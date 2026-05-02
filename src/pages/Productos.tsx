import { useState, useEffect, useMemo } from 'react'
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
  merma_pct?: number | null
  unidades_por_paquete: number | null
  forma_pago: string | null
  plazo_pago: string | null
  notas: string | null
  compra_legacy_id: number | null
  en_precios_venta: boolean
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
  const [aliasesPorProducto, setAliasesPorProducto] = useState<Map<number, string[]>>(new Map())
  // Aliases TPV elegidos al crear un producto NUEVO (se asocian tras el INSERT)
  const [aliasesNuevoSeleccionados, setAliasesNuevoSeleccionados] = useState<Set<string>>(new Set())
  // Atributos personalizados (campos_extra_producto_v2) del producto editado
  const [atributos, setAtributos] = useState<Array<{ campo: string; valor: string }>>([])
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
    const [prodRes, aliasRes] = await Promise.all([
      query,
      supabase.from('ventas_alias_v2').select('alias_tpv, producto_id'),
    ])
    if (!prodRes.error && prodRes.data) setProductos(prodRes.data)
    if (!aliasRes.error && aliasRes.data) {
      const map = new Map<number, string[]>()
      ;(aliasRes.data as any[]).forEach(a => {
        const list = map.get(a.producto_id) ?? []
        list.push(a.alias_tpv)
        map.set(a.producto_id, list)
      })
      setAliasesPorProducto(map)
    }
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
      en_precios_venta: false,
    })
  }

  function startEdit(p: Producto) {
    setEditing(p)
    setCreating(false)
    setForm({ ...p })
    setAtributos([])
    void cargarMermaYAtributos(p)
  }

  /** Carga merma_pct (de producto_formatos) y atributos personalizados
   * (campos_extra_producto_v2) del producto que se está editando. */
  async function cargarMermaYAtributos(p: Producto) {
    if (!p.compra_legacy_id) return
    const compraId = p.compra_legacy_id
    const [fmtRes, attrRes] = await Promise.all([
      supabase.from('producto_formatos').select('merma_pct')
        .eq('producto_id', compraId).eq('es_predeterminado', true).limit(1).maybeSingle(),
      supabase.from('campos_extra_producto_v2').select('campo, valor')
        .eq('producto_compra_id', compraId).order('campo'),
    ])
    if (fmtRes.data?.merma_pct != null) {
      setForm((prev) => ({ ...prev, merma_pct: Number(fmtRes.data!.merma_pct) }))
    }
    if (attrRes.data) {
      setAtributos(attrRes.data.map((a: { campo: string; valor: string }) => ({ campo: a.campo, valor: a.valor })))
    }
  }

