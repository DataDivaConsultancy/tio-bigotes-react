import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESET_SECRET = process.env.RESET_TOKEN_SECRET || RESEND_API_KEY || 'fallback-secret'
const APP_URL = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173')

const FROM_EMAIL = 'Tío Bigotes <noreply@sebbrofoods.com>'

/* ── SHA-256 hash ── */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/* ── Generate signed reset token (expires in 1 hour) ── */
async function generateResetToken(userId: number): Promise<string> {
  const expires = Date.now() + 60 * 60 * 1000
  const payload = `${userId}.${expires}`
  const signature = await sha256(`${payload}.${RESET_SECRET}`)
  return Buffer.from(`${payload}.${signature}`).toString('base64url')
}

/* ── Verify reset token ── */
async function verifyResetToken(token: string): Promise<{ valid: boolean; userId?: number }> {
  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const parts = decoded.split('.')
    if (parts.length !== 3) return { valid: false }

    const userId = parseInt(parts[0], 10)
    const expires = parseInt(parts[1], 10)
    const signature = parts[2]

    if (Date.now() > expires) return { valid: false }

    const expectedSig = await sha256(`${userId}.${expires}.${RESET_SECRET}`)
    if (signature !== expectedSig) return { valid: false }

    return { valid: true, userId }
  } catch {
    return { valid: false }
  }
}

/* ── Send via Resend ── */
async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Error enviando email')
  return data
}

/* ── Password reset: send link ── */
async function handlePasswordReset(email: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase config missing')
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: user, error } = await supabase
    .from('empleados_v2')
    .select('id, nombre, email')
    .eq('email', email.toLowerCase().trim())
    .eq('activo', true)
    .single()

  if (error || !user) {
    // Don't reveal if email exists
    return { ok: true }
  }

  const token = await generateResetToken(user.id)
  const resetUrl = `${APP_URL}/reset-password?token=${token}`

  await sendEmail(
    user.email,
    'Tío Bigotes — Recuperar contraseña',
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #fb923c, #ea580c); color: white; font-weight: bold; font-size: 20px; line-height: 48px;">TB</div>
      </div>
      <h2 style="color: #1e293b; margin: 0 0 16px;">Hola ${user.nombre},</h2>
      <p style="color: #475569; line-height: 1.6;">Has solicitado recuperar tu contraseña. Haz clic en el siguiente botón para crear una nueva:</p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #fb923c, #ea580c); color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 16px;">Crear nueva contraseña</a>
      </div>
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">Este enlace expira en 1 hora. Si no solicitaste este cambio, puedes ignorar este email.</p>
      <p style="color: #94a3b8; font-size: 12px; word-break: break-all; margin-top: 16px;">Si el botón no funciona, copia este enlace:<br/>${resetUrl}</p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">Tío Bigotes Pro &copy; ${new Date().getFullYear()}</p>
    </div>
    `
  )

  return { ok: true }
}

/* ── Set new password (from reset link) ── */
async function handleSetNewPassword(token: string, newPassword: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase config missing')
  }

  if (newPassword.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres')
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(newPassword)) {
    throw new Error('La contraseña debe contener al menos un símbolo (!@#$%...)')
  }

  const { valid, userId } = await verifyResetToken(token)
  if (!valid || !userId) {
    throw new Error('El enlace ha expirado o no es válido. Solicita uno nuevo.')
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: user, error } = await supabase
    .from('empleados_v2')
    .select('id')
    .eq('id', userId)
    .eq('activo', true)
    .single()

  if (error || !user) {
    throw new Error('Usuario no encontrado o inactivo')
  }

  const hashed = await sha256(newPassword)
  const { error: updateError } = await supabase
    .from('empleados_v2')
    .update({ password_hash: hashed, password_temporal: false })
    .eq('id', userId)

  if (updateError) {
    throw new Error('Error al actualizar la contraseña')
  }

  return { ok: true }
}

/* ── Supplier order email ── */
async function handleOrderEmail(body: {
  proveedorNombre: string
  proveedorEmail: string
  items: { producto: string; cantidad: number; unidad?: string }[]
  notas?: string
  localNombre?: string
}) {
  const { proveedorNombre, proveedorEmail, items, notas, localNombre } = body

  const itemsHtml = items
    .map(
      (item) =>
        `<tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${item.producto}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${item.cantidad} ${item.unidad || 'uds'}</td>
        </tr>`
    )
    .join('')

  const fecha = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  await sendEmail(
    proveedorEmail,
    `Pedido — Tío Bigotes${localNombre ? ` (${localNombre})` : ''}`,
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #fb923c, #ea580c); color: white; font-weight: bold; font-size: 20px; line-height: 48px;">TB</div>
      </div>
      <h2 style="color: #1e293b; margin: 0 0 8px;">Nuevo pedido</h2>
      <p style="color: #64748b; margin: 0 0 24px; font-size: 14px;">${fecha}${localNombre ? ` — ${localNombre}` : ''}</p>

      <p style="color: #475569;">Estimado/a <strong>${proveedorNombre}</strong>,</p>
      <p style="color: #475569; line-height: 1.6;">Le enviamos nuestro pedido con los siguientes productos:</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <thead>
          <tr style="background: #f8fafc;">
            <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; color: #475569;">Producto</th>
            <th style="padding: 10px 12px; text-align: right; border-bottom: 2px solid #e2e8f0; color: #475569;">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      ${notas ? `<div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;"><strong style="color: #92400e;">Notas:</strong><p style="color: #78350f; margin: 4px 0 0;">${notas}</p></div>` : ''}

      <p style="color: #475569; line-height: 1.6;">Gracias por su atención. Quedamos a la espera de confirmación.</p>
      <p style="color: #475569;">Un saludo,<br/><strong>Tío Bigotes</strong></p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">Este email fue enviado automáticamente desde Tío Bigotes Pro</p>
    </div>
    `
  )

  return { ok: true }
}

/* ── Main handler ── */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' })
  }

  try {
    const { type, ...data } = req.body

    switch (type) {
      case 'password-reset':
        await handlePasswordReset(data.email)
        return res.status(200).json({ ok: true, message: 'Si el email existe, recibirás instrucciones.' })

      case 'set-new-password':
        await handleSetNewPassword(data.token, data.password)
        return res.status(200).json({ ok: true, message: 'Contraseña actualizada correctamente.' })

      case 'order':
        await handleOrderEmail(data)
        return res.status(200).json({ ok: true, message: 'Pedido enviado al proveedor.' })

      default:
        return res.status(400).json({ error: `Tipo de email no válido: ${type}` })
    }
  } catch (err: any) {
    console.error('Email error:', err)
    return res.status(500).json({ error: err.message || 'Error interno' })
  }
}
