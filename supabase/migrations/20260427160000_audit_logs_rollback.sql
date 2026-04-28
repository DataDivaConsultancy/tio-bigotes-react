-- ============================================================
-- ROLLBACK: audit_logs + trigger genérico de auditoría
-- Fecha: 2026-04-27
-- Tarea: F0-5
-- ============================================================

-- 1. Quitar triggers de las tablas
DO $$
DECLARE
  v_tabla text;
  v_tablas text[] := ARRAY[
    'proveedores_v2',
    'productos_compra_v2',
    'locales_compra_v2',
    'proveedor_contactos',
    'proveedor_condiciones_pago',
    'producto_formatos',
    'proveedor_producto_precios'
  ];
BEGIN
  FOREACH v_tabla IN ARRAY v_tablas LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_audit_%I ON %I', v_tabla, v_tabla);
  END LOOP;
END $$;

-- 2. Borrar función trigger
DROP FUNCTION IF EXISTS tg_audit_log_changes();
DROP FUNCTION IF EXISTS audit_logs_crear_particion(int, int);

-- 3. Borrar particiones + tabla padre (CASCADE para dropear FKs si las hubiera)
DROP TABLE IF EXISTS audit_logs CASCADE;
