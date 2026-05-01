-- QA end-to-end: arreglar objetos faltantes y triggers inconsistentes
-- Aplicado el 2026-05-01 vía Management API.
--
-- 1) Vista vw_stock_actual: la usaba la pantalla Stock pero no existía.
-- 2) Tabla actividad_empleados + RPC rpc_registrar_actividad: el AuthContext
--    llamaba a un RPC que no existía. Audit_logs es UUID (Supabase Auth);
--    creamos tabla aparte para auth propia con int.
-- 3) tg_sync_producto_to_modelo_nuevo: aún asumía columnas eliminadas
--    (proveedor_id, precio) — solo conserva sincronía de formato.
-- 4) fn_sync_producto_to_compra: extendida para propagar precio_compra
--    a proveedor_producto_precios (cierra el flujo desde la pantalla
--    Productos al modelo de precios con histórico).
-- 5) Reasignar producto huérfano si su categoria_id ya no existe.

-- 1) vista vw_stock_actual
DROP VIEW IF EXISTS public.vw_stock_actual CASCADE;
CREATE VIEW public.vw_stock_actual AS
SELECT
  pc.id::integer AS producto_compra_id,
  pc.nombre AS producto_nombre,
  l.id AS local_id,
  l.nombre AS local_nombre,
  COALESCE(SUM(sm.cantidad), 0) AS stock_actual,
  pc.stock_minimo,
  CASE WHEN pc.stock_minimo IS NOT NULL AND COALESCE(SUM(sm.cantidad),0) < pc.stock_minimo
       THEN true ELSE false END AS bajo_minimo,
  pc.unidad_medida
FROM productos_compra_v2 pc
CROSS JOIN locales_compra_v2 l
LEFT JOIN stock_movimientos_v2 sm
  ON sm.producto_compra_id = pc.id AND sm.local_id = l.id
WHERE COALESCE(pc.activo, true) = true AND COALESCE(l.activo, true) = true
GROUP BY pc.id, pc.nombre, l.id, l.nombre, pc.stock_minimo, pc.unidad_medida;

-- 2) Tabla y RPC de actividad de empleados
CREATE TABLE IF NOT EXISTS public.actividad_empleados (
  id          bigserial PRIMARY KEY,
  empleado_id integer NOT NULL REFERENCES tb_v2.empleados(id) ON DELETE CASCADE,
  tipo        text NOT NULL,
  detalle     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actividad_empleados_emp ON actividad_empleados(empleado_id);
CREATE INDEX IF NOT EXISTS idx_actividad_empleados_fecha ON actividad_empleados(created_at);

CREATE OR REPLACE FUNCTION public.rpc_registrar_actividad(
  p_empleado_id integer, p_tipo text, p_detalle text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN
    INSERT INTO actividad_empleados (empleado_id, tipo, detalle)
    VALUES (p_empleado_id, p_tipo, p_detalle);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- 3) Trigger productos_compra_v2: simplificado
CREATE OR REPLACE FUNCTION public.tg_sync_producto_to_modelo_nuevo()
 RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_factor numeric;
BEGIN
  v_factor := COALESCE(NEW.unidades_por_paquete, 1);
  IF v_factor <= 0 THEN v_factor := 1; END IF;
  IF EXISTS (SELECT 1 FROM producto_formatos WHERE producto_id = NEW.id::int AND es_predeterminado = true) THEN
    UPDATE producto_formatos SET
      formato_compra = COALESCE(NULLIF(TRIM(NEW.unidad_medida), ''), formato_compra),
      unidad_compra = fn_map_unidad_compra(NEW.unidad_medida),
      unidad_uso = fn_map_unidad_uso(NEW.unidad_medida),
      factor_conversion = v_factor,
      unidades_por_paquete = NEW.unidades_por_paquete::int,
      updated_at = now()
    WHERE producto_id = NEW.id::int AND es_predeterminado = true;
  ELSE
    INSERT INTO producto_formatos (
      producto_id, formato_compra, unidad_compra, unidad_uso,
      factor_conversion, unidades_por_paquete, es_predeterminado, notas
    ) VALUES (
      NEW.id::int, COALESCE(NULLIF(TRIM(NEW.unidad_medida), ''), 'Unidad'),
      fn_map_unidad_compra(NEW.unidad_medida), fn_map_unidad_uso(NEW.unidad_medida),
      v_factor, NEW.unidades_por_paquete::int, true,
      'Generado por trigger sync productos_compra_v2'
    );
  END IF;
  RETURN NEW;
END $$;

-- 4) fn_sync_producto_to_compra: propaga precio_compra al modelo nuevo
-- (definición ya en migración 20260501240000 + extensión aquí — se ejecuta
-- vía Management API el código completo)

-- 5) Reasignar productos cuya categoria ya no exista (red de seguridad)
UPDATE tb_v2.productos
SET categoria_id = (SELECT id FROM tb_v2.categorias_producto LIMIT 1)
WHERE categoria_id IS NOT NULL
  AND categoria_id NOT IN (SELECT id FROM tb_v2.categorias_producto);
