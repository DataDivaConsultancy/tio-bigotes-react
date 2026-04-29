-- ============================================================
-- MIGRACIÃN: Unificar productos como tabla maestra
-- Fecha: 2026-04-29
-- ============================================================
-- Agrega campos de compra a tb_v2.productos (la tabla base real).
-- Recrea las vistas productos_v2, tb_v2.vw_productos_dim y
-- vw_productos_dim para exponer los nuevos campos.
-- Migra datos desde productos_compra_v2 y crea trigger de sync.
-- ============================================================

BEGIN;

-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- 1. Nuevas columnas en tb_v2.productos (campos de compra)
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'venta'
  CHECK (tipo IN ('venta','compra','ambos'));

ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS proveedor_id integer;
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS cod_proveedor text;
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS cod_interno text;
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS precio_compra numeric(10,2);
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS tipo_iva text
  CHECK (tipo_iva IS NULL OR tipo_iva IN ('General 21%','Reducido 10%','Superreducido 4%','Exento 0%'));
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS dia_pedido text;
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS dia_entrega text;
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS stock_minimo numeric DEFAULT 0;
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS unidades_por_paquete numeric DEFAULT 1;
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS forma_pago text;
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS plazo_pago text;
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS notas text;

-- ID del registro legacy en productos_compra_v2 (para FK sync)
ALTER TABLE tb_v2.productos ADD COLUMN IF NOT EXISTS compra_legacy_id integer;

-- Ãndices Ãºtiles
CREATE INDEX IF NOT EXISTS idx_tb_productos_tipo ON tb_v2.productos(tipo);
CREATE INDEX IF NOT EXISTS idx_tb_productos_proveedor ON tb_v2.productos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_tb_productos_compra_legacy ON tb_v2.productos(compra_legacy_id);

-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- 2. Marcar productos existentes como tipo 'venta'
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
UPDATE tb_v2.productos
SET tipo = 'venta'
WHERE tipo IS NULL;

-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- 3. Recrear vista productos_v2 para incluir nuevos campos
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
CREATE OR REPLACE VIEW public.productos_v2 AS
SELECT
  id, codigo, nombre, nombre_normalizado,
  categoria_id, subtipo, activo,
  es_vendible, es_producible, afecta_forecast,
  uds_equivalentes_empanadas, uds_equivalentes_bebidas,
  prioridad_produccion, observaciones, created_at,
  visible_en_control_diario, visible_en_forecast,
  orden_visual, fecha_inicio_venta, fecha_fin_venta,
  -- Nuevos campos de compra
  tipo, proveedor_id, cod_proveedor, cod_interno,
  precio_compra, tipo_iva, dia_pedido, dia_entrega,
  stock_minimo, unidades_por_paquete, forma_pago, plazo_pago,
  notas, compra_legacy_id
FROM tb_v2.productos;

-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- 4. Recrear vista tb_v2.vw_productos_dim con nuevos campos
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
CREATE OR REPLACE VIEW tb_v2.vw_productos_dim AS
SELECT
  p.id AS producto_id,
  p.codigo,
  p.nombre AS producto_nombre,
  p.nombre_normalizado,
  p.activo,
  p.es_vendible,
  p.es_producible,
  p.afecta_forecast,
  p.visible_en_control_diario,
  p.visible_en_forecast,
  p.orden_visual,
  p.fecha_inicio_venta,
  p.fecha_fin_venta,
  p.uds_equivalentes_empanadas,
  p.uds_equivalentes_bebidas,
  p.prioridad_produccion,
  p.subtipo,
  p.observaciones,
  cp.id AS categoria_id,
  cp.codigo AS categoria_codigo,
  cp.nombre AS categoria_nombre,
  -- Nuevos campos de compra
  p.tipo,
  p.proveedor_id,
  p.cod_proveedor,
  p.cod_interno,
  p.precio_compra,
  p.tipo_iva,
  p.dia_pedido,
  p.dia_entrega,
  p.stock_minimo,
  p.unidades_por_paquete,
  p.forma_pago,
  p.plazo_pago,
  p.notas,
  p.compra_legacy_id
FROM tb_v2.productos p
LEFT JOIN tb_v2.categorias_producto cp ON cp.id = p.categoria_id;

-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- 5. Recrear vista pÃºblica vw_productos_dim con nuevos campos
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
CREATE OR REPLACE VIEW public.vw_productos_dim AS
SELECT
  p.producto_id AS id,
  p.codigo,
  p.producto_nombre AS nombre,
  p.nombre_normalizado,
  p.activo,
  p.es_vendible,
  p.es_producible,
  p.afecta_forecast,
  p.fecha_inicio_venta,
  p.fecha_fin_venta,
  p.categoria_id,
  p.categoria_codigo,
  p.categoria_nombre AS categoria,
  p.observaciones,
  NULL::numeric AS precio_venta,
  -- Nuevos campos de compra
  p.tipo,
  p.proveedor_id,
  p.cod_proveedor,
  p.cod_interno,
  p.precio_compra,
  p.tipo_iva,
  p.dia_pedido,
  p.dia_entrega,
  p.stock_minimo,
  p.unidades_por_paquete,
  p.forma_pago,
  p.plazo_pago,
  p.notas,
  p.compra_legacy_id,
  -- Nombre del proveedor (join)
  prov.nombre_comercial AS proveedor_nombre
