-- ============================================================
-- Migración: Refactor de maestros
-- Fecha: 2026-04-27
-- Tarea: F0-3
-- Descripción:
--   Crea 4 tablas nuevas para preparar el módulo de compras v2:
--     - proveedor_contactos             — múltiples contactos por proveedor
--     - proveedor_condiciones_pago      — condiciones de pago con vigencia temporal
--     - producto_formatos               — factor de conversión compra ↔ unidad de uso
--     - proveedor_producto_precios      — precios con vigencia (histórico de tarifas)
--
--   No rompe nada existente: las tablas viejas (proveedores_v2, productos_compra_v2)
--   mantienen sus columnas actuales. La UI seguirá leyendo lo de antes hasta F0-6.
--   La migración de DATOS a las nuevas tablas va aparte (F0-4).
--
-- Rollback: 20260427150000_refactor_maestros_rollback.sql
-- ============================================================

-- Helper compartido: trigger para auto-actualizar updated_at
CREATE OR REPLACE FUNCTION tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 1. proveedor_contactos
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedor_contactos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id    integer NOT NULL REFERENCES proveedores_v2(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  rol             text CHECK (rol IN ('comercial', 'logistica', 'administracion', 'gerencia', 'general')),
  telefono        text,
  movil           text,
  email           text,
  es_primario     boolean NOT NULL DEFAULT false,
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_proveedor_contactos_proveedor ON proveedor_contactos(proveedor_id);

-- Solo un contacto primario por proveedor
CREATE UNIQUE INDEX IF NOT EXISTS uq_proveedor_contactos_primario
  ON proveedor_contactos(proveedor_id) WHERE es_primario = true;

DROP TRIGGER IF EXISTS tg_proveedor_contactos_updated_at ON proveedor_contactos;
CREATE TRIGGER tg_proveedor_contactos_updated_at
  BEFORE UPDATE ON proveedor_contactos
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

COMMENT ON TABLE  proveedor_contactos IS
  'Contactos del proveedor. Múltiples por proveedor, máximo uno primario.';

-- ────────────────────────────────────────────────────────────
-- 2. proveedor_condiciones_pago
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedor_condiciones_pago (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id             integer NOT NULL REFERENCES proveedores_v2(id) ON DELETE CASCADE,
  forma_pago               text NOT NULL CHECK (forma_pago IN
                              ('transferencia', 'sepa', 'domiciliacion', 'efectivo',
                               'cheque', 'tarjeta_credito', 'pagare', 'contado')),
  dias_pago                integer NOT NULL DEFAULT 30 CHECK (dias_pago >= 0),
  descuento_pronto_pago    numeric(5,2) DEFAULT 0 CHECK (descuento_pronto_pago BETWEEN 0 AND 100),
  dias_pronto_pago         integer CHECK (dias_pronto_pago IS NULL OR dias_pronto_pago >= 0),
  iban                     text,
  nombre_banco             text,
  vigente_desde            date NOT NULL DEFAULT CURRENT_DATE,
  vigente_hasta            date,
  activa                   boolean NOT NULL DEFAULT true,
  notas                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_pcp_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

CREATE INDEX IF NOT EXISTS ix_pcp_proveedor ON proveedor_condiciones_pago(proveedor_id);

-- Solo una condición activa por proveedor
CREATE UNIQUE INDEX IF NOT EXISTS uq_pcp_activa
  ON proveedor_condiciones_pago(proveedor_id) WHERE activa = true;

DROP TRIGGER IF EXISTS tg_pcp_updated_at ON proveedor_condiciones_pago;
CREATE TRIGGER tg_pcp_updated_at
  BEFORE UPDATE ON proveedor_condiciones_pago
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

COMMENT ON TABLE  proveedor_condiciones_pago IS
  'Condiciones de pago del proveedor con vigencia temporal. Solo una activa por proveedor.';
COMMENT ON COLUMN proveedor_condiciones_pago.dias_pago IS
  'Plazo en días desde fecha factura. 0 = contado, 30 = a 30 días, etc.';

-- ────────────────────────────────────────────────────────────
-- 3. producto_formatos
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producto_formatos (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id              integer NOT NULL REFERENCES productos_compra_v2(id) ON DELETE CASCADE,
  formato_compra           text NOT NULL,
  unidad_compra            text NOT NULL CHECK (unidad_compra IN
                              ('kg', 'g', 'l', 'ml', 'ud', 'caja', 'pack',
                               'saco', 'garrafa', 'palet', 'bandeja', 'bidon', 'docena')),
  unidad_uso               text NOT NULL CHECK (unidad_uso IN ('kg', 'g', 'l', 'ml', 'ud')),
  factor_conversion        numeric(12,4) NOT NULL CHECK (factor_conversion > 0),
  peso_neto_kg             numeric(10,3),
  peso_bruto_kg            numeric(10,3),
  unidades_por_paquete     integer CHECK (unidades_por_paquete IS NULL OR unidades_por_paquete > 0),
  merma_pct                numeric(5,2) NOT NULL DEFAULT 0 CHECK (merma_pct BETWEEN 0 AND 100),
  ean                      text,
  es_predeterminado        boolean NOT NULL DEFAULT false,
  activo                   boolean NOT NULL DEFAULT true,
  notas                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_producto_formatos_producto ON producto_formatos(producto_id);
CREATE INDEX IF NOT EXISTS ix_producto_formatos_ean      ON producto_formatos(ean) WHERE ean IS NOT NULL;

-- Solo un formato predeterminado por producto
CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_formatos_predeterminado
  ON producto_formatos(producto_id) WHERE es_predeterminado = true;

DROP TRIGGER IF EXISTS tg_producto_formatos_updated_at ON producto_formatos;
CREATE TRIGGER tg_producto_formatos_updated_at
  BEFORE UPDATE ON producto_formatos
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

COMMENT ON TABLE  producto_formatos IS
  'Formatos de compra del producto y factor de conversión a la unidad de uso interna.';
COMMENT ON COLUMN producto_formatos.factor_conversion IS
  '1 unidad de compra = factor_conversion unidades de uso. Ej: caja 6x500g con unidad_uso=kg → factor 3.';
COMMENT ON COLUMN producto_formatos.merma_pct IS
  'Merma esperada en proceso (limpieza, recortes, etc.) — se descuenta al calcular coste/escandallo.';

-- ────────────────────────────────────────────────────────────
-- 4. proveedor_producto_precios
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedor_producto_precios (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id             integer NOT NULL REFERENCES proveedores_v2(id) ON DELETE CASCADE,
  formato_id               uuid    NOT NULL REFERENCES producto_formatos(id) ON DELETE CASCADE,
  precio                   numeric(12,4) NOT NULL CHECK (precio >= 0),
  iva_pct                  numeric(4,2)  NOT NULL CHECK (iva_pct IN (0, 4, 10, 21)),
  moneda                   text NOT NULL DEFAULT 'EUR' CHECK (char_length(moneda) = 3),
  cantidad_minima_pedido   numeric(12,3),
  multiplo_pedido          numeric(12,3),
  descuento_pct            numeric(5,2) NOT NULL DEFAULT 0 CHECK (descuento_pct BETWEEN 0 AND 100),
  vigente_desde            date NOT NULL DEFAULT CURRENT_DATE,
  vigente_hasta            date,
  activa                   boolean NOT NULL DEFAULT true,
  notas                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ppp_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

CREATE INDEX IF NOT EXISTS ix_ppp_proveedor ON proveedor_producto_precios(proveedor_id);
CREATE INDEX IF NOT EXISTS ix_ppp_formato   ON proveedor_producto_precios(formato_id);
CREATE INDEX IF NOT EXISTS ix_ppp_vigencia  ON proveedor_producto_precios(vigente_desde DESC, vigente_hasta DESC);

-- Solo un precio activo por (proveedor + formato)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ppp_activa
  ON proveedor_producto_precios(proveedor_id, formato_id) WHERE activa = true;

DROP TRIGGER IF EXISTS tg_ppp_updated_at ON proveedor_producto_precios;
CREATE TRIGGER tg_ppp_updated_at
  BEFORE UPDATE ON proveedor_producto_precios
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

COMMENT ON TABLE  proveedor_producto_precios IS
  'Precios por proveedor y formato, con vigencia temporal. Permite histórico y alertas de cambio.';

-- ────────────────────────────────────────────────────────────
-- 5. RLS — políticas permisivas (alineadas con el baseline existente)
-- ────────────────────────────────────────────────────────────
-- Nota: los locks por rol/local se aplicarán cuando se introduzcan pedidos (F1A-2).
-- De momento, mismo nivel de acceso que las tablas de maestros existentes.

ALTER TABLE proveedor_contactos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedor_condiciones_pago        ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_formatos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedor_producto_precios        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_proveedor_contactos" ON proveedor_contactos;
CREATE POLICY "allow_all_proveedor_contactos" ON proveedor_contactos
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_proveedor_condiciones_pago" ON proveedor_condiciones_pago;
CREATE POLICY "allow_all_proveedor_condiciones_pago" ON proveedor_condiciones_pago
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_producto_formatos" ON producto_formatos;
CREATE POLICY "allow_all_producto_formatos" ON producto_formatos
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_proveedor_producto_precios" ON proveedor_producto_precios;
CREATE POLICY "allow_all_proveedor_producto_precios" ON proveedor_producto_precios
  FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 6. Vistas de conveniencia (compatibilidad con UI existente)
-- ────────────────────────────────────────────────────────────

-- v_proveedor_contacto_principal: 1 fila por proveedor con el contacto primario
CREATE OR REPLACE VIEW v_proveedor_contacto_principal AS
SELECT
  pc.proveedor_id,
  pc.nombre        AS contacto_nombre,
  pc.rol           AS contacto_rol,
  pc.telefono      AS contacto_telefono,
  pc.movil         AS contacto_movil,
  pc.email         AS contacto_email
FROM proveedor_contactos pc
WHERE pc.es_primario = true;

-- v_proveedor_condicion_actual: 1 fila por proveedor con la condición de pago vigente
CREATE OR REPLACE VIEW v_proveedor_condicion_actual AS
SELECT
  pcp.proveedor_id,
  pcp.forma_pago,
  pcp.dias_pago,
  pcp.descuento_pronto_pago,
  pcp.dias_pronto_pago,
  pcp.iban,
  pcp.nombre_banco,
  pcp.vigente_desde
FROM proveedor_condiciones_pago pcp
WHERE pcp.activa = true;

-- v_producto_precio_actual: precio activo por (proveedor, producto, formato)
CREATE OR REPLACE VIEW v_producto_precio_actual AS
SELECT
  ppp.proveedor_id,
  pf.producto_id,
  pf.id                  AS formato_id,
  pf.formato_compra,
  pf.unidad_compra,
  pf.unidad_uso,
  pf.factor_conversion,
  ppp.precio,
  ppp.iva_pct,
  ppp.descuento_pct,
  ppp.cantidad_minima_pedido,
  ppp.multiplo_pedido,
  ppp.vigente_desde,
  ppp.vigente_hasta
FROM proveedor_producto_precios ppp
JOIN producto_formatos pf ON pf.id = ppp.formato_id
WHERE ppp.activa = true;

-- ============================================================
-- FIN MIGRACIÓN F0-3
-- ============================================================
