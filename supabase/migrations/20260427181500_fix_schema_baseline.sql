-- ============================================================
-- Fix: Sincronizar schema con baseline esperado
-- Fecha: 2026-04-27
-- Motivo:
--   La BD de producción tenía algunas columnas desactualizadas vs el
--   sql_modulo_compras.sql baseline (al menos `mail_pedidos` faltaba).
--   Este script añade IDEMPOTENTEMENTE cualquier columna esperada
--   por las RPCs/UI que falte, sin tocar las existentes.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- proveedores_v2 — columnas esperadas
-- ────────────────────────────────────────────────────────────
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS razon_social      text;
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS cif               text;
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS domicilio         text;
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS persona_contacto  text;
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS telefono_contacto text;
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS mail_contacto     text;
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS mail_pedidos      text;
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS forma_pago        text;
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS plazo_pago        text;
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS notas             text;
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS activo            boolean DEFAULT true;
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS created_at        timestamptz DEFAULT now();
ALTER TABLE proveedores_v2 ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

-- Si forma_pago existe pero sin CHECK, no lo forzamos aquí (puede romper si hay datos
-- con valores no estándar). El CHECK se aplica en proveedor_condiciones_pago (modelo nuevo).

-- Asegurar UNIQUE sobre cif (si no existe ya)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'proveedores_v2'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%cif%'
  ) THEN
    BEGIN
      ALTER TABLE proveedores_v2 ADD CONSTRAINT proveedores_v2_cif_key UNIQUE (cif);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN
      NULL; -- ya existe con otro nombre
    END;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- productos_compra_v2 — columnas esperadas
-- ────────────────────────────────────────────────────────────
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS cod_proveedor        text;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS cod_interno          text;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS medidas              text;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS color                text;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS unidad_medida        text;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS unidad_minima_compra numeric;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS dia_pedido           text;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS dia_entrega          text;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS proveedor_id         integer REFERENCES proveedores_v2(id);
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS precio               numeric(10,2);
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS tipo_iva             text;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS forma_pago           text;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS plazo_pago           text;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS producto_venta_id    integer;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS stock_minimo         numeric DEFAULT 0;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS activo               boolean DEFAULT true;
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS created_at           timestamptz DEFAULT now();
ALTER TABLE productos_compra_v2 ADD COLUMN IF NOT EXISTS updated_at           timestamptz DEFAULT now();

-- ────────────────────────────────────────────────────────────
-- locales_compra_v2 — columnas esperadas
-- ────────────────────────────────────────────────────────────
ALTER TABLE locales_compra_v2 ADD COLUMN IF NOT EXISTS direccion   text;
ALTER TABLE locales_compra_v2 ADD COLUMN IF NOT EXISTS telefono    text;
ALTER TABLE locales_compra_v2 ADD COLUMN IF NOT EXISTS transporte  text;
ALTER TABLE locales_compra_v2 ADD COLUMN IF NOT EXISTS activo      boolean DEFAULT true;
ALTER TABLE locales_compra_v2 ADD COLUMN IF NOT EXISTS created_at  timestamptz DEFAULT now();

-- ────────────────────────────────────────────────────────────
-- Verificación: listar columnas que SIGUEN faltando (NOTICE)
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_faltan text[];
  v_col    text;
BEGIN
  v_faltan := ARRAY[]::text[];

  FOREACH v_col IN ARRAY ARRAY[
    'proveedores_v2.mail_pedidos',
    'proveedores_v2.forma_pago',
    'productos_compra_v2.unidad_medida',
    'productos_compra_v2.precio',
    'productos_compra_v2.tipo_iva',
    'locales_compra_v2.direccion'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = split_part(v_col, '.', 1)
        AND column_name  = split_part(v_col, '.', 2)
    ) THEN
      v_faltan := array_append(v_faltan, v_col);
    END IF;
  END LOOP;

  IF array_length(v_faltan, 1) > 0 THEN
    RAISE WARNING 'Columnas SIGUEN faltando: %', array_to_string(v_faltan, ', ');
  ELSE
    RAISE NOTICE 'Schema OK — todas las columnas críticas existen.';
  END IF;
END $$;

-- ============================================================
-- FIN FIX SCHEMA
-- ============================================================
