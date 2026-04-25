import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, Lock, Check, X } from 'lucide-react'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const hasMinLength = password.length >= 8
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const isValid = hasMinLength && hasSymbol && passwordsMatch

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'set-new-password', token, password }),
      })
      const data = await res.json()

      if (res.ok) {
        setSuccess(true)
      } else {
        setError(data.error || 'Error al cambiar la contraseña')
      }
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.')
    }

    setLoading(false)
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-orange-500/30">
            TB
          </div>
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <p className="text-red-600 font-medium mb-4">Enlace no válido</p>
            <p className="text-slate-500 text-sm mb-6">Este enlace de recuperación no es válido. Solicita uno nuevo desde la pantalla de login.</p>
            <Button onClick={() => navigate('/login')} className="w-full">
              Ir al login
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-green-500/30">
            <Check size={32} />
          </div>
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-2">Contraseña actualizada</h2>
            <p className="text-slate-500 text-sm mb-6">Tu contraseña se ha cambiado correctamente. Ya puedes iniciar sesión.</p>
            <Button onClick={() => navigate('/login')} className="w-full">
              Ir al login
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-orange-500/30">
            TB
          </div>
          <h1 className="text-2xl font-bold text-white">Nueva contraseña</h1>
          <p className="text-slate-400 text-sm mt-1">Crea tu nueva contraseña</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nueva contraseña</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoFocus
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar contraseña</label>
            <div className="relative">
              <Input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Password requirements */}
          <div className="space-y-1.5 text-sm">
            <div className={`flex items-center gap-2 ${hasMinLength ? 'text-green-600' : 'text-slate-400'}`}>
              {hasMinLength ? <Check size={14} /> : <X size={14} />}
              Mínimo 8 caracteres
            </div>
            <div className={`flex items-center gap-2 ${hasSymbol ? 'text-green-600' : 'text-slate-400'}`}>
              {hasSymbol ? <Check size={14} /> : <X size={14} />}
              Al menos un símbolo (!@#$%...)
            </div>
            <div className={`flex items-center gap-2 ${passwordsMatch ? 'text-green-600' : 'text-slate-400'}`}>
              {passwordsMatch ? <Check size={14} /> : <X size={14} />}
              Las contraseñas coinciden
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-100">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full h-11" disabled={loading || !isValid}>
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <>
                <Lock size={16} />
                Cambiar contraseña
              </>
            )}
          </Button>
        </form>

        <p className="text-center text-slate-500 text-xs mt-6">
          Tío Bigotes Pro &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
