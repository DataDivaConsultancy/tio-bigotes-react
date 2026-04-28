-- ============================================================
-- Vista: v_catalogo_proveedor
-- Fecha: 2026-04-27
-- Descripción: catálogo de productos por proveedor con precio activo
--   y datos del formato. Usado por la pantalla de creación de pedidos.
-- ============================================================

CREATE OR REPLACE VIEW v_catalogo_proveedor AS
SELECT
  ppp.proveedor_id,
  ppp.formato_id,
  pf.producto_id,
  p.nombre                 AS producto_nombre,
  p.cod_proveedor,
  p.cod_interno,
  pf.formato_compra,
  pf.unidad_compra,
  pf.unidad_uso,
  pf.factor_conversion,
  pf.unidades_por_paquete,
  ppp.precio,
  ppp.iva_pct,
  ppp.descuento_pct,
  ppp.cantidad_minima_pedido,
  ppp.multiplo_pedido,
  ppp.vigente_desde,
  ppp.vigente_hasta
FROM proveedor_producto_precios ppp
JOIN producto_formatos pf  ON pf.id = ppp.formato_id
JOIN productos_compra_v2 p ON p.id = pf.producto_id
WHERE ppp.activa = true
  AND p.activo IS DISTINCT FROM false;

COMMENT ON VIEW v_catalogo_proveedor IS
  'Catálogo de un proveedor: cada formato con su precio activo y datos del producto. Usado por la pantalla de creación de pedidos.';
