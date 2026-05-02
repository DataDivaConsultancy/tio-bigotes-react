-- fn_sync_producto_to_compra: guardar precio UNITARIO en
-- proveedor_producto_precios.precio (no el del paquete).
--
-- Convención del módulo Compras:
--   producto_formatos.factor_conversion = uds_uso por uds_compra (paquete)
--   proveedor_producto_precios.precio = precio por unidad de USO
--   total_linea = cantidad * factor_conversion * precio
--
-- Antes el trigger guardaba NEW.precio_compra directamente en .precio,
-- mezclando "precio del paquete" con "precio unitario" → cálculos
-- incorrectos en Crear pedido (multiplicaba el paquete x el factor).
--
-- Ahora:
--   factor_conversion = NEW.unidades_por_paquete (default 1)
--   precio = NEW.precio_compra / factor_conversion
-- El usuario en Productos.tsx mete el precio del paquete + uds; la BD
-- almacena el precio unitario y todo cuadra en el módulo de Compras.

CREATE OR REPLACE FUNCTION public.fn_sync_producto_to_compra()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_compra_id integer;
  v_formato_id uuid;
  v_factor numeric;
  v_precio_unitario numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.tipo IN ('compra','ambos') AND NEW.tipo = 'venta' THEN
    UPDATE productos_compra_v2 SET activo = false, updated_at = now()
    WHERE producto_venta_id = NEW.id OR id = OLD.compra_legacy_id;
    UPDATE producto_proveedor pp SET activo = false, updated_at = now()
    WHERE pp.producto_id IN (
      SELECT id FROM productos_compra_v2
      WHERE producto_venta_id = NEW.id OR id = OLD.compra_legacy_id
    );
    RETURN NEW;
  END IF;

  IF NEW.tipo NOT IN ('compra','ambos') THEN RETURN NEW; END IF;

  IF NEW.compra_legacy_id IS NOT NULL THEN
    UPDATE productos_compra_v2 SET nombre = NEW.nombre, cod_interno = NEW.cod_interno,
      stock_minimo = NEW.stock_minimo, unidad_minima_compra = NEW.unidades_por_paquete,
      activo = NEW.activo,
      producto_venta_id = CASE WHEN NEW.tipo='ambos' THEN NEW.id ELSE NULL END,
      updated_at = now()
    WHERE id = NEW.compra_legacy_id;
    v_compra_id := NEW.compra_legacy_id;
  ELSIF NEW.tipo='ambos' AND EXISTS (SELECT 1 FROM productos_compra_v2 WHERE producto_venta_id = NEW.id) THEN
    UPDATE productos_compra_v2 SET nombre = NEW.nombre, cod_interno = NEW.cod_interno,
      stock_minimo = NEW.stock_minimo, unidad_minima_compra = NEW.unidades_por_paquete,
      activo = NEW.activo, updated_at = now()
    WHERE producto_venta_id = NEW.id RETURNING id INTO v_compra_id;
  ELSE
    INSERT INTO productos_compra_v2 (nombre, cod_interno, stock_minimo,
      unidad_minima_compra, unidad_medida, activo, producto_venta_id)
    VALUES (NEW.nombre, NEW.cod_interno, NEW.stock_minimo, NEW.unidades_por_paquete,
      'unidad', NEW.activo, CASE WHEN NEW.tipo='ambos' THEN NEW.id ELSE NULL END)
    RETURNING id INTO v_compra_id;
    UPDATE tb_v2.productos SET compra_legacy_id = v_compra_id WHERE id = NEW.id;
  END IF;

  v_factor := GREATEST(COALESCE(NEW.unidades_por_paquete, 1), 1);
  SELECT id INTO v_formato_id FROM producto_formatos
    WHERE producto_id = v_compra_id AND es_predeterminado = true LIMIT 1;
  IF v_formato_id IS NULL THEN
    INSERT INTO producto_formatos (producto_id, formato_compra, unidad_compra,
      unidad_uso, factor_conversion, unidades_por_paquete, es_predeterminado, activo)
    VALUES (v_compra_id, 'paquete', 'paquete', 'unidad', v_factor,
      NEW.unidades_por_paquete, true, true)
    RETURNING id INTO v_formato_id;
  ELSE
    UPDATE producto_formatos SET factor_conversion = v_factor,
      unidades_por_paquete = NEW.unidades_por_paquete, updated_at = now()
    WHERE id = v_formato_id;
  END IF;

  IF NEW.proveedor_id IS NOT NULL AND v_compra_id IS NOT NULL THEN
    INSERT INTO producto_proveedor (producto_id, proveedor_id, cod_proveedor,
      dia_pedido, dia_entrega, forma_pago, plazo_pago, es_principal, activo)
    VALUES (v_compra_id, NEW.proveedor_id, NEW.cod_proveedor, NEW.dia_pedido,
      NEW.dia_entrega, NEW.forma_pago, NEW.plazo_pago, true,
      COALESCE(NEW.activo, true))
    ON CONFLICT (producto_id, proveedor_id) DO UPDATE SET
      cod_proveedor = EXCLUDED.cod_proveedor,
      dia_pedido = EXCLUDED.dia_pedido, dia_entrega = EXCLUDED.dia_entrega,
      forma_pago = EXCLUDED.forma_pago, plazo_pago = EXCLUDED.plazo_pago,
      activo = EXCLUDED.activo, updated_at = now();

    IF NEW.precio_compra IS NOT NULL AND NEW.precio_compra > 0 THEN
      v_precio_unitario := NEW.precio_compra / v_factor;

      UPDATE proveedor_producto_precios SET activa = false, vigente_hasta = CURRENT_DATE
      WHERE proveedor_id = NEW.proveedor_id AND formato_id = v_formato_id
        AND activa = true AND ROUND(precio::numeric, 6) IS DISTINCT FROM ROUND(v_precio_unitario, 6);

      IF NOT EXISTS (
        SELECT 1 FROM proveedor_producto_precios WHERE proveedor_id = NEW.proveedor_id
          AND formato_id = v_formato_id AND activa = true
          AND ROUND(precio::numeric, 6) = ROUND(v_precio_unitario, 6)
      ) THEN
        INSERT INTO proveedor_producto_precios (proveedor_id, formato_id, precio,
          iva_pct, moneda, vigente_desde, activa)
        VALUES (NEW.proveedor_id, v_formato_id, v_precio_unitario,
          CASE WHEN NEW.tipo_iva ILIKE '%21%' THEN 21
               WHEN NEW.tipo_iva ILIKE '%10%' THEN 10
               WHEN NEW.tipo_iva ILIKE '%4%' THEN 4
               WHEN NEW.tipo_iva ILIKE '%0%' OR NEW.tipo_iva ILIKE '%exento%' THEN 0
               ELSE 21 END, 'EUR', CURRENT_DATE, true);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;
