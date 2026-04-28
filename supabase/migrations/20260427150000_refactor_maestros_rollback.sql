-- ============================================================
-- ROLLBACK: Refactor de maestros
-- Fecha: 2026-04-27
-- Tarea: F0-3
-- Descripción:
--   Revierte la migración 20260427150000_refactor_maestros.sql.
--   Borra las 4 tablas nuevas, sus vistas y la función helper.
--   IMPORTANTE: si ya se han poblado datos con F0-4, este rollback los borrará.
-- ============================================================

-- Vistas
DROP VIEW IF EXISTS v_producto_precio_actual;
DROP VIEW IF EXISTS v_proveedor_condicion_actual;
DROP VIEW IF EXISTS v_proveedor_contacto_principal;

-- Tablas (orden inverso por FKs)
DROP TABLE IF EXISTS proveedor_producto_precios CASCADE;
DROP TABLE IF EXISTS producto_formatos CASCADE;
DROP TABLE IF EXISTS proveedor_condiciones_pago CASCADE;
DROP TABLE IF EXISTS proveedor_contactos CASCADE;

-- Función helper (solo si NO la usa nada más en el sistema)
-- Comprobación: si tg_set_updated_at se usa en otras tablas creadas por migraciones
-- posteriores, NO la borres. Por eso la dejamos con un IF EXISTS comentado.
-- DROP FUNCTION IF EXISTS tg_set_updated_at();
