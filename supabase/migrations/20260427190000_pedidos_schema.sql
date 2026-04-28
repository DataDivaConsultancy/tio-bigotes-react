-- ============================================================
-- Migración: Schema de pedidos de compra (F1A-1 + F1A-4)
-- Fecha: 2026-04-27
-- Tareas: F1A-1 (schema pedidos), F1A-4 (configuración)
-- Descripción:
--   Crea las 3 tablas centrales del flujo de pedidos:
--     - pedidos_compra              cabecera (estados, importes, local, proveedor)
--     - pedido_compra_lineas        líneas (formato, cantidad, precio, totales)
--     - pedido_compra_aprobaciones  histórico de decisiones de aprobación
--   Más:
--     - configuracion_compras       parámetros (umbrales, tolerancias) — F1A-4
--     - función gen_numero_pedido() generador PC-YYYYMMDD-XXXX
--     - trigger calcular_total_linea automático
--
--   RLS: por ahora permisiva (allow_all). Locks por rol/local llegarán
--   en F1A-2 cuando confirmemos la estructura de empleados_v2.
--
-- Rollback: 20260427190000_pedidos_schema_rollback.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. configuracion_compras — F1A-4
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracion_compras (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave         text NOT NULL,
  valor         jsonb NOT NULL,
  scope         text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'local')),
  local_id      integer REFERENCES locales_compra_v2(id) ON DELETE CASCADE,
  descripcion   text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_local_scope CHECK (
    (scope = 'global' AND local_id IS NULL) OR
    (scope = 'local'  AND local_id IS NOT NULL)
  )
);

-- Un valor por (clave, local). NULL local = configuración global.
CREATE UNIQUE INDEX IF NOT EXISTS uq_config_global ON configuracion_compras(clave) WHERE local_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_config_local  ON configuracion_compras(clave, local_id) WHERE local_id IS NOT NULL;

DROP TRIGGER IF EXISTS tg_config_compras_updated_at ON configuracion_compras;
CREATE TRIGGER tg_config_compras_updated_at
  BEFORE UPDATE ON configuracion_compras
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

ALTER TABLE configuracion_compras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_configuracion_compras" ON configuracion_compras;
CREATE POLICY "allow_all_configuracion_compras" ON configuracion_compras
  FOR ALL USING (true) WITH CHECK (true);

-- Valores iniciales (idempotente vía ON CONFLICT)
INSERT INTO configuracion_compras (clave, valor, scope, descripcion) VALUES
  ('umbral_aprobacion_eur',           '500'::jsonb,  'global', 'Importe en EUR a partir del cual un pedido requiere aprobación'),
  ('tolerancia_recepcion_pct',        '5'::jsonb,    'global', 'Diferencia % en cantidad recibida que genera incidencia automática'),
  ('tolerancia_matching_cantidad_pct','5'::jsonb,    'global', 'Tolerancia % cantidad albarán vs factura'),
  ('tolerancia_matching_precio_pct',  '1'::jsonb,    'global', 'Tolerancia % precio albarán vs factura'),
  ('tolerancia_matching_total_pct',   '2'::jsonb,    'global', 'Tolerancia % total pedido vs factura'),
  ('temperatura_refrigerado_max',     '5'::jsonb,    'global', 'Temperatura máxima permitida productos refrigerados (°C)'),
  ('temperatura_congelado_max',       '-18'::jsonb,  'global', 'Temperatura máxima permitida productos congelados (°C)')
ON CONFLICT DO NOTHING;

