-- ============================================================
-- Migración de DATOS: poblar tablas de maestros
-- Fecha: 2026-04-27
-- Tarea: F0-4
-- Descripción:
--   Migra los datos existentes desde proveedores_v2 / productos_compra_v2
--   a las nuevas tablas creadas en F0-3:
--     - proveedor_contactos (a partir de persona_contacto/telefono/mail)
--     - proveedor_condiciones_pago (a partir de forma_pago/plazo_pago)
--     - producto_formatos (uno predeterminado por producto, factor=1)
--     - proveedor_producto_precios (precio actual del producto)
--
--   Idempotente: usa NOT EXISTS para no duplicar si se reejecuta.
--   No borra ni modifica datos antiguos: las columnas de proveedores_v2
--   y productos_compra_v2 siguen ahí (la UI las seguirá usando hasta F0-6).
--
-- Rollback: 20260427170000_data_migracion_maestros_rollback.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. proveedor_contactos — uno primario por proveedor
-- ────────────────────────────────────────────────────────────
INSERT INTO proveedor_contactos (
  proveedor_id, nombre, rol, telefono, email, es_primario, notas
)
SELECT
  p.id,
  COALESCE(NULLIF(TRIM(p.persona_contacto), ''), p.nombre_comercial) AS nombre,
  'general' AS rol,
  NULLIF(TRIM(p.telefono_contacto), '') AS telefono,
  NULLIF(TRIM(p.mail_contacto), '')      AS email,
  true                                   AS es_primario,
  'Migrado desde proveedores_v2 (F0-4)'  AS notas
FROM proveedores_v2 p
WHERE
  -- Solo proveedores con algún dato de contacto
  (
    NULLIF(TRIM(p.persona_contacto), '') IS NOT NULL OR
    NULLIF(TRIM(p.telefono_contacto), '') IS NOT NULL OR
    NULLIF(TRIM(p.mail_contacto), '') IS NOT NULL
  )
  AND NOT EXISTS (
    -- No duplicar: si ya existe uno primario, no crear otro
    SELECT 1 FROM proveedor_contactos pc
    WHERE pc.proveedor_id = p.id AND pc.es_primario = true
  );

-- ────────────────────────────────────────────────────────────
-- 2. proveedor_condiciones_pago — una activa por proveedor
-- ────────────────────────────────────────────────────────────
INSERT INTO proveedor_condiciones_pago (
  proveedor_id, forma_pago, dias_pago, activa, notas
)
SELECT
  p.id,
  -- Mapeo forma_pago vieja → nueva
  CASE p.forma_pago
    WHEN 'SEPA'         THEN 'sepa'
    WHEN 'Transferencia' THEN 'transferencia'
    WHEN 'T. Credito'   THEN 'tarjeta_credito'
    WHEN 'Efectivo'     THEN 'efectivo'
    ELSE 'transferencia'   -- default razonable
  END AS forma_pago,
  -- Parseo de plazo_pago: extrae primer número, sino 0 si "contado", sino 30
  CASE
    WHEN p.plazo_pago IS NULL OR TRIM(p.plazo_pago) = '' THEN 30
    WHEN LOWER(p.plazo_pago) LIKE '%contado%' THEN 0
    WHEN LOWER(p.plazo_pago) LIKE '%0%' AND LOWER(p.plazo_pago) NOT LIKE '%30%' AND LOWER(p.plazo_pago) NOT LIKE '%60%' AND LOWER(p.plazo_pago) NOT LIKE '%90%' THEN 0
    WHEN LOWER(p.plazo_pago) LIKE '%90%' THEN 90
    WHEN LOWER(p.plazo_pago) LIKE '%60%' THEN 60
    WHEN LOWER(p.plazo_pago) LIKE '%45%' THEN 45
    WHEN LOWER(p.plazo_pago) LIKE '%30%' THEN 30
    WHEN LOWER(p.plazo_pago) LIKE '%15%' THEN 15
    WHEN LOWER(p.plazo_pago) LIKE '%7%'  THEN 7
    ELSE 30
  END AS dias_pago,
  true AS activa,
  'Migrado desde proveedores_v2.plazo_pago=' || COALESCE(p.plazo_pago, 'NULL') AS notas
FROM proveedores_v2 p
WHERE p.forma_pago IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM proveedor_condiciones_pago pcp
    WHERE pcp.proveedor_id = p.id AND pcp.activa = true
  );

