-- ============================================================
-- RPCs de recepción e incidencias (F1B-4 + F1B-5)
-- Fecha: 2026-04-28
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. rpc_iniciar_recepcion
-- ────────────────────────────────────────────────────────────
-- Crea una recepción a partir de un pedido enviado/confirmado y copia
-- sus líneas como recepcion_lineas en estado 'pendiente'.
-- Si ya existe una recepción no cerrada para ese pedido, la devuelve.
CREATE OR REPLACE FUNCTION rpc_iniciar_recepcion(p_pedido_id uuid)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_pedido RECORD;
  v_recepcion_id uuid;
  v_numero text;
BEGIN
  SELECT id, estado, local_id, proveedor_id INTO v_pedido
    FROM pedidos_compra WHERE id = p_pedido_id;
  IF v_pedido.id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'pedido_no_encontrado');
  END IF;

  IF v_pedido.estado NOT IN ('enviado','confirmado','parcialmente_recibido') THEN
    RETURN json_build_object('ok', false, 'error', 'estado_invalido',
      'mensaje', 'Solo se puede recepcionar un pedido enviado o confirmado. Estado: ' || v_pedido.estado);
  END IF;

  -- Reusar recepción no cerrada si existe
  SELECT id INTO v_recepcion_id FROM recepciones
   WHERE pedido_id = p_pedido_id
     AND estado IN ('pendiente','en_revision','con_incidencias')
   ORDER BY iniciada_at DESC LIMIT 1;

  IF v_recepcion_id IS NULL THEN
    v_numero := gen_numero_recepcion();
    INSERT INTO recepciones (numero, pedido_id, local_id, proveedor_id, recibido_por)
    VALUES (v_numero, p_pedido_id, v_pedido.local_id, v_pedido.proveedor_id, auth.uid())
    RETURNING id INTO v_recepcion_id;

    -- Copiar líneas del pedido
    INSERT INTO recepcion_lineas (
      recepcion_id, pedido_linea_id, formato_id, producto_id,
      factor_conversion, cantidad_esperada, cantidad_recibida, estado
    )
    SELECT v_recepcion_id, l.id, l.formato_id, l.producto_id,
           COALESCE(l.factor_conversion, 1), l.cantidad, 0, 'pendiente'
      FROM pedido_compra_lineas l
     WHERE l.pedido_id = p_pedido_id
     ORDER BY l.orden;
  END IF;

  RETURN json_build_object('ok', true, 'data', json_build_object('id', v_recepcion_id));
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. rpc_actualizar_linea_recepcion
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_actualizar_linea_recepcion(
  p_linea_id          uuid,
  p_cantidad_recibida numeric,
  p_estado            text,
  p_lote              text DEFAULT NULL,
  p_fecha_caducidad   date DEFAULT NULL,
  p_temperatura       numeric DEFAULT NULL,
  p_foto_url          text DEFAULT NULL,
  p_notas             text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_recepcion_id uuid;
BEGIN
  IF p_estado NOT IN ('pendiente','ok','parcial','exceso','danado','rechazado') THEN
    RETURN json_build_object('ok', false, 'error', 'estado_invalido');
  END IF;

  UPDATE recepcion_lineas SET
    cantidad_recibida = COALESCE(p_cantidad_recibida, cantidad_recibida),
    estado            = p_estado,
    lote              = COALESCE(p_lote, lote),
    fecha_caducidad   = COALESCE(p_fecha_caducidad, fecha_caducidad),
    temperatura       = COALESCE(p_temperatura, temperatura),
    foto_url          = COALESCE(p_foto_url, foto_url),
    notas             = COALESCE(p_notas, notas)
  WHERE id = p_linea_id
  RETURNING recepcion_id INTO v_recepcion_id;

  IF v_recepcion_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'linea_no_encontrada');
  END IF;

  -- Cambiar estado de la cabecera a 'en_revision' si está pendiente
  UPDATE recepciones SET estado = 'en_revision'
   WHERE id = v_recepcion_id AND estado = 'pendiente';

  RETURN json_build_object('ok', true);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. rpc_completar_recepcion
-- ────────────────────────────────────────────────────────────
-- Aplica las líneas: genera stock_movimientos (purchase_in) por las OK,
-- crea incidencias auto para diferencias >5% o estados no ok,
-- cambia estado del pedido y de la recepción.
CREATE OR REPLACE FUNCTION rpc_completar_recepcion(p_recepcion_id uuid)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_rec RECORD;
  v_linea RECORD;
  v_tolerancia numeric := 5; -- % por defecto
  v_diff_pct numeric;
  v_inc_id uuid;
  v_inc_count int := 0;
  v_stock_count int := 0;
  v_pedido_id uuid;
  v_lineas_pendientes int;
  v_estado_recepcion text := 'aprobada';
  v_estado_pedido text;
