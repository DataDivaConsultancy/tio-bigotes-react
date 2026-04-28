// ============================================================
// Edge Function: enviar-pedido-email
// Envía un pedido de compra al proveedor por email (Resend).
// Marca el pedido como 'enviado' tras envío exitoso.
//
// Variables de entorno requeridas (configurar en Supabase Dashboard
// → Edge Functions → Secrets):
//   - RESEND_API_KEY: clave de la API de Resend
//   - EMAIL_FROM: email del remitente (ej: 'pedidos@sebbrofoods.com')
//                 si Resend no tiene dominio propio: 'pedidos@onboarding.resend.dev'
//   - REPLY_TO (opcional): email donde recibir respuestas
// ============================================================

// @ts-ignore -- Deno
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Pedido {
  id: string
  numero: string
  estado: string
  fecha_pedido: string
  fecha_entrega_solicitada: string | null
  proveedor_id: number
  proveedor_nombre: string
  proveedor_cif: string | null
  local_id: number
  local_nombre: string | null
  subtotal: number
  iva_total: number
  portes: number
  total: number
  notas: string | null
}

interface Linea {
  id: string
  cantidad: number
  factor_conversion: number
  precio_unitario: number
  descuento_pct: number
  iva_pct: number
  total_linea: number
  notas: string | null
  producto: { nombre: string } | null
  formato: { formato_compra: string; unidad_uso: string } | null
}

