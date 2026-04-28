-- ============================================================
-- Migración: audit_logs + trigger genérico de auditoría
-- Fecha: 2026-04-27
-- Tarea: F0-5
-- Descripción:
--   Crea tabla audit_logs particionada por mes (12 particiones
--   pre-creadas: 2026-04 a 2027-03).
--   Crea función tg_audit_log_changes() reutilizable.
--   La aplica como trigger AFTER INSERT/UPDATE/DELETE a las tablas
--   críticas: proveedores, productos, locales, contactos, condiciones,
--   formatos, precios.
--
--   No se aplica a stock_movimientos_v2 (ya es log inmutable).
--   No se aplica a productos_v2 / empleados_v2 (no son del módulo de compras).
--
-- Rollback: 20260427160000_audit_logs_rollback.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Tabla audit_logs (particionada por created_at)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id            bigserial,
  user_id       uuid,                    -- auth.uid() del actor (NULL si proceso sistema)
  action        text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  entity_type   text NOT NULL,           -- nombre de tabla
  entity_id     text,                    -- id como texto (puede ser int o uuid)
  old_values    jsonb,
  new_values    jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Particiones mensuales (12 meses pre-creados)
CREATE TABLE IF NOT EXISTS audit_logs_2026_04 PARTITION OF audit_logs FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS audit_logs_2026_05 PARTITION OF audit_logs FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS audit_logs_2026_06 PARTITION OF audit_logs FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS audit_logs_2026_07 PARTITION OF audit_logs FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS audit_logs_2026_08 PARTITION OF audit_logs FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS audit_logs_2026_09 PARTITION OF audit_logs FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS audit_logs_2026_10 PARTITION OF audit_logs FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS audit_logs_2026_11 PARTITION OF audit_logs FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS audit_logs_2026_12 PARTITION OF audit_logs FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS audit_logs_2027_01 PARTITION OF audit_logs FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS audit_logs_2027_02 PARTITION OF audit_logs FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE IF NOT EXISTS audit_logs_2027_03 PARTITION OF audit_logs FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

-- Índices (se propagan a las particiones)
CREATE INDEX IF NOT EXISTS ix_audit_logs_entity     ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_user       ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs (created_at DESC);

COMMENT ON TABLE audit_logs IS
  'Log de auditoría centralizado (particionado por mes). Cualquier tabla con tg_audit_log_changes escribe aquí.';

-- ────────────────────────────────────────────────────────────
-- 2. Función auxiliar para crear particiones futuras
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit_logs_crear_particion(p_year int, p_month int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_inicio date;
  v_fin    date;
  v_nombre text;
BEGIN
  v_inicio := make_date(p_year, p_month, 1);
  v_fin    := v_inicio + interval '1 month';
  v_nombre := format('audit_logs_%s_%s', p_year, lpad(p_month::text, 2, '0'));
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
    v_nombre, v_inicio, v_fin
  );
END;
$$;

COMMENT ON FUNCTION audit_logs_crear_particion(int, int) IS
  'Crea la partición de audit_logs para el (year, month) dado. Idempotente.';

-- ────────────────────────────────────────────────────────────
-- 3. Función trigger genérica de auditoría
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tg_audit_log_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_old     jsonb;
  v_new     jsonb;
  v_id      text;
BEGIN
  -- Obtener uid de Supabase Auth (NULL si proceso sin sesión)
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    BEGIN v_id := (to_jsonb(OLD) ->> 'id'); EXCEPTION WHEN OTHERS THEN v_id := NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    BEGIN v_id := (to_jsonb(NEW) ->> 'id'); EXCEPTION WHEN OTHERS THEN v_id := NULL; END;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    BEGIN v_id := (to_jsonb(NEW) ->> 'id'); EXCEPTION WHEN OTHERS THEN v_id := NULL; END;
  END IF;

  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (v_user_id, TG_OP, TG_TABLE_NAME, v_id, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION tg_audit_log_changes() IS
  'Trigger function genérica: registra INSERT/UPDATE/DELETE en audit_logs como JSONB.';

-- ────────────────────────────────────────────────────────────
-- 4. Aplicar trigger a tablas críticas
-- ────────────────────────────────────────────────────────────
-- Helper: macro DROP+CREATE para que la migración sea idempotente
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
    -- Solo aplicar si la tabla existe
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_tabla
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tg_audit_%I ON %I', v_tabla, v_tabla);
      EXECUTE format(
        'CREATE TRIGGER tg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I '
        'FOR EACH ROW EXECUTE FUNCTION tg_audit_log_changes()',
        v_tabla, v_tabla
      );
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. RLS — audit_logs solo lectura para roles autenticados
-- ────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (refinaremos por rol más adelante).
DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT TO authenticated USING (true);

-- Escritura: NO permitida desde clientes. Solo el trigger SECURITY DEFINER inserta.
-- (No creamos política INSERT/UPDATE/DELETE → bloqueado por defecto con RLS activa.)

-- ────────────────────────────────────────────────────────────
-- FIN MIGRACIÓN F0-5
-- ============================================================
