-- ============================================================
-- ROLLBACK: RPCs de pedidos (F1A-3)
-- Fecha: 2026-04-27
-- ============================================================

DROP FUNCTION IF EXISTS rpc_duplicar_pedido(uuid);
DROP FUNCTION IF EXISTS rpc_cancelar_pedido(uuid, text);
DROP FUNCTION IF EXISTS rpc_aprobar_pedido(uuid, text, text);
DROP FUNCTION IF EXISTS rpc_enviar_pedido(uuid, text);
DROP FUNCTION IF EXISTS rpc_actualizar_pedido(uuid, jsonb, date, numeric, text);
DROP FUNCTION IF EXISTS rpc_crear_pedido(integer, integer, jsonb, date, numeric, text, text);
DROP FUNCTION IF EXISTS fn_recalcular_totales_pedido(uuid);
DROP FUNCTION IF EXISTS fn_pedido_puede_transicionar(text, text);
