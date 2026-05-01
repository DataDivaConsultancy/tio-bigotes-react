-- ============================================================
-- FIX: Eliminar firmas duplicadas de rpc_crear_escandallo
-- Fecha: 2026-05-01
-- ============================================================
-- Problema:
--   En la base existen DOS versiones de rpc_crear_escandallo:
--     1) (p_producto_id, p_nombre, p_descripcion, p_unidad_resultado,
--         p_cantidad_resultado, p_es_subreceta, p_lineas)
--     2) (p_producto_id, p_nombre, p_descripcion, p_unidad_resultado,
--         p_cantidad_resultado, p_es_subreceta, p_notas, p_lineas)
--   Cuando el frontend la llama por nombre sin pasar p_notas, Postgres
--   no puede decidir cuál usar y lanza:
--     "Could not choose the best candidate function between..."
--
-- Solución:
--   1) DROP explícito de las dos firmas
--   2) CREATE de UNA sola firma canónica que incluye p_notas opcional
--      (default NULL). El frontend la sigue llamando igual que antes,
--      pero Postgres ya tiene una sola candidata.
-- ============================================================

BEGIN;

-- 1. DROP explícito de las dos firmas que pueden coexistir
DROP FUNCTION IF EXISTS rpc_crear_escandallo(
  integer, text, text, text, numeric, boolean, jsonb
);

DROP FUNCTION IF EXISTS rpc_crear_escandallo(
  integer, text, text, text, numeric, boolean, text, jsonb
);

-- 2. Crear la versión canónica única (con p_notas opcional)
CREATE OR REPLACE FUNCTION rpc_crear_escandallo(
  p_producto_id        integer,
  p_nombre             text,
  p_descripcion        text DEFAULT NULL,
  p_unidad_resultado   text DEFAULT 'ud',
  p_cantidad_resultado numeric DEFAULT 1,
  p_es_subreceta       boolean DEFAULT false,
  p_lineas             jsonb DEFAULT '[]'::jsonb,
  p_notas              text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, tb_v2
AS $$
DECLARE
  v_escandallo_id integer;
  v_linea jsonb;
BEGIN
  -- Desactivar escandallos anteriores del mismo producto
  IF p_producto_id IS NOT NULL THEN
    UPDATE escandallos SET activo = false
    WHERE producto_id = p_producto_id AND activo = true;
  END IF;

  -- Crear cabecera
  INSERT INTO escandallos (
    producto_id, nombre, descripcion,
    unidad_resultado, cantidad_resultado,
    es_subreceta, notas
  ) VALUES (
    p_producto_id, p_nombre, p_descripcion,
    p_unidad_resultado, p_cantidad_resultado,
    p_es_subreceta, p_notas
  )
  RETURNING id INTO v_escandallo_id;

  -- Insertar líneas
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    INSERT INTO escandallo_lineas (
      escandallo_id, componente_producto_id, componente_escandallo_id,
      cantidad_bruta, unidad, merma_pct, coste_override, notas, orden
    ) VALUES (
      v_escandallo_id,
      (v_linea->>'componente_producto_id')::integer,
      (v_linea->>'componente_escandallo_id')::integer,
      (v_linea->>'cantidad_bruta')::numeric,
      v_linea->>'unidad',
      COALESCE((v_linea->>'merma_pct')::numeric, 0),
      (v_linea->>'coste_override')::numeric,
      v_linea->>'notas',
      COALESCE((v_linea->>'orden')::integer, 0)
    );
  END LOOP;

  RETURN json_build_object('ok', true, 'id', v_escandallo_id);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_crear_escandallo(
  integer, text, text, text, numeric, boolean, jsonb, text
) TO authenticated;

COMMIT;
