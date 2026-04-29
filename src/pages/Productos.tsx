import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, Pencil, Check, X, Package } from 'lucide-react'

interface Producto {
  id: number
  codigo: string
  nombre: string
  categoria: string
  precio_venta: number
  activo: boolean
  unidad_medida: string
  descripcion?: string
}

interface CategoriaProducto {
  id: number
  nombre: string
}

export default function Productos() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategoria, setFilterCategoria] = useState<string>('__all__')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Producto | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<Partial<Producto>>({})

  useEffect(() => {
    loadData()
  }, [showInactive])

  useEffect(() => {
    loadCategorias()
  }, [])

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
    const { data, error } = await supabase
      .from('categorias_producto_v2')
      .select('*')
      .order('nombre')
    if (!error && data) setCategorias(data)
  }

  const filtered = productos.filter((p) => {
    const q = search.toLowerCase()
    const matchesSearch =
      p.nombre.toLowerCase().includes(q) ||
      (p.codigo || '').toLowerCase().includes(q)
    const matchesCategoria =
      filterCategoria === '__all__' ||
      (filterCategoria === '__none__' ? !p.categoria : p.categoria === filterCategoria)
    return matchesSearch && matchesCategoria
  })

  function startCreate() {
    setCreating(true)
    setEditing(null)
    setForm({ codigo: '', nombre: '', categoria: '', precio_venta: 0, unidad_medida: '', descripcion: '' })
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

    const payload = {
      codigo: form.codigo || null,
      nombre: form.nombre,
      categoria: form.categoria || null,
      precio_venta: form.precio_venta ?? 0,
      unidad_medida: form.unidad_medida || null,
      descripcion: form.descripcion || null,
      ...(editing ? { activo: form.activo } : {}),
    }

    if (creating) {
      const { error } = await supabase.from('productos_v2').insert(payload)
      if (error) {
        alert(error.message || 'Error al crear producto')
        setSaving(false)
        return
      }
    } else if (editing) {
      const { error } = await supabase.from('productos_v2').update(payload).eq('id', editing.id)
      if (error) {
        alert(error.message || 'Error al actualizar producto')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    cancelEdit()
    loadData()
  }

  const isEditing = creating || editing !== null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center">
            <Package size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Productos</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} productos{filterCategoria !== '__all__' ? ` · ${filterCategoria === '__none__' ? 'Sin categoría' : filterCategoria}` : ''}</p>
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
            placeholder="Buscar por nombre o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterCategoria}
          onChange={(e) => setFilterCategoria(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="__all__">Todas las categorías</option>
          <option value="__none__">Sin categoría</option>
          {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
        </select>
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
              {creating ? 'Nuevo producto' : `Editando: ${editing?.nombre}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Código</label>
                <Input value={form.codigo || ''} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                <Input value={form.nombre || ''} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Categoría</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.categoria || ''}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value || undefined })}
                >
                  <option value="">— Sin categoría —</option>
                  {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Precio venta</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.precio_venta ?? ''}
                  onChange={(e) => setForm({ ...form, precio_venta: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Unidad de medida</label>
                <Input
                  value={form.unidad_medida || ''}
                  onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })}
                  placeholder="Ej: kg, ud, litro"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Descripción</label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                  value={form.descripcion || ''}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
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
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Código</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Nombre</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Categoría</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Precio</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Unidad</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${!p.activo ? 'opacity-50' : ''}`}
                  >
                    <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{p.codigo || '—'}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{p.nombre}</div>
                      {p.descripcion && <div className="text-xs text-muted-foreground truncate max-w-xs">{p.descripcion}</div>}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {p.categoria && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {p.categoria}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right hidden md:table-cell font-medium">
                      {formatCurrency(p.precio_venta)}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-muted-foreground">{p.unidad_medida || '—'}</td>
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
                      No se encontraron productos
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
