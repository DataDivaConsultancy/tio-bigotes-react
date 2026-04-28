-- ============================================================
-- Migración: Schema de recepciones e incidencias (F1B-1)
-- Fecha: 2026-04-28
-- Descripción:
--   3 tablas centrales para el flujo de recepción de mercancía:
--     - recepciones (cabecera por pedido)
--     - recepcion_lineas (una por cada línea del pedido)
--     - incidencias (10 tipos del PRD, urgencia y SLA)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. recepciones — cabecera
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recepciones (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                   text NOT NULL UNIQUE,
  pedido_id                uuid NOT NULL REFERENCES pedidos_compra(id) ON DELETE RESTRICT,
  local_id                 integer NOT NULL REFERENCES locales_compra_v2(id),
  proveedor_id             integer NOT NULL REFERENCES proveedores_v2(id),
  estado                   text NOT NULL DEFAULT 'pendiente' CHECK (estado IN
                              ('pendiente','en_revision','con_incidencias','aprobada','cerrada')),
  recibido_por             uuid,                              -- auth.uid()
  iniciada_at              timestamptz NOT NULL DEFAULT now(),
  completada_at            timestamptz,
  numero_albaran_papel     text,
  foto_albaran_url         text,
  temperatura_ok           boolean,
  notas                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_recepciones_pedido    ON recepciones(pedido_id);
CREATE INDEX IF NOT EXISTS ix_recepciones_local     ON recepciones(local_id);
CREATE INDEX IF NOT EXISTS ix_recepciones_proveedor ON recepciones(proveedor_id);
CREATE INDEX IF NOT EXISTS ix_recepciones_estado    ON recepciones(estado);
CREATE INDEX IF NOT EXISTS ix_recepciones_fecha     ON recepciones(iniciada_at DESC);

DROP TRIGGER IF EXISTS tg_recepciones_updated_at ON recepciones;
CREATE TRIGGER tg_recepciones_updated_at
  BEFORE UPDATE ON recepciones
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

DROP TRIGGER IF EXISTS tg_audit_recepciones ON recepciones;
CREATE TRIGGER tg_audit_recepciones
  AFTER INSERT OR UPDATE OR DELETE ON recepciones
  FOR EACH ROW EXECUTE FUNCTION tg_audit_log_changes();

ALTER TABLE recepciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_recepciones" ON recepciones;
CREATE POLICY "allow_all_recepciones" ON recepciones FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 2. recepcion_lineas
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recepcion_lineas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recepcion_id             uuid NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
  pedido_linea_id          uuid REFERENCES pedido_compra_lineas(id) ON DELETE SET NULL,
  formato_id               uuid NOT NULL REFERENCES producto_formatos(id),
  producto_id              integer NOT NULL,
  factor_conversion        numeric NOT NULL DEFAULT 1,        -- copia del formato
  cantidad_esperada        numeric(12,3) NOT NULL DEFAULT 0,  -- en unidad de compra
  cantidad_recibida        numeric(12,3) NOT NULL DEFAULT 0,  -- en unidad de compra
  unidades_recibidas       numeric(12,3) GENERATED ALWAYS AS  -- auto: cantidad x factor
                              (cantidad_recibida * COALESCE(factor_conversion, 1)) STORED,
  estado                   text NOT NULL DEFAULT 'pendiente' CHECK (estado IN
                              ('pendiente','ok','parcial','exceso','danado','rechazado')),
  lote                     text,
  fecha_caducidad          date,
  temperatura              numeric(5,2),
  foto_url                 text,
  notas                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_rl_recepcion ON recepcion_lineas(recepcion_id);
CREATE INDEX IF NOT EXISTS ix_rl_pedido_linea ON recepcion_lineas(pedido_linea_id);
CREATE INDEX IF NOT EXISTS ix_rl_producto ON recepcion_lineas(producto_id);

DROP TRIGGER IF EXISTS tg_rl_updated_at ON recepcion_lineas;
CREATE TRIGGER tg_rl_updated_at
  BEFORE UPDATE ON recepcion_lineas
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

ALTER TABLE recepcion_lineas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_recepcion_lineas" ON recepcion_lineas;
CREATE POLICY "allow_all_recepcion_lineas" ON recepcion_lineas FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 3. incidencias
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidencias (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                   text NOT NULL UNIQUE,
  tipo                     text NOT NULL CHECK (tipo IN
                              ('faltante','exceso','danado','caducado','temp_incorrecta',
                               'precio_incorrecto','no_solicitado','entrega_tarde',
                               'docs_incorrectos','factura_duplicada','otro')),
  recepcion_id             uuid REFERENCES recepciones(id) ON DELETE SET NULL,
  recepcion_linea_id       uuid REFERENCES recepcion_lineas(id) ON DELETE SET NULL,
  pedido_id                uuid REFERENCES pedidos_compra(id) ON DELETE SET NULL,
  factura_id               uuid,                              -- FK Fase 2 (facturas_compra)
  proveedor_id             integer NOT NULL REFERENCES proveedores_v2(id),
  local_id                 integer REFERENCES locales_compra_v2(id),
  formato_id               uuid REFERENCES producto_formatos(id),
  producto_id              integer,
  cantidad_afectada        numeric(12,3),
  impacto_economico        numeric(12,2),
  urgencia                 text NOT NULL DEFAULT 'media' CHECK (urgencia IN ('baja','media','alta','critica')),
  estado                   text NOT NULL DEFAULT 'abierta' CHECK (estado IN
                              ('abierta','asignada','esperando_proveedor','en_resolucion',
                               'resuelta','cerrada','reabierta','escalada')),
  asignada_a               uuid,
  sla_deadline             timestamptz,
  tipo_resolucion          text CHECK (tipo_resolucion IS NULL OR tipo_resolucion IN
                              ('abono','reposicion','descuento','sin_accion','factura_rectificativa')),
  importe_resolucion       numeric(12,2),
  notas_resolucion         text,
  fotos_urls               jsonb DEFAULT '[]'::jsonb,
  descripcion              text,
  creada_por               uuid,
  creada_at                timestamptz NOT NULL DEFAULT now(),
  resuelta_at              timestamptz,
  cerrada_at               timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_inc_proveedor ON incidencias(proveedor_id);
CREATE INDEX IF NOT EXISTS ix_inc_local     ON incidencias(local_id);
CREATE INDEX IF NOT EXISTS ix_inc_recepcion ON incidencias(recepcion_id);
CREATE INDEX IF NOT EXISTS ix_inc_pedido    ON incidencias(pedido_id);
CREATE INDEX IF NOT EXISTS ix_inc_estado    ON incidencias(estado);
CREATE INDEX IF NOT EXISTS ix_inc_urgencia  ON incidencias(urgencia);
CREATE INDEX IF NOT EXISTS ix_inc_sla       ON incidencias(sla_deadline) WHERE sla_deadline IS NOT NULL;

DROP TRIGGER IF EXISTS tg_inc_updated_at ON incidencias;
CREATE TRIGGER tg_inc_updated_at
  BEFORE UPDATE ON incidencias
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

DROP TRIGGER IF EXISTS tg_audit_incidencias ON incidencias;
CREATE TRIGGER tg_audit_incidencias
  AFTER INSERT OR UPDATE OR DELETE ON incidencias
  FOR EACH ROW EXECUTE FUNCTION tg_audit_log_changes();

ALTER TABLE incidencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_incidencias" ON incidencias;
CREATE POLICY "allow_all_incidencias" ON incidencias FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 4. Generadores de número
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gen_numero_recepcion()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_hoy text := to_char(CURRENT_DATE, 'YYYYMMDD'); v_count int;
BEGIN
  SELECT COUNT(*)+1 INTO v_count FROM recepciones WHERE numero LIKE 'REC-' || v_hoy || '-%';
  RETURN 'REC-' || v_hoy || '-' || lpad(v_count::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION gen_numero_incidencia()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_hoy text := to_char(CURRENT_DATE, 'YYYYMMDD'); v_count int;
BEGIN
  SELECT COUNT(*)+1 INTO v_count FROM incidencias WHERE numero LIKE 'INC-' || v_hoy || '-%';
  RETURN 'INC-' || v_hoy || '-' || lpad(v_count::text, 4, '0');
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. Helper: SLA por tipo de incidencia (horas)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_sla_incidencia(p_tipo text)
RETURNS interval LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tipo
    WHEN 'temp_incorrecta'   THEN interval '4 hours'
    WHEN 'caducado'          THEN interval '24 hours'
    WHEN 'docs_incorrectos'  THEN interval '48 hours'
    WHEN 'danado'            THEN interval '48 hours'
    WHEN 'faltante'          THEN interval '72 hours'
    WHEN 'exceso'            THEN interval '24 hours'
    WHEN 'no_solicitado'     THEN interval '24 hours'
    WHEN 'entrega_tarde'     THEN interval '24 hours'
    WHEN 'precio_incorrecto' THEN interval '7 days'
    WHEN 'factura_duplicada' THEN interval '4 hours'
    ELSE interval '48 hours'
  END;
$$;

-- ────────────────────────────────────────────────────────────
-- 6. Vistas de conveniencia
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_recepciones_listado AS
SELECT
  r.id, r.numero, r.estado, r.iniciada_at, r.completada_at,
  r.local_id, l.nombre AS local_nombre,
  r.proveedor_id, p.nombre_comercial AS proveedor_nombre,
  r.pedido_id, pc.numero AS pedido_numero,
  (SELECT COUNT(*) FROM recepcion_lineas WHERE recepcion_id = r.id) AS num_lineas,
  (SELECT COUNT(*) FROM recepcion_lineas WHERE recepcion_id = r.id AND estado = 'ok') AS lineas_ok,
  (SELECT COUNT(*) FROM incidencias WHERE recepcion_id = r.id) AS num_incidencias,
  r.recibido_por, r.created_at, r.updated_at
FROM recepciones r
LEFT JOIN locales_compra_v2 l ON l.id = r.local_id
LEFT JOIN proveedores_v2 p ON p.id = r.proveedor_id
LEFT JOIN pedidos_compra pc ON pc.id = r.pedido_id;

CREATE OR REPLACE VIEW v_incidencias_listado AS
SELECT
  i.id, i.numero, i.tipo, i.urgencia, i.estado,
  i.proveedor_id, p.nombre_comercial AS proveedor_nombre,
  i.local_id, l.nombre AS local_nombre,
  i.recepcion_id, r.numero AS recepcion_numero,
  i.pedido_id, pc.numero AS pedido_numero,
  i.cantidad_afectada, i.impacto_economico,
  i.sla_deadline,
  CASE WHEN i.sla_deadline IS NOT NULL AND i.sla_deadline < now() AND i.estado IN ('abierta','asignada','esperando_proveedor','en_resolucion')
       THEN true ELSE false END AS sla_vencido,
  i.tipo_resolucion, i.importe_resolucion,
  i.creada_at, i.resuelta_at, i.cerrada_at,
  i.descripcion, i.fotos_urls
FROM incidencias i
LEFT JOIN proveedores_v2 p ON p.id = i.proveedor_id
LEFT JOIN locales_compra_v2 l ON l.id = i.local_id
LEFT JOIN recepciones r ON r.id = i.recepcion_id
LEFT JOIN pedidos_compra pc ON pc.id = i.pedido_id;

-- ────────────────────────────────────────────────────────────
-- 7. Realtime
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='recepciones') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE recepciones';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='recepcion_lineas') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE recepcion_lineas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='incidencias') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE incidencias';
  END IF;
END $$;

COMMENT ON TABLE recepciones IS 'Recepciones de mercancía. Una por pedido (o varias si hay entregas parciales).';
COMMENT ON TABLE recepcion_lineas IS 'Líneas de recepción. unidades_recibidas se calcula auto = cantidad * factor.';
COMMENT ON TABLE incidencias IS 'Incidencias de calidad/cantidad/precio/etc con SLA por tipo.';
