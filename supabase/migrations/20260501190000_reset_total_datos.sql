-- Reset total de datos transaccionales y catálogo (Nivel 3)
--
-- Aplicado el 2026-05-01 vía Supabase Management API.
-- Esta migración queda como source-of-truth en el repo.
--
-- CONSERVADO:
--   - empleados_v2 + roles_v2 (auth de usuarios)
--   - tb_v2.locales (puntos de venta físicos)
--   - configuracion_app
--   - tb_v2.config_importaciones (mapeos guardados de columnas CSV)
--   - proveedores_v2 (proveedores dados de alta)
--
-- BORRADO:
--   - Tablas legacy public.productos y public.historial_ventas (huérfanas).
--   - Todas las ventas / hechos transaccionales.
--   - Catálogo (productos_v2, categorías, aliases).
--   - Compras: pedidos, recepciones, incidencias, facturas, stock, escandallos.
--   - Buckets storage: facturas, incidencias, recepciones, albaranes vaciados
--     vía Storage API (no via SQL — protección de Supabase).
--
-- IMPORTANTE: este script ES IDEMPOTENTE pero no quieres ejecutarlo dos veces
-- accidentalmente. Solo correrlo manualmente cuando se haya tomado la decisión
-- explícita de empezar de cero.

-- 1. Drop legacy huérfanas
DROP TABLE IF EXISTS public.historial_ventas CASCADE;
DROP TABLE IF EXISTS public.productos CASCADE;

-- 2. Drop backups del ejercicio de empanadas (ya no aplican)
DROP TABLE IF EXISTS public._backup_empanada_productos;
DROP TABLE IF EXISTS public._backup_empanada_historial;
DROP TABLE IF EXISTS public._backup_empanada_alias;
DROP TABLE IF EXISTS public._backup_empanada_raw;
DROP TABLE IF EXISTS public._backup_empanada_categorias;

-- 3. TRUNCATE hechos: ventas + control diario
TRUNCATE TABLE
  tb_v2.ventas_staging,
  tb_v2.ventas_raw,
  tb_v2.import_batches,
  tb_v2.articulos_pendientes,
  tb_v2.control_diario,
  tb_v2.control_diario_horneadas,
  tb_v2.hornadas_eventos
RESTART IDENTITY CASCADE;

-- 4. TRUNCATE compras + catálogo derivado
TRUNCATE TABLE
  public.factura_compra_lineas,
  public.factura_recepciones,
  public.facturas_compra,
  public.incidencias,
  public.recepcion_lineas,
  public.recepciones,
  public.pedido_compra_aprobaciones,
  public.pedido_compra_lineas,
  public.pedidos_compra,
  public.stock_movimientos_v2,
  public.escandallo_lineas,
  public.escandallos,
  public.configuracion_escandallo,
  public.precios_venta,
  public.producto_formatos,
  public.campos_extra_producto_v2,
  public.proveedor_producto_precios,
  public.proveedor_categorias,
  public.ventas_alias_v2,
  tb_v2.producto_aliases,
  public.productos_compra_v2,
  public.ia_promedios
RESTART IDENTITY CASCADE;

-- 5. TRUNCATE catálogo principal
TRUNCATE TABLE
  tb_v2.productos,
  tb_v2.categorias_producto,
  tb_v2.categoria_raw_map,
  tb_v2.productos_import_raw
RESTART IDENTITY CASCADE;
