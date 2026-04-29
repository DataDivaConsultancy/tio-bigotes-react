import { useEffect, useMemo, useState } from 'react'
import { supabase, rpcCall } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Pencil, Check, X, KeyRound, Trash2, Search, Lock } from 'lucide-react'

// Catálogo de pantallas (debe coincidir con los `screen` usados en App.tsx)
const ALL_SCREENS: { key: string; label: string; group: string }[] = [
  { key: 'ComprasDashboard', label: 'Dashboard Compras', group: 'Compras' },
  { key: 'Pedidos', label: 'Pedidos', group: 'Compras' },
  { key: 'Recepciones', label: 'Recepciones', group: 'Compras' },
  { key: 'Incidencias', label: 'Incidencias', group: 'Compras' },
  { key: 'Albaranes', label: 'Albaranes (Fase 2)', group: 'Compras' },
  { key: 'FacturasCompra', label: 'Facturas (Fase 2)', group: 'Compras' },
  { key: 'Proveedores', label: 'Proveedores', group: 'Maestros' },
  { key: 'ProductosCompra', label: 'Productos Compra', group: 'Maestros' },
  { key: 'Locales', label: 'Locales', group: 'Maestros' },
  { key: 'Stock', label: 'Stock', group: 'Maestros' },
  { key: 'Productos', label: 'Productos', group: 'Maestros' },
  { key: 'Empleados', label: 'Empleados', group: 'Administración' },
  { key: 'Roles', label: 'Roles y permisos', group: 'Administración' },
  { key: 'Auditoria', label: 'Auditoría', group: 'Administración' },
  { key: 'CargaVentas', label: 'Subir CSV Ventas', group: 'Datos' },
  { key: 'CargaProductos', label: 'Subir CSV Productos', group: 'Datos' },
  { key: 'BI', label: 'Historial / BI', group: 'Operaciones' },
  { key: 'Forecast', label: 'Forecast', group: 'Operaciones' },
  { key: 'Operativa', label: 'Control Diario', group: 'Operaciones' },
  { key: 'Pendientes', label: 'Pendientes', group: 'Operaciones' },
]

interface Rol {
  id: string
  nombre: string
  descripcion: string | null
  permisos: string[]
  es_sistema: boolean
  activo: boolean
  created_at: string
  updated_at: string
}

