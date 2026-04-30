import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Search, Save, Copy, TrendingUp } from 'lucide-react'

interface PrecioLocal {
  producto_id: number
  producto_nombre: string
  local_id: number
  local_nombre: string
  precio_efectivo: number | null
  tipo_iva: string | null
  origen_precio: string // 'local' | 'base'
  coste_por_unidad: number | null
  margen_bruto: number | null
}

interface Local {
  id: number
  nombre: string
}

interface ProductoRow {
  producto_id: number
  producto_nombre: string
  coste_por_unidad: number | null
  precios: Record<number, {
    precio: number | null
    origen: string
    margen: number | null
  }>
  precio_base: number | null
}

export default function PreciosVenta() {
  const [data, setData] = useState<PrecioLocal[]>([])
  const [locales, setLocales] = useState<Local[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editCells, setEditCells] = useState<Record<string, string>>({}) // "prodId-localId" â value
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [preciosRes, localesRes] = await Promise.all([
      supabase.from('vw_precios_por_local').select('*').order('producto_nombre'),
      supabase.from('locales_compra_v2').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    if (preciosRes.data) setData(preciosRes.data)
    if (localesRes.data) setLocales(localesRes.data)
    setLoading(false)
  }

  // Build matrix: rows = products, columns = locals
  const productMap = new Map<number, ProductoRow>()
  data.forEach(d => {
    if (!productMap.has(d.producto_id)) {
      productMap.set(d.producto_id, {
        producto_id: d.producto_id,
        producto_nombre: d.producto_nombre,
        coste_por_unidad: d.coste_por_unidad,
        precios: {},
        precio_base: null,
      })
    }
    const row = productMap.get(d.producto_id)!
    row.precios[d.local_id] = {
      precio: d.precio_efectivo,
      origen: d.origen_precio,
      margen: d.margen_bruto,
    }
  })

  // Get precio base (from precios_venta where local_id IS NULL)
  // We can derive it: if all locals show 'base' origin, that's the base price
  productMap.forEach(row => {
    const basePrices = Object.values(row.precios).filter(p => p.origen === 'base')
    if (basePrices.length > 0 && basePrices[0].precio != null) {
      row.precio_base = basePrices[0].precio
    }
  })

  let rows = Array.from(productMap.values())
  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter(r => r.producto_nombre.toLowerCase().includes(q))
  }

  function cellKey(prodId: number, localId: number | 'base') {
    return `${prodId}-${localId}`
  }

  function getCellValue(row: ProductoRow, localId: number | 'base') {
    const key = cellKey(row.producto_id, localId)
    if (key in editCells) return editCells[key]
    if (localId === 'base') return row.precio_base?.toString() ?? ''
    const cell = row.precios[localId]
    if (!cell || cell.precio == null) return ''
    // Only show if it's a local-specific price
    if (cell.origen === 'local') return cell.precio.toString()
    return '' // base price inherited, show empty (inherited)
  }

  function setCellValue(prodId: number, localId: number | 'base', value: string) {
    setEditCells({ ...editCells, [cellKey(prodId, localId)]: value })
    setDirty(true)
  }

  function margenColor(margen: number | null | undefined, precio: number | null | undefined) {
    if (margen == null || precio == null || precio === 0) return ''
    const pct = (margen / precio) * 100
    if (pct >= 60) return 'text-green-500'
    if (pct >= 40) return 'text-yellow-500'
    return 'text-red-500'
  }

  async function handleSave() {
    if (!dirty) return
    setSaving(true)

    const updates: { producto_id: number; local_id: number | null; precio: number }[] = []

    for (const [key, val] of Object.entries(editCells)) {
      const [prodIdStr, localIdStr] = key.split('-')
      const prodId = Number(prodIdStr)
      const localId = localIdStr === 'base' ? null : Number(localIdStr)
      const precio = Number(val)

      if (isNaN(precio) || precio < 0) continue

      updates.push({ producto_id: prodId, local_id: localId, precio })
    }

    // Use rpc_set_precio_venta for each update
    let hasError = false
    for (const u of updates) {
      if (u.precio === 0 && u.local_id !== null) {
        // Delete local override (revert to base)
        const { error } = await supabase
          .from('precios_venta')
          .delete()
          .eq('producto_id', u.producto_id)
          .eq('local_id', u.local_id)
          .is('canal', null)
          .is('franja_horaria', null)
        if (error) { hasError = true; break }
      } else {
        const { error } = await supabase.rpc('rpc_set_precio_venta', {
          p_producto_id: u.producto_id,
          p_local_id: u.local_id,
          p_precio: u.precio,
          p_tipo_iva: 'Reducido 10%', // Default for food
        })
        if (error) { hasError = true; alert(error.message); break }
      }
    }

    if (!hasError) {
      setEditCells({})
      setDirty(false)
      await loadData()
    }
    setSaving(false)
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Cargando...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Precios de Venta</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona precios por local. Deja vacÃ­o para heredar el precio base.
          </p>
        </div>
        {dirty && (
          <Button onClick={handleSave} disabled={saving}>
            <Save size={16} className="mr-2" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar producto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Matrix table */}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No hay productos de venta con precios configurados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium sticky left-0 bg-muted/30 min-w-[200px]">
                      Producto
                    </th>
                    <th className="text-right p-3 font-medium w-24">Coste</th>
                    <th className="text-right p-3 font-medium w-28 bg-blue-500/5">
                      Precio Base
                    </th>
                    {locales.map(l => (
                      <th key={l.id} className="text-right p-3 font-medium w-28">
                        {l.nombre}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.producto_id} className="border-b hover:bg-muted/10">
                      <td className="p-3 font-medium sticky left-0 bg-background">
                        {row.producto_nombre}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {row.coste_por_unidad != null
                          ? formatCurrency(row.coste_por_unidad)
                          : 'â'}
                      </td>
                      {/* Precio base */}
                      <td className="p-3 bg-blue-500/5">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={getCellValue(row, 'base')}
                          onChange={e => setCellValue(row.producto_id, 'base', e.target.value)}
                          placeholder="â"
                          className="h-8 text-right text-sm w-24"
                        />
                      </td>
                      {/* Local-specific prices */}
                      {locales.map(l => {
                        const cell = row.precios[l.id]
                        const isLocal = cell?.origen === 'local'
                        const editVal = getCellValue(row, l.id)

                        return (
                          <td key={l.id} className="p-3">
                            <div className="flex flex-col items-end gap-0.5">
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                value={editVal}
                                onChange={e => setCellValue(row.producto_id, l.id, e.target.value)}
                                placeholder={row.precio_base != null
                                  ? `${row.precio_base}`
                                  : 'â'}
                                className={`h-8 text-right text-sm w-24 ${
                                  isLocal ? 'border-blue-400' : ''
                                }`}
                              />
                              {cell?.margen != null && cell.precio != null && (
                                <span className={`text-[10px] font-mono ${
                                  margenColor(cell.margen, cell.precio)
                                }`}>
                                  {((cell.margen / cell.precio) * 100).toFixed(0)}% margen
                                </span>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded border-2 border-blue-400 inline-block" />
          Precio especÃ­fico del local
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded border border-border inline-block" />
          Hereda precio base
        </span>
      </div>
    </div>
  )
}
