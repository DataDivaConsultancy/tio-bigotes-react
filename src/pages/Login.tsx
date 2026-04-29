import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, LogIn } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(email, password)
    setLoading(false)

    if (result.ok) {
      // Si el usuario debe cambiar la contraseña, redirigir
      try {
        const u = JSON.parse(localStorage.getItem('tb_user') || 'null')
        if (u?.must_change_password) {
          navigate('/cambiar-password')
        } else {
          navigate('/')
        }
      } catch {
        navigate('/')
      }
    } else {
      setError(result.error || 'Error al iniciar sesión')
    }
  }

  const handlePasswordReset = async () => {
    if (!resetEmail.trim()) return
    setResetLoading(true)
    setResetMessage('')

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'password-reset', email: resetEmail.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setResetMessage('Si el email existe, recibirás un enlace para crear tu nueva contraseña.')
      } else {
        setResetMessage(data.error || 'Error al enviar el email.')
      }
    } catch {
      setResetMessage('Error de conexión. Inténtalo de nuevo.')
    }

    setResetLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-orange-500/30">
            TB
          </div>
          <h1 className="text-2xl font-bold text-white">Tío Bigotes</h1>
          <p className="text-slate-400 text-sm mt-1">Panel de gestión</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-2xl p-8 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
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

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-100">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <>
                <LogIn size={16} />
                Entrar
              </>
            )}
          </Button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => { setResetMode(!resetMode); setResetMessage(''); setResetEmail(email) }}
              className="text-sm text-orange-600 hover:text-orange-700 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          {resetMode && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
              <p className="text-sm text-slate-600">Ingresa tu email y te enviaremos un enlace para crear tu nueva contraseña.</p>
              <Input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="tu@email.com"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full mt-2"
                disabled={resetLoading || !resetEmail.trim()}
                onClick={handlePasswordReset}
              >
                {resetLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                ) : (
                  'Enviar enlace de recuperación'
                )}
              </Button>
              {resetMessage && (
                <div className="text-sm text-slate-600 bg-white rounded-lg p-3 border border-slate-100">
                  {resetMessage}
                </div>
              )}
            </div>
          )}
        </form>

        <p className="text-center text-slate-500 text-xs mt-6">
          Tío Bigotes Pro &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
