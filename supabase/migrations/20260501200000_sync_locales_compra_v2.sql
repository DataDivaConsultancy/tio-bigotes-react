-- Sincronización de locales entre los dos catálogos paralelos.
--
-- Problema: existen dos tablas de locales:
--   - tb_v2.locales (vista pública locales_v2): la usan CargaVentas, BI,
--     Forecast, ventas_staging.local_id, etc.
--   - public.locales_compra_v2: la usa el módulo de compras (la pantalla
--     "Locales" del sidebar escribe AQUÍ).
--
-- Resultado: el usuario crea Provenza 478 desde "Locales" y aparece en
-- locales_compra_v2 pero NO en tb_v2.locales, con lo que CargaVentas no lo
-- ve y BI tampoco puede filtrar por él.
--
-- Esta migración:
-- 1) Sincroniza inicialmente los locales que ya existen en
--    locales_compra_v2 hacia tb_v2.locales.
-- 2) Crea un trigger que mantiene la sincronía hacia adelante: cualquier
--    INSERT/UPDATE en locales_compra_v2 se replica en tb_v2.locales.
--    En el DELETE solo desactiva (no borra) en tb_v2.locales para preservar
--    la integridad de ventas históricas que apuntan al local_id.
--
-- IMPORTANTE: tb_v2.locales tiene `codigo` NOT NULL, así que en INSERT
-- generamos un código a partir del nombre (UPPER + sin caracteres especiales).
-- Si el usuario quiere personalizarlo, puede editarlo directamente.

INSERT INTO tb_v2.locales (id, codigo, nombre, activo, timezone)
SELECT
  lc.id,
  COALESCE(
    (SELECT codigo FROM tb_v2.locales WHERE id = lc.id),
    UPPER(REGEXP_REPLACE(LEFT(lc.nombre, 6), '[^A-Za-z0-9]', '', 'g')) || lc.id
  ),
  lc.nombre,
  COALESCE(lc.activo, true),
  'Europe/Madrid'
FROM locales_compra_v2 lc
WHERE NOT EXISTS (SELECT 1 FROM tb_v2.locales WHERE id = lc.id);

UPDATE tb_v2.locales l
SET nombre = lc.nombre,
    activo = COALESCE(lc.activo, true)
FROM locales_compra_v2 lc
WHERE l.id = lc.id;

CREATE OR REPLACE FUNCTION tb_v2.fn_sync_locales_compra_to_v2()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO tb_v2.locales (id, codigo, nombre, activo, timezone)
    VALUES (
      NEW.id,
      UPPER(REGEXP_REPLACE(LEFT(NEW.nombre, 6), '[^A-Za-z0-9]', '', 'g')) || NEW.id,
      NEW.nombre,
      COALESCE(NEW.activo, true),
      'Europe/Madrid'
    )
    ON CONFLICT (id) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      activo = EXCLUDED.activo;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE tb_v2.locales
    SET nombre = NEW.nombre, activo = COALESCE(NEW.activo, true)
    WHERE id = NEW.id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE tb_v2.locales SET activo = false WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_locales_compra ON locales_compra_v2;
CREATE TRIGGER trg_sync_locales_compra
AFTER INSERT OR UPDATE OR DELETE ON locales_compra_v2
FOR EACH ROW EXECUTE FUNCTION tb_v2.fn_sync_locales_compra_to_v2();
