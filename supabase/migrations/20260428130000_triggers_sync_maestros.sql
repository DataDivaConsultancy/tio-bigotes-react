-- ============================================================
-- Migración F0-6b: triggers de sincronización maestros → modelo nuevo
-- Fecha: 2026-04-28
-- Motivo:
--   La doble escritura via RPCs (F0-6) solo funciona si la app llama
--   las RPCs. Algunos productos se crean por otras vías (importación,
--   pantalla legacy, SQL directo). Un trigger AFTER INSERT/UPDATE
--   garantiza que las tablas nuevas siempre quedan sincronizadas,
--   independientemente de cómo se inserte la fila.
-- ============================================================

-- ── Trigger sobre productos_compra_v2 ─────────────────────────
CREATE OR REPLACE FUNCTION tg_sync_producto_to_modelo_nuevo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_formato_id uuid;
BEGIN
  -- Crea/actualiza el formato predeterminado
  v_formato_id := fn_upsert_formato_predeterminado(
    NEW.id::int,
    NEW.unidad_medida,
    NEW.unidad_minima_compra
  );

  -- Crea/actualiza el precio activo (solo si tiene proveedor + precio)
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

DROP TRIGGER IF EXISTS tg_sync_producto_compra ON productos_compra_v2;
CREATE TRIGGER tg_sync_producto_compra
  AFTER INSERT OR UPDATE ON productos_compra_v2
  FOR EACH ROW EXECUTE FUNCTION tg_sync_producto_to_modelo_nuevo();

-- ── Trigger sobre proveedores_v2 ──────────────────────────────
CREATE OR REPLACE FUNCTION tg_sync_proveedor_to_modelo_nuevo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_upsert_contacto_primario(
    NEW.id::int,
    NEW.persona_contacto,
    NEW.telefono_contacto,
    NEW.mail_contacto
  );
  PERFORM fn_upsert_condicion_activa(
    NEW.id::int,
    NEW.forma_pago,
    NEW.plazo_pago
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_sync_proveedor ON proveedores_v2;
CREATE TRIGGER tg_sync_proveedor
  AFTER INSERT OR UPDATE ON proveedores_v2
  FOR EACH ROW EXECUTE FUNCTION tg_sync_proveedor_to_modelo_nuevo();

-- ── Sincronización retroactiva: forzar UPDATE para que dispare el trigger ──
-- Esto rellena producto_formatos y proveedor_producto_precios para todos los
-- productos y proveedores existentes que aún no estén sincronizados.
UPDATE productos_compra_v2 SET updated_at = updated_at;
UPDATE proveedores_v2      SET updated_at = updated_at;
