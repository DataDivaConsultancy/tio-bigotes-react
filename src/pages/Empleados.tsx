import { useState, useEffect } from 'react'
import { supabase, rpcCall } from '@/lib/supabase'
import { hashPassword, generateTempPassword } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, Pencil, Check, X, Users, KeyRound, Mail } from 'lucide-react'

interface Empleado {
  id: number
  nombre: string
  email: string
  telefono?: string
  rol: string
  activo: boolean
  permisos: string[]
  must_change_password?: boolean
}

const PERMISOS_OPTIONS = [
  'Productos', 'Empleados', 'Operativa', 'BI', 'Forecast',
  'Pendientes', 'CargaVentas', 'Auditoria', 'Proveedores',
  'ProductosCompra', 'Locales', 'Stock',
]

const ROL_COLORS: Record<string, string> = {
  superadmin: 'bg-red-50 text-red-700',
  admin: 'bg-purple-50 text-purple-700',
  operador: 'bg-blue-50 text-blue-700',
  viewer: 'bg-gray-50 text-gray-700',
}

interface EmpleadoForm {
  nombre: string
  apellido: string
  email: string
  telefono: string
  rol: string
  activo: boolean
  permisos: string[]
  password: string
}

export default function Empleados() {
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Empleado | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [emailSent, setEmailSent] = useState<{ to: string; password: string } | null>(null)
  const [rolOptions, setRolOptions] = useState<string[]>([])
  const [form, setForm] = useState<EmpleadoForm>({
    nombre: '', apellido: '', email: '', telefono: '',
    rol: '', activo: true, permisos: [], password: '',
  })

  /* ---------- Load roles from roles_v2 ---------- */
  async function loadRoles() {
    const { data, error } = await supabase
      .from('roles_v2')
      .select('rol')
      .order('rol')
    if (data && data.length > 0) {
      const roles = data.map((r: any) => r.rol)
      roles.sort((a: string, b: string) => {
        if (a === 'superadmin') return -1
        if (b === 'superadmin') return 1
        return a.localeCompare(b)
      })
      setRolOptions(roles)
    } else {
      const { data: empData } = await supabase
        .from('empleados_v2')
        .select('rol')
      if (empData) {
        const unique = [...new Set(empData.map((e: any) => e.rol).filter(Boolean))]
        unique.sort()
        setRolOptions(unique as string[])
      }
    }
  }

  async function loadEmpleados() {
    setLoading(true)
    let query = supabase
      .from('empleados_v2')
      .select('id, nombre, email, telefono, rol, activo, permisos, must_change_password')
      .order('nombre')
    if (!showInactive) {
      query = query.eq('activo', true)
    }
    const { data } = await query
    setEmpleados(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadRoles()
  }, [])

  useEffect(() => {
    loadEmpleados()
  }, [showInactive])

  const filtered = empleados.filter((e) => {
    const q = search.toLowerCase()
    return (
      e.nombre.toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q)
    )
  })

  function startCreate() {
    setCreating(true)
    setEditing(null)
    setEmailSent(null)
    setForm({
      nombre: '', apellido: '', email: '', telefono: '',
      rol: rolOptions.length > 0 ? rolOptions[0] : '',
      activo: true, permisos: [], password: '',
    })
  }

  function startEdit(emp: Empleado) {
    setEditing(emp)
    setCreating(false)
    setEmailSent(null)
    const parts = (emp.nombre || '').trim().split(/\s+/)
    const firstName = parts[0] || ''
    const lastName = parts.slice(1).join(' ')
    setForm({
      nombre: firstName, apellido: lastName,
      email: emp.email, telefono: emp.telefono || '',
      rol: emp.rol, activo: emp.activo,
      permisos: emp.permisos || [], password: '',
    })
  }

  function cancel() {
    setEditing(null)
    setCreating(false)
    setEmailSent(null)
    setForm({
      nombre: '', apellido: '', email: '', telefono: '',
      rol: rolOptions.length > 0 ? rolOptions[0] : '',
      activo: true, permisos: [], password: '',
    })
  }

  async function save() {
    if (!form.nombre.trim() || !form.apellido.trim() || !form.email.trim()) return
    setSaving(true)
    const fullName = `${form.nombre.trim()} ${form.apellido.trim()}`

    if (creating) {
      const tempPassword = generateTempPassword()
      const passwordHash = await hashPassword(tempPassword)
      const { error } = await supabase.from('empleados_v2').insert({
        nombre: fullName,
        email: form.email,
        telefono: form.telefono || null,
        rol: form.rol,
        activo: true,
        permisos: [],
        password_hash: passwordHash,
      })
      if (error) {
        alert(error.message)
        setSaving(false)
        return
      }
      setEmailSent({ to: form.email, password: tempPassword })
      await loadEmpleados()
    } else if (editing) {
      const updates: Record<string, any> = {
        nombre: fullName,
        email: form.email,
        telefono: form.telefono || null,
        rol: form.rol,
        activo: form.activo,
      }
      const { error } = await supabase
        .from('empleados_v2')
        .update(updates)
        .eq('id', editing.id)
      if (error) {
        alert(error.message)
        setSaving(false)
        return
      }
      setEditing(null)
      await loadEmpleados()
    }
    if (!emailSent) {
      cancel()
    }
    setSaving(false)
  }

  function sendWelcomeEmail(email: string, password: string) {
    const subject = encodeURIComponent('Bienvenido a Tio Bigotes Pro - Tus credenciales de acceso')
    const body = encodeURIComponent(
      `Hola,\n\nSe ha creado tu cuenta en Tio Bigotes Pro.\n\n` +
      `Tus credenciales de acceso son:\n\n` +
      `URL: https://app.sebbrofoods.com\n` +
      `Email: ${email}\n` +
      `Contrasena: ${password}\n\n` +
      `Al iniciar sesion por primera vez se te pedira cambiar la contrasena.\n\n` +
      `Saludos,\nEquipo Tio Bigotes`
    )
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank')
  }

  async function resetPassword() {
    if (!editing) return
    const tempPassword = generateTempPassword()
    const hash = await hashPassword(tempPassword)
    const result = await rpcCall('rpc_reset_password', {
      p_empleado_id: editing.id,
      p_new_hash: hash,
    })
    if (result.ok) {
      setEmailSent({ to: editing.email, password: tempPassword })
    } else {
      alert(result.error || 'Error al resetear contrasena')
    }
  }

  const isEditing = creating || editing !== null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
          <Users size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empleados</h1>
          <p className="text-muted-foreground text-sm">Gestion del equipo</p>
        </div>
      </div>

      {/* Search + controls */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded"
              />
              Mostrar inactivos
            </label>
            <Button onClick={startCreate} className="gap-1.5">
              <Plus size={16} /> Nuevo empleado
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email sent notification */}
      {emailSent && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-green-800 font-medium">
                <Check size={18} /> Empleado creado correctamente
              </div>
              <div className="text-sm text-green-700 space-y-1">
                <p><strong>Email:</strong> {emailSent.to}</p>
                <p><strong>Contrasena temporal:</strong> <code className="bg-green-100 px-2 py-0.5 rounded text-base font-mono">{emailSent.password}</code></p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => sendWelcomeEmail(emailSent.to, emailSent.password)}
                  className="gap-1.5 bg-green-600 hover:bg-green-700">
                  <Mail size={14} /> Enviar email con credenciales
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  navigator.clipboard.writeText(emailSent.password)
                  alert('Contrasena copiada al portapapeles')
                }}>
                  Copiar contrasena
                </Button>
                <Button size="sm" variant="ghost" onClick={cancel}>Cerrar</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit form */}
      {isEditing && !emailSent && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {creating ? 'Nuevo empleado' : `Editar: ${editing?.nombre}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Apellido *</label>
                <Input value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} placeholder="Apellido" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email *</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@ejemplo.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Telefono</label>
                <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Telefono" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Rol *</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground"
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value })}
                >
                  {rolOptions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              {!creating && (
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                      className="rounded"
                    />
                    Activo
                  </label>
                </div>
              )}
            </div>
            {/* Permisos */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Permisos</label>
              <div className="flex flex-wrap gap-2">
                {PERMISOS_OPTIONS.map(p => {
                  const isSelected = form.permisos.includes(p)
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setForm({
                          ...form,
                          permisos: isSelected
                            ? form.permisos.filter(x => x !== p)
                            : [...form.permisos, p],
                        })
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
              </div>
            </div>
            {creating && (
              <p className="text-xs text-muted-foreground">
                Se generara automaticamente una contrasena temporal que podras enviar por email al empleado.
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={save} disabled={saving || !form.nombre.trim() || !form.apellido.trim() || !form.email.trim()}>
                {saving ? 'Guardando...' : creating ? 'Crear empleado' : 'Guardar cambios'}
              </Button>
              {editing && (
                <Button variant="outline" onClick={resetPassword} className="gap-1.5">
                  <KeyRound size={14} /> Resetear contrasena
                </Button>
              )}
              <Button variant="ghost" onClick={cancel}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employees table */}
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {search ? 'No se encontraron empleados' : 'No hay empleados registrados'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nombre</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rol</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Permisos</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Estado</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id} className={`border-b hover:bg-muted/30 ${!emp.activo ? 'opacity-50' : ''}`}>
                    <td className="py-3 px-4">
                      <div className="font-medium">{emp.nombre}</div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">{emp.email}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROL_COLORS[emp.rol] || 'bg-gray-50 text-gray-700'}`}>
                        {emp.rol}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {(emp.permisos || []).slice(0, 3).map(p => (
                          <span key={p} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{p}</span>
                        ))}
                        {(emp.permisos || []).length > 3 && (
                          <span className="text-xs text-muted-foreground">+{emp.permisos.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {emp.activo ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <Check size={12} /> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <X size={12} /> Inactivo
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(emp)}>
                        <Pencil size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
