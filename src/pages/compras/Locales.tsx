import { useState, useEffect } from 'react'
import { supabase, rpcCall } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, Pencil, Check, X, Store } from 'lucide-react'

interface Local {
  id: number
  nombre: string
  direccion?: string
  telefono?: string
  responsable?: string
  activo: boolean
  notas?: string
}

export default function Locales() {
  const [locales, setLocales] = useState<Local[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Local | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<Partial<Local>>({})

  useEffect(() => {
    loadLocales()
  }, [showInactive])

  async function loadLocales() {
    setLoading(true)
    let query = supabase
      .from('locales_compra_v2')
      .select('*')
      .order('nombre')

    if (!showInactive) query = query.eq('activo', true)

    const { data, error } = await query
    if (!error && data) setLocales(data)
    setLoading(false)
  }

  const filtered = locales.filter((l) => {
    const q = search.toLowerCase()
    return (
      l.nombre.toLowerCase().includes(q) ||
      (l.direccion || '').toLowerCase().includes(q)
    )
  })

  function startCreate() {
    setCreating(true)
    setEditing(null)
    setForm({ nombre: '', activo: true })
  }

  function startEdit(l: Local) {
    setEditing(l)
    setCreating(false)
    setForm({ ...l })
  }

  function cancelEdit() {
    setEditing(null)
    setCreating(false)
    setForm({})
  }

  async function save() {
    if (!form.nombre?.trim()) return
    setSaving(true)

    if (creating) {
      const result = await rpcCall('rpc_crear_local_compra', {
        p_nombre: form.nombre,
        p_direccion: form.direccion || null,
        p_telefono: form.telefono || null,
        p_responsable: form.responsable || null,
        p_notas: form.notas || null,
      })
      if (!result.ok) {
        alert(result.error || 'Error al crear local')
        setSaving(false)
        return
      }
    } else if (editing) {
      const result = await rpcCall('rpc_actualizar_local_compra', {
        p_id: editing.id,
        p_nombre: form.nombre,
        p_direccion: form.direccion || null,
        p_telefono: form.telefono || null,
        p_responsable: form.responsable || null,
        p_notas: form.notas || null,
        p_activo: form.activo,
      })
      if (!result.ok) {
        alert(result.error || 'Error al actualizar local')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    cancelEdit()
    loadLocales()
  }

  const isEditing = creating || editing !== null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center">
            <Store size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Locales</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} locales</p>
          </div>
        </div>
        <Button onClick={startCreate} disabled={isEditing}>
          <Plus size={16} /> Nuevo local
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o dirección..."
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
              {creating ? 'Nuevo local' : `Editando: ${editing?.nombre}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                <Input value={form.nombre || ''} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Dirección</label>
                <Input value={form.direccion || ''} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
                <Input value={form.telefono || ''} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Responsable</label>
                <Input value={form.responsable || ''} onChange={(e) => setForm({ ...form, responsable: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Notas</label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                  value={form.notas || ''}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                />
              </div>
              {editing && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Activo</label>
                  <input
                    type="checkbox"
                    checked={form.activo ?? true}
                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                <X size={14} /> Cancelar
              </Button>
              <Button onClick={save} disabled={saving || !form.nombre?.trim()}>
                {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Check size={14} />}
                {creating ? 'Crear' : 'Guardar'}
              </Button>
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
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Dirección</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Teléfono</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Responsable</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr
                    key={l.id}
                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${!l.activo ? 'opacity-50' : ''}`}
                  >
                    <td className="py-3 px-4 font-medium">{l.nombre}</td>
                    <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">{l.direccion || '—'}</td>
                    <td className="py-3 px-4 hidden lg:table-cell text-muted-foreground">{l.telefono || '—'}</td>
                    <td className="py-3 px-4 hidden lg:table-cell text-muted-foreground">{l.responsable || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => startEdit(l)}
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
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                      No se encontraron locales
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
