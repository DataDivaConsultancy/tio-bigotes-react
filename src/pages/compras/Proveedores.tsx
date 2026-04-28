import { useState, useEffect } from 'react'
import { supabase, rpcCall } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, Pencil, Check, X, Factory } from 'lucide-react'

interface Proveedor {
  id: number
  nombre_comercial: string
  razon_social?: string | null
  cif?: string | null
  domicilio?: string | null
  persona_contacto?: string | null
  telefono_contacto?: string | null
  mail_contacto?: string | null
  mail_pedidos?: string | null
  forma_pago?: string | null
  plazo_pago?: string | null
  notas?: string | null
  activo: boolean
}

interface Contacto {
  nombre?: string | null
  apellido?: string | null
  cargo?: string | null   // mapeado a 'rol' en BD
  email?: string | null
  telefono?: string | null
  movil?: string | null
}

interface Categoria {
  id: number
  codigo: string
  nombre: string
}

const FORMA_PAGO_OPTIONS = ['SEPA', 'Transferencia', 'T. Credito', 'Efectivo']

export default function Proveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Proveedor | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [form, setForm] = useState<Partial<Proveedor>>({})
  const [contacto, setContacto] = useState<Contacto>({})
  const [categoriasSel, setCategoriasSel] = useState<Set<number>>(new Set())

  useEffect(() => {
    loadProveedores()
    loadCategorias()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive])

  async function loadProveedores() {
    setLoading(true)
    let q = supabase.from('proveedores_v2').select('*').order('nombre_comercial')
    if (!showInactive) q = q.eq('activo', true)
    const { data, error } = await q
    if (!error && data) setProveedores(data as Proveedor[])
    setLoading(false)
  }

  async function loadCategorias() {
    const { data } = await supabase.from('categorias_producto_v2').select('id, codigo, nombre').order('nombre')
    if (data) setCategorias(data as Categoria[])
  }

  async function loadContacto(proveedorId: number) {
    const { data } = await supabase
      .from('proveedor_contactos')
      .select('nombre, apellido, rol, email, telefono, movil')
      .eq('proveedor_id', proveedorId)
      .eq('es_primario', true)
      .maybeSingle()
    if (data) {
      setContacto({
        nombre: data.nombre,
        apellido: data.apellido,
        cargo: data.rol,
        email: data.email,
        telefono: data.telefono,
        movil: data.movil,
      })
    } else setContacto({})
  }

  async function loadProveedorCategorias(proveedorId: number) {
    const { data } = await supabase
      .from('proveedor_categorias')
      .select('categoria_id')
      .eq('proveedor_id', proveedorId)
    setCategoriasSel(new Set((data ?? []).map((r: any) => r.categoria_id)))
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
    setForm({ activo: true })
    setContacto({})
    setCategoriasSel(new Set())
    setErrorMsg(null)
  }
  async function startEdit(p: Proveedor) {
    setEditing(p)
    setCreating(false)
    setForm({ ...p })
    setErrorMsg(null)
    await Promise.all([loadContacto(p.id), loadProveedorCategorias(p.id)])
  }
  function cancelEdit() {
    setEditing(null); setCreating(false)
    setForm({}); setContacto({}); setCategoriasSel(new Set())
    setErrorMsg(null)
  }

  function toggleCategoria(id: number) {
    setCategoriasSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!form.nombre_comercial?.trim()) return
    setSaving(true); setErrorMsg(null)

    let proveedorId: number | null = editing?.id ?? null

    // 1. Crear o actualizar el proveedor (datos básicos)
    if (creating) {
      const r = await rpcCall<{ id: number }>('rpc_crear_proveedor', {
        p_nombre_comercial: form.nombre_comercial,
        p_razon_social: form.razon_social ?? null,
        p_cif: form.cif ?? null,
        p_domicilio: form.domicilio ?? null,
        p_persona_contacto: [contacto.nombre, contacto.apellido].filter(Boolean).join(' ') || null,
        p_telefono_contacto: contacto.telefono ?? null,
        p_mail_contacto: contacto.email ?? null,
        p_mail_pedidos: form.mail_pedidos ?? null,
        p_forma_pago: form.forma_pago ?? null,
        p_plazo_pago: form.plazo_pago ?? null,
        p_notas: form.notas ?? null,
      })
      if (!r.ok) { setErrorMsg(r.error || 'Error al crear'); setSaving(false); return }
      proveedorId = (r as any).id ?? r.data?.id ?? null
    } else if (editing) {
      const r = await rpcCall('rpc_actualizar_proveedor', {
        p_id: editing.id,
        p_nombre_comercial: form.nombre_comercial,
        p_razon_social: form.razon_social ?? null,
        p_cif: form.cif ?? null,
        p_domicilio: form.domicilio ?? null,
        p_persona_contacto: [contacto.nombre, contacto.apellido].filter(Boolean).join(' ') || null,
        p_telefono_contacto: contacto.telefono ?? null,
        p_mail_contacto: contacto.email ?? null,
        p_mail_pedidos: form.mail_pedidos ?? null,
        p_forma_pago: form.forma_pago ?? null,
        p_plazo_pago: form.plazo_pago ?? null,
        p_notas: form.notas ?? null,
        p_activo: form.activo,
      })
      if (!r.ok) { setErrorMsg(r.error || 'Error al actualizar'); setSaving(false); return }
    }

    // 2. Sincronizar contacto primario detallado
    if (proveedorId) {
      await rpcCall('rpc_set_contacto_primario', {
        p_proveedor_id: proveedorId,
        p_nombre: contacto.nombre ?? '',
        p_apellido: contacto.apellido ?? null,
        p_cargo: contacto.cargo ?? null,
        p_email: contacto.email ?? null,
        p_telefono: contacto.telefono ?? null,
        p_movil: contacto.movil ?? null,
      })

      // 3. Sincronizar categorías
      await rpcCall('rpc_set_proveedor_categorias', {
        p_proveedor_id: proveedorId,
        p_categoria_ids: Array.from(categoriasSel),
      })
    }

    setSaving(false); cancelEdit(); loadProveedores()
  }

  const isEditing = creating || editing !== null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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

      {errorMsg && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{errorMsg}</CardContent>
        </Card>
      )}

      {isEditing && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">
              {creating ? 'Nuevo proveedor' : `Editando: ${editing?.nombre_comercial}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Datos fiscales */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Datos fiscales</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nombre comercial *</label>
                  <Input value={form.nombre_comercial || ''} onChange={(e) => setForm({ ...form, nombre_comercial: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">NIF/CIF</label>
                  <Input value={form.cif || ''} onChange={(e) => setForm({ ...form, cif: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nombre fiscal (razón social)</label>
                  <Input value={form.razon_social || ''} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} />
                </div>
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="text-xs font-medium text-muted-foreground">Dirección</label>
                  <Input value={form.domicilio || ''} onChange={(e) => setForm({ ...form, domicilio: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Categorías (multi-select) */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Categorías de productos que suministra</h3>
              {categorias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cargando categorías…</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {categorias.map((c) => {
                    const sel = categoriasSel.has(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCategoria(c.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          sel
                            ? 'bg-teal-500 text-white border-teal-500'
                            : 'bg-background text-muted-foreground border-border hover:border-teal-400 hover:text-teal-600'
                        }`}
                      >
                        {c.nombre}
                      </button>
                    )
                  })}
                </div>
              )}
              {categoriasSel.size > 0 && (
                <p className="text-xs text-muted-foreground mt-2">{categoriasSel.size} categoría{categoriasSel.size === 1 ? '' : 's'} seleccionada{categoriasSel.size === 1 ? '' : 's'}</p>
              )}
            </div>

            {/* Persona de contacto */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Persona de contacto</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Nombre</label>
                  <Input value={contacto.nombre || ''} onChange={(e) => setContacto({ ...contacto, nombre: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Apellido</label>
                  <Input value={contacto.apellido || ''} onChange={(e) => setContacto({ ...contacto, apellido: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Cargo</label>
                  <Input value={contacto.cargo || ''} onChange={(e) => setContacto({ ...contacto, cargo: e.target.value })} placeholder="Director Comercial, Jefe de Almacén…" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Correo electrónico</label>
                  <Input type="email" value={contacto.email || ''} onChange={(e) => setContacto({ ...contacto, email: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
                  <Input value={contacto.telefono || ''} onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Móvil (opcional)</label>
                  <Input value={contacto.movil || ''} onChange={(e) => setContacto({ ...contacto, movil: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Otros datos */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">Pagos y otros</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Forma de pago</label>
                  <select
                    value={form.forma_pago ?? ''}
                    onChange={(e) => setForm({ ...form, forma_pago: e.target.value || null })}
                    className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">— Seleccionar —</option>
                    {FORMA_PAGO_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Plazo de pago</label>
                  <Input value={form.plazo_pago || ''} onChange={(e) => setForm({ ...form, plazo_pago: e.target.value })} placeholder="30 días, contado…" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email para pedidos</label>
                  <Input type="email" value={form.mail_pedidos || ''} onChange={(e) => setForm({ ...form, mail_pedidos: e.target.value })} />
                </div>
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="text-xs font-medium text-muted-foreground">Notas</label>
                  <textarea
                    value={form.notas || ''}
                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                    rows={2}
                    className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                {!creating && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox" id="prov-activo"
                      checked={form.activo ?? true}
                      onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor="prov-activo" className="text-sm">Activo</label>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                <X size={16} /> Cancelar
              </Button>
              <Button onClick={save} disabled={saving || !form.nombre_comercial?.trim()}>
                <Check size={16} /> {saving ? 'Guardando…' : (creating ? 'Crear' : 'Guardar')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Nombre comercial</th>
                    <th className="px-4 py-3 font-semibold">CIF</th>
                    <th className="px-4 py-3 font-semibold">Contacto</th>
                    <th className="px-4 py-3 font-semibold">Forma pago</th>
                    <th className="px-4 py-3 font-semibold w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/30 ${!p.activo ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{p.nombre_comercial}</div>
                        {p.razon_social && <div className="text-xs text-muted-foreground">{p.razon_social}</div>}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{p.cif ?? '—'}</td>
                      <td className="px-4 py-2">
                        {p.persona_contacto ?? '—'}
                        {p.telefono_contacto && <div className="text-xs text-muted-foreground">{p.telefono_contacto}</div>}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{p.forma_pago ?? '—'}</td>
                      <td className="px-4 py-2">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(p)} disabled={isEditing}>
                          <Pencil size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      {proveedores.length === 0 ? 'Aún no hay proveedores. Crea el primero.' : 'No hay proveedores que coincidan con la búsqueda.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && <div className="text-center text-muted-foreground py-8">Cargando…</div>}
    </div>
  )
}
