import { useState, useEffect } from 'react'
import { supabase, rpcCall } from '@/lib/supabase'
import { hashPassword, generateTempPassword } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, Pencil, Check, X, Users, KeyRound } from 'lucide-react'

interface Empleado {
  id: numberh
  nombre: string
  email: string
  telefono?: string
  rol: string
  activo: boolean
  permisos: string[]
  must_change_password?: boolean
}

const ROL_OPTIONS = ['superadmin', 'admin', 'operador', 'viewer']

const PERMISOS_OPTIONS = [
  'Productos',
  'Empleados',
  'Operativa',
  'BI',
  'Forecast',
  'Pendientes',
  'CargaVentas',
  'Auditoria',
  'Proveedores',
  'ProductosCompra',
  'Locales',
  'Stock',
]

const ROL_COLORS: Record<string, string> = {
  superadmin: 'bg-red-50 text-red-700',
  admin: 'bg-purple-50 text-purple-700',
  operador: 'bg-blue-50 text-blue-700',
  viewer: 'bg-gray-50 text-gray-700',
}

interface EmpleadoForm {
  nombre: string
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

  const [form, setForm] = useState<EmpleadoForm>({
    nombre: '',
    email: '',
    telefono: '',
    rol: 'operador',
    activo: true,
    permisos: [],
    password: '',
  })

  useEffect(() => {
    loadEmpleados()
  }, [showInactive])

  async function loadEmpleados() {
    setLoading(true)
    let query = supabase
      .from('empleados_v2')
      .select('id, nombre, email, telefono, rol, activo, permisos, must_change_password')
      .order('nombre')

    if (!showInactive) query = query.eq('activo', true)

    const { data, error } = await query
    if (!error && data) setEmpleados(data)
    setLoading(false)
  }

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
    setForm({
      nombre: '',
      email: '',
      telefono: '',
      rol: 'operador',
      activo: true,
      permisos: [],
      password: '',
    })
  }

  function startEdit(emp: Empleado) {
    setEditing(emp)
    setCreating(false)
    setForm({
      nombre: emp.nombre,
      email: emp.email,
      telefono: emp.telefono || '',
      rol: emp.rol,
      activo: emp.activo,
      permisos: emp.permisos || [],
      password: '',
    })
  }

  function cancelEdit() {
    setEditing(null)
    setCreating(false)
    setForm({
      nombre: '',
      email: '',
      telefono: '',
      rol: 'operador',
      activo: true,
      permisos: [],
      password: '',
    })
  }

  function togglePermiso(permiso: string) {
    setForm((prev) => ({
      ...prev,
      permisos: prev.permisos.includes(permiso)
        ? prev.permisos.filter((p) => p !== permiso)
        : [...prev.permisos, permiso],
    }))
  }

  async function save() {
    if (!form.nombre.trim() || !form.email.trim()) return
    setSaving(true)

    if (creating) {
      if (!form.password.trim()) {
        alert('Debe ingresar una contraseña inicial')
        setSaving(false)
        return
      }
      const passwordHash = await hashPassword(form.password)
      const { error } = await supabase.from('empleados_v2').insert({
        nombre: form.nombre,
        email: form.email,
        telefono: form.telefono || null,
        rol: form.rol,
        activo: true,
        permisos: [],
        password_hash: passwordHash,
      })
      if (error) {
        alert(error.message || 'Error al crear empleado')
        setSaving(false)
        return
      }
    } else if (editing) {
      // Update basic fields
      const { error } = await supabase
        .from('empleados_v2')
        .update({
          nombre: form.nombre,
          email: form.email,
          telefono: form.telefono || null,
          rol: form.rol,
          activo: form.activo,
        })
        .eq('id', editing.id)

      if (error) {
        alert(error.message || 'Error al actualizar empleado')
        setSaving(false)
        return
      }

      // Update permisos via RPC
      const permResult = await rpcCall('rpc_actualizar_permisos', {
        p_empleado_id: editing.id,
        p_permisos: form.permisos,
      })
      if (!permResult.ok) {
        alert(permResult.error || 'Error al actualizar permisos')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    cancelEdit()
    loadEmpleados()
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
      alert(`Contraseña temporal generada:\n\n${tempPassword}\n\nCompártela con el empleado de forma segura.`)
    } else {
      alert(result.error || 'Error al resetear contraseña')
    }
  }

  const isEditing = creating || editing !== null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center">
            <Users size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Empleados</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} empleados</p>
          </div>
        </div>
        <Button onClick={startCreate} disabled={isEditing}>
          <Plus size={16} /> Nuevo empleado
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
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
      </div>

      {/* Create/Edit form */}
      {isEditing && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">
              {creating ? 'Nuevo empleado' : `Editando: ${editing?.nombre}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email *</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Telefono</label>
                <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Rol *</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value })}
                >
                  {ROL_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              {creating && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Contraseña inicial *</label>
                  <Input
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Contraseña para el nuevo empleado"
                  />
                </div>
              )}
              {editing && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Activo</label>
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                  />
                </div>
              )}
            </div>

            {/* Permisos multi-select (only on edit) */}
            {editing && (
              <div className="mt-5">
                <label className="text-xs font-medium text-muted-foreground block mb-2">Permisos</label>
                <div className="flex flex-wrap gap-2">
                  {PERMISOS_OPTIONS.map((permiso) => (
                    <label
                      key={permiso}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                        form.permisos.includes(permiso)
                          ? 'bg-violet-50 border-violet-300 text-violet-700'
                          : 'bg-background border-input text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.permisos.includes(permiso)}
                        onChange={() => togglePermiso(permiso)}
                        className="sr-only"
                      />
                      {form.permisos.includes(permiso) && <Check size={12} />}
                      {permiso}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-5">
              {/* Reset password button (only on edit) */}
              <div>
                {editing && (
                  <Button variant="outline" onClick={resetPassword} disabled={saving}>
                    <KeyRound size={14} /> Resetear contraseña
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                  <X size={14} /> Cancelar
                </Button>
                <Button onClick={save} disabled={saving || !form.nombre.trim() || !form.email.trim()}>
                  {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Check size={14} />}
                  {creating ? 'Crear' : 'Guardar'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
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
                  <tr
                    key={emp.id}
                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${!emp.activo ? 'opacity-50' : ''}`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium">{emp.nombre}</div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">{emp.email}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROL_COLORS[emp.rol] || 'bg-gray-50 text-gray-700'}`}>
                        {emp.rol}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-muted-foreground">
                      {(emp.permisos || []).length} permisos
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          emp.activo ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {emp.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => startEdit(emp)}
                        disabled={isEditing}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      No se encontraron empleados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