FROM tb_v2.vw_productos_dim p
LEFT JOIN public.proveedores_v2 prov ON prov.id = p.proveedor_id;

-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- 6. Migrar datos de productos_compra_v2 â tb_v2.productos
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

-- 6a. Productos de compra que YA tienen producto_venta_id â enriquecer
UPDATE tb_v2.productos pv
SET
  tipo            = 'ambos',
  proveedor_id    = COALESCE(pv.proveedor_id, pc.proveedor_id),
  cod_proveedor   = COALESCE(pv.cod_proveedor, pc.cod_proveedor),
  cod_interno     = COALESCE(pv.cod_interno, pc.cod_interno),
  precio_compra   = COALESCE(pv.precio_compra, pc.precio),
  tipo_iva        = COALESCE(pv.tipo_iva, pc.tipo_iva),
  dia_pedido      = COALESCE(pv.dia_pedido, pc.dia_pedido),
  dia_entrega     = COALESCE(pv.dia_entrega, pc.dia_entrega),
  stock_minimo    = COALESCE(pv.stock_minimo, pc.stock_minimo),
  unidades_por_paquete = COALESCE(pv.unidades_por_paquete, pc.unidad_minima_compra, 1),
  forma_pago      = COALESCE(pv.forma_pago, pc.forma_pago),
  plazo_pago      = COALESCE(pv.plazo_pago, pc.plazo_pago),
  compra_legacy_id = pc.id
FROM productos_compra_v2 pc
WHERE pc.producto_venta_id = pv.id
  AND pc.activo = true;

-- 6b. Productos de compra SIN producto_venta_id â insertar nuevos
INSERT INTO tb_v2.productos (
  nombre, nombre_normalizado, codigo,
  activo, es_vendible, es_producible, afecta_forecast,
  tipo, proveedor_id, cod_proveedor, cod_interno,
  precio_compra, tipo_iva,
  dia_pedido, dia_entrega, stock_minimo,
  unidades_por_paquete, forma_pago, plazo_pago,
  compra_legacy_id
)
SELECT
  pc.nombre,
  lower(unaccent(pc.nombre)),
  pc.cod_interno,
  pc.activo,
  false,   -- no vendible
  false,   -- no producible
  false,   -- no afecta forecast
  'compra',
  pc.proveedor_id,
  pc.cod_proveedor,
  pc.cod_interno,
  pc.precio,
  pc.tipo_iva,
  pc.dia_pedido,
  pc.dia_entrega,
  COALESCE(pc.stock_minimo, 0),
  COALESCE(pc.unidad_minima_compra, 1),
  pc.forma_pago,
  pc.plazo_pago,
  pc.id
FROM productos_compra_v2 pc
WHERE pc.producto_venta_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM tb_v2.productos pv
    WHERE pv.compra_legacy_id = pc.id
  );

-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
-- 7. Trigger: sincronizar tb_v2.productos â productos_compra_v2
--    Mantiene la tabla legacy actualizada para stock/pedidos
-- ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
CREATE OR REPLACE FUNCTION fn_sync_producto_to_compra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_compra_id integer;
BEGIN
  -- Solo sincronizar si el producto tiene datos de compra
  IF NEW.tipo IN ('compra', 'ambos') THEN
    IF NEW.compra_legacy_id IS NOT NULL THEN
      -- Actualizar registro existente
      UPDATE productos_compra_v2 SET
        nombre          = NEW.nombre,
        proveedor_id    = NEW.proveedor_id,
        cod_proveedor   = NEW.cod_proveedor,
        cod_interno     = NEW.cod_interno,
        precio          = NEW.precio_compra,
        tipo_iva        = NEW.tipo_iva,
        dia_pedido      = NEW.dia_pedido,
        dia_entrega     = NEW.dia_entrega,
        stock_minimo    = NEW.stock_minimo,
        unidad_minima_compra = NEW.unidades_por_paquete,
        forma_pago      = NEW.forma_pago,
        plazo_pago      = NEW.plazo_pago,
        activo          = NEW.activo,
        producto_venta_id = CASE WHEN NEW.tipo = 'ambos' THEN NEW.id ELSE NULL END
      WHERE id = NEW.compra_legacy_id;
    ELSE
      -- Crear nuevo registro en compra
      INSERT INTO productos_compra_v2 (
        nombre, proveedor_id, cod_proveedor, cod_interno,
        precio, tipo_iva,
        dia_pedido, dia_entrega, stock_minimo,
        unidad_minima_compra, forma_pago, plazo_pago,
        activo, producto_venta_id
      ) VALUES (
        NEW.nombre, NEW.proveedor_id, NEW.cod_proveedor, NEW.cod_interno,
        NEW.precio_compra, NEW.tipo_iva,
        NEW.dia_pedido, NEW.dia_entrega, NEW.stock_minimo,
        NEW.unidades_por_paquete, NEW.forma_pago, NEW.plazo_pago,
        NEW.activo,
        CASE WHEN NEW.tipo = 'ambos' THEN NEW.id ELSE NULL END
      )
      RETURNING id INTO v_compra_id;

      -- Actualizar el legacy_id en tb_v2.productos
      UPDATE tb_v2.productos SET compra_legacy_id = v_compra_id WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_producto_to_compra ON tb_v2.productos;
CREATE TRIGGER trg_sync_producto_to_compra
  AFTER INSERT OR UPDATE ON tb_v2.productos
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_producto_to_compra();

COMMIT;
