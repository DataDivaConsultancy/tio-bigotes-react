-- ============================================================
-- ROLLBACK: Schema de pedidos de compra (F1A-1 + F1A-4)
-- Fecha: 2026-04-27
-- ============================================================

DROP VIEW     IF EXISTS v_pedidos_compra_listado;
DROP FUNCTION IF EXISTS gen_numero_pedido();
DROP FUNCTION IF EXISTS fn_calcular_total_linea() CASCADE;
DROP FUNCTION IF EXISTS fn_get_config(text, integer);

DROP TABLE IF EXISTS pedido_compra_aprobaciones CASCADE;
DROP TABLE IF EXISTS pedido_compra_lineas       CASCADE;
DROP TABLE IF EXISTS pedidos_compra             CASCADE;
DROP TABLE IF EXISTS configuracion_compras      CASCADE;