export default function Roles() {
  const [roles, setRoles] = useState<Rol[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Rol | null>(null)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<{ nombre: string; descripcion: string; permisos: Set<string> }>({
    nombre: '', descripcion: '', permisos: new Set(),
  })
  const [saving, setSaving] = useState(false)

  async function cargar() {
    setLoading(true); setError(null)
    const { data, error: e } = await supabase.from('roles_v2')
      .select('id, nombre, descripcion, permisos, es_sistema, activo, created_at, updated_at')
      .order('es_sistema', { ascending: false })
      .order('nombre')
    if (e) setError(e.message)
    else setRoles((data ?? []).map((r: any) => ({ ...r, permisos: r.permisos ?? [] })) as Rol[])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  function startCreate() {
    setCreating(true); setEditing(null); setError(null)
    setForm({ nombre: '', descripcion: '', permisos: new Set() })
  }
  function startEdit(r: Rol) {
    setEditing(r); setCreating(false); setError(null)
    setForm({
      nombre: r.nombre,
      descripcion: r.descripcion ?? '',
      permisos: new Set(r.permisos ?? []),
    })
  }
  function cancelEdit() {
    setEditing(null); setCreating(false); setError(null)
    setForm({ nombre: '', descripcion: '', permisos: new Set() })
  }

  function togglePerm(key: string) {
    setForm((prev) => {
      const next = new Set(prev.permisos)
      if (next.has(key)) next.delete(key); else next.add(key)
      return { ...prev, permisos: next }
    })
  }
  function toggleGroup(group: string) {
    const groupScreens = ALL_SCREENS.filter((s) => s.group === group).map((s) => s.key)
    setForm((prev) => {
      const next = new Set(prev.permisos)
      const todos = groupScreens.every((s) => next.has(s))
      if (todos) groupScreens.forEach((s) => next.delete(s))
      else groupScreens.forEach((s) => next.add(s))
      return { ...prev, permisos: next }
    })
  }

  async function guardar() {
    if (!form.nombre.trim()) { setError('Falta el nombre'); return }
    setSaving(true); setError(null)

    const permisosArr = Array.from(form.permisos)
    let r
    if (creating) {
      r = await rpcCall<{ id: string }>('rpc_crear_rol', {
        p_nombre: form.nombre, p_descripcion: form.descripcion || null, p_permisos: permisosArr,
      })
    } else if (editing) {
      r = await rpcCall('rpc_actualizar_rol', {
        p_id: editing.id, p_nombre: form.nombre, p_descripcion: form.descripcion || null,
        p_permisos: permisosArr,
      })
    } else { setSaving(false); return }
    setSaving(false)
    if (!r.ok) { setError(r.error === 'ya_existe' ? 'Ya existe un rol con ese nombre' : (r.error || 'Error')); return }
    cancelEdit(); cargar()
  }

  async function eliminar(r: Rol) {
    if (r.es_sistema) return
    if (!confirm(`¿Eliminar el rol "${r.nombre}"? Solo se puede si no hay empleados activos con ese rol.`)) return
    const res = await rpcCall('rpc_eliminar_rol', { p_id: r.id })
    if (!res.ok) {
      alert(res.error === 'rol_en_uso' ? 'No se puede eliminar: hay empleados activos con este rol.' : (res.error || 'Error'))
      return
    }
    cargar()
  }

  const filtered = roles.filter((r) => r.nombre.toLowerCase().includes(search.toLowerCase()))
  const isEditing = creating || editing !== null

  const screensByGroup = useMemo(() => {
    const m = new Map<string, typeof ALL_SCREENS>()
    for (const s of ALL_SCREENS) {
      const g = m.get(s.group) ?? []
      g.push(s); m.set(s.group, g)
    }
    return Array.from(m.entries())
  }, [])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center"><KeyRound size={20} className="text-white" /></div>
          <div>
            <h1 className="text-xl font-bold">Roles y permisos</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} roles</p>
          </div>
        </div>
        <Button onClick={startCreate} disabled={isEditing}><Plus size={16} /> Nuevo rol</Button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar rol..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {error && <Card className="border-red-200 bg-red-50"><CardContent className="py-3 text-sm text-red-700">{error}</CardContent></Card>}

      {/* Form crear/editar */}
      {isEditing && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              {creating ? 'Nuevo rol' : `Editando: ${editing?.nombre}`}
              {editing?.es_sistema && <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Lock size={10} /> Rol del sistema</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                <Input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  disabled={editing?.es_sistema}
                  placeholder="ej: encargado_tienda"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Descripción</label>
                <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Para qué sirve este rol" />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center justify-between">
                <span>Funcionalidades a las que tiene acceso ({form.permisos.size})</span>
                <span className="text-xs font-normal text-muted-foreground">Click en grupo para alternar todo</span>
              </h3>
              <div className="space-y-3">
                {screensByGroup.map(([group, screens]) => {
                  const todos = screens.every((s) => form.permisos.has(s.key))
                  const algunos = screens.some((s) => form.permisos.has(s.key))
                  return (
                    <div key={group} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group)}
                          className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${todos ? 'bg-violet-500 text-white' : algunos ? 'bg-violet-100 text-violet-700' : 'text-muted-foreground hover:bg-muted'}`}
                        >
                          {group}
                        </button>
                        <span className="text-[10px] text-muted-foreground">{screens.filter((s) => form.permisos.has(s.key)).length} / {screens.length}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {screens.map((s) => {
                          const sel = form.permisos.has(s.key)
                          return (
                            <button
                              key={s.key}
                              type="button"
                              onClick={() => togglePerm(s.key)}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                sel
                                  ? 'bg-violet-500 text-white border-violet-500'
                                  : 'bg-background text-muted-foreground border-border hover:border-violet-400'
                              }`}
                            >
                              {s.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={cancelEdit} disabled={saving}><X size={16} /> Cancelar</Button>
              <Button onClick={guardar} disabled={saving || !form.nombre.trim()}>
                <Check size={16} /> {saving ? 'Guardando…' : (creating ? 'Crear rol' : 'Guardar')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla de roles */}
      {!loading && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Descripción</th>
                  <th className="px-4 py-3 font-semibold text-right">Funcionalidades</th>
                  <th className="px-4 py-3 font-semibold w-24"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={`border-b last:border-0 hover:bg-muted/30 ${!r.activo ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2">
                      <div className="font-medium flex items-center gap-2">
                        {r.nombre}
                        {r.es_sistema && <Lock size={11} className="text-amber-600" />}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{r.descripcion ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.permisos.length}</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(r)} disabled={isEditing}><Pencil size={14} /></Button>
                        {!r.es_sistema && (
                          <Button variant="ghost" size="icon" onClick={() => eliminar(r)} disabled={isEditing} className="text-red-600"><Trash2 size={14} /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sin roles. Crea el primero.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {loading && <div className="text-center text-muted-foreground py-8">Cargando…</div>}
    </div>
  )
}
