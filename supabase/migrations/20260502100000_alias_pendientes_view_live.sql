-- vw_alias_pendientes: convertir matview a vista normal (always-live).
--
-- Antes era una MATERIALIZED VIEW que requería REFRESH manual. Resultado:
-- al asociar un alias TPV a un producto via rpc_crear_alias_y_reprocesar,
-- la matview seguía mostrándolo como pendiente hasta que alguien
-- ejecutaba REFRESH. Síntoma: en el picker de aliases al crear producto
-- aparecían alias "ya mapeados" como si estuvieran sin asignar.
--
-- Solución: vista normal. La query agrega 286k filas pero con el índice
-- parcial idx_ventas_staging_pid_null_articulo es ~2s (aceptable para una
-- pantalla que no se carga con frecuencia).
--
-- rpc_refresh_alias_pendientes pasa a ser no-op (compat con frontend).

CREATE INDEX IF NOT EXISTS idx_ventas_staging_pid_null_articulo
  ON tb_v2.ventas_staging (articulo_raw)
  WHERE producto_id IS NULL;

DROP MATERIALIZED VIEW IF EXISTS public.vw_alias_pendientes CASCADE;

CREATE VIEW public.vw_alias_pendientes AS
SELECT
  vs.articulo_raw AS alias_tpv,
  vs.articulo_normalizado AS alias_normalizado,
  COUNT(*) AS n_ventas,
  COALESCE(SUM(vs.neto), 0) AS importe_total,
  MIN(vs.fecha) AS primera_venta,
  MAX(vs.fecha) AS ultima_venta
FROM tb_v2.ventas_staging vs
WHERE vs.producto_id IS NULL
  AND vs.articulo_raw IS NOT NULL
  AND vs.articulo_raw <> ''
GROUP BY vs.articulo_raw, vs.articulo_normalizado;

CREATE OR REPLACE FUNCTION public.rpc_refresh_alias_pendientes()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN json_build_object('ok', true, 'refreshed_at', now(), 'note', 'view is live');
END;
$$;
