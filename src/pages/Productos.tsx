import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, Pencil, Check, X, Package, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Producto {
  id: number
  codigo: string | null
  nombre: string
  categoria: string | null        // from vw_productos_dim (read-only join)
  categoria_id: number | null     // actual FK for writes
  precio_venta: number | null     // always NULL in current schema
  activo: boolean
  observaciones: string | null
  es_vendible: boolean
  es_producible: boolean
  // Campos de compra
  tipo: 'venta' | 'compra' | 'ambos'
  proveedor_id: number | null
  proveedor_nombre: string | null
  cod_proveedor: string | null
  cod_interno: string | null
  precio_compra: number | null
  tipo_iva: string | null
  dia_pedido: string | null
  dia_entrega: string | null
  stock_minimo: number | null
  unidades_por_paquete: number | null
  forma_pago: string | null
  plazo_pago: string | null
  notas: string | null
  compra_legacy_id: number | null
}

interface CategoriaProducto {
  id: number
  nombre: string
}

interface ProveedorOption {
  id: number
  nombre_comercial: string
}

type TipoFilter = 'todos' | 'venta' | 'compra' | 'ambos'

// ─── Component ──────────────────────────────────────────────────────────────

export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [proveedores, setProveedores] = useState<ProveedorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState<string>('__all__')
  const [filterTipo, setFilterTipo] = useState<TipoFilter>('todos')
  const [filterProveedor, setFilterProveedor] = useState<string>('__all__')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<Producto>>({})

  useEffect(() => { loadData() }, [showInactive])
  useEffect(() => { loadCategorias(); loadProveedores() }, [])

  async function loadData() {
    setLoading(true)
    let query = supabase
      .from('vw_productos_dim')
      .select('*')
      .order('nombre')
    if (!showInactive) query = query.eq('activo', true)
    const { data, error } = await query
    if (!error && data) setProductos(data)
    setLoading(false)
  }

  async function loadCategorias() {
    const { data } = await supabase.from('categorias_producto_v2').select('*').order('nombre')
    if (data) setCategorias(data)
  }

  async function loadProveedores() {
    const { data } = await supabase.from('proveedores_v2').select('id, nombre_comercial').eq('activo', true).order('nombre_comercial')
    if (data) setProveedores(data)
  }

  // ─── Filtering ──────────────────────────────────────────────────────────────

  const filtered = productos.filter((p) => {
    const q = search.toLowerCase()
    const matchesSearch =
      p.nombre.toLowerCase().includes(q) ||
      (p.codigo || '').toLowerCase().includes(q) ||
      (p.cod_interno || '').toLowerCase().includes(q)
    const matchesCategoria =
      filterCategoria === '__all__' ||
      (filterCategoria === '__none__' ? !p.categoria : p.categoria === filterCategoria)
    const matchesTipo =
      filterTipo === 'todos' || p.tipo === filterTipo
    const matchesProveedor =
      filterProveedor === '__all__' ||
      (filterProveedor === '__none__' ? !p.proveedor_id : String(p.proveedor_id) === filterProveedor)
    return matchesSearch && matchesCategoria && matchesTipo && matchesProveedor
  })

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  function startCreate() {
    setCreating(true)
    setEditing(null)
    setForm({
      codigo: '', nombre: '', categoria_id: null, observaciones: '',
      tipo: 'venta', proveedor_id: null, precio_compra: null,
      tipo_iva: null, dia_pedido: null, dia_entrega: null,
      stock_minimo: 0, unidades_por_paquete: 1, notas: null,
    })
  }

  function startEdit(p: Producto) {
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
    if (!form.nombre?.trim()) return
    setSaving(true)

    // Determinar tipo automáticamente
    const hasCompraData = form.proveedor_id != null || (form.precio_compra != null && form.precio_compra > 0)
    const isVendible = form.es_vendible ?? (editing?.es_vendible ?? true)
    let tipo = form.tipo || 'venta'
    if (isVendible && hasCompraData) tipo = 'ambos'
    else if (hasCompraData && !isVendible) tipo = 'compra'
    else if (!hasCompraData) tipo = 'venta'

    // Build payload with only columns that exist in tb_v2.productos (via productos_v2 view)
    const payload: Record<string, any> = {
      nombre: form.nombre,
      nombre_normalizado: form.nombre?.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') || '',
      codigo: form.codigo || null,
      categoria_id: form.categoria_id || null,
      observaciones: form.observaciones || null,
      tipo,
      proveedor_id: form.proveedor_id || null,
      cod_proveedor: form.cod_proveedor || null,
      cod_interno: form.cod_interno || null,
      precio_compra: form.precio_compra ?? null,
      tipo_iva: form.tipo_iva || null,
      dia_pedido: form.dia_pedido || null,
      dia_entrega: form.dia_entrega || null,
      stock_minimo: form.stock_minimo ?? 0,
      unidades_por_paquete: form.unidades_por_paquete ?? 1,
      forma_pago: form.forma_pago || null,
      plazo_pago: form.plazo_pago || null,
      notas: form.notas || null,
    }

    if (editing) {
      payload.activo = form.activo ?? true
    }

    if (creating) {
      // New products default to vendible + producible for venta type
      if (tipo === 'venta' || tipo === 'ambos') {
        payload.es_vendible = true
        payload.es_producible = true
      } else {
        payload.es_vendible = false
        payload.es_producible = false
      }
      payload.afecta_forecast = tipo !== 'compra'
      const { error } = await supabase.from('productos_v2').insert(payload)
      if (error) { alert(error.message); setSaving(false); return }
    } else if (editing) {
      const { error } = await supabase.from('productos_v2').update(payload).eq('id', editing.id)
      if (error) { alert(error.message); setSaving(false); return }
    }

    setSaving(false)
    cancelEdit()
    loadData()
  }

  // ─── Excel export ───────────────────────────────────────────────────────────

  function exportExcel() {
    const rows = filtered.map((p) => ({
      Código: p.codigo || '',
      Nombre: p.nombre,
      Tipo: p.tipo,
      Categoría: p.categoria || '',
      Proveedor: p.proveedor_nombre || '',
      'Precio compra': p.precio_compra ?? '',
      IVA: p.tipo_iva || '',
      'Stock mín': p.stock_minimo ?? '',
      'Uds/paq': p.unidades_por_paquete ?? '',
      'Día pedido': p.dia_pedido || '',
      'Día entrega': p.dia_entrega || '',
      Activo: p.activo ? 'Sí' : 'No',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    XLSX.writeFile(wb, `productos_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const isEditing = creating || editing !== null
  const tipoLabel: Record<string, string> = { venta: 'Venta', compra: 'Compra', ambos: 'Ambos' }
  const tipoBadgeColor: Record<string, string> = {
    venta: 'bg-blue-50 text-blue-700',
    compra: 'bg-emerald-50 text-emerald-700',
    ambos: 'bg-purple-50 text-purple-700',
  }

  // ─── Form fields toggle ────────────────────────────────────────────────────

  const formTipo = form.tipo || 'venta'
  const showVentaFields = formTipo === 'venta' || formTipo === 'ambos'
  const showCompraFields = formTipo === 'compra' || formTipo === 'ambos'

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center">
            <Package size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Productos</h1>
            <p className="text-sm text-muted-foreground">
              {filtered.length} productos
              {filterTipo !== 'todos' ? ` · ${tipoLabel[filterTipo]}` : ''}
              {filterCategoria !== '__all__' ? ` · ${filterCategoria === '__none__' ? 'Sin categoría' : filterCategoria}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={filtered.length === 0}>
            <Download size={16} /> Excel
          </Button>
          <Button onClick={startCreate} disabled={isEditing}>
            <Plus size={16} /> Nuevo producto
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterTipo}
          onChange={(e) => setFilterTipo(e.target.value as TipoFilter)}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="todos">Todos los tipos</option>
          <option value="venta">Solo venta</option>
          <option value="compra">Solo compra</option>
          <option value="ambos">Venta + compra</option>
        </select>
        <select
          value={filterCategoria}
          onChange={(e) => setFilterCategoria(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="__all__">Todas las categorías</option>
          <option value="__none__">Sin categoría</option>
          {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
        </select>
        <select
          value={filterProveedor}
          onChange={(e) => setFilterProveedor(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="__all__">Todos los proveedores</option>
          <option value="__none__">Sin proveedor</option>
          {proveedores.map((pv) => <option key={pv.id} value={pv.id}>{pv.nombre_comercial}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
          Inactivos
        </label>
      </div>

      {/* Create/Edit form */}
      {isEditing && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">
              {creating ? 'Nuevo producto' : `Editando: ${editing?.nombre}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Tipo selector */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de producto</label>
              <div className="flex gap-2">
                {(['venta', 'compra', 'ambos'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, tipo: t })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      formTipo === t
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-muted'
                    }`}
                  >
                    {tipoLabel[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Common fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                <Input value={form.nombre || ''} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Código</label>
                <Input value={form.codigo || ''} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Observaciones</label>
                <Input value={form.observaciones || ''} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} placeholder="Notas internas" />
              </div>
            </div>

            {/* Venta fields */}
            {showVentaFields && (
              <div>
                <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">Datos de venta</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Categoría</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.categoria_id ?? ''}
                      onChange={(e) => setForm({ ...form, categoria_id: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">— Sin categoría —</option>
                      {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Compra fields */}
            {showCompraFields && (
              <div>
                <h3 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-3">Datos de compra</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Proveedor</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.proveedor_id ?? ''}
                      onChange={(e) => setForm({ ...form, proveedor_id: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">— Sin proveedor —</option>
                      {proveedores.map((pv) => <option key={pv.id} value={pv.id}>{pv.nombre_comercial}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Precio compra (EUR)</label>
                    <Input
                      type="number" step="0.01" min="0"
                      value={form.precio_compra ?? ''}
                      onChange={(e) => setForm({ ...form, precio_compra: e.target.value ? Number(e.target.value) : null })}
                    />
                        </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">IVA</label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.tipo_iva || ''}
                      onChange={(e) => setForm({ ...form, tipo_iva: e.target.value || null })}
                    >
                      <option value="">— Sin IVA —</option>
                      <option value="General 21%">General 21%</option>
                      <option value="Reducido 10%">Reducido 10%</option>
                      <option value="Superreducido 4%">Superreducido 4%</option>
                      <option value="Exento 0%">Exento 0%</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Código proveedor</label>
                    <Input value={form.cod_proveedor || ''} onChange={(e) => setForm({ ...form, cod_proveedor: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Uds por paquete</label>
                    <Input
                      type="number" step="1" min="1"
                      value={form.unidades_por_paquete ?? 1}
                      onChange={(e) => setForm({ ...form, unidades_por_paquete: Number(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Stock mínimo</label>
                    <Input
                      type="number" step="1" min="0"
                      value={form.stock_minimo ?? 0}
                      onChange={(e) => setForm({ ...form, stock_minimo: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Día pedido</label>
                    <Input value={form.dia_pedido || ''} onChange={(e) => setForm({ ...form, dia_pedido: e.target.value })} placeholder="Lunes, Miércoles" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Día entrega</label>
                    <Input value={form.dia_entrega || ''} onChange={(e) => setForm({ ...form, dia_entrega: e.target.value })} placeholder="Martes, Jueves" />
                  </div>
                  <div className="md:col-span-2 lg:col-span-1">
                    <label className="text-xs font-medium text-muted-foreground">Notas de compra</label>
                    <textarea
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                      value={form.notas || ''}
                      onChange={(e) => setForm({ ...form, notas: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Activo toggle + actions */}
            <div className="flex items-center justify-between pt-2">
              <div>
                {editing && (
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={form.activo ?? true} onChange={(e) => setForm({ ...form, activo: e.target.checked })} className="rounded" />
                    Activo
                  </label>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                  <X size={14} /> Cancelar
                </Button>
                <Button onClick={save} disabled={saving || !form.nombre?.trim()}>
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
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Código</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nombre</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Tipo</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Categoría</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Proveedor</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">P. compra</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">IVA</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${!p.activo ? 'opacity-50' : ''}`}
                  >
                    <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{p.codigo || p.cod_interno || '—'}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{p.nombre}</div>
                      {p.observaciones && <div className="text-xs text-muted-foreground truncate max-w-xs">{p.observaciones}</div>}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tipoBadgeColor[p.tipo] || ''}`}>
                        {tipoLabel[p.tipo] || p.tipo}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {p.categoria ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {p.categoria}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-muted-foreground">
                      {p.proveedor_nombre || '—'}
                    </td>
                    <td className="py-3 px-4 text-right hidden md:table-cell font-medium">
                      {p.precio_compra != null ? formatCurrency(p.precio_compra) : '—'}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-muted-foreground text-xs">{p.tipo_iva || '—'}</td>
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
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      {productos.length === 0 ? 'Aún no hay productos. Crea el primero.' : 'No hay productos que coincidan con los filtros.'}
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
