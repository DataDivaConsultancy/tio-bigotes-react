-- Fix duplicación productos_compra_v2 al crear producto tipo='ambos'
--
-- Problema: cuando se creaba un producto en tb_v2.productos con tipo='ambos',
-- se disparaban DOS triggers que insertaban en productos_compra_v2:
--   - tg_sync_productos_venta → fn tg_sync_producto_venta_a_compra
--   - trg_sync_producto_to_compra → fn fn_sync_producto_to_compra
-- Resultado: 2 filas duplicadas con el mismo producto_venta_id.
--
-- Solución:
-- 1) Eliminar el trigger viejo (tg_sync_productos_venta) y su función.
-- 2) Modificar fn_sync_producto_to_compra para que también maneje
--    tipo='venta' (caso que antes cubría el trigger eliminado).
-- 3) UNIQUE INDEX parcial sobre producto_venta_id para que ningún flujo
--    futuro pueda volver a duplicar.
--
-- Aplicado el 2026-05-01 vía Supabase Management API.

-- 1. Eliminar trigger y función obsoletos
DROP TRIGGER IF EXISTS tg_sync_productos_venta ON tb_v2.productos;
DROP FUNCTION IF EXISTS public.tg_sync_producto_venta_a_compra();

-- 2. Modificar la función única de sincronía
CREATE OR REPLACE FUNCTION public.fn_sync_producto_to_compra()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_compra_id integer;
BEGIN
  IF NEW.tipo IN ('compra', 'ambos') THEN
    IF NEW.compra_legacy_id IS NOT NULL THEN
      UPDATE productos_compra_v2 SET
        nombre = NEW.nombre, proveedor_id = NEW.proveedor_id,
        cod_proveedor = NEW.cod_proveedor, cod_interno = NEW.cod_interno,
        precio = NEW.precio_compra, tipo_iva = NEW.tipo_iva,
        dia_pedido = NEW.dia_pedido, dia_entrega = NEW.dia_entrega,
        stock_minimo = NEW.stock_minimo,
        unidad_minima_compra = NEW.unidades_por_paquete,
        forma_pago = NEW.forma_pago, plazo_pago = NEW.plazo_pago,
        activo = NEW.activo,
        producto_venta_id = CASE WHEN NEW.tipo='ambos' THEN NEW.id ELSE NULL END
      WHERE id = NEW.compra_legacy_id;
    ELSE
      IF NEW.tipo='ambos' AND EXISTS (SELECT 1 FROM productos_compra_v2 WHERE producto_venta_id = NEW.id) THEN
        UPDATE productos_compra_v2 SET
          nombre = NEW.nombre, proveedor_id = NEW.proveedor_id,
          cod_proveedor = NEW.cod_proveedor, cod_interno = NEW.cod_interno,
          precio = NEW.precio_compra, tipo_iva = NEW.tipo_iva,
          dia_pedido = NEW.dia_pedido, dia_entrega = NEW.dia_entrega,
          stock_minimo = NEW.stock_minimo,
          unidad_minima_compra = NEW.unidades_por_paquete,
          forma_pago = NEW.forma_pago, plazo_pago = NEW.plazo_pago,
          activo = NEW.activo
        WHERE producto_venta_id = NEW.id;
      ELSE
        INSERT INTO productos_compra_v2 (
          nombre, proveedor_id, cod_proveedor, cod_interno,
          precio, tipo_iva, dia_pedido, dia_entrega, stock_minimo,
          unidad_minima_compra, forma_pago, plazo_pago, unidad_medida,
          activo, producto_venta_id
        ) VALUES (
          NEW.nombre, NEW.proveedor_id, NEW.cod_proveedor, NEW.cod_interno,
          NEW.precio_compra, NEW.tipo_iva, NEW.dia_pedido, NEW.dia_entrega,
          NEW.stock_minimo, NEW.unidades_por_paquete, NEW.forma_pago, NEW.plazo_pago,
          'unidad', NEW.activo,
          CASE WHEN NEW.tipo='ambos' THEN NEW.id ELSE NULL END
        )
        RETURNING id INTO v_compra_id;
        UPDATE tb_v2.productos SET compra_legacy_id = v_compra_id WHERE id = NEW.id;
      END IF;
    END IF;
  END IF;

  IF NEW.tipo='venta' AND COALESCE(NEW.es_vendible, true) THEN
    IF NOT EXISTS (SELECT 1 FROM productos_compra_v2 WHERE producto_venta_id = NEW.id) THEN
      INSERT INTO productos_compra_v2 (
        nombre, proveedor_id, producto_venta_id,
        precio, tipo_iva, unidad_medida, unidad_minima_compra,
        cod_interno, activo
      ) VALUES (
        NEW.nombre, COALESCE(NEW.proveedor_id, 1), NEW.id,
        NULL, COALESCE(NEW.tipo_iva, 'Reducido 10%'), 'unidad', 1,
        NEW.codigo, COALESCE(NEW.activo, true)
      );
    ELSE
      UPDATE productos_compra_v2 SET
        nombre = NEW.nombre, cod_interno = NEW.codigo,
        activo = NEW.activo, updated_at = now()
      WHERE producto_venta_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. UNIQUE INDEX parcial: garantiza una sola fila por producto_venta_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_compra_v2_venta_id
ON productos_compra_v2 (producto_venta_id)
WHERE producto_venta_id IS NOT NULL;
