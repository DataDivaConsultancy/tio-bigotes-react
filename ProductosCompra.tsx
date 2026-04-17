import { useState, useEffect, useRef } from 'react'
import { supabase, rpcCall } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, Pencil, Check, X, ShoppingCart, Upload } from 'lucide-react'
import Papa from 'papaparse'

interface ProductoCompra {
  id: number
  nombre: string
  proveedor_id: number | null
  precio_coste: number | null
  unidad_compra: string | null
  cantidad_minima: number | null
  notas: string | null
  activo: boolean
}

interface ProveedorOption {
  id: number
  nombre_comercial: string
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
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<Partial<ProductoCompra>>({})

  useEffect(() => {
    loadProductos()
    loadProveedores()
  }, [showInactive])

  async function loadProveedores() {
    const { data } = await supabase
      .from('proveedores_v2')
      .select('id, nombre_comercial')
      .eq('activo', true)
      .order('nombre_comercial')
    if (data) setProveedores(data)
  }

  async function loadProductos() {
    setLoading(true)
    let query = supabase
      .from('productos_compra_v2')
      .select('id, nombre, proveedor_id, precio_coste, unidad_compra, cantidad_minima, notas, activo')
      .order('nombre')

    if (!showInactive) query = query.eq('activo', true)

    const { data, error } = await query
    if (!error && data) setProductos(data)
    setLoading(false)
  }

  const filtered = productos.filter((p) => {
    const q = search.toLowerCase()
    return p.nombre.toLowerCase().includes(q)
  })

  const proveedorMap = new Map(proveedores.map((pv) => [pv.id, pv.nombre_comercial]))

  function startCreate() {
    setCreating(true)
    setEditing(null)
    setForm({ nombre: '', proveedor_id: undefined, precio_coste: undefined, unidad_compra: '', cantidad_minima: undefined, notas: '', activo: true })
  }

  function startEdit(p: ProductoCompra) {
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

    if (creating) {
      const result = await rpcCall('rpc_crear_producto_compra', {
        p_nombre: form.nombre,
        p_proveedor_id: form.proveedor_id || null,
        p_precio_coste: form.precio_coste ?? null,
        p_unidad_compra: form.unidad_compra || null,
        p_cantidad_minima: form.cantidad_minima ?? null,
        p_notas: form.notas || null,
      })
      if (!result.ok) {
        alert(result.error || 'Error al crear producto')
        setSaving(false)
        return
      }
    } else if (editing) {
      const result = await rpcCall('rpc_actualizar_producto_compra', {
        p_id: editing.id,
        p_nombre: form.nombre,
        p_proveedor_id: form.proveedor_id || null,
        p_precio_coste: form.precio_coste ?? null,
        p_unidad_compra: form.unidad_compra || null,
        p_cantidad_minima: form.cantidad_minima ?? null,
        p_notas: form.notas || null,
        p_activo: form.activo,
      })
      if (!result.ok) {
        alert(result.error || 'Error al actualizar producto')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    cancelEdit()
    loadProductos()
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Record<string, unknown>[]
        const parsed = rows.map((row) => ({
          nombre: String(row.nombre || ''),
          proveedor_id: row.proveedor_id ? Number(row.proveedor_id) : null,
          precio_coste: row.precio_coste ? Number(row.precio_coste) : null,
          unidad_compra: row.unidad_compra ? String(row.unidad_compra) : null,
          cantidad_minima: row.cantidad_minima ? Number(row.cantidad_minima) : null,
        }))

        const result = await rpcCall('rpc_upsert_productos_compra_batch', {
          p_rows: parsed,
        })

        if (!result.ok) {
          alert(result.error || 'Error al importar CSV')
        } else {
          loadProductos()
        }

        setImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      },
      error: () => {
        alert('Error al leer el archivo CSV')
        setImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      },
    })
  }

  const isEditing = creating || editing !== null

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
            <p className="text-sm text-muted-foreground">{filtered.length} productos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCSVImport}
            className="hidden"
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isEditing || importing}>
            {importing ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" /> : <Upload size={16} />}
            Importar CSV
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
            placeholder="Buscar por nombre..."
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
              {creating ? 'Nuevo producto' : `Editando: ${editing?.nombre}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nombre *</label>
                <Input value={form.nombre || ''} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Proveedor</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.proveedor_id ?? ''}
                  onChange={(e) => setForm({ ...form, proveedor_id: e.target.value ? Number(e.target.value) : undefined })}
                >
                  <option value="">— Sin proveedor —</option>
                  {proveedores.map((pv) => (
                    <option key={pv.id} value={pv.id}>{pv.nombre_comercial}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Precio coste (EUR)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.precio_coste ?? ''}
                  onChange={(e) => setForm({ ...form, precio_coste: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Unidad de compra</label>
                <Input
                  value={form.unidad_compra || ''}
                  onChange={(e) => setForm({ ...form, unidad_compra: e.target.value })}
                  placeholder="Ej: kg, caja, ud"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Cantidad mínima</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.cantidad_minima ?? ''}
                  onChange={(e) => setForm({ ...form, cantidad_minima: e.target.value ? Number(e.target.value) : undefined })}
                />
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
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Proveedor</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Precio coste</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Unidad</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Cant. min</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${!p.activo ? 'opacity-50' : ''}`}
                  >
                    <td className="py-3 px-4 font-medium">{p.nombre}</td>
                    <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">
                      {p.proveedor_id ? proveedorMap.get(p.proveedor_id) || '—' : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {p.precio_coste != null ? formatCurrency(p.precio_coste) : '—'}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">{p.unidad_compra || '—'}</td>
                    <td className="py-3 px-4 text-right hidden lg:table-cell text-muted-foreground">{p.cantidad_minima ?? '—'}</td>
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
