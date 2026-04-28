-- ============================================================
-- Migración: sincronizar tb_v2.productos → productos_compra_v2 (F0-6c v2)
-- Fecha: 2026-04-28
-- Tarea: F0-6c
--
-- Crea un gemelo de cada producto_v2 vendible en productos_compra_v2,
-- con proveedor_id = 1 (Tio Bigotes), tipo_iva 'Reducido 10%' por defecto.
-- ============================================================

-- ── 1. Sincronización inicial ────────────────────────────────
INSERT INTO productos_compra_v2 (
  nombre, proveedor_id, producto_venta_id,
  precio, tipo_iva, unidad_medida, unidad_minima_compra,
  cod_interno, activo
)
SELECT
  pv.nombre,
  1                   AS proveedor_id,
  pv.id               AS producto_venta_id,
  NULL                AS precio,
  'Reducido 10%'      AS tipo_iva,
  'unidad'            AS unidad_medida,
  1                   AS unidad_minima_compra,
  pv.codigo           AS cod_interno,
  pv.activo           AS activo
FROM tb_v2.productos pv
WHERE pv.es_vendible IS DISTINCT FROM false
  AND NOT EXISTS (
    SELECT 1 FROM productos_compra_v2 pc
    WHERE pc.producto_venta_id = pv.id
  );

-- ── 2. Trigger en la tabla real tb_v2.productos ──────────────
CREATE OR REPLACE FUNCTION tg_sync_producto_venta_a_compra()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.es_vendible IS DISTINCT FROM false THEN
    IF NOT EXISTS (
      SELECT 1 FROM productos_compra_v2 pc
      WHERE pc.producto_venta_id = NEW.id
    ) THEN
      INSERT INTO productos_compra_v2 (
        nombre, proveedor_id, producto_venta_id,
        precio, tipo_iva, unidad_medida, unidad_minima_compra,
        cod_interno, activo
      ) VALUES (
        NEW.nombre, 1, NEW.id,
        NULL, 'Reducido 10%', 'unidad', 1,
        NEW.codigo, NEW.activo
      );
    ELSE
      UPDATE productos_compra_v2 SET
        nombre      = NEW.nombre,
        cod_interno = NEW.codigo,
        activo      = NEW.activo,
        updated_at  = now()
      WHERE producto_venta_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_sync_productos_venta ON tb_v2.productos;
CREATE TRIGGER tg_sync_productos_venta
  AFTER INSERT OR UPDATE OF nombre, codigo, activo, es_vendible ON tb_v2.productos
  FOR EACH ROW EXECUTE FUNCTION tg_sync_producto_venta_a_compra();

COMMENT ON FUNCTION tg_sync_producto_venta_a_compra() IS
  'Mantiene productos_compra_v2 con un gemelo de cada producto_v2 vendible (proveedor Tio Bigotes id=1).';