-- ────────────────────────────────────────────────────────────
-- 3. producto_formatos — un formato predeterminado por producto
-- ────────────────────────────────────────────────────────────
INSERT INTO producto_formatos (
  producto_id, formato_compra, unidad_compra, unidad_uso,
  factor_conversion, unidades_por_paquete, es_predeterminado, notas
)
SELECT
  pr.id,
  COALESCE(NULLIF(TRIM(pr.unidad_medida), ''), 'Unidad') AS formato_compra,
  -- Mapeo unidad_medida → unidad_compra (vocabulario controlado)
  CASE
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('kg', 'kilo', 'kilos', 'kilogramo') THEN 'kg'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('g', 'gr', 'gramo', 'gramos')       THEN 'g'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('l', 'litro', 'litros')             THEN 'l'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('ml', 'mililitro', 'mililitros')    THEN 'ml'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('caja', 'cajas')                    THEN 'caja'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('pack', 'packs')                    THEN 'pack'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('saco', 'sacos')                    THEN 'saco'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('garrafa', 'garrafas')              THEN 'garrafa'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('palet', 'palets', 'palé')          THEN 'palet'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('bidon', 'bidón', 'bidones')        THEN 'bidon'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('bandeja', 'bandejas')              THEN 'bandeja'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('docena', 'docenas')                THEN 'docena'
    ELSE 'ud'
  END AS unidad_compra,
  -- unidad_uso: para kg/g/l/ml mantener; resto = 'ud'
  CASE
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('kg', 'kilo', 'kilos', 'kilogramo') THEN 'kg'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('g', 'gr', 'gramo', 'gramos')       THEN 'g'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('l', 'litro', 'litros')             THEN 'l'
    WHEN LOWER(COALESCE(pr.unidad_medida, '')) IN ('ml', 'mililitro', 'mililitros')    THEN 'ml'
    ELSE 'ud'
  END AS unidad_uso,
  1.0 AS factor_conversion,
  CASE
    WHEN pr.unidad_minima_compra IS NOT NULL AND pr.unidad_minima_compra > 0
      THEN pr.unidad_minima_compra::int
    ELSE NULL
  END AS unidades_por_paquete,
  true AS es_predeterminado,
  'Migrado desde productos_compra_v2.unidad_medida=' || COALESCE(pr.unidad_medida, 'NULL')
   || ' — REVISAR: factor_conversion default 1' AS notas
FROM productos_compra_v2 pr
WHERE NOT EXISTS (
  SELECT 1 FROM producto_formatos pf
  WHERE pf.producto_id = pr.id AND pf.es_predeterminado = true
);

-- ────────────────────────────────────────────────────────────
-- 4. proveedor_producto_precios — precio activo por (proveedor, formato)
-- ────────────────────────────────────────────────────────────
INSERT INTO proveedor_producto_precios (
  proveedor_id, formato_id, precio, iva_pct, moneda,
  cantidad_minima_pedido, vigente_desde, activa, notas
)
SELECT
  pr.proveedor_id,
  pf.id AS formato_id,
  COALESCE(pr.precio, 0) AS precio,
  -- Mapeo tipo_iva → iva_pct
  CASE pr.tipo_iva
    WHEN 'General 21%'        THEN 21
    WHEN 'Reducido 10%'       THEN 10
    WHEN 'Superreducido 4%'   THEN 4
    WHEN 'Exento 0%'          THEN 0
    ELSE 21   -- default razonable
  END AS iva_pct,
  'EUR' AS moneda,
  pr.unidad_minima_compra AS cantidad_minima_pedido,
  CURRENT_DATE AS vigente_desde,
  true AS activa,
  'Migrado desde productos_compra_v2.precio (F0-4)' AS notas
FROM productos_compra_v2 pr
JOIN producto_formatos pf
  ON pf.producto_id = pr.id AND pf.es_predeterminado = true
WHERE pr.proveedor_id IS NOT NULL
  AND pr.precio IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM proveedor_producto_precios ppp
    WHERE ppp.proveedor_id = pr.proveedor_id
      AND ppp.formato_id   = pf.id
      AND ppp.activa = true
  );

-- ────────────────────────────────────────────────────────────
-- 5. Resumen de la migración (RAISE NOTICE)
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_proveedores int;
  v_contactos   int;
  v_condiciones int;
  v_formatos    int;
  v_precios     int;
BEGIN
  SELECT COUNT(*) INTO v_proveedores FROM proveedores_v2;
  SELECT COUNT(*) INTO v_contactos   FROM proveedor_contactos        WHERE notas LIKE '%F0-4%';
  SELECT COUNT(*) INTO v_condiciones FROM proveedor_condiciones_pago WHERE notas LIKE '%plazo_pago%';
  SELECT COUNT(*) INTO v_formatos    FROM producto_formatos          WHERE notas LIKE '%F0-4%' OR notas LIKE '%REVISAR%';
  SELECT COUNT(*) INTO v_precios     FROM proveedor_producto_precios WHERE notas LIKE '%F0-4%';

  RAISE NOTICE '=== Migración F0-4 completada ===';
  RAISE NOTICE 'Proveedores existentes: %', v_proveedores;
  RAISE NOTICE 'Contactos creados:      %', v_contactos;
  RAISE NOTICE 'Condiciones de pago:    %', v_condiciones;
  RAISE NOTICE 'Formatos creados:       %', v_formatos;
  RAISE NOTICE 'Precios creados:        %', v_precios;
END $$;

-- ============================================================
-- FIN MIGRACIÓN F0-4
-- ============================================================
