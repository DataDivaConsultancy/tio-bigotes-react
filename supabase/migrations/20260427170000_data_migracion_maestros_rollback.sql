-- ============================================================
-- ROLLBACK: Migración de datos de maestros (F0-4)
-- Fecha: 2026-04-27
-- IMPORTANTE: borra solo las filas creadas por F0-4 (identificadas por la nota
-- 'F0-4'). Filas creadas manualmente después no se tocan.
-- ============================================================

DELETE FROM proveedor_producto_precios WHERE notas LIKE '%F0-4%';
DELETE FROM producto_formatos          WHERE notas LIKE '%F0-4%' OR notas LIKE '%REVISAR%';
DELETE FROM proveedor_condiciones_pago WHERE notas LIKE '%plazo_pago%';
DELETE FROM proveedor_contactos        WHERE notas LIKE '%F0-4%';
