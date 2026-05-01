-- Limpieza de tablas/funciones legacy huérfanas (Tier 1).
--
-- Aplicado el 2026-05-01 vía Supabase Management API.
-- Reduce 6 objetos duplicados a 1 sola fuente de verdad.
--
-- Tablas eliminadas:
--   - public.empleados (4 filas legacy, no la usaba ningún componente ni RPC).
--   - public.locales (vacía, vista locales_v2 ya apunta a tb_v2.locales).
--   - public.control_diario (22 filas legacy, Forecast migrado a control_diario_v2).
--   - public.config_mapeo (1 fila, no usada — config_importaciones_v2 la sustituye).
--   - public.ventas_staging_v2_backup (vacía, backup huérfano).
--
-- Función eliminada:
--   - public.rpc_ventas_modo_seguro (usaba ventas_staging_v2_backup; era
--     herramienta de mantenimiento manual, no se invocaba desde frontend).
--
-- NO se tocan (en uso):
--   - public.productos_compra_v2 / locales_compra_v2 (módulo Compras MVP1 vivo).
--   - public.ventas_alias_v2 (5 RPCs/triggers críticos del flujo de carga CSV).
--   - public.configuracion_compras / configuracion_app / configuracion_escandallo
--     (tres almacenes de settings independientes, no son duplicidad).

DROP FUNCTION IF EXISTS public.rpc_ventas_modo_seguro(date, date, text) CASCADE;
DROP TABLE IF EXISTS public.ventas_staging_v2_backup CASCADE;
DROP TABLE IF EXISTS public.config_mapeo CASCADE;
DROP TABLE IF EXISTS public.locales CASCADE;
DROP TABLE IF EXISTS public.empleados CASCADE;
DROP TABLE IF EXISTS public.control_diario CASCADE;
