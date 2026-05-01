-- ============================================================
-- MIGRACION: Simulador de cambio de precio + configuracion
-- Fecha: 2026-05-01
-- Fase 4 del modulo Escandallo
-- ============================================================
-- Crea:
--   * configuracion_escandallo       -- tabla key/value de umbrales
--   * rpc_get_config_escandallo      -- leer un valor de config
--   * rpc_set_config_escandallo      -- actualizar un valor de config
--   * rpc_simular_cambio_precio      -- impacto de cambio de precio de
--     un ingrediente sobre todos los escandallos afectados (incluyendo
--     recursivamente via sub-recetas, hasta 5 niveles)
-- ============================================================

BEGIN;

-- 1. CONFIGURACION GLOBAL DEL MODULO
CREATE TABLE IF NOT EXISTS configuracion_escandallo (
  clave         text PRIMARY KEY,
  valor         text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('numero', 'texto', 'booleano')),
  descripcion   text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO configuracion_escandallo (clave, valor, tipo, descripcion) VALUES
  ('margen_bajo_pct',   '40', 'numero',
   'Umbral por debajo del cual el margen se considera bajo (alerta roja)'),
  ('margen_medio_pct',  '60', 'numero',
   'Umbral medio: entre bajo y medio se muestra amarillo, por encima verde'),
  ('iva_default_venta', 'Reducido 10%', 'texto',
   'Tipo de IVA por defecto al crear un nuevo precio de venta de comida')
ON CONFLICT (clave) DO NOTHING;

-- 2. RPCs DE CONFIGURACION
CREATE OR REPLACE FUNCTION rpc_get_config_escandallo(p_clave text)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT valor FROM configuracion_escandallo WHERE clave = p_clave;
$$;

CREATE OR REPLACE FUNCTION rpc_set_config_escandallo(p_clave text, p_valor text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE configuracion_escandallo
     SET valor = p_valor, updated_at = now()
   WHERE clave = p_clave;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'clave no existe');
  END IF;
  RETURN json_build_object('ok', true, 'clave', p_clave, 'valor', p_valor);
END;
$$;