const eur = (n: number | string | null | undefined) => {
  if (n == null) return '—'
  return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function buildHtml(p: Pedido, lineas: Linea[]): string {
  const fechas = `Fecha pedido: <b>${p.fecha_pedido}</b>` +
    (p.fecha_entrega_solicitada ? ` &nbsp;·&nbsp; Entrega solicitada: <b>${p.fecha_entrega_solicitada}</b>` : '')

  const filas = lineas.map((l, i) => {
    const nombre = l.producto?.nombre ?? `(producto)`
    const fmt = l.formato?.formato_compra ?? ''
    const uds = Number(l.cantidad) * Number(l.factor_conversion ?? 1)
    return `<tr>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;">${i + 1}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;"><b>${nombre}</b><br/><span style="color:#888;font-size:11px">${fmt}</span></td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;">${Number(l.cantidad).toLocaleString('es-ES')}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;color:#666;">${uds.toLocaleString('es-ES')}<br/><span style="font-size:10px">${l.formato?.unidad_uso ?? ''}</span></td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;">${eur(l.precio_unitario)}</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:center;">${Number(l.iva_pct)}%</td>
      <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${eur(l.total_linea)}</td>
    </tr>`
  }).join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>Pedido ${p.numero}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="padding:24px 28px;background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;">
            <div style="font-size:11px;letter-spacing:1px;opacity:0.85;text-transform:uppercase;">Tío Bigotes · Pedido de compra</div>
            <div style="font-size:26px;font-weight:700;letter-spacing:-0.5px;margin-top:4px;font-family:monospace;">${p.numero}</div>
          </td>
        </tr>

        <!-- Saludo -->
        <tr>
          <td style="padding:20px 28px 0;">
            <p style="margin:0;font-size:15px;line-height:1.5;">
              Hola <b>${p.proveedor_nombre}</b>,
            </p>
            <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:#444;">
              Te enviamos el siguiente pedido. Te agradeceríamos confirmación de la recepción y la fecha de entrega prevista.
            </p>
          </td>
        </tr>

        <!-- Datos -->
        <tr>
          <td style="padding:20px 28px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;border-radius:8px;padding:14px;">
              <tr>
                <td style="font-size:12px;color:#555;line-height:1.7;">
                  ${fechas}<br/>
                  Entregar en: <b>${p.local_nombre ?? '—'}</b>
                  ${p.notas ? `<br/>Notas: <i>${p.notas}</i>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Líneas -->
        <tr>
          <td style="padding:24px 28px 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#f3f4f6;text-align:left;">
                  <th style="padding:10px 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;">#</th>
                  <th style="padding:10px 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;">Producto</th>
                  <th style="padding:10px 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;text-align:right;">Cant.</th>
                  <th style="padding:10px 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;text-align:right;">Uds.</th>
                  <th style="padding:10px 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;text-align:right;">Precio</th>
                  <th style="padding:10px 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;text-align:center;">IVA</th>
                  <th style="padding:10px 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>${filas}</tbody>
            </table>
          </td>
        </tr>

        <!-- Totales -->
        <tr>
          <td style="padding:0 28px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr><td style="padding:6px 0;text-align:right;color:#555;font-size:13px;">Subtotal:</td><td style="padding:6px 0;text-align:right;width:120px;font-variant-numeric:tabular-nums;">${eur(p.subtotal)}</td></tr>
              <tr><td style="padding:6px 0;text-align:right;color:#555;font-size:13px;">IVA:</td><td style="padding:6px 0;text-align:right;font-variant-numeric:tabular-nums;">${eur(p.iva_total)}</td></tr>
              ${p.portes > 0 ? `<tr><td style="padding:6px 0;text-align:right;color:#555;font-size:13px;">Portes:</td><td style="padding:6px 0;text-align:right;font-variant-numeric:tabular-nums;">${eur(p.portes)}</td></tr>` : ''}
              <tr style="border-top:2px solid #1e40af;"><td style="padding:10px 0;text-align:right;font-weight:700;font-size:15px;">Total:</td><td style="padding:10px 0;text-align:right;font-weight:700;font-size:18px;color:#1e40af;font-variant-numeric:tabular-nums;">${eur(p.total)}</td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:18px 28px;background:#fafafa;border-top:1px solid #eee;font-size:11px;color:#888;line-height:1.6;">
            Email automático generado por la app de gestión de Tío Bigotes (sebbrofoods).<br/>
            Para cualquier consulta, responde a este email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// @ts-ignore -- Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const { pedido_id } = await req.json()
    if (!pedido_id) {
      return new Response(JSON.stringify({ ok: false, error: 'falta_pedido_id' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // @ts-ignore
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    // @ts-ignore
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Cargar pedido (cabecera)
    const { data: pedido, error: e1 } = await supabase
      .from('v_pedidos_compra_listado')
      .select('*')
      .eq('id', pedido_id)
      .single()
    if (e1 || !pedido) {
      return new Response(JSON.stringify({ ok: false, error: 'no_encontrado', mensaje: e1?.message }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Cargar líneas con join a producto y formato
    const { data: lineas, error: e2 } = await supabase
      .from('pedido_compra_lineas')
      .select('id, cantidad, factor_conversion, precio_unitario, descuento_pct, iva_pct, total_linea, notas, producto_id, formato_id')
      .eq('pedido_id', pedido_id)
      .order('orden')
    if (e2) {
      return new Response(JSON.stringify({ ok: false, error: 'error_lineas', mensaje: e2.message }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Resolver nombres de producto y formato (en lugar de un join complejo)
    const productoIds = Array.from(new Set((lineas ?? []).map((l: any) => l.producto_id).filter(Boolean)))
    const formatoIds  = Array.from(new Set((lineas ?? []).map((l: any) => l.formato_id).filter(Boolean)))
    const [{ data: prods }, { data: fmts }] = await Promise.all([
      productoIds.length ? supabase.from('productos_compra_v2').select('id, nombre').in('id', productoIds) : Promise.resolve({ data: [] as any[] }),
      formatoIds.length  ? supabase.from('producto_formatos').select('id, formato_compra, unidad_uso').in('id', formatoIds) : Promise.resolve({ data: [] as any[] }),
    ])
    const prodMap = new Map<number, any>((prods ?? []).map((p: any) => [p.id, p]))
    const fmtMap  = new Map<string, any>((fmts ?? []).map((f: any) => [f.id, f]))

    const lineasEnriched: Linea[] = (lineas ?? []).map((l: any) => ({
      ...l,
      producto: prodMap.get(l.producto_id) ?? null,
      formato:  fmtMap.get(l.formato_id) ?? null,
    }))

    // Email destinatario: prioridad a mail_pedidos del proveedor
    const { data: prov, error: e3 } = await supabase
      .from('proveedores_v2')
      .select('mail_pedidos, mail_contacto, nombre_comercial')
      .eq('id', pedido.proveedor_id)
      .single()
    if (e3 || !prov) {
      return new Response(JSON.stringify({ ok: false, error: 'proveedor_no_encontrado' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const dest = (prov.mail_pedidos || prov.mail_contacto || '').trim()
    if (!dest) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'sin_email_proveedor',
        mensaje: 'El proveedor no tiene email configurado. Añade mail_pedidos o mail_contacto en su ficha.',
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Generar HTML
    const html = buildHtml(pedido as Pedido, lineasEnriched)

    // Enviar via Resend
    // @ts-ignore
    const resendKey = Deno.env.get('RESEND_API_KEY')
    // @ts-ignore
    const fromAddr = Deno.env.get('EMAIL_FROM') || 'onboarding@resend.dev'
    // @ts-ignore
    const replyTo  = Deno.env.get('REPLY_TO') || ''

    if (!resendKey) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'sin_resend_key',
        mensaje: 'Falta configurar RESEND_API_KEY en los secrets de la Edge Function.',
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const resendBody: any = {
      from: fromAddr,
      to: [dest],
      subject: `Pedido ${pedido.numero} — Tío Bigotes`,
      html,
    }
    if (replyTo) resendBody.reply_to = replyTo

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendBody),
    })

    const respBody = await resp.text()
    if (!resp.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'email_falló',
        mensaje: respBody,
        status: resp.status,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Marcar como enviado vía RPC (que respeta transición de estados)
    await supabase.rpc('rpc_enviar_pedido', { p_id: pedido_id, p_via: 'email' })

    return new Response(JSON.stringify({
      ok: true,
      data: {
        destinatario: dest,
        from: fromAddr,
        resend: JSON.parse(respBody || '{}'),
      },
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'excepcion', mensaje: String(e) }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