-- Helper para leer configuración con fallback global
CREATE OR REPLACE FUNCTION fn_get_config(p_clave text, p_local_id integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_valor jsonb;
BEGIN
  -- Buscar valor del local
  IF p_local_id IS NOT NULL THEN
    SELECT valor INTO v_valor FROM configuracion_compras
     WHERE clave = p_clave AND local_id = p_local_id;
    IF v_valor IS NOT NULL THEN RETURN v_valor; END IF;
  END IF;
  -- Fallback global
  SELECT valor INTO v_valor FROM configuracion_compras
   WHERE clave = p_clave AND local_id IS NULL;
  RETURN v_valor;
END;
$$;

COMMENT ON TABLE configuracion_compras IS
  'Parámetros configurables del módulo de compras. Resolución por local con fallback global vía fn_get_config().';

-- ────────────────────────────────────────────────────────────
-- 2. pedidos_compra — cabecera
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos_compra (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                      text NOT NULL UNIQUE,
  local_id                    integer NOT NULL REFERENCES locales_compra_v2(id),
  proveedor_id                integer NOT NULL REFERENCES proveedores_v2(id),
  estado                      text NOT NULL DEFAULT 'borrador' CHECK (estado IN
                                ('borrador', 'sugerido', 'pendiente_aprobacion', 'aprobado',
                                 'enviado', 'confirmado', 'parcialmente_recibido',
                                 'recibido', 'cerrado', 'cancelado')),
  fecha_pedido                date NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega_solicitada    date,
  fecha_entrega_confirmada    date,
  subtotal                    numeric(12,2) NOT NULL DEFAULT 0,
  iva_total                   numeric(12,2) NOT NULL DEFAULT 0,
  portes                      numeric(10,2) NOT NULL DEFAULT 0,
  total                       numeric(12,2) NOT NULL DEFAULT 0,
  origen                      text NOT NULL DEFAULT 'manual' CHECK (origen IN
                                ('manual', 'sugerido', 'duplicado', 'plantilla')),
  enviado_via                 text CHECK (enviado_via IS NULL OR enviado_via IN
                                ('email', 'portal', 'whatsapp', 'telefono', 'edi')),
  enviado_at                  timestamptz,
  confirmado_at               timestamptz,
  cancelado_at                timestamptz,
  motivo_cancelacion          text,
  notas                       text,
  creado_por                  uuid,                      -- auth.uid() del solicitante
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_total_no_negativo CHECK (total >= 0),
  CONSTRAINT chk_fecha_entrega     CHECK (fecha_entrega_solicitada IS NULL OR fecha_entrega_solicitada >= fecha_pedido)
);

CREATE INDEX IF NOT EXISTS ix_pedidos_local        ON pedidos_compra(local_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_proveedor    ON pedidos_compra(proveedor_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_estado       ON pedidos_compra(estado);
CREATE INDEX IF NOT EXISTS ix_pedidos_fecha        ON pedidos_compra(fecha_pedido DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_creado_por   ON pedidos_compra(creado_por);

DROP TRIGGER IF EXISTS tg_pedidos_compra_updated_at ON pedidos_compra;
CREATE TRIGGER tg_pedidos_compra_updated_at
  BEFORE UPDATE ON pedidos_compra
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

-- Auditoría (re-aplicar trigger genérico de F0-5)
DROP TRIGGER IF EXISTS tg_audit_pedidos_compra ON pedidos_compra;
CREATE TRIGGER tg_audit_pedidos_compra
  AFTER INSERT OR UPDATE OR DELETE ON pedidos_compra
  FOR EACH ROW EXECUTE FUNCTION tg_audit_log_changes();

ALTER TABLE pedidos_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_pedidos_compra" ON pedidos_compra;
CREATE POLICY "allow_all_pedidos_compra" ON pedidos_compra
  FOR ALL USING (true) WITH CHECK (true);
-- TODO F1A-2: aplicar RLS por local_id según rol del usuario.

COMMENT ON TABLE  pedidos_compra IS
  'Cabeceras de pedidos de compra. Estado evoluciona desde borrador hasta cerrado o cancelado.';
COMMENT ON COLUMN pedidos_compra.numero IS
  'Identificador humano. Formato PC-YYYYMMDD-XXXX, generado por gen_numero_pedido().';

-- ────────────────────────────────────────────────────────────
-- 3. pedido_compra_lineas
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_compra_lineas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id                   uuid NOT NULL REFERENCES pedidos_compra(id) ON DELETE CASCADE,
  formato_id                  uuid NOT NULL REFERENCES producto_formatos(id),
  producto_id                 integer NOT NULL,            -- denormalizado para queries simples
  proveedor_producto_precio_id uuid,                       -- referencia al precio aplicado
  cantidad                    numeric(12,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario             numeric(12,4) NOT NULL CHECK (precio_unitario >= 0),
  descuento_pct               numeric(5,2)  NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100),
  iva_pct                     numeric(4,2)  NOT NULL DEFAULT 21 CHECK (iva_pct IN (0, 4, 10, 21)),
  total_linea                 numeric(12,2) NOT NULL DEFAULT 0,
  cantidad_sugerida           numeric(12,3),
  motivo_modificacion         text,
  notas                       text,
  orden                       int NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pcl_pedido    ON pedido_compra_lineas(pedido_id);
CREATE INDEX IF NOT EXISTS ix_pcl_formato   ON pedido_compra_lineas(formato_id);
CREATE INDEX IF NOT EXISTS ix_pcl_producto  ON pedido_compra_lineas(producto_id);

-- Trigger: calcular total_linea automáticamente
CREATE OR REPLACE FUNCTION fn_calcular_total_linea()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.total_linea := ROUND(
    NEW.cantidad
    * NEW.precio_unitario
    * (1 - NEW.descuento_pct / 100.0)
    * (1 + NEW.iva_pct / 100.0)
  , 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_calcular_total_linea ON pedido_compra_lineas;
CREATE TRIGGER tg_calcular_total_linea
  BEFORE INSERT OR UPDATE OF cantidad, precio_unitario, descuento_pct, iva_pct
  ON pedido_compra_lineas
  FOR EACH ROW EXECUTE FUNCTION fn_calcular_total_linea();

DROP TRIGGER IF EXISTS tg_pcl_updated_at ON pedido_compra_lineas;
CREATE TRIGGER tg_pcl_updated_at
  BEFORE UPDATE ON pedido_compra_lineas
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

ALTER TABLE pedido_compra_lineas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_pedido_compra_lineas" ON pedido_compra_lineas;
CREATE POLICY "allow_all_pedido_compra_lineas" ON pedido_compra_lineas
  FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 4. pedido_compra_aprobaciones
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_compra_aprobaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       uuid NOT NULL REFERENCES pedidos_compra(id) ON DELETE CASCADE,
  aprobador_id    uuid,                                       -- auth.uid()
  decision        text NOT NULL CHECK (decision IN ('aprobado', 'rechazado', 'devuelto')),
  comentarios     text,
  decidido_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pca_pedido ON pedido_compra_aprobaciones(pedido_id);
CREATE INDEX IF NOT EXISTS ix_pca_aprobador ON pedido_compra_aprobaciones(aprobador_id);

ALTER TABLE pedido_compra_aprobaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_pedido_compra_aprobaciones" ON pedido_compra_aprobaciones;
CREATE POLICY "allow_all_pedido_compra_aprobaciones" ON pedido_compra_aprobaciones
  FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 5. gen_numero_pedido — generador PC-YYYYMMDD-XXXX
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gen_numero_pedido()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_hoy   text := to_char(CURRENT_DATE, 'YYYYMMDD');
  v_count int;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM pedidos_compra
  WHERE numero LIKE 'PC-' || v_hoy || '-%';
  RETURN 'PC-' || v_hoy || '-' || lpad(v_count::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION gen_numero_pedido() IS
  'Genera el siguiente número de pedido del día. Formato PC-YYYYMMDD-XXXX (4 dígitos).';

-- ────────────────────────────────────────────────────────────
-- 6. Vista de conveniencia: pedidos con datos de proveedor y local
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_pedidos_compra_listado AS
SELECT
  p.id,
  p.numero,
  p.estado,
  p.fecha_pedido,
  p.fecha_entrega_solicitada,
  p.local_id,
  l.nombre               AS local_nombre,
  p.proveedor_id,
  pr.nombre_comercial    AS proveedor_nombre,
  pr.cif                 AS proveedor_cif,
  p.subtotal,
  p.iva_total,
  p.portes,
  p.total,
  p.origen,
  p.enviado_via,
  p.enviado_at,
  p.confirmado_at,
  (SELECT COUNT(*) FROM pedido_compra_lineas WHERE pedido_id = p.id) AS num_lineas,
  p.creado_por,
  p.created_at,
  p.updated_at
FROM pedidos_compra p
LEFT JOIN locales_compra_v2 l  ON l.id  = p.local_id
LEFT JOIN proveedores_v2 pr    ON pr.id = p.proveedor_id;

-- ============================================================
-- FIN MIGRACIÓN F1A-1 + F1A-4
-- ============================================================
