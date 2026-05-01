-- ============================================================
-- MIGRACION: Mapeo TPV -> producto canonico (alias de ventas)
-- Fecha: 2026-05-01
-- ============================================================
-- Crea:
--   * fn_normalizar_alias            -- normaliza nombre del CSV
--   * ventas_alias_v2                -- tabla de mapeos
--   * trigger normalizado en alias
--   * trigger auto-resolver producto_id al insertar en ventas_raw_v2
--   * vw_alias_pendientes            -- nombres del CSV sin mapeo
--   * vw_alias_activos               -- mapeos creados con uso
--   * rpc_sugerir_producto_para_alias
--   * rpc_crear_alias_y_reprocesar
--   * rpc_eliminar_alias_y_revertir
-- ============================================================

BEGIN;

-- 1. Helper de normalizacion
-- "1.CARNE SUAVE", "11. HUMITA", "Carne Suave" -> "carne suave"
CREATE OR REPLACE FUNCTION fn_normalizar_alias(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    -- 4) trim
    trim(
    -- 3) collapse multiple spaces
      regexp_replace(
    -- 2) reemplazar caracteres no alfanumericos (excepto espacio) por espacio
        regexp_replace(
    -- 1) quitar prefijo numerico tipo "1.", "11. ", "13."
          regexp_replace(
            lower(unaccent(COALESCE(p, ''))),
            '^\s*\d+\s*[\.\-:]?\s*', ''
          ),
          '[^a-z0-9 ]+', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    );
$$;

-- 2. Tabla de alias
CREATE TABLE IF NOT EXISTS ventas_alias_v2 (
  id                serial PRIMARY KEY,
  alias_tpv         text NOT NULL UNIQUE,         -- nombre exacto del CSV
  alias_normalizado text NOT NULL,                -- auto, via trigger
  producto_id       integer NOT NULL REFERENCES tb_v2.productos(id) ON DELETE CASCADE,
  notas             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_alias_normalizado    ON ventas_alias_v2(alias_normalizado);
CREATE INDEX IF NOT EXISTS ix_alias_producto       ON ventas_alias_v2(producto_id);

-- 3. Trigger para auto-calcular alias_normalizado y updated_at
CREATE OR REPLACE FUNCTION tg_alias_normalizar()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.alias_normalizado := fn_normalizar_alias(NEW.alias_tpv);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_alias_normalizar ON ventas_alias_v2;
CREATE TRIGGER tg_alias_normalizar
  BEFORE INSERT OR UPDATE ON ventas_alias_v2
  FOR EACH ROW EXECUTE FUNCTION tg_alias_normalizar();

-- 4. Trigger en tb_v2.ventas_staging (tabla real subyacente a la vista
--    ventas_raw_v2). Al insertar una fila nueva, intentar resolver
--    producto_id automaticamente.
CREATE OR REPLACE FUNCTION tg_ventas_staging_resolver_alias()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, tb_v2
AS $$
DECLARE
  v_pid integer;
  v_nombre text;
BEGIN
  -- Si ya viene producto_id, no tocar
  IF NEW.producto_id IS NOT NULL THEN
    IF NEW.estado_mapeo IS NULL THEN
      NEW.estado_mapeo := 'preasignado';
    END IF;
    RETURN NEW;
  END IF;

  v_nombre := NEW.articulo_raw;

  IF v_nombre IS NULL OR v_nombre = '' THEN
    NEW.estado_mapeo := 'sin_producto';
    RETURN NEW;
  END IF;

  -- 1) match exacto en alias
  SELECT producto_id INTO v_pid
  FROM ventas_alias_v2
  WHERE alias_tpv = v_nombre
  LIMIT 1;

  IF v_pid IS NOT NULL THEN
    NEW.producto_id := v_pid;
    NEW.estado_mapeo := 'mapeado_alias';
    RETURN NEW;
  END IF;

  -- 2) match por nombre exacto en productos
  SELECT id INTO v_pid
  FROM tb_v2.productos
  WHERE nombre = v_nombre
    AND tipo IN ('venta', 'ambos')
    AND activo = true
  LIMIT 1;

  IF v_pid IS NOT NULL THEN
    NEW.producto_id := v_pid;
    NEW.estado_mapeo := 'mapeado_producto_directo';
    RETURN NEW;
  END IF;

  -- Sin match
  NEW.estado_mapeo := 'sin_match';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_ventas_staging_resolver_alias ON tb_v2.ventas_staging;
CREATE TRIGGER tg_ventas_staging_resolver_alias
  BEFORE INSERT ON tb_v2.ventas_staging
  FOR EACH ROW EXECUTE FUNCTION tg_ventas_staging_resolver_alias();

-- 5. Vista: nombres del CSV sin mapeo (con stats de uso)
CREATE OR REPLACE VIEW vw_alias_pendientes AS
SELECT
  vs.articulo_raw                       AS alias_tpv,
  fn_normalizar_alias(vs.articulo_raw)  AS alias_normalizado,
  COUNT(*)                              AS n_ventas,
  MIN(vs.fecha)                         AS primera_venta,
  MAX(vs.fecha)                         AS ultima_venta,
  SUM(vs.uds_v)                         AS unidades_totales,
  SUM(vs.neto)                          AS importe_total
FROM tb_v2.ventas_staging vs
WHERE vs.producto_id IS NULL
  AND vs.articulo_raw IS NOT NULL
  AND vs.articulo_raw <> ''
GROUP BY vs.articulo_raw
ORDER BY COUNT(*) DESC;

