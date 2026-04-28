-- ============================================================
-- Migración: campo unidades_por_paquete en productos_compra_v2
-- Fecha: 2026-04-28
--   Permite indicar cuántas unidades de uso hay en una unidad de compra.
--   Ej: caja de 12 botellas → unidades_por_paquete = 12.
--   El trigger lo propaga a producto_formatos.factor_conversion para que
--   pedido y recepción puedan calcular el equivalente en stock.
-- ============================================================

ALTER TABLE productos_compra_v2
  ADD COLUMN IF NOT EXISTS unidades_por_paquete numeric DEFAULT 1;

UPDATE productos_compra_v2
   SET unidades_por_paquete = 1
 WHERE unidades_por_paquete IS NULL;

-- Reescribir el trigger de sync para que use unidades_por_paquete como factor_conversion
CREATE OR REPLACE FUNCTION tg_sync_producto_to_modelo_nuevo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_formato_id uuid;
  v_factor numeric;
BEGIN
  v_factor := COALESCE(NEW.unidades_por_paquete, 1);
  IF v_factor <= 0 THEN v_factor := 1; END IF;

  -- Crea/actualiza el formato predeterminado (incluye factor_conversion)
  IF EXISTS (SELECT 1 FROM producto_formatos WHERE producto_id = NEW.id::int AND es_predeterminado = true) THEN
    UPDATE producto_formatos SET
      formato_compra       = COALESCE(NULLIF(TRIM(NEW.unidad_medida), ''), formato_compra),
      unidad_compra        = fn_map_unidad_compra(NEW.unidad_medida),
      unidad_uso           = fn_map_unidad_uso(NEW.unidad_medida),
      factor_conversion    = v_factor,
      unidades_por_paquete = NEW.unidades_por_paquete::int,
      updated_at           = now()
    WHERE producto_id = NEW.id::int AND es_predeterminado = true
    RETURNING id INTO v_formato_id;
  ELSE
    INSERT INTO producto_formatos (
      producto_id, formato_compra, unidad_compra, unidad_uso,
      factor_conversion, unidades_por_paquete, es_predeterminado, notas
    ) VALUES (
      NEW.id::int,
      COALESCE(NULLIF(TRIM(NEW.unidad_medida), ''), 'Unidad'),
      fn_map_unidad_compra(NEW.unidad_medida),
      fn_map_unidad_uso(NEW.unidad_medida),
      v_factor,
      NEW.unidades_por_paquete::int,
      true,
      'Generado por trigger sync (F0-6b)'
    ) RETURNING id INTO v_formato_id;
  END IF;

  -- Crea/actualiza el precio activo si hay proveedor + precio
  IF NEW.proveedor_id IS NOT NULL AND NEW.precio IS NOT NULL AND NEW.precio > 0 THEN
    PERFORM fn_upsert_precio_activo(
      NEW.proveedor_id::int,
      v_formato_id,
      NEW.precio,
      NEW.tipo_iva,
      NEW.unidad_minima_compra
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Forzar resync para que el factor se propague a las filas existentes
UPDATE productos_compra_v2 SET updated_at = updated_at;