BEGIN
  SELECT * INTO v_rec FROM recepciones WHERE id = p_recepcion_id;
  IF v_rec.id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'no_encontrada');
  END IF;
  IF v_rec.estado IN ('aprobada','cerrada') THEN
    RETURN json_build_object('ok', false, 'error', 'ya_completada');
  END IF;

  v_pedido_id := v_rec.pedido_id;

  -- Obtener tolerancia configurada
  v_tolerancia := COALESCE((fn_get_config('tolerancia_recepcion_pct', v_rec.local_id))::numeric, 5);

  -- Iterar líneas y aplicar reglas
  FOR v_linea IN
    SELECT rl.*, pc.precio AS precio_actual
      FROM recepcion_lineas rl
      LEFT JOIN productos_compra_v2 pc ON pc.id = rl.producto_id
     WHERE rl.recepcion_id = p_recepcion_id
  LOOP
    -- Si está pendiente: marcamos como exceso/parcial/ok según cantidad
    IF v_linea.estado = 'pendiente' THEN
      IF v_linea.cantidad_recibida = 0 THEN
        UPDATE recepcion_lineas SET estado = 'rechazado' WHERE id = v_linea.id;
        v_linea.estado := 'rechazado';
      ELSIF v_linea.cantidad_recibida = v_linea.cantidad_esperada THEN
        UPDATE recepcion_lineas SET estado = 'ok' WHERE id = v_linea.id;
        v_linea.estado := 'ok';
      ELSIF v_linea.cantidad_recibida < v_linea.cantidad_esperada THEN
        UPDATE recepcion_lineas SET estado = 'parcial' WHERE id = v_linea.id;
        v_linea.estado := 'parcial';
      ELSE
        UPDATE recepcion_lineas SET estado = 'exceso' WHERE id = v_linea.id;
        v_linea.estado := 'exceso';
      END IF;
    END IF;

    -- Generar stock_movimientos para todo lo recibido (incluso parcial)
    IF v_linea.cantidad_recibida > 0 AND v_linea.estado IN ('ok','parcial','exceso') THEN
      INSERT INTO stock_movimientos_v2 (
        producto_compra_id, local_id, tipo, cantidad, motivo, fecha
      ) VALUES (
        v_linea.producto_id, v_rec.local_id, 'entrada',
        v_linea.cantidad_recibida * COALESCE(v_linea.factor_conversion, 1),
        'Recepción ' || v_rec.numero, CURRENT_DATE
      );
      v_stock_count := v_stock_count + 1;
    END IF;

    -- Calcular diferencia y crear incidencia auto si supera tolerancia
    IF v_linea.cantidad_esperada > 0 THEN
      v_diff_pct := abs(v_linea.cantidad_recibida - v_linea.cantidad_esperada) * 100.0 / v_linea.cantidad_esperada;
      IF v_diff_pct > v_tolerancia THEN
        DECLARE v_tipo text;
        BEGIN
          IF v_linea.cantidad_recibida < v_linea.cantidad_esperada THEN
            v_tipo := 'faltante';
          ELSE
            v_tipo := 'exceso';
          END IF;
          INSERT INTO incidencias (
            numero, tipo, recepcion_id, recepcion_linea_id, pedido_id,
            proveedor_id, local_id, formato_id, producto_id,
            cantidad_afectada, urgencia, estado, sla_deadline,
            descripcion, creada_por
          ) VALUES (
            gen_numero_incidencia(), v_tipo, p_recepcion_id, v_linea.id, v_pedido_id,
            v_rec.proveedor_id, v_rec.local_id, v_linea.formato_id, v_linea.producto_id,
            abs(v_linea.cantidad_recibida - v_linea.cantidad_esperada),
            CASE WHEN v_diff_pct > 20 THEN 'alta' ELSE 'media' END,
            'abierta',
            now() + fn_sla_incidencia(v_tipo),
            format('Auto: dif %.1f%% (esperado %s, recibido %s)',
                   v_diff_pct, v_linea.cantidad_esperada, v_linea.cantidad_recibida),
            auth.uid()
          ) RETURNING id INTO v_inc_id;
          v_inc_count := v_inc_count + 1;
        END;
      END IF;
    END IF;

    -- Si el estado es danado, rechazado, etc — crear incidencia auto
    IF v_linea.estado IN ('danado','rechazado') AND v_linea.cantidad_recibida > 0 THEN
      INSERT INTO incidencias (
        numero, tipo, recepcion_id, recepcion_linea_id, pedido_id,
        proveedor_id, local_id, formato_id, producto_id,
        cantidad_afectada, urgencia, estado, sla_deadline,
        descripcion, creada_por
      ) VALUES (
        gen_numero_incidencia(),
        CASE v_linea.estado WHEN 'danado' THEN 'danado' ELSE 'no_solicitado' END,
        p_recepcion_id, v_linea.id, v_pedido_id,
        v_rec.proveedor_id, v_rec.local_id, v_linea.formato_id, v_linea.producto_id,
        v_linea.cantidad_recibida,
        'alta',
        'abierta',
        now() + fn_sla_incidencia(CASE v_linea.estado WHEN 'danado' THEN 'danado' ELSE 'no_solicitado' END),
        'Auto: producto en estado ' || v_linea.estado,
        auth.uid()
      );
      v_inc_count := v_inc_count + 1;
    END IF;
  END LOOP;

  -- Determinar estado final
  IF v_inc_count > 0 THEN v_estado_recepcion := 'con_incidencias'; END IF;

  UPDATE recepciones
     SET estado = v_estado_recepcion,
         completada_at = now()
   WHERE id = p_recepcion_id;

  -- Cambiar estado del pedido
  -- Si todas las líneas del pedido tienen su recepcion_lineas con estado != 'pendiente'/'rechazado' y cantidad cubre lo esperado → recibido
  -- Si parcial → parcialmente_recibido
  SELECT COUNT(*) INTO v_lineas_pendientes
    FROM pedido_compra_lineas pl
   WHERE pl.pedido_id = v_pedido_id
     AND NOT EXISTS (
       SELECT 1 FROM recepcion_lineas rl
        WHERE rl.pedido_linea_id = pl.id
          AND rl.estado IN ('ok','parcial','exceso')
          AND rl.cantidad_recibida >= pl.cantidad
     );

  IF v_lineas_pendientes = 0 THEN
    v_estado_pedido := 'recibido';
  ELSE
    v_estado_pedido := 'parcialmente_recibido';
  END IF;

  UPDATE pedidos_compra SET estado = v_estado_pedido WHERE id = v_pedido_id;

  RETURN json_build_object('ok', true, 'data', json_build_object(
    'recepcion_id', p_recepcion_id,
    'estado_recepcion', v_estado_recepcion,
    'estado_pedido', v_estado_pedido,
    'movimientos_stock', v_stock_count,
    'incidencias_creadas', v_inc_count
  ));
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. rpc_crear_incidencia (manual desde UI)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_crear_incidencia(
  p_tipo                text,
  p_proveedor_id        integer,
  p_descripcion         text DEFAULT NULL,
  p_recepcion_id        uuid DEFAULT NULL,
  p_recepcion_linea_id  uuid DEFAULT NULL,
  p_pedido_id           uuid DEFAULT NULL,
  p_local_id            integer DEFAULT NULL,
  p_formato_id          uuid DEFAULT NULL,
  p_producto_id         integer DEFAULT NULL,
  p_cantidad_afectada   numeric DEFAULT NULL,
  p_urgencia            text DEFAULT 'media',
  p_fotos_urls          jsonb DEFAULT '[]'::jsonb
)
RETURNS json LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_num text;
BEGIN
  IF p_tipo IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'falta_tipo');
  END IF;
  IF p_proveedor_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'falta_proveedor');
  END IF;

  v_num := gen_numero_incidencia();
  INSERT INTO incidencias (
    numero, tipo, recepcion_id, recepcion_linea_id, pedido_id,
    proveedor_id, local_id, formato_id, producto_id,
    cantidad_afectada, urgencia, estado, sla_deadline,
    descripcion, fotos_urls, creada_por
  ) VALUES (
    v_num, p_tipo, p_recepcion_id, p_recepcion_linea_id, p_pedido_id,
    p_proveedor_id, p_local_id, p_formato_id, p_producto_id,
    p_cantidad_afectada,
    COALESCE(p_urgencia, 'media'),
    'abierta',
    now() + fn_sla_incidencia(p_tipo),
    p_descripcion,
    COALESCE(p_fotos_urls, '[]'::jsonb),
    auth.uid()
  ) RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'data', json_build_object('id', v_id, 'numero', v_num));
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. rpc_resolver_incidencia
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_resolver_incidencia(
  p_id              uuid,
  p_tipo_resolucion text,
  p_importe         numeric DEFAULT NULL,
  p_notas           text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql AS $$
BEGIN
  IF p_tipo_resolucion NOT IN ('abono','reposicion','descuento','sin_accion','factura_rectificativa') THEN
    RETURN json_build_object('ok', false, 'error', 'tipo_resolucion_invalido');
  END IF;

  UPDATE incidencias SET
    tipo_resolucion = p_tipo_resolucion,
    importe_resolucion = p_importe,
    notas_resolucion = p_notas,
    estado = 'resuelta',
    resuelta_at = now()
  WHERE id = p_id AND estado IN ('abierta','asignada','esperando_proveedor','en_resolucion','reabierta','escalada');

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'no_encontrada_o_estado_invalido');
  END IF;
  RETURN json_build_object('ok', true);
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. rpc_cerrar_incidencia
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_cerrar_incidencia(p_id uuid)
RETURNS json LANGUAGE plpgsql AS $$
BEGIN
  UPDATE incidencias SET estado = 'cerrada', cerrada_at = now()
   WHERE id = p_id AND estado IN ('resuelta','abierta','asignada','esperando_proveedor','en_resolucion','reabierta','escalada');
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'no_encontrada');
  END IF;
  RETURN json_build_object('ok', true);
END;
$$;
