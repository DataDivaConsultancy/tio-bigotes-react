-- ============================================================
-- MIGRACION: RPCs ciclo de vida de facturas_compra
-- Fecha: 2026-05-01
-- ============================================================

BEGIN;

-- 1. Crear factura con líneas y vinculacion opcional a recepciones
CREATE OR REPLACE FUNCTION rpc_crear_factura(
  p_numero            text,
  p_proveedor_id      bigint,
  p_local_id          bigint,
  p_fecha_emision     date,
  p_importe_total     numeric,
  p_lineas            jsonb DEFAULT '[]',
  p_recepcion_ids     uuid[] DEFAULT NULL,
  p_fecha_vencimiento date DEFAULT NULL,
  p_importe_neto      numeric DEFAULT NULL,
  p_iva_total         numeric DEFAULT NULL,
  p_foto_url          text DEFAULT NULL,
  p_notas             text DEFAULT NULL,
  p_creado_por        bigint DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $func$
DECLARE
  v_factura_id uuid;
  v_linea jsonb;
  v_rec_id uuid;
BEGIN
  IF p_numero IS NULL OR trim(p_numero) = '' THEN
    RETURN json_build_object('ok', false, 'error', 'numero vacio');
  END IF;
  IF p_proveedor_id IS NULL OR p_local_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'proveedor y local son obligatorios');
  END IF;

  -- Validar duplicado
  IF EXISTS (
    SELECT 1 FROM facturas_compra
    WHERE proveedor_id = p_proveedor_id
      AND numero = p_numero
      AND fecha_emision = p_fecha_emision
  ) THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'duplicado',
      'mensaje', 'Ya existe una factura con ese numero, proveedor y fecha de emision'
    );
  END IF;

  INSERT INTO facturas_compra (
    numero, proveedor_id, local_id,
    fecha_emision, fecha_vencimiento,
    importe_neto, iva_total, importe_total,
    foto_url, notas, creado_por
  ) VALUES (
    p_numero, p_proveedor_id, p_local_id,
    p_fecha_emision, p_fecha_vencimiento,
    p_importe_neto, p_iva_total, p_importe_total,
    p_foto_url, p_notas, p_creado_por
  )
  RETURNING id INTO v_factura_id;

  -- Insertar lineas
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    INSERT INTO factura_compra_lineas (
      factura_id, formato_id, producto_id,
      descripcion, cantidad, unidad,
      precio_unitario, descuento_pct, iva_pct,
      total_linea, orden, notas
    ) VALUES (
      v_factura_id,
      NULLIF(v_linea->>'formato_id','')::uuid,
      NULLIF(v_linea->>'producto_id','')::bigint,
      v_linea->>'descripcion',
      (v_linea->>'cantidad')::numeric,
      v_linea->>'unidad',
      (v_linea->>'precio_unitario')::numeric,
      COALESCE((v_linea->>'descuento_pct')::numeric, 0),
      COALESCE((v_linea->>'iva_pct')::numeric, 21),
      (v_linea->>'total_linea')::numeric,
      COALESCE((v_linea->>'orden')::int, 0),
      v_linea->>'notas'
    );
  END LOOP;

  -- Vincular recepciones (si vienen)
  IF p_recepcion_ids IS NOT NULL THEN
    FOREACH v_rec_id IN ARRAY p_recepcion_ids
    LOOP
      INSERT INTO factura_recepciones (factura_id, recepcion_id)
      VALUES (v_factura_id, v_rec_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'id', v_factura_id,
    'numero_interno', (SELECT numero_interno FROM facturas_compra WHERE id = v_factura_id)
  );
END;
$func$;

-- 2. Aprobar factura
CREATE OR REPLACE FUNCTION rpc_aprobar_factura(
  p_factura_id uuid,
  p_empleado_id bigint
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM facturas_compra WHERE id = p_factura_id;
  IF v_estado IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'factura no existe');
  END IF;
  IF v_estado <> 'borrador' THEN
    RETURN json_build_object('ok', false, 'error', 'solo se puede aprobar desde estado borrador. Estado actual: ' || v_estado);
  END IF;

  UPDATE facturas_compra
     SET estado = 'aprobada',
         fecha_aprobacion = now(),
         aprobado_por = p_empleado_id
   WHERE id = p_factura_id;

  RETURN json_build_object('ok', true);
END;
$func$;

-- 3. Marcar factura como pagada
CREATE OR REPLACE FUNCTION rpc_pagar_factura(
  p_factura_id uuid,
  p_fecha_pago date,
  p_empleado_id bigint
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM facturas_compra WHERE id = p_factura_id;
  IF v_estado IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'factura no existe');
  END IF;
  IF v_estado <> 'aprobada' THEN
    RETURN json_build_object('ok', false, 'error', 'solo se puede pagar facturas aprobadas. Estado actual: ' || v_estado);
  END IF;

  UPDATE facturas_compra
     SET estado = 'pagada',
         fecha_pago = COALESCE(p_fecha_pago, CURRENT_DATE),
         pagado_por = p_empleado_id
   WHERE id = p_factura_id;

  RETURN json_build_object('ok', true);
END;
$func$;

-- 4. Rechazar factura
CREATE OR REPLACE FUNCTION rpc_rechazar_factura(
  p_factura_id uuid,
  p_motivo text,
  p_empleado_id bigint
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_estado text;
BEGIN
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RETURN json_build_object('ok', false, 'error', 'motivo requerido para rechazar');
  END IF;
  SELECT estado INTO v_estado FROM facturas_compra WHERE id = p_factura_id;
  IF v_estado IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'factura no existe');
  END IF;
  IF v_estado = 'pagada' THEN
    RETURN json_build_object('ok', false, 'error', 'no se puede rechazar una factura ya pagada');
  END IF;

  UPDATE facturas_compra
     SET estado = 'rechazada',
         motivo_rechazo = p_motivo,
         rechazado_por = p_empleado_id
   WHERE id = p_factura_id;

  RETURN json_build_object('ok', true);
END;
$func$;

-- 5. Vincular o desvincular recepciones a una factura
CREATE OR REPLACE FUNCTION rpc_vincular_recepciones_a_factura(
  p_factura_id   uuid,
  p_recepcion_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_rec_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM facturas_compra WHERE id = p_factura_id) THEN
    RETURN json_build_object('ok', false, 'error', 'factura no existe');
  END IF;

  -- Reemplazar el set completo
  DELETE FROM factura_recepciones WHERE factura_id = p_factura_id;
  IF p_recepcion_ids IS NOT NULL THEN
    FOREACH v_rec_id IN ARRAY p_recepcion_ids
    LOOP
      INSERT INTO factura_recepciones (factura_id, recepcion_id)
      VALUES (p_factura_id, v_rec_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'n_recepciones', COALESCE(array_length(p_recepcion_ids, 1), 0)
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION rpc_crear_factura(text, bigint, bigint, date, numeric, jsonb, uuid[], date, numeric, numeric, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_aprobar_factura(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_pagar_factura(uuid, date, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_rechazar_factura(uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_vincular_recepciones_a_factura(uuid, uuid[]) TO authenticated;

COMMIT;
