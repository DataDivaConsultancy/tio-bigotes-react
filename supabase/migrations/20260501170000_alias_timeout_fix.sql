-- ============================================================
-- FIX: timeout al mapear alias con muchas ventas
-- Fecha: 2026-05-01
-- ============================================================
-- Problema: rpc_crear_alias_y_reprocesar fallaba con statement timeout
-- (8s) cuando se mapeaba un alias con muchas ventas históricas (28k).
--
-- Soluciones aplicadas:
--   1. Indice completo sobre articulo_raw (no solo parcial)
--   2. Quitar REFRESH MATERIALIZED VIEW de dentro de las RPCs
--      (que el cliente lo llame después por separado)
--   3. Aumentar statement_timeout de roles authenticated/anon
-- ============================================================

BEGIN;

-- 1. Indice no-parcial sobre articulo_raw
CREATE INDEX IF NOT EXISTS ix_ventas_staging_articulo_raw
ON tb_v2.ventas_staging (articulo_raw);

-- 2. RPC crear sin REFRESH inline
CREATE OR REPLACE FUNCTION rpc_crear_alias_y_reprocesar(
  p_alias_tpv   text,
  p_producto_id integer,
  p_notas       text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, tb_v2
AS $func$
DECLARE
  v_alias_id integer;
  v_ventas_actualizadas integer;
BEGIN
  IF p_alias_tpv IS NULL OR p_alias_tpv = '' THEN
    RETURN json_build_object('ok', false, 'error', 'alias_tpv vacio');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tb_v2.productos WHERE id = p_producto_id) THEN
    RETURN json_build_object('ok', false, 'error', 'producto_id invalido');
  END IF;

  INSERT INTO ventas_alias_v2 (alias_tpv, alias_normalizado, producto_id, notas)
  VALUES (p_alias_tpv, fn_normalizar_alias(p_alias_tpv), p_producto_id, p_notas)
  ON CONFLICT (alias_tpv) DO UPDATE
    SET producto_id = EXCLUDED.producto_id,
        notas       = EXCLUDED.notas,
        updated_at  = now()
  RETURNING id INTO v_alias_id;

  UPDATE tb_v2.ventas_staging
     SET producto_id   = p_producto_id,
         estado_mapeo  = 'mapeado_alias_retro'
   WHERE articulo_raw = p_alias_tpv
     AND (producto_id IS NULL OR producto_id = p_producto_id);

  GET DIAGNOSTICS v_ventas_actualizadas = ROW_COUNT;

  -- NO refrescamos la MV aqui — el cliente debe llamar
  -- rpc_refresh_alias_pendientes() despues por separado.

  RETURN json_build_object(
    'ok', true,
    'alias_id', v_alias_id,
    'ventas_actualizadas', v_ventas_actualizadas
  );
END;
$func$;

-- 3. RPC eliminar sin REFRESH inline
CREATE OR REPLACE FUNCTION rpc_eliminar_alias_y_revertir(p_alias_id integer)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, tb_v2
AS $func$
DECLARE
  v_alias text;
  v_ventas_revertidas integer;
BEGIN
  SELECT alias_tpv INTO v_alias
  FROM ventas_alias_v2 WHERE id = p_alias_id;

  IF v_alias IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'alias no encontrado');
  END IF;

  UPDATE tb_v2.ventas_staging
     SET producto_id  = NULL,
         estado_mapeo = 'sin_match'
   WHERE articulo_raw = v_alias
     AND estado_mapeo IN ('mapeado_alias', 'mapeado_alias_retro');

  GET DIAGNOSTICS v_ventas_revertidas = ROW_COUNT;

  DELETE FROM ventas_alias_v2 WHERE id = p_alias_id;

  RETURN json_build_object('ok', true, 'ventas_revertidas', v_ventas_revertidas);
END;
$func$;

-- 4. Subir statement_timeout de los roles anon/authenticated
--    para permitir UPDATE masivos legitimos.
ALTER ROLE authenticated SET statement_timeout = '60s';
ALTER ROLE anon          SET statement_timeout = '30s';

NOTIFY pgrst, 'reload schema';

COMMIT;
