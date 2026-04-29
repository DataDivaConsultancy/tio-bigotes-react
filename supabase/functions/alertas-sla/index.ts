// Edge Function: alertas-sla
// Recorre incidencias con SLA vencido o próximo a vencer y envía
// emails de reclamación al proveedor con descripción y fotos.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
}

const TIPO_LABELS = {
  faltante: "Faltante de mercancía",
  exceso: "Exceso de mercancía",
  danado: "Producto dañado",
  caducado: "Producto caducado / vida útil insuficiente",
  temp_incorrecta: "Temperatura incorrecta",
  precio_incorrecto: "Precio incorrecto",
  no_solicitado: "Producto no solicitado",
  entrega_tarde: "Entrega fuera de plazo",
  docs_incorrectos: "Documentación incorrecta",
  factura_duplicada: "Factura duplicada",
  otro: "Incidencia",
}

function buildHtml(i, vencido) {
  const tipoLabel = TIPO_LABELS[i.tipo] || i.tipo
  const fotosArr = Array.isArray(i.fotos_urls) ? i.fotos_urls : []
  const fotos = fotosArr.map(u => '<img src="' + u + '" style="max-width:280px;max-height:200px;border-radius:8px;margin:4px;border:1px solid #eee" />').join("")
  const headerColor = vencido ? "#dc2626" : "#f59e0b"
  const headerLabel = vencido ? "Reclamación — SLA vencido" : "Aviso — SLA próximo a vencer"
  const slaTxt = i.sla_deadline ? new Date(i.sla_deadline).toLocaleString("es-ES") : ""
  const intro = vencido
    ? "Os contactamos por una incidencia que ya ha superado el plazo de respuesta acordado. Necesitamos vuestra atención urgente."
    : "Os recordamos esta incidencia que pronto vencerá su SLA. Agradecemos vuestra respuesta cuanto antes."
  return [
    '<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body style="margin:0;font-family:sans-serif;background:#f5f5f5;color:#1a1a1a;">',
    '<div style="max-width:640px;margin:24px auto;background:white;border-radius:12px;overflow:hidden;">',
    '<div style="padding:20px 28px;background:' + headerColor + ';color:white;">',
    '<div style="font-size:11px;letter-spacing:1px;opacity:0.9;text-transform:uppercase;">Tío Bigotes · Incidencia</div>',
    '<div style="font-size:22px;font-weight:700;margin-top:4px;">' + headerLabel + '</div>',
    '<div style="font-size:13px;margin-top:8px;opacity:0.9;">' + i.numero + ' · ' + tipoLabel + '</div>',
    '</div>',
    '<div style="padding:20px 28px;font-size:14px;line-height:1.6;">',
    '<p>Hola <b>' + (i.proveedor_nombre || "") + '</b>,</p>',
    '<p>' + intro + '</p>',
    '<table style="width:100%;background:#f9fafb;border-radius:8px;padding:14px;margin-top:12px;font-size:13px;line-height:1.7;"><tr><td>',
    '<b>Tipo:</b> ' + tipoLabel + '<br/>',
    i.local_nombre ? '<b>Local:</b> ' + i.local_nombre + '<br/>' : '',
    i.pedido_numero ? '<b>Pedido:</b> ' + i.pedido_numero + '<br/>' : '',
    i.recepcion_numero ? '<b>Recepción:</b> ' + i.recepcion_numero + '<br/>' : '',
    i.cantidad_afectada ? '<b>Cantidad afectada:</b> ' + i.cantidad_afectada + '<br/>' : '',
    slaTxt ? '<b>SLA:</b> ' + slaTxt : '',
    '</td></tr></table>',
    i.descripcion ? '<div style="margin-top:14px;font-style:italic;background:#fafafa;padding:12px;border-radius:6px;border-left:3px solid #ccc;">' + i.descripcion + '</div>' : '',
    fotos ? '<div style="text-align:center;margin-top:14px;">' + fotos + '</div>' : '',
    '</div>',
    '<div style="padding:16px 28px;background:#fafafa;border-top:1px solid #eee;font-size:11px;color:#888;">Email automático de Tío Bigotes (sebbrofoods). Responde a este email para resolver la incidencia.</div>',
    '</div></body></html>'
  ].join("")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })

  const cronSecret = Deno.env.get("CRON_SECRET") || ""
  const header = req.headers.get("x-cron-secret") || ""
  if (cronSecret && header !== cronSecret) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: Object.assign({}, CORS, { "Content-Type": "application/json" }),
    })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const resendKey = Deno.env.get("RESEND_API_KEY")
    const fromAddr = Deno.env.get("EMAIL_FROM") || "onboarding@resend.dev"

    if (!resendKey) {
      return new Response(JSON.stringify({ ok: false, error: "sin_resend_key" }), {
        headers: Object.assign({}, CORS, { "Content-Type": "application/json" }),
      })
    }

    // Query directa a PostgREST (sin createClient)
    const restUrl = supabaseUrl + "/rest/v1/v_incidencias_para_reclamar?urgencia_sla=in.(vencido,proximo)&limit=50"
    const queryResp = await fetch(restUrl, {
      headers: { "apikey": serviceKey, "Authorization": "Bearer " + serviceKey },
    })
    if (!queryResp.ok) {
      const txt = await queryResp.text()
      return new Response(JSON.stringify({ ok: false, error: "query_failed", mensaje: txt }), {
        headers: Object.assign({}, CORS, { "Content-Type": "application/json" }),
      })
    }
    const incs = await queryResp.json()

    let enviados = 0
    const errores = []

    for (const i of incs) {
      const dest = ((i.mail_pedidos || i.mail_contacto) || "").trim()
      if (!dest) continue

      const vencido = i.urgencia_sla === "vencido"
      const html = buildHtml(i, vencido)
      const subject = (vencido ? "[Reclamación] " : "[Aviso] ") + (TIPO_LABELS[i.tipo] || i.tipo) + " — " + i.numero

      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": "Bearer " + resendKey, "Content-Type": "application/json" },
          body: JSON.stringify({ from: fromAddr, to: [dest], subject, html }),
        })
        if (!r.ok) {
          errores.push({ id: i.id, status: r.status, body: await r.text() })
          continue
        }
        // Update via PostgREST
        await fetch(supabaseUrl + "/rest/v1/incidencias?id=eq." + i.id, {
          method: "PATCH",
          headers: {
            "apikey": serviceKey,
            "Authorization": "Bearer " + serviceKey,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            email_reclamacion_enviado_at: new Date().toISOString(),
            email_reclamacion_count: (i.email_reclamacion_count || 0) + 1,
            estado: "esperando_proveedor",
          }),
        })
        enviados++
      } catch (e) {
        errores.push({ id: i.id, error: String(e) })
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      data: { revisadas: incs.length, enviados, errores: errores.length, detalles_errores: errores },
    }), { headers: Object.assign({}, CORS, { "Content-Type": "application/json" }) })

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "excepcion", mensaje: String(e) }), {
      status: 500, headers: Object.assign({}, CORS, { "Content-Type": "application/json" }),
    })
  }
})
