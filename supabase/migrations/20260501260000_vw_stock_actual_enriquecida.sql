-- vw_stock_actual: añadir proveedor principal + precio activo
--
-- Antes la vista solo tenía producto + local + stock. La pantalla Stock
-- esperaba columnas proveedor_nombre, precio, cod_proveedor que no
-- venían (proveedor en blanco, "Precio coste" guion).
--
-- Ahora la vista hace LEFT JOIN LATERAL contra producto_proveedor para
-- obtener el "principal" (es_principal=true, o el primero si no hay), y
-- contra proveedor_producto_precios para el precio activo del formato
-- predeterminado. Así la pantalla Stock muestra todo correcto.
--
-- Aplicado el 2026-05-01 vía Management API.

DROP VIEW IF EXISTS public.vw_stock_actual CASCADE;
CREATE VIEW public.vw_stock_actual AS
SELECT
  pc.id::integer AS producto_compra_id,
  pc.nombre AS producto_nombre,
  pc.cod_interno,
  l.id AS local_id,
  l.nombre AS local_nombre,
  COALESCE(SUM(sm.cantidad), 0) AS stock_actual,
  pc.stock_minimo,
  CASE WHEN pc.stock_minimo IS NOT NULL AND COALESCE(SUM(sm.cantidad),0) < pc.stock_minimo
       THEN true ELSE false END AS bajo_minimo,
  pc.unidad_medida,
  prov.id AS proveedor_id,
  prov.nombre_comercial AS proveedor_nombre,
  pp.cod_proveedor,
  ppp.precio,
  ppp.iva_pct
FROM productos_compra_v2 pc
CROSS JOIN locales_compra_v2 l
LEFT JOIN stock_movimientos_v2 sm
  ON sm.producto_compra_id = pc.id AND sm.local_id = l.id
LEFT JOIN LATERAL (
  SELECT proveedor_id, cod_proveedor FROM producto_proveedor
  WHERE producto_id = pc.id AND activo = true
  ORDER BY es_principal DESC, proveedor_id ASC LIMIT 1
) pp ON true
LEFT JOIN proveedores_v2 prov ON prov.id = pp.proveedor_id
LEFT JOIN producto_formatos pf
  ON pf.producto_id = pc.id AND pf.es_predeterminado = true
LEFT JOIN proveedor_producto_precios ppp
  ON ppp.proveedor_id = pp.proveedor_id
 AND ppp.formato_id = pf.id
 AND ppp.activa = true
WHERE COALESCE(pc.activo, true) = true AND COALESCE(l.activo, true) = true
GROUP BY pc.id, pc.nombre, pc.cod_interno, l.id, l.nombre,
         pc.stock_minimo, pc.unidad_medida,
         prov.id, prov.nombre_comercial, pp.cod_proveedor, ppp.precio, ppp.iva_pct;
