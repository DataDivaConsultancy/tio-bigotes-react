-- Solo productos con tipo='compra' o 'ambos' deben aparecer en el flujo
-- de compras (pedidos a proveedor, recepciones, facturas).
--
-- Antes: la función fn_sync_producto_to_compra creaba fila en
-- productos_compra_v2 también para tipo='venta' (replicando un trigger
-- legacy). Eso hacía que productos terminados (que se PRODUCEN, no se
-- compran) aparecieran como comprables.
--
-- Cambios:
-- 1) fn_sync_producto_to_compra ya no crea fila para tipo='venta'.
-- 2) Cuando un producto pasa de 'compra'/'ambos' → 'venta', su fila en
--    productos_compra_v2 se DESACTIVA (activo=false). No la borramos por
--    si hay líneas de pedido/recepción históricas que la referencien.
-- 3) Backfill: filas existentes en productos_compra_v2 vinculadas a
--    productos tipo='venta' se marcan como inactivas.
-- 4) Reparación: tb_v2.productos.compra_legacy_id que apuntaban a IDs
--    eliminados en el fix anterior se redirigen al ID correcto.
--
-- Aplicado el 2026-05-01 vía Supabase Management API.

-- 1. Reparar punteros rotos
UPDATE tb_v2.productos
SET compra_legacy_id = 1
WHERE id = 1 AND compra_legacy_id = 2;

-- 2. Función reescrita: solo compra/ambos → productos_compra_v2
CREATE OR REPLACE FUNCTION public.fn_sync_producto_to_compra()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_compra_id integer;
BEGIN
  -- Si pasa de 'compra'/'ambos' a 'venta', desactivar la fila de compra
  IF TG_OP = 'UPDATE' AND OLD.tipo IN ('compra','ambos') AND NEW.tipo = 'venta' THEN
    UPDATE productos_compra_v2 SET activo = false, updated_at = now()
    WHERE producto_venta_id = NEW.id OR id = OLD.compra_legacy_id;
    RETURN NEW;
  END IF;

  -- tipo='venta': no se sincroniza nada en productos_compra_v2
  IF NEW.tipo NOT IN ('compra','ambos') THEN
    RETURN NEW;
  END IF;

  -- tipo en ('compra','ambos') con compra_legacy_id válido → UPDATE
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
      producto_venta_id = CASE WHEN NEW.tipo='ambos' THEN NEW.id ELSE NULL END,
      updated_at = now()
    WHERE id = NEW.compra_legacy_id;
  ELSE
    -- tipo='ambos' y ya existe fila por producto_venta_id (caso de cambio venta→ambos)
    IF NEW.tipo='ambos' AND EXISTS (SELECT 1 FROM productos_compra_v2 WHERE producto_venta_id = NEW.id) THEN
      UPDATE productos_compra_v2 SET
        nombre = NEW.nombre, proveedor_id = NEW.proveedor_id,
        cod_proveedor = NEW.cod_proveedor, cod_interno = NEW.cod_interno,
        precio = NEW.precio_compra, tipo_iva = NEW.tipo_iva,
        dia_pedido = NEW.dia_pedido, dia_entrega = NEW.dia_entrega,
        stock_minimo = NEW.stock_minimo,
        unidad_minima_compra = NEW.unidades_por_paquete,
        forma_pago = NEW.forma_pago, plazo_pago = NEW.plazo_pago,
        activo = NEW.activo, updated_at = now()
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

  RETURN NEW;
END;
$$;

-- 3. Backfill: desactivar las filas que ya estaban mal vinculadas a venta
UPDATE productos_compra_v2 pc
SET activo = false, updated_at = now()
WHERE producto_venta_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM tb_v2.productos p
    WHERE p.id = pc.producto_venta_id AND p.tipo = 'venta'
  );
