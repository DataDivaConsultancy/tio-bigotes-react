import { useState, useEffect } from 'react'
import { supabase, rpcCall } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, Pencil, Check, X, Store, MapPin, User, Clock } from 'lucide-react'

interface Local {
  id: number
  nombre: string
  calle?: string
  numero?: string
  ciudad?: string
  codigo_postal?: string
  pais?: string
  horario_apertura?: string
  resp_nombre?: string
  resp_apellido?: string
  resp_email?: string
  resp_telefono?: string
  notas?: string
  activo: boolean
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

  useEffect(() => { loadLocales() }, [showInactive])

  async function loadLocales() {
    setLoading(true)
    let query = supabase.from('locales_compra_v2').select('*').order('nombre')
    if (!showInactive) query = query.eq('activo', true)
    const { data, error } = await query
    if (!error && data) setLocales(data)
    setLoading(false)
  }

  const filtered = locales.filter((l) => {
    const q = search.toLowerCase()
    return (
      l.nombre.toLowerCase().includes(q) ||
      (l.calle || '').toLowerCase().includes(q) ||
      (l.ciudad || '').toLowerCase().includes(q) ||
      (l.resp_nombre || '').toLowerCase().includes(q) ||
      (l.resp_apellido || '').toLowerCase().includes(q)
    )
  })

  function startCreate() {
    setCreating(true)
    setEditing(null)
    setForm({ nombre: '', pais: 'España', activo: true })
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

    const params = {
      p_nombre: form.nombre,
      p_calle: form.calle || null,
      p_numero: form.numero || null,
      p_ciudad: form.ciudad || null,
      p_codigo_postal: form.codigo_postal || null,
      p_pais: form.pais || null,
      p_horario_apertura: form.horario_apertura || null,
      p_resp_nombre: form.resp_nombre || null,
      p_resp_apellido: form.resp_apellido || null,
      p_resp_email: form.resp_email || null,
      p_resp_telefono: form.resp_telefono || null,
      p_notas: form.notas || null,
    }

    if (creating) {
      const result = await rpcCall('rpc_crear_local_compra', params)
      if (!result.ok) {
        alert(result.error || 'Error al crear local')
        setSaving(false)
        return
      }
    } else if (editing) {
      const result = await rpcCall('rpc_actualizar_local_compra', {
        p_id: editing.id,
        ...params,
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

  function direccionCompleta(l: Local) {
    const parts = [l.calle, l.numero].filter(Boolean).join(' ')
    const city = [l.codigo_postal, l.ciudad].filter(Boolean).join(' ')
    return [parts, city].filter(Boolean).join(', ') || '—'
  }

  function responsableCompleto(l: Local) {
    return [l.resp_nombre, l.resp_apellido].filter(Boolean).join(' ') || '—'
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
            placeholder="Buscar por nombre, dirección o responsable..."
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
          <CardContent className="space-y-6">
            {/* Nombre del local */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nombre del local *</label>
              <Input
                value={form.nombre || ''}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Tio Bigotes - Provença"
              />
            </div>

            {/* Dirección */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin size={14} className="text-sky-500" />
                <span className="text-sm font-semibold">Dirección</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Calle</label>
                  <Input
                    value={form.calle || ''}
                    onChange={(e) => setForm({ ...form, calle: e.target.value })}
                    placeholder="Ej: Carrer de Provença"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Número</label>
                  <Input
                    value={form.numero || ''}
                    onChange={(e) => setForm({ ...form, numero: e.target.value })}
                    placeholder="Ej: 478"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Ciudad</label>
                  <Input
                    value={form.ciudad || ''}
                    onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                    placeholder="Ej: Barcelona"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Código Postal</label>
                  <Input
                    value={form.codigo_postal || ''}
                    onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })}
                    placeholder="Ej: 08025"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">País</label>
                  <Input
                    value={form.pais || ''}
                    onChange={(e) => setForm({ ...form, pais: e.target.value })}
                    placeholder="Ej: España"
                  />
                </div>
              </div>
            </div>

            {/* Horario */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} className="text-sky-500" />
                <span className="text-sm font-semibold">Horario de apertura</span>
              </div>
              <Input
                value={form.horario_apertura || ''}
                onChange={(e) => setForm({ ...form, horario_apertura: e.target.value })}
                placeholder="Ej: Lun-Vie 8:00-21:00, Sáb 9:00-22:00, Dom 10:00-20:00"
              />
            </div>

            {/* Responsable */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <User size={14} className="text-sky-500" />
                <span className="text-sm font-semibold">Responsable</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nombre</label>
                  <Input
                    value={form.resp_nombre || ''}
                    onChange={(e) => setForm({ ...form, resp_nombre: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Apellido</label>
                  <Input
                    value={form.resp_apellido || ''}
                    onChange={(e) => setForm({ ...form, resp_apellido: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <Input
                    type="email"
                    value={form.resp_email || ''}
                    onChange={(e) => setForm({ ...form, resp_email: e.target.value })}
                    placeholder="email@ejemplo.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
                  <Input
                    value={form.resp_telefono || ''}
                    onChange={(e) => setForm({ ...form, resp_telefono: e.target.value })}
                    placeholder="+34 600 000 000"
                  />
                </div>
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notas</label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                value={form.notas || ''}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Observaciones del local..."
              />
            </div>

            {/* Activo toggle (solo en edición) */}
            {editing && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.activo ?? true}
                  onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                  className="rounded"
                />
                <label className="text-sm text-muted-foreground">Local activo</label>
              </div>
            )}

            {/* Botones */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                <X size={14} /> Cancelar
              </Button>
              <Button onClick={save} disabled={saving || !form.nombre?.trim()}>
                {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Check size={14} />}
                {creating ? 'Crear local' : 'Guardar cambios'}
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
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Local</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Dirección</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Horario</th>
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
                    <td className="py-3 px-4">
                      <div className="font-medium">{l.nombre}</div>
                      {l.resp_telefono && (
                        <div className="text-xs text-muted-foreground mt-0.5">{l.resp_telefono}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-muted-foreground text-xs">
                      {direccionCompleta(l)}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-muted-foreground text-xs">
                      {l.horario_apertura || '—'}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-muted-foreground text-xs">
                      <div>{responsableCompleto(l)}</div>
                      {l.resp_email && <div className="text-xs opacity-70">{l.resp_email}</div>}
                    </td>
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
