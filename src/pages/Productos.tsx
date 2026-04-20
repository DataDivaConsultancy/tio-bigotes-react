import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, Pencil, Check, X, Package, Upload } from 'lucide-react'

interface Producto {
  id: number
  codigo: string
  nombre: string
  categoria: string
  categoria_id: number | null
  precio_venta: number | null
  activo: boolean
  es_vendible: boolean
  es_producible: boolean
  observaciones: string | null
  // Campos de compra (join con productos_compra_v2)
  compra_id: number | null
  proveedor_id: number | null
  proveedor_nombre: string | null
  precio_coste: number | null
  unidad_medida: string | null
  unidad_minima_compra: number | null
  cod_proveedor: string | null
  cod_interno: string | null
  stock_minimo: number | null
  dia_pedido: string | null
  dia_entrega: string | null
}

interface CategoriaProducto {
  id: number
  nombre: string
}

interface ProveedorOption {
  id: number
  nombre_comercial: string
}

export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [proveedores, setProveedores] = useState<ProveedorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<Producto>>({})
  const [filtroCategoria, setFiltroCategoria] = useState<string>('')

  async function loadData() {
    setLoading(true)

    // Cargar productos de venta
    let query = supabase
      .from('vw_productos_dim')
      .select('id, codigo, nombre, categoria, categoria_id, precio_venta, activo, es_vendible, es_producible, observaciones')
      .order('nombre')

    if (!showInactive) query = query.eq('activo', true)

    const { data: prodData, error: prodError } = await query
    if (prodError) {
      console.error('Error loading productos:', prodError)
      setLoading(false)
      return
    }

    // Cargar datos de compra
    const { data: compraData } = await supabase
      .from('productos_compra_v2')
      .select('id, producto_venta_id, proveedor_id, precio, unidad_medida, unidad_minima_compra, cod_proveedor, cod_interno, stock_minimo, dia_pedido, dia_entrega')

    // Cargar nombres de proveedores
    const { data: provData } = await supabase
      .from('proveedores_v2')
      .select('id, nombre_comercial')
      .order('nombre_comercial')

    if (provData) setProveedores(provData)

    // Crear map de compras por producto_venta_id
    const compraMap: Record<number, any> = {}
    if (compraData) {
      compraData.forEach((c: any) => {
        if (c.producto_venta_id) compraMap[c.producto_venta_id] = c
      })
    }

    // Crear map de proveedores
    const provMap: Record<number, string> = {}
    if (provData) {
      provData.forEach((p: any) => { provMap[p.id] = p.nombre_comercial })
    }

    // Fusionar datos
    const merged: Producto[] = (prodData || []).map((p: any) => {
      const compra = compraMap[p.id] || {}
      return {
        id: p.id,
        codigo: p.codigo || '',
        nombre: p.nombre,
        categoria: p.categoria || '',
        categoria_id: p.categoria_id,
        precio_venta: p.precio_venta,
        activo: p.activo,
        es_vendible: p.es_vendible,
        es_producible: p.es_producible,
        observaciones: p.observaciones,
        compra_id: compra.id || null,
        proveedor_id: compra.proveedor_id || null,
        proveedor_nombre: compra.proveedor_id ? (provMap[compra.proveedor_id] || null) : null,
        precio_coste: compra.precio || null,
        unidad_medida: compra.unidad_medida || null,
        unidad_minima_compra: compra.unidad_minima_compra || null,
        cod_proveedor: compra.cod_proveedor || null,
        cod_interno: compra.cod_interno || null,
        stock_minimo: compra.stock_minimo || null,
        dia_pedido: compra.dia_pedido || null,
        dia_entrega: compra.dia_entrega || null,
      }
    })

    setProductos(merged)
    setLoading(false)
  }

  async function loadCategorias() {
    const { data } = await supabase
      .from('categorias_producto_v2')
      .select('id, nombre')
      .order('nombre')
    if (data) setCategorias(data)
  }

  useEffect(() => { loadData() }, [showInactive])
  useEffect(() => { loadCategorias() }, [])

  const filtered = productos.filter(p => {
    const matchSearch = !search ||
      p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo?.toLowerCase().includes(search.toLowerCase()) ||
      p.proveedor_nombre?.toLowerCase().includes(search.toLowerCase()) ||
      p.cod_proveedor?.toLowerCase().includes(search.toLowerCase())
    const matchCat = !filtroCategoria || p.categoria === filtroCategoria
    return matchSearch && matchCat
  })

  function startCreate() {
    setCreating(true)
    setEditing(null)
    setForm({
      codigo: '',
      nombre: '',
      categoria_id: categorias.length > 0 ? categorias[0].id : undefined,
      precio_venta: 0,
      activo: true,
      proveedor_id: null,
      precio_coste: null,
      unidad_medida: '',
      unidad_minima_compra: null,
      cod_proveedor: '',
      cod_interno: '',
      stock_minimo: null,
      dia_pedido: '',
      dia_entrega: '',
      observaciones: '',
    })
  }

  function startEdit(p: Producto) {
    setEditing(p)
    setCreating(false)
    setForm({
      codigo: p.codigo,
      nombre: p.nombre,
      categoria_id: p.categoria_id,
      precio_venta: p.precio_venta,
      activo: p.activo,
      proveedor_id: p.proveedor_id,
      precio_coste: p.precio_coste,
      unidad_medida: p.unidad_medida,
      unidad_minima_compra: p.unidad_minima_compra,
      cod_proveedor: p.cod_proveedor,
      cod_interno: p.cod_interno,
      stock_minimo: p.stock_minimo,
      dia_pedido: p.dia_pedido,
      dia_entrega: p.dia_entrega,
      observaciones: p.observaciones,
    })
  }

  function cancelEdit() {
    setEditing(null)
    setCreating(false)
    setForm({})
  }

  async function save() {
    if (!form.nombre?.trim()) return
    setSaving(true)

    // 1. Guardar datos de producto (venta)
    const prodPayload: any = {
      codigo: form.codigo || null,
      nombre: form.nombre,
      categoria_id: form.categoria_id || null,
      observaciones: form.observaciones || null,
      ...(editing ? { activo: form.activo } : {}),
    }

    let productoId: number | null = null

    if (creating) {
      const { data, error } = await supabase
        .from('productos_v2')
        .insert(prodPayload)
        .select('id')
        .single()
      if (error) {
        alert(error.message || 'Error al crear producto')
        setSaving(false)
        return
      }
      productoId = data?.id || null
    } else if (editing) {
      productoId = editing.id
      const { error } = await supabase
        .from('productos_v2')
        .update(prodPayload)
        .eq('id', editing.id)
      if (error) {
        alert(error.message || 'Error al actualizar producto')
        setSaving(false)
        return
      }
    }

    // 2. Guardar datos de compra si hay proveedor o precio coste
    const hasCompraData = form.proveedor_id || form.precio_coste || form.unidad_minima_compra ||
                          form.cod_proveedor?.trim() || form.stock_minimo

    if (productoId && hasCompraData) {
      const compraPayload: any = {
        producto_venta_id: productoId,
        proveedor_id: form.proveedor_id || null,
        precio: form.precio_coste ?? null,
        unidad_medida: form.unidad_medida || null,
        unidad_minima_compra: form.unidad_minima_compra ?? null,
        cod_proveedor: form.cod_proveedor || null,
        cod_interno: form.cod_interno || null,
        stock_minimo: form.stock_minimo ?? null,
        dia_pedido: form.dia_pedido || null,
        dia_entrega: form.dia_entrega || null,
        nombre: form.nombre,
        activo: form.activo ?? true,
      }

      const compraId = editing?.compra_id
      if (compraId) {
        // Actualizar registro existente
        const { error } = await supabase
          .from('productos_compra_v2')
          .update(compraPayload)
          .eq('id', compraId)
        if (error) {
          console.error('Error updating compra:', error)
          alert('Producto guardado pero error en datos de compra: ' + error.message)
        }
      } else {
        // Crear nuevo registro de compra
        const { error } = await supabase
          .from('productos_compra_v2')
          .insert(compraPayload)
        if (error) {
          console.error('Error creating compra:', error)
          alert('Producto guardado pero error en datos de compra: ' + error.message)
        }
      }
    }

    setSaving(false)
    cancelEdit()
    loadData()
  }

  const isEditing = creating || editing !== null
  const categoriasUnicas = [...new Set(productos.map(p => p.categoria).filter(Boolean))].sort()

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
            <p className="text-sm text-muted-foreground">{filtered.length} productos</p>
          </div>
        </div>
        <Button onClick={startCreate} disabled={isEditing}>
          <Plus size={16} /> Nuevo producto
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, código o proveedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={filtroCategoria}
          onChange={e => setFiltroCategoria(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categoriasUnicas.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Mostrar inactivos
        </label>
      </div>

      {/* Form */}
      {isEditing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{creating ? 'Nuevo producto' : 'Editar producto'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* --- Datos generales --- */}
              <div className="lg:col-span-3">
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2">Datos generales</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Código</label>
                <Input
                  value={form.codigo || ''}
                  onChange={e => setForm({ ...form, codigo: e.target.value })}
                  placeholder="Ej: EMP-001"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                <Input
                  value={form.nombre || ''}
                  onChange={e => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Nombre del producto"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Categoría</label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  value={form.categoria_id ?? ''}
                  onChange={e => setForm({ ...form, categoria_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Sin categoría</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Observaciones</label>
                <Input
                  value={form.observaciones || ''}
                  onChange={e => setForm({ ...form, observaciones: e.target.value })}
                  placeholder="Notas internas"
                />
              </div>

              {editing && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Activo</label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                    value={form.activo ? 'true' : 'false'}
                    onChange={e => setForm({ ...form, activo: e.target.value === 'true' })}
                  >
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </div>
              )}

              {/* --- Datos de compra --- */}
              <div className="lg:col-span-3 mt-2 pt-3 border-t">
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Datos de compra</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Proveedor</label>
                <select
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  value={form.proveedor_id ?? ''}
                  onChange={e => setForm({ ...form, proveedor_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre_comercial}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Precio coste (EUR)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.precio_coste ?? ''}
                  onChange={e => setForm({ ...form, precio_coste: e.target.value ? Number(e.target.value) : null })}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Unidad de medida</label>
                <Input
                  value={form.unidad_medida || ''}
                  onChange={e => setForm({ ...form, unidad_medida: e.target.value })}
                  placeholder="Ej: kg, unidad, litro"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Compra mínima</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.unidad_minima_compra ?? ''}
                  onChange={e => setForm({ ...form, unidad_minima_compra: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Cantidad mínima"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Ref. proveedor</label>
                <Input
                  value={form.cod_proveedor || ''}
                  onChange={e => setForm({ ...form, cod_proveedor: e.target.value })}
                  placeholder="Código del proveedor"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Código interno</label>
                <Input
                  value={form.cod_interno || ''}
                  onChange={e => setForm({ ...form, cod_interno: e.target.value })}
                  placeholder="Código interno"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Stock mínimo</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.stock_minimo ?? ''}
                  onChange={e => setForm({ ...form, stock_minimo: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Stock mínimo"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Día de pedido</label>
                <Input
                  value={form.dia_pedido || ''}
                  onChange={e => setForm({ ...form, dia_pedido: e.target.value })}
                  placeholder="Ej: Lunes"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Día de entrega</label>
                <Input
                  value={form.dia_entrega || ''}
                  onChange={e => setForm({ ...form, dia_entrega: e.target.value })}
                  placeholder="Ej: Miércoles"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t">
              <Button onClick={save} disabled={saving || !form.nombre?.trim()}>
                <Check size={16} /> {saving ? 'Guardando...' : 'Guardar'}
              </Button>
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                <X size={16} /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package size={40} className="mb-2 opacity-40" />
              <p>No se encontraron productos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Código</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nombre</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Categoría</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Proveedor</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">P. Coste</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Compra mín.</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden xl:table-cell">Ref. Proveedor</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr
                      key={p.id}
                      className={`border-b hover:bg-muted/20 transition-colors ${!p.activo ? 'opacity-50' : ''}`}
                    >
                      <td className="py-3 px-4 text-sm font-mono">{p.codigo || '—'}</td>
                      <td className="py-3 px-4 text-sm font-medium">{p.nombre}</td>
                      <td className="py-3 px-4 text-sm hidden md:table-cell">
                        {p.categoria ? (
                          <span className="inline-block bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                            {p.categoria}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-4 text-sm hidden lg:table-cell">
                        {p.proveedor_nombre || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-3 px-4 text-sm text-right hidden md:table-cell">
                        {p.precio_coste != null ? `${p.precio_coste.toFixed(2)} €` : '—'}
                      </td>
                      <td className="py-3 px-4 text-sm text-center hidden lg:table-cell">
                        {p.unidad_minima_compra != null ? `${p.unidad_minima_compra} ${p.unidad_medida || ''}`.trim() : '—'}
                      </td>
                      <td className="py-3 px-4 text-sm hidden xl:table-cell font-mono">
                        {p.cod_proveedor || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(p)}
                          disabled={isEditing}
                        >
                          <Pencil size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
