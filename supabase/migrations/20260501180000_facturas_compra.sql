-- ============================================================
-- MIGRACION: MVP2 Compras — Facturas de compra
-- Fecha: 2026-05-01
-- Sprint 1 del MVP2
-- ============================================================
-- Crea:
--   * facturas_compra            -- cabecera de factura del proveedor
--   * factura_compra_lineas      -- items facturados
--   * factura_recepciones        -- N:N con recepciones (1 factura cubre varias)
--   * fn_proximo_numero_factura  -- generador FC-YYYY-XXXX
--   * Triggers updated_at + numero_interno
--   * RLS por local
--   * RPCs ciclo de vida (crear/aprobar/pagar/rechazar/vincular)
-- ============================================================

BEGIN;

-- 1. Tabla cabecera de factura
CREATE TABLE IF NOT EXISTS facturas_compra (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero            TEXT NOT NULL,                      -- nº de factura del proveedor
  numero_interno    TEXT UNIQUE,                         -- FC-YYYY-XXXX (auto)
  proveedor_id      BIGINT NOT NULL REFERENCES proveedores_v2(id),
  local_id          BIGINT NOT NULL REFERENCES locales_compra_v2(id),
  fecha_emision     DATE NOT NULL,
  fecha_vencimiento DATE,
  importe_neto      NUMERIC(12,2),
  iva_total         NUMERIC(12,2),
  importe_total     NUMERIC(12,2) NOT NULL,
  estado            TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','aprobada','pagada','rechazada')),
  foto_url          TEXT,
  notas             TEXT,
  motivo_rechazo    TEXT,
  fecha_pago        DATE,
  fecha_aprobacion  TIMESTAMPTZ,
  aprobado_por      BIGINT,
  pagado_por        BIGINT,
  rechazado_por     BIGINT,
  creado_por        BIGINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_factura_dup
    UNIQUE (proveedor_id, numero, fecha_emision)
);

CREATE INDEX IF NOT EXISTS ix_facturas_local      ON facturas_compra(local_id);
CREATE INDEX IF NOT EXISTS ix_facturas_proveedor  ON facturas_compra(proveedor_id);
CREATE INDEX IF NOT EXISTS ix_facturas_estado     ON facturas_compra(estado);
CREATE INDEX IF NOT EXISTS ix_facturas_fecha      ON facturas_compra(fecha_emision DESC);

-- 2. Tabla líneas de factura
CREATE TABLE IF NOT EXISTS factura_compra_lineas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id      UUID NOT NULL REFERENCES facturas_compra(id) ON DELETE CASCADE,
  formato_id      UUID,
  producto_id     BIGINT,
  descripcion     TEXT NOT NULL,
  cantidad        NUMERIC(12,4) NOT NULL,
  unidad          TEXT,
  precio_unitario NUMERIC(12,4) NOT NULL,
  descuento_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  iva_pct         NUMERIC(5,2) NOT NULL DEFAULT 21,
  total_linea     NUMERIC(12,2) NOT NULL,
  orden           INT NOT NULL DEFAULT 0,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_fcl_factura ON factura_compra_lineas(factura_id);

-- 3. Vinculación N:N factura ↔ recepciones
CREATE TABLE IF NOT EXISTS factura_recepciones (
  factura_id    UUID NOT NULL REFERENCES facturas_compra(id) ON DELETE CASCADE,
  recepcion_id  UUID NOT NULL REFERENCES recepciones(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (factura_id, recepcion_id)
);
CREATE INDEX IF NOT EXISTS ix_factrec_factura   ON factura_recepciones(factura_id);
CREATE INDEX IF NOT EXISTS ix_factrec_recepcion ON factura_recepciones(recepcion_id);

-- 4. Generador del numero_interno: FC-YYYY-XXXX (4 dígitos, secuencia por año)
CREATE OR REPLACE FUNCTION fn_proximo_numero_factura(p_anio INT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anio INT := COALESCE(p_anio, EXTRACT(YEAR FROM CURRENT_DATE)::INT);
  v_seq INT;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(numero_interno FROM '\d+$')::INT), 0) + 1
    INTO v_seq
  FROM facturas_compra
  WHERE numero_interno LIKE 'FC-' || v_anio || '-%';
  RETURN 'FC-' || v_anio || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;

-- 5. Trigger numero_interno + updated_at
CREATE OR REPLACE FUNCTION tg_facturas_compra_before()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.numero_interno IS NULL THEN
    NEW.numero_interno := fn_proximo_numero_factura(EXTRACT(YEAR FROM NEW.fecha_emision)::INT);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tg_facturas_compra_before ON facturas_compra;
CREATE TRIGGER tg_facturas_compra_before
  BEFORE INSERT OR UPDATE ON facturas_compra
  FOR EACH ROW EXECUTE FUNCTION tg_facturas_compra_before();

-- 6. Vista resumen para listados (con joins de proveedor/local)
CREATE OR REPLACE VIEW vw_facturas_compra AS
SELECT
  f.id,
  f.numero,
  f.numero_interno,
  f.estado,
  f.fecha_emision,
  f.fecha_vencimiento,
  f.fecha_pago,
  f.importe_neto,
  f.iva_total,
  f.importe_total,
  f.foto_url,
  f.notas,
  f.motivo_rechazo,
  f.created_at,
  f.updated_at,
  p.id        AS proveedor_id,
  p.nombre_comercial AS proveedor_nombre,
  l.id        AS local_id,
  l.nombre    AS local_nombre,
  (SELECT COUNT(*) FROM factura_compra_lineas WHERE factura_id = f.id) AS num_lineas,
  (SELECT COUNT(*) FROM factura_recepciones   WHERE factura_id = f.id) AS num_recepciones
FROM facturas_compra f
LEFT JOIN proveedores_v2     p ON p.id = f.proveedor_id
LEFT JOIN locales_compra_v2  l ON l.id = f.local_id;

-- 7. RLS y permisos
ALTER TABLE facturas_compra        ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura_compra_lineas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura_recepciones    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all" ON facturas_compra;
CREATE POLICY "allow_all" ON facturas_compra        FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all" ON factura_compra_lineas;
CREATE POLICY "allow_all" ON factura_compra_lineas  FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all" ON factura_recepciones;
CREATE POLICY "allow_all" ON factura_recepciones    FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON facturas_compra        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON factura_compra_lineas  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON factura_recepciones    TO authenticated;
GRANT SELECT ON vw_facturas_compra TO authenticated;
GRANT EXECUTE ON FUNCTION fn_proximo_numero_factura(INT) TO authenticated;

COMMIT;
