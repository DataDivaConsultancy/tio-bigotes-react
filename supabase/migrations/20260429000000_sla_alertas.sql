-- ============================================================
-- F1B-11: campos para alertas SLA (tracking de emails enviados)
-- ============================================================
ALTER TABLE incidencias ADD COLUMN IF NOT EXISTS email_reclamacion_enviado_at timestamptz;
ALTER TABLE incidencias ADD COLUMN IF NOT EXISTS email_reclamacion_count       int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_inc_pendiente_email
  ON incidencias(sla_deadline)
  WHERE estado IN ('abierta','asignada','esperando_proveedor','en_resolucion','reabierta','escalada')
    AND email_reclamacion_count < 3;

-- Vista de incidencias que requieren reclamación: vencidas o a <2h del SLA, abiertas, max 3 emails
CREATE OR REPLACE VIEW v_incidencias_para_reclamar AS
SELECT
  i.id, i.numero, i.tipo, i.urgencia, i.estado,
  i.proveedor_id, p.nombre_comercial AS proveedor_nombre, p.mail_pedidos, p.mail_contacto,
  i.local_id, l.nombre AS local_nombre,
  i.recepcion_id, r.numero AS recepcion_numero,
  i.pedido_id, pc.numero AS pedido_numero,
  i.descripcion, i.fotos_urls, i.cantidad_afectada,
  i.sla_deadline,
  i.email_reclamacion_enviado_at, i.email_reclamacion_count,
  CASE
    WHEN i.sla_deadline IS NULL THEN 'sin_sla'
    WHEN i.sla_deadline < now() THEN 'vencido'
    WHEN i.sla_deadline < now() + interval '2 hours' THEN 'proximo'
    ELSE 'futuro'
  END AS urgencia_sla
FROM incidencias i
LEFT JOIN proveedores_v2 p ON p.id = i.proveedor_id
LEFT JOIN locales_compra_v2 l ON l.id = i.local_id
LEFT JOIN recepciones r ON r.id = i.recepcion_id
LEFT JOIN pedidos_compra pc ON pc.id = i.pedido_id
WHERE i.estado IN ('abierta','asignada','esperando_proveedor','en_resolucion','reabierta','escalada')
  AND i.email_reclamacion_count < 3
  AND COALESCE(p.mail_pedidos, p.mail_contacto, '') <> '';