function cancelEdit() {
    setEditing(null)
    setCreating(false)
    setForm({})
    setAliasesNuevoSeleccionados(new Set())
  }

  async function save() {
    if (!form.nombre?.trim()) return
    setSaving(true)

    // El tipo lo elige el usuario explicitamente con los botones Venta/Compra/Ambos.
    // Si no esta seteado (caso raro), inferir de los datos de compra disponibles.
    const isVendible = form.es_vendible ?? (editing?.es_vendible ?? true)
    let tipo = form.tipo
    if (!tipo) {
      const hasCompraData = form.proveedor_id != null || (form.precio_compra != null && form.precio_compra > 0)
      if (isVendible && hasCompraData) tipo = 'ambos'
      else if (hasCompraData && !isVendible) tipo = 'compra'
      else tipo = 'venta'
    }

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
      en_precios_venta: form.en_precios_venta ?? false,
    }

    if (editing) {
      payload.activo = form.activo ?? true
    }

    if (creating) {
      if (tipo === 'venta' || tipo === 'ambos') {
        payload.es_vendible = true
        payload.es_producible = true
      } else {
        payload.es_vendible = false
        payload.es_producible = false
      }
      payload.afecta_forecast = tipo !== 'compra'
      const { data: created, error } = await supabase.from('productos_v2').insert(payload).select('id').single()
      if (error) { alert(error.message); setSaving(false); return }

      // Asociar aliases TPV elegidos durante la creación
      if (created?.id && aliasesNuevoSeleccionados.size > 0) {
        const errs: string[] = []
        for (const alias of aliasesNuevoSeleccionados) {
          const { data: r, error: aliasErr } = await supabase.rpc('rpc_crear_alias_y_reprocesar', {
            p_alias_tpv: alias,
            p_producto_id: created.id,
            p_notas: null,
          })
          if (aliasErr) errs.push(`${alias}: ${aliasErr.message}`)
          else if (r && typeof r === 'object' && 'error' in r && (r as { error?: string }).error) {
            errs.push(`${alias}: ${(r as { error: string }).error}`)
          }
        }
        // Refrescar matview de pendientes en background
        void supabase.rpc('rpc_refresh_alias_pendientes')
        if (errs.length > 0) {
          alert(`Producto creado pero hubo errores asociando aliases:\n${errs.join('\n')}`)
        }
      }
    } else if (editing) {
      // Si el nombre cambió, primero llamar a la RPC que auto-crea alias TPV
      // si el nombre viejo aparecía en ventas. Esto preserva el match en
      // futuras importaciones del CSV.
      if (payload.nombre && payload.nombre !== editing.nombre) {
        const { data: r, error: errRen } = await supabase.rpc('rpc_renombrar_producto_con_alias', {
          p_producto_id: editing.id,
          p_nombre_nuevo: payload.nombre,
        })
        if (errRen) { alert(`Error al renombrar: ${errRen.message}`); setSaving(false); return }
        if (r?.error) { alert(`Error al renombrar: ${r.error}`); setSaving(false); return }
        if (r?.alias_creado) {
          alert(
            `✓ Producto renombrado.\n\n` +
            `Se creó automáticamente el alias TPV "${r.alias_tpv_creado}" para preservar el mapeo de ${r.ventas_preservadas} ventas históricas y futuras importaciones del CSV.`
          )
          // Refrescar la materialized view en background
          void supabase.rpc('rpc_refresh_alias_pendientes')
        }
      }
      const { error } = await supabase.from('productos_v2').update(payload).eq('id', editing.id)
      if (error) { alert(error.message); setSaving(false); return }
    }

    // Tras INSERT/UPDATE del producto: el trigger fn_sync_producto_to_compra ya
    // creó/actualizó productos_compra_v2 + producto_formatos predeterminado.
    // Aquí completamos lo que el trigger no toca: merma_pct + atributos extra.
    // Para resolver el id de productos_compra_v2 (compra_legacy_id), recargamos
    // el producto de venta.
    const targetId = editing?.id ?? null
    if (targetId != null) {
      const { data: prodRow } = await supabase
        .from('productos_v2').select('compra_legacy_id').eq('id', targetId).maybeSingle()
      const compraId = prodRow?.compra_legacy_id ?? null
      if (compraId) {
        // Merma
        if (form.merma_pct !== undefined) {
          await supabase.from('producto_formatos')
            .update({ merma_pct: form.merma_pct })
            .eq('producto_id', compraId).eq('es_predeterminado', true)
        }
        // Atributos: borrar todos los que tenía y reinsertar los del form
        await supabase.from('campos_extra_producto_v2')
          .delete().eq('producto_compra_id', compraId)
        const limpios = atributos
          .map((a) => ({ campo: a.campo.trim(), valor: a.valor.trim() }))
          .filter((a) => a.campo && a.valor)
        if (limpios.length > 0) {
          await supabase.from('campos_extra_producto_v2').insert(
            limpios.map((a) => ({
              producto_compra_id: compraId,
              campo: a.campo,
              valor: a.valor,
            })),
          )
        }
      }
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

            {/* Aliases TPV: editor completo al editar; selector de pendientes al crear */}
            {editing && <AliasTpvSection productoId={editing.id} productoNombre={editing.nombre} productoTipo={editing.tipo} />}
            {creating && (form.tipo === 'venta' || form.tipo === 'ambos') && (
              <AliasTpvPickerNuevo
                seleccionados={aliasesNuevoSeleccionados}
                onChange={setAliasesNuevoSeleccionados}
              />
            )}

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
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.en_precios_venta ?? false}
                        onChange={(e) => setForm({ ...form, en_precios_venta: e.target.checked })}
                        className="rounded"
                      />
                      En Precios de Venta
                    </label>
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
                    <label className="text-xs font-medium text-muted-foreground">
                      Precio coste paquete (EUR)
                    </label>
                    <Input
                      type="number" step="0.01" min="0"
                      value={form.precio_compra ?? ''}
                      onChange={(e) => setForm({ ...form, precio_compra: e.target.value ? Number(e.target.value) : null })}
                      placeholder="Precio del paquete completo"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Es el precio de la unidad mínima de compra (caja, palet, lote…).
                    </p>
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
                    <label className="text-xs font-medium text-muted-foreground">
                      Uds / kg / l por paquete
                    </label>
                    <Input
                      type="number" step="any" min="0"
                      value={form.unidades_por_paquete ?? ''}
                      onChange={(e) => setForm({ ...form, unidades_por_paquete: e.target.value ? Number(e.target.value) : null })}
                      placeholder="Ej: 12 (caja de 12 ud), 25 (saco de 25 kg)"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Cuántas unidades / kg / litros vienen en un paquete.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Precio unitario (calculado)
                    </label>
                    <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/30 px-3 py-2 text-sm font-mono">
                      {(() => {
                        const p = form.precio_compra
                        const u = form.unidades_por_paquete
                        if (!p || p <= 0) return <span className="text-muted-foreground">— sin precio —</span>
                        if (!u || u <= 0) return <span className="text-muted-foreground">— sin uds —</span>
                        const pu = p / u
                        return <span className="text-emerald-600 font-semibold">{pu.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                      })()}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      precio paquete ÷ uds por paquete (auto)
                    </p>
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
                    <label className="text-xs font-medium text-muted-foreground">Merma (%)</label>
                    <Input
                      type="number" step="0.01" min="0" max="100"
                      value={form.merma_pct ?? ''}
                      onChange={(e) => setForm({ ...form, merma_pct: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="0"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Pérdida típica al manipular el producto (ej. 5% en kg de carne).
                    </p>
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

                {/* Atributos personalizados */}
                <div className="mt-4 pt-3 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wide">
                      Atributos personalizados
                    </label>
                    <Button
                      type="button" variant="outline" size="sm"
                      onClick={() => setAtributos((prev) => [...prev, { campo: '', valor: '' }])}
                    >
                      <Plus size={12} className="mr-1" /> Añadir
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Cualquier dato extra que no encaje en los campos estándar (ej. origen, lote,
                    trazabilidad, certificación). Se guarda en campos_extra_producto_v2.
                  </p>
                  {atributos.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">— sin atributos —</p>
                  ) : (
                    <div className="space-y-1.5">
                      {atributos.map((a, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            placeholder="Nombre del atributo"
                            value={a.campo}
                            onChange={(e) => setAtributos((prev) => prev.map((x, j) => j === i ? { ...x, campo: e.target.value } : x))}
                            className="max-w-[40%] font-mono text-xs"
                          />
                          <Input
                            placeholder="Valor"
                            value={a.valor}
                            onChange={(e) => setAtributos((prev) => prev.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))}
                          />
                          <Button
                            type="button" variant="outline" size="icon"
                            onClick={() => setAtributos((prev) => prev.filter((_, j) => j !== i))}
                            className="shrink-0"
                            title="Quitar"
                          >
                            <X size={12} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
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
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">P. coste paquete</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Cant. paq.</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">P. unitario</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden xl:table-cell">IVA</th>
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
                      {(() => {
                        const aliases = aliasesPorProducto.get(p.id) ?? []
                        if (aliases.length === 0) return null
                        return (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {aliases.slice(0, 3).map(a => (
                              <span key={a} className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 text-[10px] font-mono" title={`Alias TPV: ${a}`}>
                                {a}
                              </span>
                            ))}
                            {aliases.length > 3 && (
                              <span className="text-[10px] text-muted-foreground self-center">
                                +{aliases.length - 3} más
                              </span>
                            )}
                          </div>
                        )
                      })()}
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
                    <td className="py-3 px-4 text-right hidden md:table-cell font-medium tabular-nums">
                      {p.precio_compra != null
                        ? formatCurrency(p.precio_compra)
                        : <span className="text-muted-foreground font-normal">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right hidden lg:table-cell tabular-nums">
                      {p.unidades_por_paquete != null && p.unidades_por_paquete > 0
                        ? p.unidades_por_paquete.toLocaleString('es-ES')
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right hidden lg:table-cell tabular-nums">
                      {(p.precio_compra != null && p.unidades_por_paquete && p.unidades_por_paquete > 0)
                        ? <span className="text-emerald-600 font-medium">
                            {(p.precio_compra / p.unidades_por_paquete).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                          </span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-3 px-4 hidden xl:table-cell text-muted-foreground text-xs">{p.tipo_iva || '—'}</td>
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
/* ═══════════════════════════════════════════════════════════
   Sub-componente: gestión de Aliases TPV de un producto
   ═══════════════════════════════════════════════════════════ */
interface AliasActivoRow {
  id: number
  alias_tpv: string
  n_ventas_mapeadas: number | null
}
interface AliasCandidatoRow {
  alias_tpv: string
  n_ventas: number
  importe_total: number | null
  origen: 'pendiente' | 'asignado_otro'
  producto_origen_id: number | null
  producto_origen_nombre: string | null
}

function AliasTpvSection({ productoId, productoNombre, productoTipo }: { productoId: number; productoNombre: string; productoTipo: 'venta' | 'compra' | 'ambos' }) {
  // Solo productos de venta o ambos pueden recibir alias TPV
  if (productoTipo === 'compra') {
    return (
      <div className="pt-3 border-t">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Aliases TPV
        </h3>
        <div className="p-3 rounded border border-yellow-500/40 bg-yellow-500/5 text-sm">
          <p className="text-yellow-700">
            Este producto es tipo <strong>Compra</strong>. Las ventas del TPV solo pueden asociarse a productos de tipo <strong>Venta</strong> o <strong>Ambos</strong>.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Si este producto también se vende, cambiá el tipo a <strong>Ambos</strong> arriba y guardá. Después podrás asociar alias TPV.
          </p>
        </div>
      </div>
    )
  }

  const [aliases, setAliases] = useState<AliasActivoRow[]>([])
  const [candidatos, setCandidatos] = useState<AliasCandidatoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [working, setWorking] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => { void loadAll() }, [productoId])

  async function loadAll() {
    setLoading(true)
    const [actRes, pendRes, otrosRes] = await Promise.all([
      supabase
        .from('vw_alias_activos')
        .select('alias_id, alias_tpv, n_ventas_mapeadas')
        .eq('producto_id', productoId)
        .order('n_ventas_mapeadas', { ascending: false, nullsFirst: false }),
      supabase
        .from('vw_alias_pendientes')
        .select('alias_tpv, n_ventas, importe_total')
        .order('n_ventas', { ascending: false }),
      supabase
        .from('vw_alias_activos')
        .select('alias_tpv, producto_id, producto_nombre, n_ventas_mapeadas')
        .neq('producto_id', productoId)
        .order('n_ventas_mapeadas', { ascending: false, nullsFirst: false }),
    ])
    if (actRes.data) {
      setAliases(actRes.data.map((d: any) => ({
        id: d.alias_id,
        alias_tpv: d.alias_tpv,
        n_ventas_mapeadas: d.n_ventas_mapeadas,
      })))
    }
    const candidatos: AliasCandidatoRow[] = []
    if (pendRes.data) {
      ;(pendRes.data as any[]).forEach(d => candidatos.push({
        alias_tpv: d.alias_tpv,
        n_ventas: d.n_ventas,
        importe_total: d.importe_total,
        origen: 'pendiente',
        producto_origen_id: null,
        producto_origen_nombre: null,
      }))
    }
    if (otrosRes.data) {
      ;(otrosRes.data as any[]).forEach(d => candidatos.push({
        alias_tpv: d.alias_tpv,
        n_ventas: d.n_ventas_mapeadas ?? 0,
        importe_total: null,
        origen: 'asignado_otro',
        producto_origen_id: d.producto_id,
        producto_origen_nombre: d.producto_nombre,
      }))
    }
    setCandidatos(candidatos)
    setSeleccionados(new Set())
    setLoading(false)
  }

  // Normaliza para comparar similitud: quita acentos, números prefijo, puntuación
  function norm(s: string): string {
    return s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/^\s*\d+\s*[\.\-:]?\s*/, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function similarityScore(alias: string, producto: string): number {
    const a = norm(alias)
    const p = norm(producto)
    if (a === p) return 100
    if (a.includes(p) || p.includes(a)) return 80
    // Palabras compartidas
    const aWords = new Set(a.split(' ').filter(w => w.length >= 3))
    const pWords = p.split(' ').filter(w => w.length >= 3)
    const shared = pWords.filter(w => aWords.has(w)).length
    if (shared > 0 && pWords.length > 0) return Math.round((shared / pWords.length) * 60)
    return 0
  }

  // Candidatos ordenados: pendientes + asignados a otros productos.
  // Excluimos los que coinciden EXACTO con el nombre del producto.
  const candidatosOrdenados = useMemo(() => {
    const q = search.toLowerCase().trim()
    return candidatos
      .filter(p => p.alias_tpv !== productoNombre)
      .map(p => ({
        ...p,
        score: similarityScore(p.alias_tpv, productoNombre),
      }))
      .filter(p => !q || p.alias_tpv.toLowerCase().includes(q))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.n_ventas - a.n_ventas
      })
  }, [candidatos, productoNombre, search])

  // Pendiente que coincide EXACTO con el nombre del producto
  const matchExactoPendiente = useMemo(
    () => candidatos.find(p => p.alias_tpv === productoNombre && p.origen === 'pendiente'),
    [candidatos, productoNombre]
  )

  function toggle(alias: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(alias)) next.delete(alias)
      else next.add(alias)
      return next
    })
  }

  async function asociarSeleccionados() {
    const lista = Array.from(seleccionados)
    if (lista.length === 0) return

    // Si alguno está asignado a otro producto, confirmar reasignación
    const reasignaciones = lista.filter(alias => {
      const c = candidatos.find(c => c.alias_tpv === alias)
      return c && c.origen === 'asignado_otro'
    })
    if (reasignaciones.length > 0) {
      const detalle = reasignaciones.slice(0, 5).map(alias => {
        const c = candidatos.find(c => c.alias_tpv === alias)
        return `  • '${alias}' está hoy en '${c?.producto_origen_nombre}'`
      }).join('\n')
      if (!confirm(
        `Vas a REASIGNAR ${reasignaciones.length} alias desde otro(s) producto(s):\n\n${detalle}${reasignaciones.length > 5 ? '\n  ...' : ''}\n\nLas ventas históricas se moverán al producto actual. ¿Continuar?`
      )) {
        return
      }
    }

    setWorking(true)
    let okCount = 0
    let movedCount = 0
    let errMsg = ''
    for (const alias of lista) {
      const { data, error } = await supabase.rpc('rpc_crear_alias_y_reprocesar', {
        p_alias_tpv: alias,
        p_producto_id: productoId,
        p_notas: null,
      })
      if (error) { errMsg = error.message; break }
      if (data?.error) { errMsg = data.error; break }
      okCount++
      if (data?.reasignado) movedCount++
    }
    if (errMsg) {
      alert(`Asociados: ${okCount}/${lista.length}. Error: ${errMsg}`)
    }
    void supabase.rpc('rpc_refresh_alias_pendientes')
    setShowPicker(false)
    await loadAll()
    setWorking(false)
  }

  async function eliminar(aliasId: number, aliasTpv: string) {
    if (!confirm(`¿Eliminar el alias TPV "${aliasTpv}"?\n\nLas ventas históricas con este nombre quedarán sin mapear hasta que crees otro alias.`)) return
    setWorking(true)
    const { data, error } = await supabase.rpc('rpc_eliminar_alias_y_revertir', { p_alias_id: aliasId })
    if (error) { alert(`Error: ${error.message}`); setWorking(false); return }
    if (data?.error) { alert(`Error: ${data.error}`); setWorking(false); return }
    void supabase.rpc('rpc_refresh_alias_pendientes')
    await loadAll()
    setWorking(false)
  }

  function colorScore(score: number) {
    if (score >= 80) return 'text-green-500'
    if (score >= 40) return 'text-yellow-500'
    return 'text-muted-foreground'
  }

  return (
    <div className="space-y-2 pt-3 border-t">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Aliases TPV
        </h3>
        <span className="text-[10px] text-muted-foreground">
          Nombres del CSV de ventas que apuntan a este producto
        </span>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Cargando...</div>
      ) : (
        <>
          {/* Chips de aliases ya asociados */}
          <div className="flex flex-wrap gap-2 min-h-[28px]">
            {aliases.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">
                Sin aliases asociados todavía.
              </span>
            ) : (
              aliases.map(a => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 text-xs font-mono"
                >
                  {a.alias_tpv}
                  {a.n_ventas_mapeadas != null && a.n_ventas_mapeadas > 0 && (
                    <span className="text-[10px] opacity-70">
                      {a.n_ventas_mapeadas} ventas
                    </span>
                  )}
                  <button
                    onClick={() => eliminar(a.id, a.alias_tpv)}
                    disabled={working}
                    className="hover:text-red-500 transition"
                    title="Eliminar alias"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Aviso: si hay un alias pendiente con el mismo nombre que el producto,
              significa que hay ventas en CSV con ese nombre exacto pero todavia
              no se reasignaron al producto. Boton para reasignarlas. */}
          {matchExactoPendiente && (
            <div className="flex items-center justify-between gap-2 p-2 rounded border border-yellow-500/40 bg-yellow-500/5 text-xs">
              <span>
                <span className="text-yellow-600 font-medium">{matchExactoPendiente.n_ventas} ventas</span> con el nombre exacto <span className="font-mono">'{matchExactoPendiente.alias_tpv}'</span> aun sin asignar.
              </span>
              <Button
                size="sm" variant="outline"
                onClick={async () => {
                  setWorking(true)
                  await supabase.rpc('rpc_crear_alias_y_reprocesar', {
                    p_alias_tpv: matchExactoPendiente.alias_tpv,
                    p_producto_id: productoId,
                    p_notas: null,
                  })
                  void supabase.rpc('rpc_refresh_alias_pendientes')
                  await loadAll()
                }}
                disabled={working}
              >
                Reasignar
              </Button>
            </div>
          )}

          {/* Botón para abrir el picker */}
          {!showPicker ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPicker(true)}
              disabled={candidatos.filter(p => p.alias_tpv !== productoNombre).length === 0}
            >
              <Plus size={12} className="mr-1" />
              {(() => {
                const realCount = candidatos.filter(p => p.alias_tpv !== productoNombre).length
                return realCount === 0
                  ? 'No hay aliases para asociar'
                  : `Asociar alias TPV (${realCount} disponibles)`
              })()}
            </Button>
          ) : (
            <div className="border rounded-md p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <Input
                  placeholder="Buscar entre los alias pendientes..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="text-sm h-8"
                  autoFocus
                />
                <Button size="sm" variant="ghost" onClick={() => { setShowPicker(false); setSeleccionados(new Set()); setSearch('') }}>
                  Cancelar
                </Button>
              </div>

              <div className="max-h-72 overflow-y-auto border rounded bg-background">
                <table className="w-full text-sm">
                  <tbody>
                    {candidatosOrdenados.length === 0 ? (
                      <tr><td colSpan={3} className="p-3 text-center text-xs text-muted-foreground">
                        No hay coincidencias
                      </td></tr>
                    ) : (
                      candidatosOrdenados.map(p => (
                        <tr
                          key={p.alias_tpv}
                          className={`border-b last:border-0 cursor-pointer hover:bg-muted/30 ${seleccionados.has(p.alias_tpv) ? 'bg-blue-500/5' : ''}`}
                          onClick={() => toggle(p.alias_tpv)}
                        >
                          <td className="p-2 w-8">
                            <input
                              type="checkbox"
                              checked={seleccionados.has(p.alias_tpv)}
                              onChange={() => toggle(p.alias_tpv)}
                              className="rounded"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="p-2 font-mono text-xs">
                            <div>{p.alias_tpv}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {p.score >= 40 && (
                                <span className={`text-[10px] ${colorScore(p.score)}`}>
                                  ✨ {p.score >= 80 ? 'alta similitud' : 'similitud media'}
                                </span>
                              )}
                              {p.origen === 'asignado_otro' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600" title="Click para reasignar a este producto">
                                  Asignado a: {p.producto_origen_nombre} → reasignar
                                </span>
                              )}
                              {p.origen === 'pendiente' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">
                                  pendiente
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-right text-xs text-muted-foreground">
                            {p.n_ventas} ventas
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  {seleccionados.size > 0 ? `${seleccionados.size} seleccionado${seleccionados.size === 1 ? '' : 's'}` : 'Click en una fila o checkbox para seleccionar'}
                </span>
                <Button
                  size="sm"
                  onClick={asociarSeleccionados}
                  disabled={working || seleccionados.size === 0}
                >
                  {working ? 'Asociando...' : `Asociar ${seleccionados.size || ''} alias`}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground">
        Al asociar un alias, las ventas históricas con ese nombre se reasignan a este producto automáticamente.
      </p>
    </div>
  )
}

/* ─── Selector de aliases TPV pendientes para usar AL CREAR un producto ─── */
interface AliasPendienteSimple {
  alias_tpv: string
  n_ventas: number
  importe_total: number | null
}

interface AliasYaAsignado {
  alias_tpv: string
  n_ventas: number
  producto_id: number
  producto_nombre: string
}

function AliasTpvPickerNuevo({
  seleccionados, onChange,
}: { seleccionados: Set<string>; onChange: (s: Set<string>) => void }) {
  const [pendientes, setPendientes] = useState<AliasPendienteSimple[]>([])
  const [yaAsignados, setYaAsignados] = useState<AliasYaAsignado[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mostrarAsignados, setMostrarAsignados] = useState(false)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const [pRes, aRes] = await Promise.all([
        supabase
          .from('vw_alias_pendientes')
          .select('alias_tpv, n_ventas, importe_total')
          .order('n_ventas', { ascending: false }),
        supabase
          .from('vw_alias_activos')
          .select('alias_tpv, producto_id, producto_nombre, n_ventas_mapeadas')
          .order('n_ventas_mapeadas', { ascending: false, nullsFirst: false }),
      ])
      setPendientes((pRes.data ?? []) as AliasPendienteSimple[])
      setYaAsignados(((aRes.data ?? []) as Array<{
        alias_tpv: string; producto_id: number; producto_nombre: string; n_ventas_mapeadas: number | null
      }>).map(a => ({
        alias_tpv: a.alias_tpv,
        producto_id: a.producto_id,
        producto_nombre: a.producto_nombre,
        n_ventas: a.n_ventas_mapeadas ?? 0,
      })))
      setLoading(false)
    })()
  }, [])

  const filtered = pendientes.filter((a) =>
    !search || a.alias_tpv.toLowerCase().includes(search.toLowerCase()),
  )
  const filteredAsignados = yaAsignados.filter((a) =>
    !search || a.alias_tpv.toLowerCase().includes(search.toLowerCase()),
  )

  function toggle(alias: string) {
    const next = new Set(seleccionados)
    if (next.has(alias)) next.delete(alias)
    else next.add(alias)
    onChange(next)
  }

  return (
    <div className="pt-3 border-t">
      <h3 className="text-sm font-semibold uppercase tracking-wide mb-2">
        Aliases TPV pendientes — opcional
      </h3>
      <p className="text-xs text-muted-foreground mb-2">
        Marca los nombres del TPV que correspondan a este producto.
        Se asociarán al guardar; ventas históricas con ese alias se
        atribuirán automáticamente al nuevo producto.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando aliases…</p>
      ) : pendientes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay aliases pendientes.</p>
      ) : (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar alias…"
            className="mb-2 w-full max-w-md px-3 py-1.5 text-sm border rounded-md bg-background"
          />
          {seleccionados.size > 0 && (
            <p className="mb-2 text-xs text-emerald-600 font-medium">
              {seleccionados.size} alias seleccionado{seleccionados.size === 1 ? '' : 's'} para asociar al guardar.
            </p>
          )}
          <div className="max-h-64 overflow-y-auto rounded border divide-y">
            {filtered.slice(0, 100).map((a) => (
              <label
                key={a.alias_tpv}
                className="flex items-center gap-3 px-3 py-1.5 hover:bg-muted/40 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={seleccionados.has(a.alias_tpv)}
                  onChange={() => toggle(a.alias_tpv)}
                />
                <span className="flex-1 font-medium">{a.alias_tpv}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {a.n_ventas.toLocaleString('es-ES')} ventas
                </span>
                {a.importe_total != null && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {Number(a.importe_total).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                  </span>
                )}
              </label>
            ))}
            {filtered.length > 100 && (
              <p className="px-3 py-2 text-xs text-muted-foreground text-center">
                Mostrando 100 de {filtered.length}. Filtra para encontrar más.
              </p>
            )}
          </div>

          {/* Aliases ya asignados a otros productos — colapsable */}
          {filteredAsignados.length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <button
                type="button"
                onClick={() => setMostrarAsignados(!mostrarAsignados)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <span>{mostrarAsignados ? '▾' : '▸'}</span>
                Aliases ya asignados a otro producto ({filteredAsignados.length})
              </button>
              {mostrarAsignados && (
                <>
                  <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/20 rounded px-2 py-1.5">
                    ⚠ Si marcas alguno aquí, las ventas históricas de ese alias se REASIGNARÁN
                    al nuevo producto y se quitarán del producto que las tenía.
                  </p>
                  <div className="mt-2 max-h-48 overflow-y-auto rounded border divide-y bg-muted/10">
                    {filteredAsignados.slice(0, 100).map((a) => (
                      <label
                        key={a.alias_tpv}
                        className="flex items-center gap-3 px-3 py-1.5 hover:bg-muted/40 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={seleccionados.has(a.alias_tpv)}
                          onChange={() => toggle(a.alias_tpv)}
                        />
                        <span className="flex-1 font-medium">{a.alias_tpv}</span>
                        <span className="text-xs text-muted-foreground">
                          → <span className="font-medium text-foreground">{a.producto_nombre}</span>
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {a.n_ventas.toLocaleString('es-ES')}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

