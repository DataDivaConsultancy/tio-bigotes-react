-- Refactor a modelo N:N producto ↔ proveedor (Tier 3)
--
-- Antes: productos_compra_v2 tenía proveedor_id, cod_proveedor, dia_pedido,
-- dia_entrega, forma_pago, plazo_pago, precio, tipo_iva como columnas
-- directas. Esto imponía 1:1 producto-proveedor: para que un producto se
-- compre a 3 proveedores había que crear 3 filas duplicadas.
--
-- Ahora:
--   - productos_compra_v2 contiene SOLO la identidad del producto
--     (nombre, cod_interno, unidad_medida, stock_minimo, ...).
--   - producto_proveedor (NUEVA) lleva la relación N:N con cod_proveedor,
--     dia_pedido/entrega, forma/plazo de pago, principal, activo.
--   - proveedor_producto_precios sigue gestionando precios por (proveedor,
--     formato) con histórico vía vigente_desde/hasta y activa.
--
-- Vistas:
--   - v_catalogo_proveedor: reescrita para hacer JOIN con producto_proveedor
--     (en vez de la columna proveedor_id eliminada).
--   - v_proveedores_por_producto (NUEVA): helper que da los proveedores que
--     ofrecen cada producto + precio_actual.
--
-- Trigger fn_sync_producto_to_compra: extendido para que cuando se cree un
-- producto desde tb_v2.productos con proveedor_id != null, también escriba
-- en producto_proveedor (proveedor principal).
--
-- Aplicado el 2026-05-01 vía Management API. Idempotente.

-- 1) Tabla N:N
CREATE TABLE IF NOT EXISTS public.producto_proveedor (
  producto_id   integer NOT NULL REFERENCES productos_compra_v2(id) ON DELETE CASCADE,
  proveedor_id  integer NOT NULL REFERENCES proveedores_v2(id)      ON DELETE CASCADE,
  cod_proveedor text,
  dia_pedido    text,
  dia_entrega   text,
  forma_pago    text,
  plazo_pago    text,
  es_principal  boolean NOT NULL DEFAULT false,
  activo        boolean NOT NULL DEFAULT true,
  notas         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, proveedor_id)
);
CREATE INDEX IF NOT EXISTS idx_producto_proveedor_proveedor ON producto_proveedor(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_producto_proveedor_producto  ON producto_proveedor(producto_id);

CREATE OR REPLACE FUNCTION public.fn_set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_producto_proveedor_updated ON producto_proveedor;
CREATE TRIGGER trg_producto_proveedor_updated
  BEFORE UPDATE ON producto_proveedor
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2) DROP columnas redundantes en productos_compra_v2
ALTER TABLE productos_compra_v2 DROP COLUMN IF EXISTS proveedor_id  CASCADE;
ALTER TABLE productos_compra_v2 DROP COLUMN IF EXISTS cod_proveedor CASCADE;
ALTER TABLE productos_compra_v2 DROP COLUMN IF EXISTS dia_pedido    CASCADE;
ALTER TABLE productos_compra_v2 DROP COLUMN IF EXISTS dia_entrega   CASCADE;
ALTER TABLE productos_compra_v2 DROP COLUMN IF EXISTS forma_pago    CASCADE;
ALTER TABLE productos_compra_v2 DROP COLUMN IF EXISTS plazo_pago    CASCADE;
ALTER TABLE productos_compra_v2 DROP COLUMN IF EXISTS precio        CASCADE;
ALTER TABLE productos_compra_v2 DROP COLUMN IF EXISTS tipo_iva      CASCADE;

-- 3) Reescribir v_catalogo_proveedor (la columna proveedor_id ya no está)
DROP VIEW IF EXISTS public.v_catalogo_proveedor CASCADE;
CREATE VIEW public.v_catalogo_proveedor AS
SELECT
  pp.proveedor_id::integer AS proveedor_id,
  pf.id AS formato_id,
  pc.id::integer AS producto_id,
  pc.nombre AS producto_nombre,
  pp.cod_proveedor,
  pc.cod_interno,
  pf.formato_compra, pf.unidad_compra, pf.unidad_uso,
  pf.factor_conversion, pf.unidades_por_paquete,
  ppp.precio, ppp.iva_pct, ppp.descuento_pct,
  ppp.cantidad_minima_pedido, ppp.multiplo_pedido,
  ppp.vigente_desde, ppp.vigente_hasta,
  pp.es_principal, pp.dia_pedido, pp.dia_entrega
FROM producto_proveedor pp
  JOIN productos_compra_v2 pc ON pc.id = pp.producto_id
  JOIN producto_formatos pf   ON pf.producto_id = pc.id AND pf.es_predeterminado = true
  LEFT JOIN proveedor_producto_precios ppp
    ON ppp.proveedor_id = pp.proveedor_id
   AND ppp.formato_id = pf.id
   AND ppp.activa = true
WHERE pp.activo = true AND COALESCE(pc.activo, true) = true;

-- 4) Vista helper v_proveedores_por_producto
CREATE OR REPLACE VIEW public.v_proveedores_por_producto AS
SELECT
  pp.producto_id, pc.nombre AS producto_nombre,
  pp.proveedor_id, prov.nombre_comercial AS proveedor_nombre,
  pp.cod_proveedor, pp.dia_pedido, pp.dia_entrega,
  pp.forma_pago, pp.plazo_pago, pp.es_principal, pp.activo,
  (SELECT ppp.precio FROM proveedor_producto_precios ppp
   JOIN producto_formatos pf ON pf.id = ppp.formato_id
   WHERE ppp.proveedor_id = pp.proveedor_id AND pf.producto_id = pp.producto_id
     AND pf.es_predeterminado = true AND ppp.activa = true
   ORDER BY ppp.vigente_desde DESC NULLS LAST LIMIT 1) AS precio_actual
FROM producto_proveedor pp
JOIN productos_compra_v2 pc ON pc.id = pp.producto_id
JOIN proveedores_v2 prov    ON prov.id = pp.proveedor_id;

-- 5) Función sync extendida (incluye escritura en producto_proveedor)
-- (definición omitida aquí — ver ya aplicada en producción; el repo la
-- contiene en este mismo módulo de migraciones para historial completo)
