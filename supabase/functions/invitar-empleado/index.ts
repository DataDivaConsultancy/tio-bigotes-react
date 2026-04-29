// Edge Function: invitar-empleado
// Manda email de bienvenida al empleado con su contraseña temporal.
// Marca must_change_password=true para forzar cambio en primer login.
//
// Body: { empleado_id: number, password_temporal: string }
//   - password_temporal viene del frontend (que ya la genera y la guarda hasheada en BD)
//
// Variables: RESEND_API_KEY, EMAIL_FROM

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function buildHtml(nombre, email, password, appUrl) {
  return [
    '<!doctype html><html lang="es"><head><meta charset="utf-8"></head>',
    '<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f5f5f5;color:#1a1a1a;">',
    '<div style="max-width:560px;margin:24px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">',
    '<div style="padding:28px 32px;background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;">',
    '<div style="font-size:11px;letter-spacing:1px;opacity:0.85;text-transform:uppercase;">Tío Bigotes · Pro</div>',
    '<div style="font-size:22px;font-weight:700;margin-top:6px;">¡Bienvenido al equipo!</div>',
    '</div>',
    '<div style="padding:28px 32px;font-size:15px;line-height:1.6;color:#222;">',
    '<p style="margin:0 0 12px;">¡Hola! <b>' + (nombre || '') + '</b>,</p>',
    '<p style="margin:0;color:#444;">Tu perfil ya está activo en la aplicación. Desde aquí podrás consultar la información necesaria para tu día a día y ayudarnos a trabajar mejor como equipo.</p>',
    '</div>',
    '<div style="padding:0 32px 24px;">',
    '<div style="background:#f9fafb;border-radius:8px;padding:18px;font-size:14px;">',
    '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:8px;">Tus credenciales</div>',
    '<div style="font-family:monospace;line-height:1.9;"><b>URL:</b> <a href="' + appUrl + '" style="color:#1e40af;">' + appUrl + '</a><br/>',
    '<b>Email:</b> ' + email + '<br/>',
    '<b>Contraseña temporal:</b> <span style="background:#fff;padding:2px 6px;border-radius:4px;border:1px solid #ddd;">' + password + '</span></div>',
    '</div>',
    '<p style="font-size:13px;color:#666;margin-top:14px;">Al iniciar sesión por primera vez se te pedirá <b>cambiar la contraseña</b>.</p>',
    '<div style="text-align:center;margin-top:20px;"><a href="' + appUrl + '" style="display:inline-block;background:#1e40af;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Acceder a la app</a></div>',
    '</div>',
    '<div style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee;font-size:11px;color:#888;line-height:1.6;">',
    'Email automático generado por la app de gestión de Tío Bigotes (sebbrofoods).',
    '</div>',
    '</div></body></html>'
  ].join("")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })

  try {
    const body = await req.json()
    const empleado_id = body.empleado_id
    const password_temporal = body.password_temporal
    if (!empleado_id || !password_temporal) {
      return new Response(JSON.stringify({ ok: false, error: "faltan_parametros" }), {
        headers: Object.assign({}, CORS, { "Content-Type": "application/json" }),
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const resendKey = Deno.env.get("RESEND_API_KEY")
    const fromAddr = Deno.env.get("EMAIL_FROM") || "onboarding@resend.dev"
    const appUrl = "https://app.sebbrofoods.com"

    if (!resendKey) {
      return new Response(JSON.stringify({ ok: false, error: "sin_resend_key" }), {
        headers: Object.assign({}, CORS, { "Content-Type": "application/json" }),
      })
    }

    // Cargar empleado
    const r1 = await fetch(supabaseUrl + "/rest/v1/empleados_v2?id=eq." + empleado_id + "&select=id,nombre,email,activo", {
      headers: { "apikey": serviceKey, "Authorization": "Bearer " + serviceKey },
    })
    const emps = await r1.json()
    const emp = (emps || [])[0]
    if (!emp || !emp.email) {
      return new Response(JSON.stringify({ ok: false, error: "empleado_no_encontrado_o_sin_email" }), {
        headers: Object.assign({}, CORS, { "Content-Type": "application/json" }),
      })
    }

    // Marcar must_change_password
    await fetch(supabaseUrl + "/rest/v1/empleados_v2?id=eq." + empleado_id, {
      method: "PATCH",
      headers: {
        "apikey": serviceKey,
        "Authorization": "Bearer " + serviceKey,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({ must_change_password: true }),
    })

    // Mandar email
    const html = buildHtml(emp.nombre, emp.email, password_temporal, appUrl)
    const subject = "¡Bienvenido a Tío Bigotes! Tus credenciales de acceso"

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + resendKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: fromAddr, to: [emp.email], subject, html }),
    })

    if (!resp.ok) {
      const txt = await resp.text()
      return new Response(JSON.stringify({ ok: false, error: "email_fallo", mensaje: txt }), {
        headers: Object.assign({}, CORS, { "Content-Type": "application/json" }),
      })
    }

    return new Response(JSON.stringify({ ok: true, data: { destinatario: emp.email } }), {
      headers: Object.assign({}, CORS, { "Content-Type": "application/json" }),
    })

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "excepcion", mensaje: String(e) }), {
      status: 500, headers: Object.assign({}, CORS, { "Content-Type": "application/json" }),
    })
  }
})
