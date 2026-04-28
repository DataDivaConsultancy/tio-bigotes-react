-- ============================================================
-- Unificar 'unidad_minima_compra' y 'unidades_por_paquete' en un solo concepto
-- Fecha: 2026-04-28
--
-- Asume que para Horacio "Compra mínima" = "Unidades por paquete":
-- 60 = el paquete contiene 60 unidades, y eso es lo que se compra mínimo.
-- ============================================================

-- Para productos donde unidades_por_paquete es 1 (default) y unidad_minima_compra > 1,
-- copiar el valor (probable que sea el correcto)
UPDATE productos_compra_v2
   SET unidades_por_paquete = unidad_minima_compra
 WHERE COALESCE(unidades_por_paquete, 1) = 1
   AND COALESCE(unidad_minima_compra, 0) > 1;

-- Forzar resync para que el factor llegue a producto_formatos
UPDATE productos_compra_v2 SET updated_at = updated_at;

-- Recalcular líneas de pedidos existentes con los nuevos factores
UPDATE pedido_compra_lineas
   SET factor_conversion = COALESCE(pf.factor_conversion, 1)
  FROM producto_formatos pf
 WHERE pf.id = pedido_compra_lineas.formato_id;

UPDATE pedido_compra_lineas SET cantidad = cantidad;  -- dispara recálculo de total_linea

-- Recalcular cabeceras
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM pedidos_compra LOOP
    PERFORM fn_recalcular_totales_pedido(r.id);
  END LOOP;
END $$;
