-- ============================================================
-- Migración: precio por unidad suelta — factor en la línea
-- Fecha: 2026-04-28
-- Cambio: total_linea = cantidad x factor_conversion x precio_unitario x (1-dto) x (1+iva)
-- Asume que precio_unitario es POR UNIDAD DE USO (suelta), no por paquete.
-- ============================================================

-- 1. Añadir factor_conversion a pedido_compra_lineas
ALTER TABLE pedido_compra_lineas
  ADD COLUMN IF NOT EXISTS factor_conversion numeric NOT NULL DEFAULT 1;

-- 2. Trigger BEFORE de cálculo: incluir factor
CREATE OR REPLACE FUNCTION fn_calcular_total_linea()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.total_linea := ROUND(
    NEW.cantidad
    * COALESCE(NEW.factor_conversion, 1)
    * NEW.precio_unitario
    * (1 - NEW.descuento_pct / 100.0)
    * (1 + NEW.iva_pct / 100.0)
  , 2);
  RETURN NEW;
END;
$$;

-- 3. Recalcular totales de cabecera con factor
CREATE OR REPLACE FUNCTION fn_recalcular_totales_pedido(p_pedido_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_subtotal  numeric(12,2);
  v_iva_total numeric(12,2);
  v_portes    numeric(10,2);
BEGIN
  SELECT
    COALESCE(SUM(cantidad * COALESCE(factor_conversion,1) * precio_unitario * (1 - descuento_pct/100.0)), 0),
    COALESCE(SUM(cantidad * COALESCE(factor_conversion,1) * precio_unitario * (1 - descuento_pct/100.0) * (iva_pct/100.0)), 0)
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

-- 4. RPC crear_pedido — leer factor_conversion del formato y guardarlo en la línea
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
  v_factor           numeric;
  v_lineas_count     int := 0;
BEGIN
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

  v_numero := gen_numero_pedido();
  INSERT INTO pedidos_compra (
    numero, local_id, proveedor_id, estado, fecha_entrega_solicitada,
    portes, origen, notas, creado_por
  ) VALUES (
    v_numero, p_local_id, p_proveedor_id, 'borrador', p_fecha_entrega_solicitada,
    COALESCE(p_portes, 0), COALESCE(p_origen, 'manual'), p_notas, auth.uid()
  )
  RETURNING id INTO v_pedido_id;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_formato_id := (v_linea ->> 'formato_id')::uuid;

    SELECT producto_id, COALESCE(factor_conversion, 1)
      INTO v_producto_id, v_factor
      FROM producto_formatos WHERE id = v_formato_id;
    IF v_producto_id IS NULL THEN
      DELETE FROM pedidos_compra WHERE id = v_pedido_id;
      RETURN json_build_object('ok', false, 'error', 'formato_invalido', 'mensaje', 'Formato no encontrado: ' || v_formato_id::text);
    END IF;

    SELECT id, iva_pct
      INTO v_proveedor_pre_id, v_iva_pct_default
      FROM proveedor_producto_precios
     WHERE proveedor_id = p_proveedor_id AND formato_id = v_formato_id AND activa = true
     LIMIT 1;

    INSERT INTO pedido_compra_lineas (
      pedido_id, formato_id, producto_id, proveedor_producto_precio_id,
      cantidad, factor_conversion, precio_unitario, descuento_pct, iva_pct,
      cantidad_sugerida, motivo_modificacion, notas, orden
    ) VALUES (
      v_pedido_id, v_formato_id, v_producto_id, v_proveedor_pre_id,
      (v_linea ->> 'cantidad')::numeric,
      v_factor,
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

  PERFORM fn_recalcular_totales_pedido(v_pedido_id);
  SELECT total INTO v_total FROM pedidos_compra WHERE id = v_pedido_id;

  v_umbral := (fn_get_config('umbral_aprobacion_eur', p_local_id))::numeric;
  IF v_umbral IS NULL THEN v_umbral := 500; END IF;

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
      'id', v_pedido_id, 'numero', v_numero, 'estado', v_estado,
      'total', v_total, 'requiere_aprobacion', v_requiere_aprob, 'lineas', v_lineas_count
    )
  );
END;
$$;

-- 5. Recalcular todas las líneas existentes (por si hay pedidos previos)
UPDATE pedido_compra_lineas SET cantidad = cantidad;  -- dispara trigger
