DROP VIEW IF EXISTS v_catalogo_proveedor;

CREATE VIEW v_catalogo_proveedor AS
SELECT
  pc.proveedor_id::int    AS proveedor_id,
  pf.id                   AS formato_id,
  pc.id::int              AS producto_id,
  pc.nombre               AS producto_nombre,
  pc.cod_proveedor,
  pc.cod_interno,
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
FROM productos_compra_v2 pc
JOIN producto_formatos pf
  ON pf.producto_id = pc.id::int
  AND pf.es_predeterminado = true
LEFT JOIN proveedor_producto_precios ppp
  ON ppp.proveedor_id = pc.proveedor_id::int
  AND ppp.formato_id  = pf.id
  AND ppp.activa      = true
WHERE pc.proveedor_id IS NOT NULL
  AND pc.activo IS DISTINCT FROM false;