-- 6. Vista: alias activos con stats
CREATE OR REPLACE VIEW vw_alias_activos AS
SELECT
  a.id                  AS alias_id,
  a.alias_tpv,
  a.alias_normalizado,
  a.producto_id,
  p.nombre              AS producto_nombre,
  p.codigo              AS producto_codigo,
  a.notas,
  a.created_at,
  a.updated_at,
  COUNT(vs.id)          AS n_ventas_mapeadas,
  SUM(vs.neto)          AS importe_total_mapeado
FROM ventas_alias_v2 a
JOIN tb_v2.productos p ON p.id = a.producto_id
LEFT JOIN tb_v2.ventas_staging vs
  ON vs.articulo_raw = a.alias_tpv AND vs.producto_id = a.producto_id
GROUP BY a.id, a.alias_tpv, a.alias_normalizado, a.producto_id,
         p.nombre, p.codigo, a.notas, a.created_at, a.updated_at;

-- 7. RPC: sugerir productos para un alias dado
CREATE OR REPLACE FUNCTION rpc_sugerir_producto_para_alias(p_alias_tpv text)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, tb_v2
AS $func$
DECLARE
  v_norm text;
  v_resultado json;
BEGIN
  v_norm := fn_normalizar_alias(p_alias_tpv);

  -- Estrategia:
  --   1) match exacto sobre nombre
  --   2) match exacto sobre nombre normalizado (sin numeros, etc.)
  --   3) match parcial: alias contiene producto o viceversa
  WITH candidatos AS (
    SELECT
      p.id,
      p.nombre,
      p.codigo,
      p.tipo,
      CASE
        WHEN p.nombre = p_alias_tpv THEN 'exacto'
        WHEN fn_normalizar_alias(p.nombre) = v_norm THEN 'normalizado'
        WHEN fn_normalizar_alias(p.nombre) ILIKE '%' || v_norm || '%'
          OR v_norm ILIKE '%' || fn_normalizar_alias(p.nombre) || '%'
        THEN 'parcial'
        ELSE NULL
      END AS tipo_match,
      CASE
        WHEN p.nombre = p_alias_tpv THEN 100
        WHEN fn_normalizar_alias(p.nombre) = v_norm THEN 90
        WHEN fn_normalizar_alias(p.nombre) ILIKE '%' || v_norm || '%' THEN 70
        WHEN v_norm ILIKE '%' || fn_normalizar_alias(p.nombre) || '%' THEN 60
        ELSE 0
      END AS confianza
    FROM tb_v2.productos p
    WHERE p.activo = true
      AND p.tipo IN ('venta', 'ambos')
  ),
  filtered AS (
    SELECT *
    FROM candidatos
    WHERE tipo_match IS NOT NULL
    ORDER BY confianza DESC, length(nombre)
    LIMIT 5
  )
  SELECT json_agg(
    json_build_object(
      'producto_id',  id,
      'nombre',       nombre,
      'codigo',       codigo,
      'tipo',         tipo,
      'tipo_match',   tipo_match,
      'confianza',    confianza
    )
  )
  FROM filtered
  INTO v_resultado;

  RETURN COALESCE(v_resultado, '[]'::json);
END;
$func$;

-- 8. RPC: crear/actualizar alias y reprocesar las ventas históricas
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

  -- Upsert del alias
  INSERT INTO ventas_alias_v2 (alias_tpv, alias_normalizado, producto_id, notas)
  VALUES (p_alias_tpv, fn_normalizar_alias(p_alias_tpv), p_producto_id, p_notas)
  ON CONFLICT (alias_tpv) DO UPDATE
    SET producto_id = EXCLUDED.producto_id,
        notas       = EXCLUDED.notas,
        updated_at  = now()
  RETURNING id INTO v_alias_id;

  -- Reprocesar ventas históricas que tengan ese nombre y NO esten ya mapeadas
  UPDATE tb_v2.ventas_staging
     SET producto_id   = p_producto_id,
         estado_mapeo  = 'mapeado_alias_retro'
   WHERE articulo_raw = p_alias_tpv
     AND (producto_id IS NULL OR producto_id = p_producto_id);

  GET DIAGNOSTICS v_ventas_actualizadas = ROW_COUNT;

  RETURN json_build_object(
    'ok', true,
    'alias_id', v_alias_id,
    'ventas_actualizadas', v_ventas_actualizadas
  );
END;
$func$;

-- 9. RPC: eliminar alias y revertir ventas (se las deja sin_match)
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

  -- Revertir ventas que se hayan resuelto via este alias retroactivamente
  UPDATE tb_v2.ventas_staging
     SET producto_id  = NULL,
         estado_mapeo = 'sin_match'
   WHERE articulo_raw = v_alias
     AND estado_mapeo IN ('mapeado_alias', 'mapeado_alias_retro');

  GET DIAGNOSTICS v_ventas_revertidas = ROW_COUNT;

  DELETE FROM ventas_alias_v2 WHERE id = p_alias_id;

  RETURN json_build_object(
    'ok', true,
    'ventas_revertidas', v_ventas_revertidas
  );
END;
$func$;

-- 10. RLS y permisos
ALTER TABLE ventas_alias_v2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON ventas_alias_v2;
CREATE POLICY "allow_all" ON ventas_alias_v2 FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ventas_alias_v2 TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ventas_alias_v2_id_seq TO authenticated;
GRANT SELECT ON vw_alias_pendientes TO authenticated;
GRANT SELECT ON vw_alias_activos TO authenticated;

GRANT EXECUTE ON FUNCTION fn_normalizar_alias(text) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_sugerir_producto_para_alias(text) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_crear_alias_y_reprocesar(text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_eliminar_alias_y_revertir(integer) TO authenticated;

COMMIT;
