import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, LogIn, ArrowLeft, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/utils'

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
  const [resetSuccess, setResetSuccess] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(email, password)
    setLoading(false)
    if (result.ok) {
      navigate('/')
    } else {
      setError(result.error || 'Error al iniciar sesion')
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResetSuccess('')
    setResetLoading(true)
    try {
      const { data: user, error: findError } = await supabase
        .from('empleados_v2')
        .select('id, nombre, email')
        .eq('email', resetEmail.toLowerCase().trim())
        .eq('activo', true)
        .limit(1)
        .single()
      if (findError || !user) {
        setError('Email no encontrado o usuario inactivo')
        setResetLoading(false)
        return
      }
      const tempPassword = 'Temp' + Math.random().toString(36).slice(2, 8) + '!'
      const hashedTemp = await hashPassword(tempPassword)
      const { error: updateError } = await supabase
        .from('empleados_v2')
        .update({ password_hash: hashedTemp, password_temporal: true })
        .eq('id', user.id)
      if (updateError) {
        setError('Error al restablecer. Contacta al administrador.')
        setResetLoading(false)
        return
      }
      setResetSuccess('Contrasena temporal para ' + user.nombre + ': ' + tempPassword + ' - Cambiala despues de iniciar sesion.')
    } catch {
      setError('Error inesperado. Intenta de nuevo.')
    }
    setResetLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-orange-500/30">
            TB
          </div>
          <h1 className="text-2xl font-bold text-white">Tio Bigotes</h1>
          <p className="text-slate-400 text-sm mt-1">
            {resetMode ? 'Recuperar contrasena' : 'Panel de gestion'}
          </p>
        </div>

        {resetMode ? (
          <form onSubmit={handleResetPassword} className="bg-white rounded-2xl shadow-2xl p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <Input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="tu@email.com" required autoFocus />
            </div>
            {error && (<div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-100">{error}</div>)}
            {resetSuccess && (<div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 border border-green-200">{resetSuccess}</div>)}
            {!resetSuccess && (
              <Button type="submit" className="w-full h-11" disabled={resetLoading}>
                {resetLoading ? (<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />) : (<><Mail size={16} />Restablecer contrasena</>)}
              </Button>
            )}
            <button type="button" onClick={() => { setResetMode(false); setError(''); setResetSuccess(''); }} className="w-full text-sm text-slate-500 hover:text-orange-500 flex items-center justify-center gap-1.5 mt-2">
              <ArrowLeft size={14} />Volver al inicio de sesion
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Contrasena</label>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="********" required className="pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && (<div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 border border-red-100">{error}</div>)}
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? (<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />) : (<><LogIn size={16} />Entrar</>)}
            </Button>
            <button type="button" onClick={() => { setResetMode(true); setError(''); }} className="w-full text-sm text-slate-500 hover:text-orange-500 mt-1">
              Olvidaste tu contrasena?
            </button>
          </form>
        )}

        <p className="text-center text-slate-500 text-xs mt-6">
          Tio Bigotes Pro &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
                }
