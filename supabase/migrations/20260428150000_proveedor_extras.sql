-- ============================================================
-- Migración: ficha proveedor extendida (categorías + contacto detallado)
-- Fecha: 2026-04-28
-- Tarea: F0-6d
-- ============================================================

-- 1. Añadir apellido al contacto y relajar el CHECK de rol (-> cargo libre)
ALTER TABLE proveedor_contactos ADD COLUMN IF NOT EXISTS apellido text;

-- Eliminar CHECK constraint si existe (rol pasa a ser texto libre = cargo)
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'proveedor_contactos'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%rol%comercial%';
  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE proveedor_contactos DROP CONSTRAINT ' || quote_ident(c);
  END IF;
END $$;

COMMENT ON COLUMN proveedor_contactos.rol IS 'Cargo del contacto (texto libre, ej: Director Comercial)';

-- 2. Tabla proveedor_categorias (M:N con categorias_producto_v2)
CREATE TABLE IF NOT EXISTS proveedor_categorias (
  proveedor_id  integer NOT NULL REFERENCES proveedores_v2(id) ON DELETE CASCADE,
  categoria_id  integer NOT NULL,           -- FK lógica a tb_v2.categorias_producto.id
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proveedor_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS ix_pc_proveedor ON proveedor_categorias(proveedor_id);
CREATE INDEX IF NOT EXISTS ix_pc_categoria ON proveedor_categorias(categoria_id);

ALTER TABLE proveedor_categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_proveedor_categorias" ON proveedor_categorias;
CREATE POLICY "allow_all_proveedor_categorias" ON proveedor_categorias
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE proveedor_categorias IS
  'Categorías de productos que suministra cada proveedor. Multi-select.';

-- 3. Vista de conveniencia: categorías de cada proveedor con nombre legible
CREATE OR REPLACE VIEW v_proveedor_categorias AS
SELECT
  pc.proveedor_id,
  pc.categoria_id,
  cp.codigo  AS categoria_codigo,
  cp.nombre  AS categoria_nombre
FROM proveedor_categorias pc
JOIN categorias_producto_v2 cp ON cp.id = pc.categoria_id;

-- 4. RPC: setear categorías de un proveedor (delete + insert)
CREATE OR REPLACE FUNCTION rpc_set_proveedor_categorias(
  p_proveedor_id integer,
  p_categoria_ids integer[]
)
RETURNS json LANGUAGE plpgsql AS $$
BEGIN
  IF p_proveedor_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'falta_proveedor');
  END IF;

  DELETE FROM proveedor_categorias WHERE proveedor_id = p_proveedor_id;

  IF p_categoria_ids IS NOT NULL AND array_length(p_categoria_ids, 1) > 0 THEN
    INSERT INTO proveedor_categorias (proveedor_id, categoria_id)
    SELECT p_proveedor_id, unnest(p_categoria_ids)
    ON CONFLICT (proveedor_id, categoria_id) DO NOTHING;
  END IF;

  RETURN json_build_object('ok', true, 'data', json_build_object(
    'proveedor_id', p_proveedor_id,
    'categorias', COALESCE(array_length(p_categoria_ids, 1), 0)
  ));
END;
$$;

-- 5. RPC: setear contacto primario detallado (con nombre, apellido, cargo)
CREATE OR REPLACE FUNCTION rpc_set_contacto_primario(
  p_proveedor_id integer,
  p_nombre   text,
  p_apellido text DEFAULT NULL,
  p_cargo    text DEFAULT NULL,
  p_email    text DEFAULT NULL,
  p_telefono text DEFAULT NULL,
  p_movil    text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql AS $$
BEGIN
  IF p_proveedor_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'falta_proveedor');
  END IF;

  IF EXISTS (
    SELECT 1 FROM proveedor_contactos
    WHERE proveedor_id = p_proveedor_id AND es_primario = true
  ) THEN
    UPDATE proveedor_contactos SET
      nombre   = COALESCE(NULLIF(TRIM(p_nombre), ''), nombre),
      apellido = COALESCE(NULLIF(TRIM(p_apellido), ''), apellido),
      rol      = COALESCE(NULLIF(TRIM(p_cargo), ''), rol),
      email    = COALESCE(NULLIF(TRIM(p_email), ''), email),
      telefono = COALESCE(NULLIF(TRIM(p_telefono), ''), telefono),
      movil    = COALESCE(NULLIF(TRIM(p_movil), ''), movil),
      updated_at = now()
    WHERE proveedor_id = p_proveedor_id AND es_primario = true;
  ELSE
    INSERT INTO proveedor_contactos (
      proveedor_id, nombre, apellido, rol, email, telefono, movil, es_primario
    ) VALUES (
      p_proveedor_id,
      COALESCE(NULLIF(TRIM(p_nombre), ''), '(sin nombre)'),
      NULLIF(TRIM(p_apellido), ''),
      NULLIF(TRIM(p_cargo), ''),
      NULLIF(TRIM(p_email), ''),
      NULLIF(TRIM(p_telefono), ''),
      NULLIF(TRIM(p_movil), ''),
      true
    );
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;