-- 3. SIMULADOR DE CAMBIO DE PRECIO
CREATE OR REPLACE FUNCTION rpc_simular_cambio_precio(
  p_producto_id     integer,
  p_precio_simulado numeric
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, tb_v2
AS $func$
DECLARE
  v_resultado json;
BEGIN
  WITH RECURSIVE
  expansion AS (
    -- Caso base. Casts explicitos para que el UNION ALL recursivo
    -- compatibilice tipos (cantidad_bruta, merma_pct, coste_override).
    SELECT
      e.id                            AS escandallo_raiz,
      el.id                           AS linea_id,
      el.escandallo_id                AS escandallo_actual,
      el.componente_producto_id,
      el.componente_escandallo_id,
      el.cantidad_bruta::numeric      AS cantidad_bruta,
      el.unidad,
      el.merma_pct::numeric           AS merma_pct,
      el.coste_override::numeric      AS coste_override,
      1                               AS nivel,
      ARRAY[e.id]                     AS path
    FROM escandallos e
    JOIN escandallo_lineas el ON el.escandallo_id = e.id
    WHERE e.activo = true

    UNION ALL

    SELECT
      exp.escandallo_raiz,
      sub_el.id                                            AS linea_id,
      sub_el.escandallo_id                                 AS escandallo_actual,
      sub_el.componente_producto_id,
      sub_el.componente_escandallo_id,
      (exp.cantidad_bruta * sub_el.cantidad_bruta
        / NULLIF(sub_e.cantidad_resultado, 0))::numeric    AS cantidad_bruta,
      sub_el.unidad,
      sub_el.merma_pct::numeric                            AS merma_pct,
      sub_el.coste_override::numeric                       AS coste_override,
      exp.nivel + 1                                        AS nivel,
      exp.path || sub_el.escandallo_id                     AS path
    FROM expansion exp
    JOIN escandallos sub_e
      ON sub_e.id = exp.componente_escandallo_id
     AND sub_e.activo = true
    JOIN escandallo_lineas sub_el
      ON sub_el.escandallo_id = sub_e.id
    WHERE exp.componente_escandallo_id IS NOT NULL
      AND exp.nivel < 5
      AND NOT (sub_el.escandallo_id = ANY(exp.path))
  ),
  hojas AS (
    SELECT
      exp.escandallo_raiz,
      exp.cantidad_bruta,
      exp.componente_producto_id,
      exp.unidad,
      COALESCE(exp.coste_override, p.precio_compra, 0) AS coste_unitario_actual,
      CASE
        WHEN exp.componente_producto_id = p_producto_id
          THEN p_precio_simulado
        ELSE COALESCE(exp.coste_override, p.precio_compra, 0)
      END AS coste_unitario_simulado,
      exp.cantidad_bruta * COALESCE(exp.coste_override, p.precio_compra, 0)
        AS coste_linea_actual,
      exp.cantidad_bruta * CASE
        WHEN exp.componente_producto_id = p_producto_id
          THEN p_precio_simulado
        ELSE COALESCE(exp.coste_override, p.precio_compra, 0)
      END AS coste_linea_simulado,
      CASE
        WHEN exp.componente_producto_id = p_producto_id
          THEN exp.cantidad_bruta
        ELSE 0
      END AS cantidad_target,
      CASE
        WHEN exp.componente_producto_id = p_producto_id
          THEN exp.unidad
        ELSE NULL
      END AS unidad_target
    FROM expansion exp
    LEFT JOIN tb_v2.productos p ON p.id = exp.componente_producto_id
    WHERE exp.componente_producto_id IS NOT NULL
  ),
  agregado AS (
    SELECT
      h.escandallo_raiz,
      SUM(h.coste_linea_actual)   AS coste_total_actual,
      SUM(h.coste_linea_simulado) AS coste_total_simulado,
      SUM(h.cantidad_target)      AS cantidad_total_afectada,
      MAX(h.unidad_target)        AS unidad_afectada,
      BOOL_OR(h.componente_producto_id = p_producto_id) AS tiene_producto
    FROM hojas h
    GROUP BY h.escandallo_raiz
  ),
  afectados AS (
    SELECT
      e.id                AS escandallo_id,
      e.producto_id,
      e.nombre,
      e.cantidad_resultado,
      e.unidad_resultado,
      pv.precio           AS pvp_base,
      a.coste_total_actual,
      a.coste_total_simulado,
      a.coste_total_actual   / NULLIF(e.cantidad_resultado, 0) AS coste_por_unidad_actual,
      a.coste_total_simulado / NULLIF(e.cantidad_resultado, 0) AS coste_por_unidad_simulado,
      a.cantidad_total_afectada,
      a.unidad_afectada
    FROM escandallos e
    JOIN agregado a ON a.escandallo_raiz = e.id
    LEFT JOIN precios_venta pv ON pv.producto_id = e.producto_id
      AND pv.local_id IS NULL
      AND pv.canal IS NULL
      AND pv.franja_horaria IS NULL
      AND pv.dia_semana IS NULL
      AND pv.activo = true
    WHERE e.activo = true
      AND a.tiene_producto = true
  )
  SELECT json_agg(row_obj ORDER BY abs_delta DESC)
  FROM (
    SELECT
      json_build_object(
        'escandallo_id',             escandallo_id,
        'producto_id',               producto_id,
        'nombre',                    nombre,
        'cantidad_resultado',        cantidad_resultado,
        'unidad_resultado',          unidad_resultado,
        'pvp_base',                  pvp_base,
        'coste_total_actual',        coste_total_actual,
        'coste_total_simulado',      coste_total_simulado,
        'coste_por_unidad_actual',   coste_por_unidad_actual,
        'coste_por_unidad_simulado', coste_por_unidad_simulado,
        'delta_coste_unitario',
          coste_por_unidad_simulado - coste_por_unidad_actual,
        'margen_actual_pct',
          CASE WHEN pvp_base IS NOT NULL AND pvp_base > 0
            THEN ((pvp_base - coste_por_unidad_actual) / pvp_base) * 100
            ELSE NULL END,
        'margen_simulado_pct',
          CASE WHEN pvp_base IS NOT NULL AND pvp_base > 0
            THEN ((pvp_base - coste_por_unidad_simulado) / pvp_base) * 100
            ELSE NULL END,
        'delta_margen_pct',
          CASE WHEN pvp_base IS NOT NULL AND pvp_base > 0
            THEN (((pvp_base - coste_por_unidad_simulado) / pvp_base) * 100)
               - (((pvp_base - coste_por_unidad_actual)   / pvp_base) * 100)
            ELSE NULL END,
        'cantidad_total_afectada',   cantidad_total_afectada,
        'unidad_afectada',           unidad_afectada
      ) AS row_obj,
      ABS(coste_por_unidad_simulado - coste_por_unidad_actual) AS abs_delta
    FROM afectados
  ) sub
  INTO v_resultado;

  RETURN COALESCE(v_resultado, '[]'::json);
END;
$func$;

-- 4. RLS y trigger updated_at
ALTER TABLE configuracion_escandallo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all" ON configuracion_escandallo;
CREATE POLICY "allow_all" ON configuracion_escandallo
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS tg_config_escandallo_updated_at ON configuracion_escandallo;
CREATE TRIGGER tg_config_escandallo_updated_at
  BEFORE UPDATE ON configuracion_escandallo
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- 5. PERMISOS
GRANT SELECT, INSERT, UPDATE, DELETE ON configuracion_escandallo TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_get_config_escandallo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_set_config_escandallo(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_simular_cambio_precio(integer, numeric) TO authenticated;

COMMIT;
