import { useState, useEffect } from 'react'
import { supabase, rpcCall } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, Pencil, Check, X, Factory } from 'lucide-react'

interface Proveedor {
  id: number
  nombre_comercial: string
  razon_social?: string
  cif?: string
  domicilio?: string
  persona_contacto?: string
  telefono_contacto?: string
  mail_contacto?: string
  mail_pedidos?: string
  forma_pago?: string
  plazo_pago?: string
  notas?: string
  activo: boolean
}

const FORMA_PAGO_OPTIONS = ['SEPA', 'Transferencia', 'T. Credito', 'Efectivo', 'Otro']

export default function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Proveedor | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<Partial<Proveedor>>({})

  useEffect(() => {
    loadProveedores()
  }, [showInactive])

  async function loadProveedores() {
    setLoading(true)
    let query = supabase
      .from('proveedores_v2')
      .select('*')
      .order('nombre_comercial')

    if (!showInactive) query = query.eq('activo', true)

    const { data, error } = await query
    if (!error && data) setProveedores(data)
    setLoading(false)
  }

  const filtered = proveedores.filter((p) => {
    const q = search.toLowerCase()
    return (
      p.nombre_comercial.toLowerCase().includes(q) ||
      (p.cif || '').toLowerCase().includes(q) ||
      (p.persona_contacto || '').toLowerCase().includes(q)
    )
  })

  function startCreate() {
    setCreating(true)
    setEditing(null)
    setForm({ nombre_comercial: '', activo: true })
  }

  function startEdit(p: Proveedor) {
    setEditing(p)
    setCreating(false)
    setForm({ ...p })
  }

  function cancelEdit() {
    setEditing(null)
    setCreating(false)
    setForm({})
  }

  async function save() {
    if (!form.nombre_comercial?.trim()) return
    setSaving(true)

    if (creating) {
      const result = await rpcCall('rpc_crear_proveedor', {
        p_nombre_comercial: form.nombre_comercial,
        p_razon_social: form.razon_social || null,
        p_cif: form.cif || null,
        p_domicilio: form.domicilio || null,
        p_persona_contacto: form.persona_contacto || null,
        p_telefono_contacto: form.telefono_contacto || null,
        p_mail_contacto: form.mail_contacto || null,
        p_mail_pedidos: form.mail_pedidos || null,
        p_forma_pago: form.forma_pago || null,
        p_plazo_pago: form.plazo_pago || null,
        p_notas: form.notas || null,
      })
      if (!result.ok) {
        alert(result.error || 'Error al crear proveedor')
        setSaving(false)
        return
      }
    } else if (editing) {
      const result = await rpcCall('rpc_actualizar_proveedor', {
        p_id: editing.id,
        p_nombre_comercial: form.nombre_comercial,
        p_razon_social: form.razon_social || null,
        p_cif: form.cif || null,
        p_domicilio: form.domicilio || null,
        p_persona_contacto: form.persona_contacto || null,
        p_telefono_contacto: form.telefono_contacto || null,
        p_mail_contacto: form.mail_contacto || null,
        p_mail_pedidos: form.mail_pedidos || null,
        p_forma_pago: form.forma_pago || null,
        p_plazo_pago: form.plazo_pago || null,
        p_notas: form.notas || null,
        p_activo: form.activo,
      })
      if (!result.ok) {
        alert(result.error || 'Error al actualizar proveedor')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    cancelEdit()
    loadProveedores()
  }

  const isEditing = creating || editing !== null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center">
            <Factory size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Proveedores</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} proveedores</p>
          </div>
        </div>
        <Button onClick={startCreate} disabled={isEditing}>
          <Plus size={16} /> Nuevo proveedor
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, CIF o contacto..."
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
              {creating ? 'Nuevo proveedor' : `Editando: ${editing?.nombre_comercial}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nombre comercial *</label>
                <Input value={form.nombre_comercial || ''} onChange={(e) => setForm({ ...form, nombre_comercial: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">RazÃ³n social</label>
                <Input value={form.razon_social || ''} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">CIF</label>
                <Input value={form.cif || ''} onChange={(e) => setForm({ ...form, cif: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Domicilio</label>
                <Input value={form.domicilio || ''} onChange={(e) => setForm({ ...form, domicilio: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Persona de contacto</label>
                <Input value={form.persona_contacto || ''} onChange={(e) => setForm({ ...form, persona_contacto: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">TelÃ©fono contacto</label>
                <Input value={form.telefono_contacto || ''} onChange={(e) => setForm({ ...form, telefono_contacto: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email contacto</label>
                <Input type="email" value={form.mail_contacto || ''} onChange={(e) => setForm({ ...form, mail_contacto: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email pedidos</label>
                <Input type="email" value={form.mail_pedidos || ''} onChange={(e) => setForm({ ...form, mail_pedidos: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Forma de pago</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.forma_pago || ''}
                  onChange={(e) => setForm({ ...form, forma_pago: e.target.value || undefined })}
                >
                  <option value="">â Sin especificar â</option>
                  {FORMA_PAGO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Plazo de pago</label>
                <Input value={form.plazo_pago || ''} onChange={(e) => setForm({ ...form, plazo_pago: e.target.value })} placeholder="Ej: 30 dÃ­as" />
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
              <Button onClick={save} disabled={saving || !form.nombre_comercial?.trim()}>
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
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">CIF</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Contacto</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">TelÃ©fono</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Pago</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${!p.activo ? 'opacity-50' : ''}`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium">{p.nombre_comercial}</div>
                      {p.razon_social && <div className="text-xs text-muted-foreground">{p.razon_social}</div>}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">{p.cif || 'â'}</td>
                    <td className="py-3 px-4 hidden lg:table-cell text-muted-foreground">{p.persona_contacto || 'â'}</td>
                    <td className="py-3 px-4 hidden lg:table-cell text-muted-foreground">{p.telefono_contacto || 'â'}</td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {p.forma_pago && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {p.forma_pago}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => startEdit(p)}
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
                      No se encontraron proveedores
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
