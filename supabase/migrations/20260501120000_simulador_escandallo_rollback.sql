-- ============================================================
-- ROLLBACK: Simulador de cambio de precio + configuración
-- Fecha: 2026-05-01
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS rpc_simular_cambio_precio(integer, numeric);
DROP FUNCTION IF EXISTS rpc_set_config_escandallo(text, text);
DROP FUNCTION IF EXISTS rpc_get_config_escandallo(text);

DROP TRIGGER IF EXISTS tg_config_escandallo_updated_at ON configuracion_escandallo;
DROP POLICY IF EXISTS "allow_all" ON configuracion_escandallo;
DROP TABLE IF EXISTS configuracion_escandallo;

COMMIT;
