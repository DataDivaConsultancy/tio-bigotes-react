import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, rpcCall } from '@/lib/supabase'
import { hashPassword } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export default function CambiarPassword() {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (pwd.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    if (pwd !== pwd2) { setError('Las contraseñas no coinciden'); return }
    if (!user) { setError('No hay sesión'); return }

    setSaving(true)
    const hash = await hashPassword(pwd)
    // Update directo o vía RPC. Usamos UPDATE directo y limpiamos must_change_password
    const { error: e1 } = await supabase
      .from('empleados_v2')
      .update({ password_hash: hash, must_change_password: false })
      .eq('id', user.id)
    setSaving(false)
    if (e1) { setError(e1.message); return }
    updateUser({ must_change_password: false })
    setDone(true)
    setTimeout(() => navigate('/'), 1500)
  }

  if (!user) {
    navigate('/login')
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center"><KeyRound size={20} className="text-white" /></div>
            <div>
              <CardTitle className="text-lg">Cambia tu contraseña</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Es la primera vez que entras: define una contraseña personal.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={36} />
              <p className="font-medium">Contraseña actualizada</p>
              <p className="text-sm text-muted-foreground mt-1">Redirigiendo…</p>
            </div>
          ) : (
            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nueva contraseña</label>
                <div className="relative mt-1">
                  <Input
                    type={show ? 'text' : 'password'}
                    value={pwd} onChange={(e) => setPwd(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Repite la contraseña</label>
                <Input
                  type={show ? 'text' : 'password'}
                  value={pwd2} onChange={(e) => setPwd2(e.target.value)}
                  className="mt-1"
                />
              </div>
              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-center gap-2">
                  <AlertCircle size={14} /> {error}
                </div>
              )}
              <Button type="submit" disabled={saving || !pwd || !pwd2} className="w-full">
                {saving ? 'Guardando…' : 'Cambiar contraseña'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
