import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/utils'

/**
 * Permisos por (pantalla, local). local_id null = aplica a todos los locales
 * (wildcard global). El modo es 'ver' (lectura) o 'escribir' (lectura+escritura).
 */
export interface PermisoLocal {
  pantalla: string
  local_id: number | null
  modo: 'ver' | 'escribir'
}

export interface User {
  id: number
  nombre: string
  email: string
  telefono?: string
  rol: string
  activo: boolean
  permisos?: string[]              // legacy: lista de pantallas (compat)
  permisos_locales?: PermisoLocal[] // nuevo: matriz pantalla × local × modo
  must_change_password?: boolean
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  updateUser: (updates: Partial<User>) => void
  isSuperadmin: boolean
  /** ¿El usuario puede ver al menos esa pantalla en algún local? */
  hasAccess: (screen: string) => boolean
  /** ¿Puede ver esa pantalla en ese local concreto? */
  hasLocalAccess: (screen: string, localId: number | null) => boolean
  /** ¿Puede escribir en esa pantalla / local? */
  canWrite: (screen: string, localId?: number | null) => boolean
  /** Lista de IDs de locales en los que tiene acceso (para esa pantalla, o cualquier si screen omitido). */
  localesAccesibles: (screen?: string) => number[]
  /** Lista de IDs de locales en los que puede escribir. */
  localesEditables: (screen?: string) => number[]
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

    // 2. Cargar datos completos + permisos legacy (texto[]) + permisos por local
    const [empRes, plRes] = await Promise.all([
      supabase
        .from('v_empleado_con_permisos')
        .select('id, nombre, email, telefono, rol, activo, permisos_efectivos, must_change_password')
        .eq('id', cred.id)
        .single(),
      supabase
        .from('v_empleado_permisos_locales')
        .select('pantalla, local_id, modo')
        .eq('empleado_id', cred.id),
    ])
    const data = empRes.data
    const e2 = empRes.error
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
      permisos_locales: (plRes.data ?? []) as PermisoLocal[],
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
    if (Array.isArray(user.permisos) && user.permisos.includes(screen)) return true
    return (user.permisos_locales ?? []).some((p) => p.pantalla === screen)
  }

  /** Devuelve true si el usuario puede VER la pantalla en ese local concreto. */
  const hasLocalAccess = (screen: string, localId: number | null) => {
    if (!user) return false
    if (isSuperadmin) return true
    const pl = user.permisos_locales ?? []
    // wildcard global (local_id null) cubre todos los locales
    if (pl.some((p) => p.pantalla === screen && p.local_id === null)) return true
    if (localId == null) return false
    return pl.some((p) => p.pantalla === screen && p.local_id === localId)
  }

  /** Devuelve true si puede escribir en esa pantalla (en ese local concreto si se indica). */
  const canWrite = (screen: string, localId?: number | null) => {
    if (!user) return false
    if (isSuperadmin) return true
    const pl = user.permisos_locales ?? []
    return pl.some((p) =>
      p.pantalla === screen &&
      p.modo === 'escribir' &&
      (p.local_id === null || (localId != null && p.local_id === localId)),
    )
  }

  /** IDs de locales accesibles (en cualquier modo). Si screen no se da, devuelve la unión de todos. */
  const localesAccesibles = (screen?: string) => {
    if (!user) return []
    const pl = user.permisos_locales ?? []
    const filtered = screen ? pl.filter((p) => p.pantalla === screen) : pl
    const ids = new Set<number>()
    let hasGlobal = false
    for (const p of filtered) {
      if (p.local_id == null) hasGlobal = true
      else ids.add(p.local_id)
    }
    if (hasGlobal) return [-1] // marcador "todos los locales activos"
    return Array.from(ids)
  }

  const localesEditables = (screen?: string) => {
    if (!user) return []
    const pl = (user.permisos_locales ?? []).filter((p) => p.modo === 'escribir')
    const filtered = screen ? pl.filter((p) => p.pantalla === screen) : pl
    const ids = new Set<number>()
    let hasGlobal = false
    for (const p of filtered) {
      if (p.local_id == null) hasGlobal = true
      else ids.add(p.local_id)
    }
    if (hasGlobal) return [-1]
    return Array.from(ids)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, updateUser, isSuperadmin,
      hasAccess, hasLocalAccess, canWrite, localesAccesibles, localesEditables,
    }}>
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
