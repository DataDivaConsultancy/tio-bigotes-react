-- ============================================================
-- MIGRACION: Simulador "cambiar PVP de un escandallo"
-- Fecha: 2026-05-01
-- Fase 4 del modulo Escandallo
-- ============================================================
-- Crea:
--   * rpc_simular_cambio_pvp        -- impacto de un PVP nuevo en el margen
--   * rpc_calcular_pvp_para_margen  -- modo inverso: PVP para alcanzar un margen objetivo
--   * fn_iva_pct_from_string        -- extrae el % numerico del string de tipo_iva
-- ============================================================

BEGIN;

-- Helper: extrae el % del string "Reducido 10%" -> 10
CREATE OR REPLACE FUNCTION fn_iva_pct_from_string(p_tipo_iva text)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(
    (regexp_match(COALESCE(p_tipo_iva, ''), '(\d+(\.\d+)?)\s*%'))[1]::numeric,
    0
  );
$$;

-- Simular: dado un escandallo y un PVP nuevo (con IVA), devuelve el impacto.
CREATE OR REPLACE FUNCTION rpc_simular_cambio_pvp(
  p_escandallo_id integer,
  p_pvp_simulado  numeric  -- PVP con IVA, en euros
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, tb_v2
AS $func$
DECLARE
  v_iva_default text;
  v_resultado json;
BEGIN
  -- Si el escandallo no tiene PVP en precios_venta, usar el IVA default de config
  SELECT valor INTO v_iva_default
  FROM configuracion_escandallo
  WHERE clave = 'iva_default_venta';

  WITH
  esc AS (
    SELECT id, producto_id, nombre, cantidad_resultado, unidad_resultado
    FROM escandallos
    WHERE id = p_escandallo_id AND activo = true
  ),
  resumen AS (
    -- Tomamos el coste por unidad ya calculado
    SELECT escandallo_id, coste_por_unidad
    FROM vw_escandallo_resumen
    WHERE escandallo_id = p_escandallo_id
  ),
  precio AS (
    SELECT pv.precio AS pvp_actual, pv.tipo_iva
    FROM esc
    LEFT JOIN precios_venta pv
      ON pv.producto_id = esc.producto_id
     AND pv.local_id IS NULL
     AND pv.canal IS NULL
     AND pv.franja_horaria IS NULL
     AND pv.dia_semana IS NULL
     AND pv.activo = true
  ),
  calculo AS (
    SELECT
      esc.id              AS escandallo_id,
      esc.producto_id,
      esc.nombre,
      esc.cantidad_resultado,
      esc.unidad_resultado,
      r.coste_por_unidad,
      precio.pvp_actual,
      COALESCE(precio.tipo_iva, v_iva_default, 'Reducido 10%') AS tipo_iva,
      fn_iva_pct_from_string(
        COALESCE(precio.tipo_iva, v_iva_default, 'Reducido 10%')
      ) AS iva_pct,
      p_pvp_simulado AS pvp_simulado
    FROM esc
    LEFT JOIN resumen r ON r.escandallo_id = esc.id
    LEFT JOIN precio   ON true
  )
  SELECT json_build_object(
    'escandallo_id',           c.escandallo_id,
    'producto_id',             c.producto_id,
    'nombre',                  c.nombre,
    'cantidad_resultado',      c.cantidad_resultado,
    'unidad_resultado',        c.unidad_resultado,
    'coste_por_unidad',        c.coste_por_unidad,
    'tipo_iva',                c.tipo_iva,
    'iva_pct',                 c.iva_pct,
    -- Actuales
    'pvp_actual_con_iva',      c.pvp_actual,
    'pvp_actual_sin_iva',
      CASE WHEN c.pvp_actual IS NOT NULL
        THEN c.pvp_actual / (1 + c.iva_pct/100)
        ELSE NULL END,
    'margen_actual_eur',
      CASE WHEN c.pvp_actual IS NOT NULL AND c.coste_por_unidad IS NOT NULL
        THEN (c.pvp_actual / (1 + c.iva_pct/100)) - c.coste_por_unidad
        ELSE NULL END,
    'margen_actual_pct',
      CASE WHEN c.pvp_actual IS NOT NULL AND c.pvp_actual > 0 AND c.coste_por_unidad IS NOT NULL
        THEN (((c.pvp_actual / (1 + c.iva_pct/100)) - c.coste_por_unidad)
              / (c.pvp_actual / (1 + c.iva_pct/100))) * 100
        ELSE NULL END,
    -- Simulados (con el PVP nuevo c/IVA)
    'pvp_simulado_con_iva',    c.pvp_simulado,
    'pvp_simulado_sin_iva',    c.pvp_simulado / (1 + c.iva_pct/100),
    'margen_simulado_eur',
      CASE WHEN c.coste_por_unidad IS NOT NULL
        THEN (c.pvp_simulado / (1 + c.iva_pct/100)) - c.coste_por_unidad
        ELSE NULL END,
    'margen_simulado_pct',
      CASE WHEN c.pvp_simulado > 0 AND c.coste_por_unidad IS NOT NULL
        THEN (((c.pvp_simulado / (1 + c.iva_pct/100)) - c.coste_por_unidad)
              / (c.pvp_simulado / (1 + c.iva_pct/100))) * 100
        ELSE NULL END,
    -- Deltas
    'delta_pvp_con_iva',
      CASE WHEN c.pvp_actual IS NOT NULL
        THEN c.pvp_simulado - c.pvp_actual
        ELSE NULL END,
    'delta_pvp_pct',
      CASE WHEN c.pvp_actual IS NOT NULL AND c.pvp_actual > 0
        THEN ((c.pvp_simulado - c.pvp_actual) / c.pvp_actual) * 100
        ELSE NULL END,
    'delta_margen_pp',
      CASE WHEN c.pvp_actual IS NOT NULL AND c.pvp_actual > 0 AND c.pvp_simulado > 0
        AND c.coste_por_unidad IS NOT NULL
        THEN ((((c.pvp_simulado / (1 + c.iva_pct/100)) - c.coste_por_unidad)
                / (c.pvp_simulado / (1 + c.iva_pct/100))) * 100)
           - ((((c.pvp_actual / (1 + c.iva_pct/100)) - c.coste_por_unidad)
                / (c.pvp_actual / (1 + c.iva_pct/100))) * 100)
        ELSE NULL END
  )
  FROM calculo c
  INTO v_resultado;

  RETURN COALESCE(v_resultado, json_build_object('error', 'escandallo no encontrado'));
END;
$func$;

-- Inverso: dado un % de margen objetivo, calcular el PVP necesario (con IVA).
-- Formula: PVP_sin_iva = coste / (1 - margen_obj/100)
--          PVP_con_iva = PVP_sin_iva * (1 + iva_pct/100)
CREATE OR REPLACE FUNCTION rpc_calcular_pvp_para_margen(
  p_escandallo_id     integer,
  p_margen_objetivo_pct numeric  -- ej. 60 para 60%
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, tb_v2
AS $func$
DECLARE
  v_iva_default text;
  v_resultado json;
BEGIN
  IF p_margen_objetivo_pct >= 100 OR p_margen_objetivo_pct < 0 THEN
    RETURN json_build_object('error', 'margen objetivo debe estar entre 0 y 99.99');
  END IF;

  SELECT valor INTO v_iva_default
  FROM configuracion_escandallo
  WHERE clave = 'iva_default_venta';

  WITH
  esc AS (
    SELECT id, producto_id, nombre
    FROM escandallos WHERE id = p_escandallo_id AND activo = true
  ),
  r AS (
    SELECT coste_por_unidad
    FROM vw_escandallo_resumen
    WHERE escandallo_id = p_escandallo_id
  ),
  pv AS (
    SELECT pv.precio AS pvp_actual, pv.tipo_iva
    FROM esc
    LEFT JOIN precios_venta pv
      ON pv.producto_id = esc.producto_id
     AND pv.local_id IS NULL
     AND pv.canal IS NULL AND pv.franja_horaria IS NULL AND pv.dia_semana IS NULL
     AND pv.activo = true
  ),
  calc AS (
    SELECT
      esc.id, esc.producto_id, esc.nombre,
      r.coste_por_unidad,
      pv.pvp_actual,
      COALESCE(pv.tipo_iva, v_iva_default, 'Reducido 10%') AS tipo_iva,
      fn_iva_pct_from_string(
        COALESCE(pv.tipo_iva, v_iva_default, 'Reducido 10%')
      ) AS iva_pct,
      r.coste_por_unidad / (1 - p_margen_objetivo_pct/100) AS pvp_objetivo_sin_iva
    FROM esc
    LEFT JOIN r ON true
    LEFT JOIN pv ON true
  )
  SELECT json_build_object(
    'escandallo_id',          c.id,
    'producto_id',            c.producto_id,
    'nombre',                 c.nombre,
    'coste_por_unidad',       c.coste_por_unidad,
    'tipo_iva',               c.tipo_iva,
    'iva_pct',                c.iva_pct,
    'margen_objetivo_pct',    p_margen_objetivo_pct,
    'pvp_objetivo_sin_iva',   c.pvp_objetivo_sin_iva,
    'pvp_objetivo_con_iva',   c.pvp_objetivo_sin_iva * (1 + c.iva_pct/100),
    -- Redondeos sugeridos (psicologicos)
    'pvp_objetivo_redondeo_5c',
      CEIL(c.pvp_objetivo_sin_iva * (1 + c.iva_pct/100) * 20) / 20.0,
    'pvp_objetivo_redondeo_10c',
      CEIL(c.pvp_objetivo_sin_iva * (1 + c.iva_pct/100) * 10) / 10.0,
    'pvp_actual_con_iva',     c.pvp_actual,
    'delta_pvp_con_iva',
      CASE WHEN c.pvp_actual IS NOT NULL
        THEN (c.pvp_objetivo_sin_iva * (1 + c.iva_pct/100)) - c.pvp_actual
        ELSE NULL END
  )
  FROM calc c
  INTO v_resultado;

  RETURN COALESCE(v_resultado, json_build_object('error', 'escandallo no encontrado'));
END;
$func$;

GRANT EXECUTE ON FUNCTION fn_iva_pct_from_string(text) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_simular_cambio_pvp(integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_calcular_pvp_para_margen(integer, numeric) TO authenticated;

COMMIT;
