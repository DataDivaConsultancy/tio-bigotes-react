import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/utils'

export interface User {
  id: number
  nombre: string
  email: string
  telefono?: string
  rol: string
  activo: boolean
  permisos?: string[]
  must_change_password?: boolean
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  updateUser: (updates: Partial<User>) => void
  isSuperadmin: boolean
  hasAccess: (screen: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('tb_user')
    if (saved) {
      try {
        setUser(JSON.parse(saved))
      } catch {
        localStorage.removeItem('tb_user')
      }
    }
    setLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const hashed = await hashPassword(password)
    const emailNorm = email.toLowerCase().trim()

    // 1. Validar credencial en empleados_v2
    const { data: cred, error } = await supabase
      .from('empleados_v2')
      .select('id, password_hash')
      .eq('email', emailNorm)
      .eq('activo', true)
      .limit(1)
      .maybeSingle()

    if (error || !cred) {
      return { ok: false, error: 'Email no encontrado o usuario inactivo' }
    }
    if (cred.password_hash !== hashed) {
      return { ok: false, error: 'Contraseña incorrecta' }
    }

    // 2. Cargar datos completos + permisos efectivos del rol vía vista
    const { data, error: e2 } = await supabase
      .from('v_empleado_con_permisos')
      .select('id, nombre, email, telefono, rol, activo, permisos_efectivos, must_change_password')
      .eq('id', cred.id)
      .single()

    if (e2 || !data) {
      return { ok: false, error: 'No se pudieron cargar los datos del usuario' }
    }

    const userData: User = {
      id: data.id,
      nombre: data.nombre,
      email: data.email,
      telefono: data.telefono,
      rol: data.rol,
      activo: data.activo,
      permisos: Array.isArray(data.permisos_efectivos) ? data.permisos_efectivos : [],
      must_change_password: data.must_change_password,
    }

    setUser(userData)
    localStorage.setItem('tb_user', JSON.stringify(userData))

    try {
      await supabase.rpc('rpc_registrar_actividad', {
        p_empleado_id: userData.id,
        p_tipo: 'login',
        p_detalle: 'Inicio de sesión desde React app',
      })
    } catch {}

    return { ok: true }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('tb_user')
  }

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updated = { ...user, ...updates }
      setUser(updated)
      localStorage.setItem('tb_user', JSON.stringify(updated))
    }
  }

  const isSuperadmin = user?.rol === 'superadmin'

  const hasAccess = (screen: string) => {
    if (!user) return false
    if (isSuperadmin) return true
    if (!user.permisos) return false
    return user.permisos.includes(screen)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser, isSuperadmin, hasAccess }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
