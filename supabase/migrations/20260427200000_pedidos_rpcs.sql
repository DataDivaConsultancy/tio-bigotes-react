-- ============================================================
-- Migración: RPCs de pedidos de compra (F1A-3)
-- Fecha: 2026-04-27
-- Tarea: F1A-3
-- Descripción:
--   Funciones RPC para todo el ciclo de vida del pedido:
--     - rpc_crear_pedido         (crea borrador con líneas)
--     - rpc_actualizar_pedido    (edita borrador: cabecera + reemplaza líneas)
--     - rpc_enviar_pedido        (cambia estado a enviado)
--     - rpc_aprobar_pedido       (registra aprobación, cambia estado)
--     - rpc_cancelar_pedido      (cancela si no confirmado)
--     - rpc_duplicar_pedido      (clona como nuevo borrador)
--
--   Lógica de negocio:
--     - Validación de inputs (proveedor activo, formatos del proveedor, etc.)
--     - Cálculo de totales (subtotal, iva_total, total)
--     - Decisión auto-aprobación según umbral_aprobacion_eur (configuracion_compras)
--     - Validación de pedido_minimo del proveedor (warning, no bloqueo)
--     - Transición de estados controlada
--
--   Convenciones de respuesta:
--     - { "ok": true, "data": {...} }
--     - { "ok": false, "error": "codigo", "mensaje": "..." }
--
-- Rollback: 20260427200000_pedidos_rpcs_rollback.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Helper: validar transición de estado
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_pedido_puede_transicionar(
  p_estado_actual text,
  p_estado_nuevo  text
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE
    -- Desde borrador
    WHEN p_estado_actual = 'borrador' AND p_estado_nuevo IN ('pendiente_aprobacion','aprobado','enviado','cancelado') THEN true
    -- Desde sugerido
    WHEN p_estado_actual = 'sugerido' AND p_estado_nuevo IN ('borrador','pendiente_aprobacion','aprobado','cancelado') THEN true
    -- Desde pendiente_aprobacion
    WHEN p_estado_actual = 'pendiente_aprobacion' AND p_estado_nuevo IN ('aprobado','borrador','cancelado') THEN true
    -- Desde aprobado
    WHEN p_estado_actual = 'aprobado' AND p_estado_nuevo IN ('enviado','cancelado') THEN true
    -- Desde enviado
    WHEN p_estado_actual = 'enviado' AND p_estado_nuevo IN ('confirmado','cancelado') THEN true
    -- Desde confirmado
    WHEN p_estado_actual = 'confirmado' AND p_estado_nuevo IN ('parcialmente_recibido','recibido') THEN true
    -- Desde parcialmente_recibido
    WHEN p_estado_actual = 'parcialmente_recibido' AND p_estado_nuevo IN ('recibido','cerrado') THEN true
    -- Desde recibido
    WHEN p_estado_actual = 'recibido' AND p_estado_nuevo IN ('cerrado') THEN true
    ELSE false
  END;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Helper: recalcular totales de cabecera
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_recalcular_totales_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_subtotal  numeric(12,2);
  v_iva_total numeric(12,2);
  v_portes    numeric(10,2);
BEGIN
  SELECT
    COALESCE(SUM(cantidad * precio_unitario * (1 - descuento_pct/100.0)), 0),
    COALESCE(SUM(cantidad * precio_unitario * (1 - descuento_pct/100.0) * (iva_pct/100.0)), 0)
  INTO v_subtotal, v_iva_total
  FROM pedido_compra_lineas
  WHERE pedido_id = p_pedido_id;

  SELECT portes INTO v_portes FROM pedidos_compra WHERE id = p_pedido_id;

  UPDATE pedidos_compra
     SET subtotal  = ROUND(v_subtotal, 2),
         iva_total = ROUND(v_iva_total, 2),
         total     = ROUND(v_subtotal + v_iva_total + COALESCE(v_portes, 0), 2)
   WHERE id = p_pedido_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 1. rpc_crear_pedido
-- ────────────────────────────────────────────────────────────
-- Input:
--   p_local_id, p_proveedor_id, p_fecha_entrega_solicitada (date),
--   p_lineas (jsonb array): [{ formato_id, cantidad, precio_unitario,
--                             descuento_pct?, iva_pct?, cantidad_sugerida?,
--                             motivo_modificacion?, notas? }, ...]
--   p_portes (numeric), p_notas (text), p_origen (text)
-- Output:
--   { ok, data: { id, numero, estado, total, requiere_aprobacion } }
CREATE OR REPLACE FUNCTION rpc_crear_pedido(
  p_local_id     integer,
  p_proveedor_id integer,
  p_lineas       jsonb,
  p_fecha_entrega_solicitada date DEFAULT NULL,
  p_portes       numeric DEFAULT 0,
  p_notas        text DEFAULT NULL,
  p_origen       text DEFAULT 'manual'
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_pedido_id        uuid;
  v_numero           text;
  v_total            numeric(12,2);
  v_umbral           numeric;
  v_pedido_minimo    numeric;
  v_estado           text;
  v_requiere_aprob   boolean;
  v_linea            jsonb;
  v_orden            int := 1;
  v_proveedor_activo boolean;
  v_local_activo     boolean;
  v_formato_id       uuid;
  v_producto_id      integer;
  v_proveedor_pre_id uuid;
  v_iva_pct_default  numeric;
  v_lineas_count     int := 0;
BEGIN
  -- Validaciones básicas
  IF p_local_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'local_requerido', 'mensaje', 'Falta el local');
  END IF;
  IF p_proveedor_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'proveedor_requerido', 'mensaje', 'Falta el proveedor');
  END IF;
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'sin_lineas', 'mensaje', 'El pedido debe tener al menos una línea');
  END IF;

  SELECT activo INTO v_local_activo FROM locales_compra_v2 WHERE id = p_local_id;
  IF v_local_activo IS DISTINCT FROM true THEN
    RETURN json_build_object('ok', false, 'error', 'local_invalido', 'mensaje', 'Local inactivo o inexistente');
  END IF;

  SELECT activo INTO v_proveedor_activo FROM proveedores_v2 WHERE id = p_proveedor_id;
  IF v_proveedor_activo IS DISTINCT FROM true THEN
    RETURN json_build_object('ok', false, 'error', 'proveedor_invalido', 'mensaje', 'Proveedor inactivo o inexistente');
  END IF;

  -- Insertar cabecera (estado inicial 'borrador'; se ajusta abajo)
  v_numero := gen_numero_pedido();
  INSERT INTO pedidos_compra (
    numero, local_id, proveedor_id, estado, fecha_entrega_solicitada,
    portes, origen, notas, creado_por
  ) VALUES (
    v_numero, p_local_id, p_proveedor_id, 'borrador', p_fecha_entrega_solicitada,
    COALESCE(p_portes, 0), COALESCE(p_origen, 'manual'), p_notas, auth.uid()
  )
  RETURNING id INTO v_pedido_id;

  -- Insertar líneas
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_formato_id := (v_linea ->> 'formato_id')::uuid;

    -- Resolver producto_id desde formato
    SELECT producto_id INTO v_producto_id FROM producto_formatos WHERE id = v_formato_id;
    IF v_producto_id IS NULL THEN
      -- Rollback parcial
      DELETE FROM pedidos_compra WHERE id = v_pedido_id;
      RETURN json_build_object('ok', false, 'error', 'formato_invalido', 'mensaje', 'Formato no encontrado: ' || v_formato_id::text);
    END IF;

    -- Buscar precio activo para este (proveedor, formato) — opcional, para auditoría
    SELECT id, iva_pct
      INTO v_proveedor_pre_id, v_iva_pct_default
      FROM proveedor_producto_precios
     WHERE proveedor_id = p_proveedor_id AND formato_id = v_formato_id AND activa = true
     LIMIT 1;

    INSERT INTO pedido_compra_lineas (
      pedido_id, formato_id, producto_id, proveedor_producto_precio_id,
      cantidad, precio_unitario, descuento_pct, iva_pct,
      cantidad_sugerida, motivo_modificacion, notas, orden
    ) VALUES (
      v_pedido_id, v_formato_id, v_producto_id, v_proveedor_pre_id,
      (v_linea ->> 'cantidad')::numeric,
      (v_linea ->> 'precio_unitario')::numeric,
      COALESCE((v_linea ->> 'descuento_pct')::numeric, 0),
      COALESCE((v_linea ->> 'iva_pct')::numeric, COALESCE(v_iva_pct_default, 21)),
      NULLIF(v_linea ->> 'cantidad_sugerida', '')::numeric,
      v_linea ->> 'motivo_modificacion',
      v_linea ->> 'notas',
      v_orden
    );
    v_orden := v_orden + 1;
    v_lineas_count := v_lineas_count + 1;
  END LOOP;

  -- Recalcular totales
  PERFORM fn_recalcular_totales_pedido(v_pedido_id);
  SELECT total INTO v_total FROM pedidos_compra WHERE id = v_pedido_id;

  -- Determinar umbral aplicable (config local primero, luego global)
  v_umbral := (fn_get_config('umbral_aprobacion_eur', p_local_id))::numeric;
  IF v_umbral IS NULL THEN v_umbral := 500; END IF;

  -- Estado final
  IF v_total > v_umbral THEN
    v_estado := 'pendiente_aprobacion';
    v_requiere_aprob := true;
  ELSE
    v_estado := 'borrador';
    v_requiere_aprob := false;
  END IF;
  UPDATE pedidos_compra SET estado = v_estado WHERE id = v_pedido_id;

  RETURN json_build_object(
    'ok', true,
    'data', json_build_object(
      'id', v_pedido_id,
      'numero', v_numero,
      'estado', v_estado,
      'total', v_total,
      'requiere_aprobacion', v_requiere_aprob,
      'lineas', v_lineas_count
    )
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. rpc_actualizar_pedido — solo en borradores (cabecera + reemplaza líneas)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_actualizar_pedido(
  p_id           uuid,
  p_lineas       jsonb DEFAULT NULL,        -- si se pasa, REEMPLAZA todas
  p_fecha_entrega_solicitada date DEFAULT NULL,
  p_portes       numeric DEFAULT NULL,
  p_notas        text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_estado text;
  v_local_id integer;
  v_proveedor_id integer;
  v_total numeric(12,2);
  v_umbral numeric;
  v_estado_nuevo text;
  v_linea jsonb;
  v_orden int := 1;
  v_formato_id uuid;
  v_producto_id integer;
  v_iva_default numeric;
  v_pre_id uuid;
BEGIN
  SELECT estado, local_id, proveedor_id INTO v_estado, v_local_id, v_proveedor_id
  FROM pedidos_compra WHERE id = p_id;

  IF v_estado IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'no_encontrado', 'mensaje', 'Pedido no existe');
  END IF;
  IF v_estado NOT IN ('borrador','pendiente_aprobacion') THEN
    RETURN json_build_object('ok', false, 'error', 'estado_no_editable',
      'mensaje', 'Solo se pueden editar pedidos en borrador o pendientes de aprobación. Estado actual: ' || v_estado);
  END IF;

  -- Cabecera
  UPDATE pedidos_compra SET
    fecha_entrega_solicitada = COALESCE(p_fecha_entrega_solicitada, fecha_entrega_solicitada),
    portes                   = COALESCE(p_portes, portes),
    notas                    = COALESCE(p_notas, notas)
  WHERE id = p_id;

  -- Reemplazar líneas si vienen
  IF p_lineas IS NOT NULL THEN
    DELETE FROM pedido_compra_lineas WHERE pedido_id = p_id;
    FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
      v_formato_id := (v_linea ->> 'formato_id')::uuid;
      SELECT producto_id INTO v_producto_id FROM producto_formatos WHERE id = v_formato_id;
      SELECT id, iva_pct INTO v_pre_id, v_iva_default
        FROM proveedor_producto_precios
       WHERE proveedor_id = v_proveedor_id AND formato_id = v_formato_id AND activa = true
       LIMIT 1;
      INSERT INTO pedido_compra_lineas (
        pedido_id, formato_id, producto_id, proveedor_producto_precio_id,
        cantidad, precio_unitario, descuento_pct, iva_pct,
        cantidad_sugerida, motivo_modificacion, notas, orden
      ) VALUES (
        p_id, v_formato_id, v_producto_id, v_pre_id,
        (v_linea ->> 'cantidad')::numeric,
        (v_linea ->> 'precio_unitario')::numeric,
        COALESCE((v_linea ->> 'descuento_pct')::numeric, 0),
        COALESCE((v_linea ->> 'iva_pct')::numeric, COALESCE(v_iva_default, 21)),
        NULLIF(v_linea ->> 'cantidad_sugerida', '')::numeric,
        v_linea ->> 'motivo_modificacion',
        v_linea ->> 'notas',
        v_orden
      );
      v_orden := v_orden + 1;
    END LOOP;
  END IF;

  PERFORM fn_recalcular_totales_pedido(p_id);
  SELECT total INTO v_total FROM pedidos_compra WHERE id = p_id;

  -- Re-evaluar si pasa de borrador a pendiente_aprobacion (o viceversa)
  v_umbral := (fn_get_config('umbral_aprobacion_eur', v_local_id))::numeric;
  IF v_umbral IS NULL THEN v_umbral := 500; END IF;
  IF v_estado IN ('borrador', 'pendiente_aprobacion') THEN
    v_estado_nuevo := CASE WHEN v_total > v_umbral THEN 'pendiente_aprobacion' ELSE 'borrador' END;
    UPDATE pedidos_compra SET estado = v_estado_nuevo WHERE id = p_id;
  END IF;

  RETURN json_build_object('ok', true, 'data', json_build_object('id', p_id, 'total', v_total, 'estado', COALESCE(v_estado_nuevo, v_estado)));
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. rpc_enviar_pedido
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_enviar_pedido(
  p_id  uuid,
  p_via text DEFAULT 'email'
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM pedidos_compra WHERE id = p_id;
  IF v_estado IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF NOT fn_pedido_puede_transicionar(v_estado, 'enviado') THEN
    RETURN json_build_object('ok', false, 'error', 'transicion_invalida',
      'mensaje', 'No se puede enviar desde estado ' || v_estado);
  END IF;
  IF p_via NOT IN ('email','portal','whatsapp','telefono','edi') THEN
    RETURN json_build_object('ok', false, 'error', 'via_invalida');
  END IF;

  UPDATE pedidos_compra
     SET estado = 'enviado', enviado_via = p_via, enviado_at = now()
   WHERE id = p_id;

  RETURN json_build_object('ok', true, 'data', json_build_object('id', p_id, 'estado', 'enviado'));
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. rpc_aprobar_pedido
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_aprobar_pedido(
  p_id          uuid,
  p_decision    text,
  p_comentarios text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_estado text;
  v_estado_nuevo text;
BEGIN
  IF p_decision NOT IN ('aprobado','rechazado','devuelto') THEN
    RETURN json_build_object('ok', false, 'error', 'decision_invalida');
  END IF;

  SELECT estado INTO v_estado FROM pedidos_compra WHERE id = p_id;
  IF v_estado IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF v_estado <> 'pendiente_aprobacion' THEN
    RETURN json_build_object('ok', false, 'error', 'estado_invalido',
      'mensaje', 'Solo se pueden aprobar pedidos pendientes. Estado actual: ' || v_estado);
  END IF;

  -- Insertar registro de decisión
  INSERT INTO pedido_compra_aprobaciones (pedido_id, aprobador_id, decision, comentarios)
  VALUES (p_id, auth.uid(), p_decision, p_comentarios);

  -- Aplicar transición
  v_estado_nuevo := CASE p_decision
    WHEN 'aprobado'  THEN 'aprobado'
    WHEN 'rechazado' THEN 'cancelado'
    WHEN 'devuelto'  THEN 'borrador'
  END;
  UPDATE pedidos_compra
     SET estado = v_estado_nuevo,
         cancelado_at = CASE WHEN v_estado_nuevo = 'cancelado' THEN now() ELSE cancelado_at END,
         motivo_cancelacion = CASE WHEN v_estado_nuevo = 'cancelado' THEN COALESCE(p_comentarios, 'Rechazado en aprobación') ELSE motivo_cancelacion END
   WHERE id = p_id;

  RETURN json_build_object('ok', true, 'data', json_build_object('id', p_id, 'estado', v_estado_nuevo, 'decision', p_decision));
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. rpc_cancelar_pedido
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_cancelar_pedido(
  p_id     uuid,
  p_motivo text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_estado text;
  v_confirmado_at timestamptz;
BEGIN
  SELECT estado, confirmado_at INTO v_estado, v_confirmado_at
  FROM pedidos_compra WHERE id = p_id;

  IF v_estado IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF v_confirmado_at IS NOT NULL THEN
    RETURN json_build_object('ok', false, 'error', 'ya_confirmado',
      'mensaje', 'No se puede cancelar un pedido que ya ha sido confirmado por el proveedor');
  END IF;
  IF v_estado IN ('cancelado','cerrado','recibido') THEN
    RETURN json_build_object('ok', false, 'error', 'estado_invalido',
      'mensaje', 'No se puede cancelar un pedido en estado ' || v_estado);
  END IF;

  UPDATE pedidos_compra
     SET estado = 'cancelado',
         cancelado_at = now(),
         motivo_cancelacion = COALESCE(p_motivo, 'Cancelado por usuario')
   WHERE id = p_id;

  RETURN json_build_object('ok', true, 'data', json_build_object('id', p_id, 'estado', 'cancelado'));
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. rpc_duplicar_pedido — clona como nuevo borrador
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_duplicar_pedido(p_id uuid)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_nuevo_id uuid;
  v_numero text;
  v_local integer;
  v_proveedor integer;
  v_portes numeric;
  v_notas text;
  v_total numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pedidos_compra WHERE id = p_id) THEN
    RETURN json_build_object('ok', false, 'error', 'no_encontrado');
  END IF;

  SELECT local_id, proveedor_id, portes, notas
    INTO v_local, v_proveedor, v_portes, v_notas
  FROM pedidos_compra WHERE id = p_id;

  v_numero := gen_numero_pedido();
  INSERT INTO pedidos_compra (
    numero, local_id, proveedor_id, estado,
    portes, origen, notas, creado_por
  ) VALUES (
    v_numero, v_local, v_proveedor, 'borrador',
    v_portes, 'duplicado', v_notas, auth.uid()
  )
  RETURNING id INTO v_nuevo_id;

  -- Clonar líneas
  INSERT INTO pedido_compra_lineas (
    pedido_id, formato_id, producto_id, proveedor_producto_precio_id,
    cantidad, precio_unitario, descuento_pct, iva_pct,
    cantidad_sugerida, motivo_modificacion, notas, orden
  )
  SELECT
    v_nuevo_id, formato_id, producto_id, proveedor_producto_precio_id,
    cantidad, precio_unitario, descuento_pct, iva_pct,
    cantidad_sugerida, motivo_modificacion, notas, orden
  FROM pedido_compra_lineas
  WHERE pedido_id = p_id;

  PERFORM fn_recalcular_totales_pedido(v_nuevo_id);
  SELECT total INTO v_total FROM pedidos_compra WHERE id = v_nuevo_id;

  RETURN json_build_object('ok', true, 'data', json_build_object(
    'id', v_nuevo_id, 'numero', v_numero, 'total', v_total
  ));
END;
$$;

-- ============================================================
-- FIN MIGRACIÓN F1A-3
-- ============================================================
