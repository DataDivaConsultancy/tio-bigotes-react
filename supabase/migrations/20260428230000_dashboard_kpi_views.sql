-- ============================================================
-- Vista: KPIs del dashboard de compras
-- Devuelve UNA fila con todas las métricas del mes en curso
-- ============================================================

CREATE OR REPLACE VIEW v_compras_kpi_mes AS
WITH params AS (
  SELECT
    date_trunc('month', CURRENT_DATE)::date AS inicio_mes,
    (date_trunc('month', CURRENT_DATE) + interval '1 month')::date AS inicio_mes_siguiente
)
SELECT
  -- Gasto del mes (pedidos en estados con gasto comprometido o realizado)
  COALESCE((
    SELECT SUM(total) FROM pedidos_compra
     WHERE fecha_pedido >= (SELECT inicio_mes FROM params)
       AND fecha_pedido <  (SELECT inicio_mes_siguiente FROM params)
       AND estado IN ('aprobado','enviado','confirmado','parcialmente_recibido','recibido','cerrado')
  ), 0)::numeric(12,2)                                        AS gasto_mes,

  -- Cantidad de pedidos del mes
  (
    SELECT COUNT(*) FROM pedidos_compra
     WHERE fecha_pedido >= (SELECT inicio_mes FROM params)
       AND fecha_pedido <  (SELECT inicio_mes_siguiente FROM params)
       AND estado <> 'cancelado'
  )::int                                                       AS pedidos_mes,

  -- Pedidos esperando aprobación
  (SELECT COUNT(*) FROM pedidos_compra WHERE estado = 'pendiente_aprobacion')::int  AS pedidos_pendientes,

  -- Recepciones abiertas
  (SELECT COUNT(*) FROM recepciones WHERE estado IN ('pendiente','en_revision','con_incidencias'))::int  AS recepciones_abiertas,

  -- Incidencias abiertas
  (SELECT COUNT(*) FROM incidencias WHERE estado IN ('abierta','asignada','esperando_proveedor','en_resolucion','reabierta','escalada'))::int  AS incidencias_abiertas,

  -- Incidencias con SLA vencido
  (SELECT COUNT(*) FROM v_incidencias_listado WHERE sla_vencido = true)::int  AS incidencias_sla_vencido,

  -- Productos bajo stock mínimo
  (
    SELECT COUNT(*) FROM (
      SELECT p.id,
        p.stock_minimo,
        COALESCE(SUM(CASE WHEN sm.tipo = 'entrada' THEN sm.cantidad ELSE -sm.cantidad END), 0) AS stock_actual
      FROM productos_compra_v2 p
      LEFT JOIN stock_movimientos_v2 sm ON sm.producto_compra_id = p.id
      WHERE p.activo = true AND p.stock_minimo > 0
      GROUP BY p.id, p.stock_minimo
      HAVING COALESCE(SUM(CASE WHEN sm.tipo = 'entrada' THEN sm.cantidad ELSE -sm.cantidad END), 0) < p.stock_minimo
    ) sub
  )::int                                                       AS productos_bajo_minimo;

-- Evolución gasto últimos 12 meses
CREATE OR REPLACE VIEW v_compras_gasto_mensual AS
SELECT
  to_char(fecha_pedido, 'YYYY-MM')                AS mes,
  date_trunc('month', fecha_pedido)::date          AS mes_inicio,
  COUNT(*)                                          AS num_pedidos,
  SUM(total)::numeric(12,2)                         AS gasto_total,
  SUM(subtotal)::numeric(12,2)                      AS subtotal,
  SUM(iva_total)::numeric(12,2)                     AS iva_total
FROM pedidos_compra
WHERE estado <> 'cancelado'
  AND fecha_pedido >= (CURRENT_DATE - interval '12 months')
GROUP BY 1, 2
ORDER BY 2;

-- Top proveedores del mes
CREATE OR REPLACE VIEW v_compras_top_proveedores_mes AS
SELECT
  p.proveedor_id,
  pr.nombre_comercial,
  COUNT(*)            AS num_pedidos,
  SUM(p.total)::numeric(12,2) AS gasto
FROM pedidos_compra p
JOIN proveedores_v2 pr ON pr.id = p.proveedor_id
WHERE p.fecha_pedido >= date_trunc('month', CURRENT_DATE)::date
  AND p.estado <> 'cancelado'
GROUP BY p.proveedor_id, pr.nombre_comercial
ORDER BY gasto DESC
LIMIT 10;
