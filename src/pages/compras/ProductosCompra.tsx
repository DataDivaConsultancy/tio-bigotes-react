import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase, rpcCall } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, Pencil, Check, X, ShoppingCart, Download, ChevronDown } from 'lucide-react'

interface ProductoCompra {
  id: number
  nombre: string
  proveedor_id: number | null
  cod_proveedor: string | null
  cod_interno: string | null
  precio: number | null
  tipo_iva: string | null
  unidad_medida: string | null
  unidad_minima_compra: number | null
  unidades_por_paquete: number | null
  stock_minimo: number | null
  dia_pedido: string | null
  dia_entrega: string | null
  activo: boolean
}

interface ProveedorOption {
  id: number
  nombre_comercial: string
}

const TIPO_IVA_OPTIONS = [
  { value: 'General 21%', label: 'General (21%)' },
  { value: 'Reducido 10%', label: 'Reducido (10%)' },
  { value: 'Superreducido 4%', label: 'Superreducido (4%)' },
  { value: 'Exento 0%', label: 'Exento (0%)' },
]

const UNIDADES_OPTIONS = ['unidad', 'kg', 'g', 'l', 'ml', 'caja', 'pack', 'saco', 'garrafa', 'palet', 'bandeja', 'bidon', 'docena']

/* ─── Multi-select dropdown ─── */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const allSelected = selected.size === 0 || selected.size === options.length
  const toggleAll = () => onChange(new Set())
  const toggle = (v: string) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    if (next.size === options.length) onChange(new Set())
    else onChange(next)
  }

  const displayText = allSelected
    ? `${label}: Todos`
    : selected.size === 1
      ? `${label}: ${[...selected][0]}`
      : `${label}: ${selected.size} sel.`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md bg-background hover:bg-muted/50 whitespace-nowrap"
      >
        {displayText}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 max-h-64 overflow-y-auto bg-background border rounded-md shadow-lg">
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b text-sm font-medium">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
            Todos
          </label>
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={allSelected || selected.has(opt)}
                onChange={() => toggle(opt)}
                className="rounded"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProductosCompra() {
  const [productos, setProductos] = useState<ProductoCompra[]>([])
  const [proveedores, setProveedores] = useState<ProveedorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<ProductoCompra | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<ProductoCompra>>({})

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Multi-select filters
  const [filterProveedor, setFilterProveedor] = useState<Set<string>>(new Set())
  const [filterDiaPedido, setFilterDiaPedido] = useState<Set<string>>(new Set())
  const [filterDiaEntrega, setFilterDiaEntrega] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadProductos()
    loadProveedores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive])

  async function loadProveedores() {
    const { data, error } = await supabase
      .from('proveedores_v2')
      .select('id, nombre_comercial')
      .eq('activo', true)
      .order('nombre_comercial')
    if (error) { console.error('loadProveedores:', error); return }
    if (data) setProveedores(data)
  }

  async function loadProductos() {
    setLoading(true)
    let query = supabase
      .from('productos_compra_v2')
      .select('id, nombre, proveedor_id, cod_proveedor, cod_interno, precio, tipo_iva, unidad_medida, unidad_minima_compra, unidades_por_paquete, stock_minimo, dia_pedido, dia_entrega, activo')
      .order('nombre')
    if (!showInactive) query = query.eq('activo', true)
    const { data, error } = await query
    if (error) {
      console.error('loadProductos:', error)
      setErrorMsg(error.message)
      setLoading(false)
      return
    }
    setErrorMsg(null)
    if (data) setProductos(data as ProductoCompra[])
    setLoading(false)
  }

  const proveedorMap = new Map(proveedores.map((pv) => [pv.id, pv.nombre_comercial]))

  // Unique values for filter dropdowns
  const uniqueProveedores = useMemo(() => {
    const names = new Set<string>()
    productos.forEach((p) => {
      if (p.proveedor_id) {
        const name = proveedorMap.get(p.proveedor_id)
        if (name) names.add(name)
      }
    })
    return [...names].sort()
  }, [productos, proveedorMap])

  const uniqueDiasPedido = useMemo(() => {
    const days = new Set<string>()
    productos.forEach((p) => {
      if (p.dia_pedido) {
        p.dia_pedido.split(',').forEach((d) => {
          const trimmed = d.trim()
          if (trimmed) days.add(trimmed)
        })
      }
    })
    return [...days].sort()
  }, [productos])

  const uniqueDiasEntrega = useMemo(() => {
    const days = new Set<string>()
    productos.forEach((p) => {
      if (p.dia_entrega) {
        p.dia_entrega.split(',').forEach((d) => {
          const trimmed = d.trim()
          if (trimmed) days.add(trimmed)
        })
      }
    })
    return [...days].sort()
  }, [productos])

  // Apply all filters
  const filtered = useMemo(() => {
    return productos.filter((p) => {
      const q = search.toLowerCase()
      const matchesSearch =
        p.nombre.toLowerCase().includes(q) ||
        (p.cod_proveedor || '').toLowerCase().includes(q) ||
        (p.cod_interno || '').toLowerCase().includes(q)
      if (!matchesSearch) return false

      // Proveedor filter
      if (filterProveedor.size > 0) {
        const provName = p.proveedor_id ? proveedorMap.get(p.proveedor_id) : null
        if (!provName || !filterProveedor.has(provName)) return false
      }

      // Día pedido filter
      if (filterDiaPedido.size > 0) {
        if (!p.dia_pedido) return false
        const dias = p.dia_pedido.split(',').map((d) => d.trim())
        if (!dias.some((d) => filterDiaPedido.has(d))) return false
      }

      // Día entrega filter
      if (filterDiaEntrega.size > 0) {
        if (!p.dia_entrega) return false
        const dias = p.dia_entrega.split(',').map((d) => d.trim())
        if (!dias.some((d) => filterDiaEntrega.has(d))) return false
      }

      return true
    })
  }, [productos, search, filterProveedor, filterDiaPedido, filterDiaEntrega, proveedorMap])

  // Selection helpers
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id))
  const someFilteredSelected = filtered.some((p) => selectedIds.has(p.id))

  function toggleSelectAll() {
    if (allFilteredSelected) {
      const next = new Set(selectedIds)
      filtered.forEach((p) => next.delete(p.id))
      setSelectedIds(next)
    } else {
      const next = new Set(selectedIds)
      filtered.forEach((p) => next.add(p.id))
      setSelectedIds(next)
    }
  }

  function toggleSelect(id: number) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  // Excel download
  async function downloadExcel() {
    const XLSX = await import('xlsx')
    const toExport = filtered.filter((p) => selectedIds.size === 0 || selectedIds.has(p.id))
    if (toExport.length === 0) return

    const rows = toExport.map((p) => ({
      'Nombre': p.nombre,
      'Proveedor': p.proveedor_id ? proveedorMap.get(p.proveedor_id) ?? '' : '',
      'Código Proveedor': p.cod_proveedor ?? '',
      'Código Interno': p.cod_interno ?? '',
      'Unidad Medida': p.unidad_medida ?? '',
      'Compra Mínima': p.unidad_minima_compra ?? '',
      'Uds por Paquete': p.unidades_por_paquete ?? '',
      'Precio (€)': p.precio ?? '',
      'Tipo IVA': p.tipo_iva ?? '',
      'Stock Mínimo': p.stock_minimo ?? '',
      'Día Pedido': p.dia_pedido ?? '',
      'Día Entrega': p.dia_entrega ?? '',
      'Activo': p.activo ? 'Sí' : 'No',
    }))

    const ws = XLSX.utils.json_to_sheet(rows)

    // Auto-width columns
    const colWidths = Object.keys(rows[0]).map((key) => {
      const maxLen = Math.max(key.length, ...rows.map((r) => String((r as any)[key]).length))
      return { wch: Math.min(maxLen + 2, 40) }
    })
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Productos')
    XLSX.writeFile(wb, `productos_compra_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // CRUD helpers (unchanged)
  function startCreate() { setCreating(true); setEditing(null); setForm({ activo: true }) }
  function startEdit(p: ProductoCompra) { setEditing(p); setCreating(false); setForm({ ...p }) }
  function cancelEdit() { setEditing(null); setCreating(false); setForm({}); setErrorMsg(null) }

  async function save() {
    if (!form.nombre?.trim()) return
    setSaving(true)
    setErrorMsg(null)
    const payload = {
      p_nombre: form.nombre,
      p_proveedor_id: form.proveedor_id ?? null,
      p_cod_proveedor: form.cod_proveedor ?? null,
      p_cod_interno: form.cod_interno ?? null,
      p_unidad_medida: form.unidad_medida ?? null,
      p_unidad_minima_compra: form.unidades_por_paquete ?? null,
      p_unidades_por_paquete: form.unidades_por_paquete ?? 1,
      p_dia_pedido: form.dia_pedido ?? null,
      p_dia_entrega: form.dia_entrega ?? null,
      p_precio: form.precio ?? null,
      p_tipo_iva: form.tipo_iva ?? null,
      p_stock_minimo: form.stock_minimo ?? 0,
    }
    let result
    if (creating) {
      result = await rpcCall('rpc_crear_producto_compra', payload)
    } else if (editing) {
      result = await rpcCall('rpc_actualizar_producto_compra', { p_id: editing.id, ...payload, p_activo: form.activo })
    } else { setSaving(false); return }
    if (!result.ok) { setErrorMsg(result.error || 'Error al guardar el producto'); setSaving(false); return }
    setSaving(false)
    cancelEdit()
    loadProductos()
  }

  const isEditing = creating || editing !== null
  const selCount = selectedIds.size

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <ShoppingCart size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Productos de compra</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} productos{selCount > 0 ? ` · ${selCount} seleccionados` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={downloadExcel} disabled={filtered.length === 0}>
            <Download size={16} />
            Descargar Excel{selCount > 0 ? ` (${selCount})` : ''}
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
          <Input placeholder="Buscar por nombre o código..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <MultiSelect label="Proveedor" options={uniqueProveedores} selected={filterProveedor} onChange={setFilterProveedor} />
        <MultiSelect label="Día pedido" options={uniqueDiasPedido} selected={filterDiaPedido} onChange={setFilterDiaPedido} />
        <MultiSelect label="Día entrega" options={uniqueDiasEntrega} selected={filterDiaEntrega} onChange={setFilterDiaEntrega} />
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
          Mostrar inactivos
        </label>
      </div>

      {errorMsg && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{errorMsg}</CardContent>
        </Card>
      )}

      {/* Form Crear/Editar */}
      {isEditing && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">
              {creating ? 'Nuevo producto' : `Editando: ${editing?.nombre}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                <Input value={form.nombre || ''} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Proveedor</label>
                <select value={form.proveedor_id ?? ''} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">— Sin proveedor —</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Código proveedor</label>
                <Input value={form.cod_proveedor || ''} onChange={(e) => setForm({ ...form, cod_proveedor: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Código interno</label>
                <Input value={form.cod_interno || ''} onChange={(e) => setForm({ ...form, cod_interno: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Unidad de medida</label>
                <select value={form.unidad_medida ?? ''} onChange={(e) => setForm({ ...form, unidad_medida: e.target.value || null })} className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">—</option>
                  {UNIDADES_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Compra mínima <span className="ml-1 text-[10px] text-muted-foreground/70">(unidades por paquete)</span>
                </label>
                <Input type="number" step="any" min={1} value={form.unidades_por_paquete ?? ''} onChange={(e) => setForm({ ...form, unidades_por_paquete: e.target.value ? Number(e.target.value) : null, unidad_minima_compra: e.target.value ? Number(e.target.value) : null })} placeholder="1" />
                <p className="text-[10px] text-muted-foreground mt-1">Ej: caja de 60 empanadas → 60. Una empanada suelta → 1.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Precio (€)</label>
                <Input type="number" step="0.01" min={0} value={form.precio ?? ''} onChange={(e) => setForm({ ...form, precio: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Tipo IVA</label>
                <select value={form.tipo_iva ?? ''} onChange={(e) => setForm({ ...form, tipo_iva: e.target.value || null })} className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">— Seleccionar —</option>
                  {TIPO_IVA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Stock mínimo</label>
                <Input type="number" step="any" min={0} value={form.stock_minimo ?? ''} onChange={(e) => setForm({ ...form, stock_minimo: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Día pedido</label>
                <Input value={form.dia_pedido || ''} onChange={(e) => setForm({ ...form, dia_pedido: e.target.value })} placeholder="Lunes, Miércoles…" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Día entrega</label>
                <Input value={form.dia_entrega || ''} onChange={(e) => setForm({ ...form, dia_entrega: e.target.value })} placeholder="Martes, Jueves…" />
              </div>
              {!creating && (
                <div className="flex items-center gap-2 mt-6">
                  <input type="checkbox" id="activo-edit" checked={form.activo ?? true} onChange={(e) => setForm({ ...form, activo: e.target.checked })} className="rounded" />
                  <label htmlFor="activo-edit" className="text-sm">Activo</label>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={cancelEdit} disabled={saving}><X size={16} /> Cancelar</Button>
              <Button onClick={save} disabled={saving || !form.nombre?.trim()}><Check size={16} /> {saving ? 'Guardando…' : (creating ? 'Crear' : 'Guardar')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla */}
      {!loading && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr className="text-left">
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        ref={(el) => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected }}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold">Nombre</th>
                    <th className="px-4 py-3 font-semibold">Proveedor</th>
                    <th className="px-4 py-3 font-semibold">Unidad</th>
                    <th className="px-4 py-3 font-semibold text-right">Precio</th>
                    <th className="px-4 py-3 font-semibold">IVA</th>
                    <th className="px-4 py-3 font-semibold text-right">Uds/paq</th>
                    <th className="px-4 py-3 font-semibold text-right">Stock min</th>
                    <th className="px-4 py-3 font-semibold w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/30 ${!p.activo ? 'opacity-50' : ''} ${selectedIds.has(p.id) ? 'bg-primary/5' : ''}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" />
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{p.nombre}</div>
                        {p.cod_proveedor && <div className="text-xs text-muted-foreground">{p.cod_proveedor}</div>}
                      </td>
                      <td className="px-4 py-2">{p.proveedor_id ? proveedorMap.get(p.proveedor_id) ?? '—' : '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.unidad_medida ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {p.precio != null ? Number(p.precio).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{p.tipo_iva ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.unidades_por_paquete ?? 1}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.stock_minimo ?? '—'}</td>
                      <td className="px-4 py-2">
                        <Button variant="ghost" size="icon" onClick={() => startEdit(p)} disabled={isEditing}><Pencil size={14} /></Button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      {productos.length === 0 ? 'Aún no hay productos. Crea el primero.' : 'No hay productos que coincidan con los filtros.'}
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
