-- ============================================================
-- FIX de performance: vw_alias_pendientes -> materialized view
-- Fecha: 2026-05-01
-- ============================================================
-- Problema: la vista normal tomaba >8s en 286k ventas y PostgREST
-- la cancelaba por statement_timeout. Pantalla mostraba 0 alias.
--
-- Tambien: fn_normalizar_alias usaba unaccent sin schema,
-- que falla en algunos contextos por search_path.
-- ============================================================

BEGIN;

-- 1. Schema-qualificar unaccent en fn_normalizar_alias
CREATE OR REPLACE FUNCTION fn_normalizar_alias(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(public.unaccent(COALESCE(p, ''))),
          '^\s*\d+\s*[\.\-:]?\s*', ''
        ),
        '[^a-z0-9 ]+', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

-- 2. Indice parcial sobre la tabla base para acelerar el GROUP BY
CREATE INDEX IF NOT EXISTS ix_ventas_staging_sin_match
ON tb_v2.ventas_staging (articulo_raw)
WHERE producto_id IS NULL;

-- 3. Reemplazar la vista por una MATERIALIZED VIEW (precomputada)
DROP VIEW IF EXISTS vw_alias_pendientes;

CREATE MATERIALIZED VIEW IF NOT EXISTS vw_alias_pendientes AS
SELECT
  t.alias_tpv,
  fn_normalizar_alias(t.alias_tpv) AS alias_normalizado,
  t.n_ventas,
  t.primera_venta,
  t.ultima_venta,
  t.unidades_totales,
  t.importe_total
FROM (
  SELECT
    vs.articulo_raw           AS alias_tpv,
    COUNT(*)                  AS n_ventas,
    MIN(vs.fecha)             AS primera_venta,
    MAX(vs.fecha)             AS ultima_venta,
    SUM(vs.uds_v)             AS unidades_totales,
    SUM(vs.neto)              AS importe_total
  FROM tb_v2.ventas_staging vs
  WHERE vs.producto_id IS NULL
    AND vs.articulo_raw IS NOT NULL
    AND vs.articulo_raw <> ''
  GROUP BY vs.articulo_raw
) t
ORDER BY t.n_ventas DESC;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vw_alias_pendientes_tpv
ON vw_alias_pendientes (alias_tpv);

GRANT SELECT ON vw_alias_pendientes TO authenticated, anon;

-- 4. RPC para refrescar manualmente (llamada desde frontend tras subir CSV)
CREATE OR REPLACE FUNCTION rpc_refresh_alias_pendientes()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, tb_v2
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY vw_alias_pendientes;
  RETURN json_build_object('ok', true, 'refreshed_at', now());
EXCEPTION WHEN OTHERS THEN
  REFRESH MATERIALIZED VIEW vw_alias_pendientes;
  RETURN json_build_object('ok', true, 'refreshed_at', now(), 'fallback', true);
END;
$$;
GRANT EXECUTE ON FUNCTION rpc_refresh_alias_pendientes() TO authenticated;

-- 5. Las RPCs crear/eliminar alias deben refrescar la materialized view
--    para que la pantalla refleje los cambios al instante.
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

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY vw_alias_pendientes;
  EXCEPTION WHEN OTHERS THEN
    REFRESH MATERIALIZED VIEW vw_alias_pendientes;
  END;

  RETURN json_build_object(
    'ok', true,
    'alias_id', v_alias_id,
    'ventas_actualizadas', v_ventas_actualizadas
  );
END;
$func$;

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

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY vw_alias_pendientes;
  EXCEPTION WHEN OTHERS THEN
    REFRESH MATERIALIZED VIEW vw_alias_pendientes;
  END;

  RETURN json_build_object('ok', true, 'ventas_revertidas', v_ventas_revertidas);
END;
$func$;

NOTIFY pgrst, 'reload schema';

COMMIT;
