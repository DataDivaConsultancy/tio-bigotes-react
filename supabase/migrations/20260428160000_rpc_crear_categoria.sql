-- RPC para crear categoría de producto desde la UI
-- Inserta en tb_v2.categorias_producto (que está en schema separado).
CREATE OR REPLACE FUNCTION rpc_crear_categoria_producto(
  p_nombre text,
  p_codigo text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, tb_v2
AS $$
DECLARE
  v_codigo text;
  v_id integer;
BEGIN
  IF p_nombre IS NULL OR TRIM(p_nombre) = '' THEN
    RETURN json_build_object('ok', false, 'error', 'falta_nombre');
  END IF;

  -- Si no se pasa código, generarlo a partir del nombre (lowercase, sin espacios)
  v_codigo := COALESCE(NULLIF(TRIM(p_codigo), ''), LOWER(REGEXP_REPLACE(TRIM(p_nombre), '\s+', '_', 'g')));

  -- Detectar si ya existe una con ese código o nombre
  IF EXISTS (
    SELECT 1 FROM tb_v2.categorias_producto
     WHERE LOWER(codigo) = LOWER(v_codigo) OR LOWER(nombre) = LOWER(TRIM(p_nombre))
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'ya_existe', 'mensaje', 'Ya existe una categoría con ese nombre o código');
  END IF;

  INSERT INTO tb_v2.categorias_producto (codigo, nombre)
  VALUES (v_codigo, TRIM(p_nombre))
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'data', json_build_object(
    'id', v_id, 'codigo', v_codigo, 'nombre', TRIM(p_nombre)
  ));
END;
$$;
