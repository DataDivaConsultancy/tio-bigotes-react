-- proveedor_producto_precios: añadir precio_paquete (precio de la unidad
-- mínima de compra). Mantenemos `precio` como UNITARIO (uds de uso) para
-- escandallos y márgenes. precio_paquete se usa para presupuestos y
-- pedidos a proveedor.
--
-- Aplicado el 2026-05-02 vía Management API.

ALTER TABLE proveedor_producto_precios
  ADD COLUMN IF NOT EXISTS precio_paquete numeric;

COMMENT ON COLUMN proveedor_producto_precios.precio IS
  'Precio UNITARIO (por unidad de uso). Se usa en escandallos y márgenes.';
COMMENT ON COLUMN proveedor_producto_precios.precio_paquete IS
  'Precio del paquete completo (unidad mínima de compra). Se usa para presupuestos y pedidos a proveedor.';

-- Backfill para precios existentes
UPDATE proveedor_producto_precios ppp
SET precio_paquete = ppp.precio * pf.factor_conversion
FROM producto_formatos pf
WHERE pf.id = ppp.formato_id
  AND ppp.precio_paquete IS NULL
  AND ppp.precio IS NOT NULL
  AND pf.factor_conversion IS NOT NULL;

-- Trigger sync: guarda AMBOS precios (función completa en migración previa).
-- Resumen del cambio:
--   v_precio_paquete := NEW.precio_compra
--   v_precio_unitario := NEW.precio_compra / unidades_por_paquete
--   INSERT (..., precio, precio_paquete, ...) VALUES (..., unitario, paquete, ...)

-- Vista v_catalogo_proveedor: exponer ambos campos
DROP VIEW IF EXISTS public.v_catalogo_proveedor CASCADE;
CREATE VIEW public.v_catalogo_proveedor AS
SELECT
  pp.proveedor_id::integer AS proveedor_id,
  pf.id AS formato_id,
  pc.id::integer AS producto_id,
  pc.nombre AS producto_nombre,
  pp.cod_proveedor, pc.cod_interno,
  pf.formato_compra, pf.unidad_compra, pf.unidad_uso,
  pf.factor_conversion, pf.unidades_por_paquete,
  ppp.precio,                         -- UNITARIO
  ppp.precio_paquete,                 -- PAQUETE
  ppp.iva_pct, ppp.descuento_pct,
  ppp.cantidad_minima_pedido, ppp.multiplo_pedido,
  ppp.vigente_desde, ppp.vigente_hasta,
  pp.es_principal, pp.dia_pedido, pp.dia_entrega
FROM producto_proveedor pp
JOIN productos_compra_v2 pc ON pc.id = pp.producto_id
JOIN producto_formatos pf   ON pf.producto_id = pc.id AND pf.es_predeterminado = true
LEFT JOIN proveedor_producto_precios ppp
  ON ppp.proveedor_id = pp.proveedor_id AND ppp.formato_id = pf.id AND ppp.activa = true
WHERE pp.activo = true AND COALESCE(pc.activo, true) = true;
