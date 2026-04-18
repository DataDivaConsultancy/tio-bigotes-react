import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { ClipboardList, RefreshCw, Save, Plus, Trash2 } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Categoria {
    id: number
    nombre: string
}
interface Producto {
    id: number
    nombre: string
    categoria_id: number
    orden_visual: number
}
interface ControlRow {
    id?: number
    producto_id: number
    producto_nombre: string
    stock_inicial: number
    horneadas: { cantidad: number }[]
    merma: number
    resto: number
    dirty: boolean
}
interface Local {
    id: number
    nombre: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function todayStr() {
    const d = new Date()
    return d.toISOString().slice(0, 10)
}

function yesterdayStr() {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function Operativa() {
    const [locales, setLocales] = useState<Local[]>([])
    const [selectedLocal, setSelectedLocal] = useState<number | null>(null)
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [selectedCategoria, setSelectedCategoria] = useState<number | null>(null)
    const [productos, setProductos] = useState<Producto[]>([])
    const [rows, setRows] = useState<ControlRow[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [savedMsg, setSavedMsg] = useState('')
    const [fecha] = useState(todayStr())

  /* ---------- Load locales ---------- */
  useEffect(() => {
        async function load() {
                const { data } = await supabase
                  .from('locales_v2')
                  .select('id, nombre')
                  .order('nombre')
                if (data && data.length > 0) {
                          setLocales(data)
                          setSelectedLocal(data[0].id)
                }
        }
        load()
      }, [])

  /* ---------- Load categorias ---------- */
  useEffect(() => {
        async function load() {
                const { data } = await supabase
                  .from('categorias_producto_v2')
                  .select('id, nombre')
                  .order('nombre')
                if (data) setCategorias(data)
        }
        load()
      }, [])

  /* ---------- Load productos by category ---------- */
  useEffect(() => {
        if (!selectedCategoria) {
                setProductos([])
                setRows([])
                return
        }
        async function load() {
                const { data } = await supabase
                  .from('productos_v2')
                  .select('id, nombre, categoria_id, orden_visual')
                  .eq('categoria_id', selectedCategoria)
                  .eq('visible_en_control_diario', true)
                  .eq('activo', true)
                  .order('orden_visual')
                  .order('nombre')
                if (data) setProductos(data)
        }
        load()
      }, [selectedCategoria])

  /* ---------- Load control_diario rows for today + yesterday resto ---------- */
  const loadControlData = useCallback(async () => {
        if (!selectedLocal || productos.length === 0) return
        setLoading(true)
        try {
                // Load today's existing data
          const { data: todayData } = await supabase
                  .from('control_diario_v2')
                  .select('*')
                  .eq('local_id', selectedLocal)
                  .eq('fecha', fecha)
                  .in('producto_id', productos.map(p => p.id))

          // Load yesterday's resto to pre-fill stock_inicial
          const { data: yesterdayData } = await supabase
                  .from('control_diario_v2')
                  .select('producto_id, resto')
                  .eq('local_id', selectedLocal)
                  .eq('fecha', yesterdayStr())
                  .in('producto_id', productos.map(p => p.id))

          const yesterdayMap: Record<number, number> = {}
                  if (yesterdayData) {
                            yesterdayData.forEach(r => {
                                        yesterdayMap[r.producto_id] = Number(r.resto) || 0
                                      })
                  }

          const todayMap: Record<number, any> = {}
                  if (todayData) {
                            todayData.forEach(r => { todayMap[r.producto_id] = r })
                  }

          const newRows: ControlRow[] = productos.map(p => {
                    const existing = todayMap[p.id]
                    if (existing) {
                                const horneados = Number(existing.horneados) || 0
                                return {
                                              id: existing.id,
                                              producto_id: p.id,
                                              producto_nombre: p.nombre,
                                              stock_inicial: Number(existing.stock_inicial) || 0,
                                              horneadas: horneados > 0 ? [{ cantidad: horneados }] : [{ cantidad: 0 }],
                                              merma: Number(existing.merma) || 0,
                                              resto: Number(existing.resto) || 0,
                                              dirty: false,
                                }
                    }
                    const stockInicial = yesterdayMap[p.id] || 0
                    return {
                                producto_id: p.id,
                                producto_nombre: p.nombre,
                                stock_inicial: stockInicial,
                                horneadas: [{ cantidad: 0 }],
                                merma: 0,
                                resto: stockInicial,
                                dirty: stockInicial > 0,
                    }
                  })
                setRows(newRows)
              } finally {
                setLoading(false)
        }
      }, [selectedLocal, productos, fecha])

  useEffect(() => {
        loadControlData()
      }, [loadControlData])

  /* ---------- Recalculate resto ---------- */
  function recalcRow(row: ControlRow): ControlRow {
        const totalHorneadas = row.horneadas.reduce((s, h) => s + (h.cantidad || 0), 0)
        return { ...row, resto: row.stock_inicial + totalHorneadas - row.merma, dirty: true }
  }

  /* ---------- Update handlers ---------- */
  function updateStockInicial(idx: number, val: string) {
        setRows(prev => prev.map((r, i) =>
                i === idx ? recalcRow({ ...r, stock_inicial: Number(val) || 0 }) : r
                                     ))
  }

  function updateHorneada(rowIdx: number, hIdx: number, val: string) {
        setRows(prev => prev.map((r, i) => {
                if (i !== rowIdx) return r
                const horneadas = [...r.horneadas]
                horneadas[hIdx] = { cantidad: Number(val) || 0 }
                return recalcRow({ ...r, horneadas })
              }))
  }

  function addHorneada(rowIdx: number) {
        setRows(prev => prev.map((r, i) =>
                i === rowIdx ? { ...r, horneadas: [...r.horneadas, { cantidad: 0 }] } : r
                                     ))
  }

  function removeHorneada(rowIdx: number, hIdx: number) {
        setRows(prev => prev.map((r, i) => {
                if (i !== rowIdx || r.horneadas.length <= 1) return r
                const horneadas = r.horneadas.filter((_, j) => j !== hIdx)
                return recalcRow({ ...r, horneadas })
              }))
  }

  function updateMerma(idx: number, val: string) {
        setRows(prev => prev.map((r, i) =>
                i === idx ? recalcRow({ ...r, merma: Number(val) || 0 }) : r
                                     ))
  }

  /* ---------- Save ---------- */
  async function handleSave() {
        if (!selectedLocal) return
        setSaving(true)
        setSavedMsg('')
        try {
                const dirtyRows = rows.filter(r => r.dirty)
                if (dirtyRows.length === 0) {
                          setSavedMsg('No hay cambios para guardar.')
                          return
                }

          let savedCount = 0
                let errorCount = 0

          for (const row of dirtyRows) {
                    const totalHorneadas = row.horneadas.reduce((s, h) => s + (h.cantidad || 0), 0)
                    const payload = {
                                local_id: selectedLocal,
                                fecha,
                                producto_id: row.producto_id,
                                stock_inicial: row.stock_inicial,
                                horneados: totalHorneadas,
                                merma: row.merma,
                                resto: row.resto,
                    }

                  if (row.id) {
                              // Update existing
                      const { error } = await supabase
                                .from('control_diario_v2')
                                .update(payload)
                                .eq('id', row.id)
                              if (error) { errorCount++; console.error(error) }
                              else savedCount++
                            } else {
                              // Insert new
                      const { error } = await supabase
                                .from('control_diario_v2')
                                .insert(payload)
                              if (error) { errorCount++; console.error(error) }
                              else savedCount++
                  }
          }

          // Mark all as not dirty
          setRows(prev => prev.map(r => ({ ...r, dirty: false })))
                await loadControlData()

          if (errorCount > 0) {
                    setSavedMsg(`Guardado con ${errorCount} error(es). ${savedCount} filas guardadas.`)
                  } else {
                    setSavedMsg(`Guardado correctamente: ${savedCount} producto(s).`)
          }
              } finally {
                setSaving(false)
                setTimeout(() => setSavedMsg(''), 4000)
        }
  }

  /* ---------- Render ---------- */
  const hasDirty = rows.some(r => r.dirty)

  return (
        <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
                                                    <ClipboardList size={20} className="text-white" />
                                                  </div>
                                      <div>
                                                    <h1 className="text-2xl font-bold text-foreground">Control Diario</h1>
                                                    <p className="text-muted-foreground text-sm">{formatDate(new Date(), 'long')}</p>
                                                  </div>
                                    </div>
                          <div className="flex items-center gap-2">
                                      <Button variant="outline" size="sm" onClick={loadControlData} disabled={loading}>
                                                    <RefreshCw size={16} className={loading ? 'animate-spin mr-1' : 'mr-1'} />
                                                    Actualizar
                                                  </Button>
                                      <Button size="sm" onClick={handleSave} disabled={saving || !hasDirty}
                                                    className="bg-green-600 hover:bg-green-700 text-white">
                                                    <Save size={16} className="mr-1" />
                                                    {saving ? 'Guardando...' : 'Guardar'}
                                                  </Button>
                                    </div>
                        </div>

                {savedMsg && (
                  <div className={`p-3 rounded-lg text-sm font-medium ${
                              savedMsg.includes('error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                            }`}>
                              {savedMsg}
                            </div>
                )}

                {/* Filters */}
                <Card>
                          <CardContent className="pt-4 pb-4">
                                      <div className="flex flex-wrap items-end gap-4">
                                                    <div>
                                                                    <label className="text-sm font-medium text-muted-foreground mb-1 block">Local</label>
                                                                    <select
                                                                                      className="border rounded-md px-3 py-2 text-sm bg-background"
                                                                                      value={selectedLocal ?? ''}
                                                                                      onChange={e => setSelectedLocal(Number(e.target.value) || null)}
                                                                                    >
                                                                                      {locales.map(l => (
                                                                                                        <option key={l.id} value={l.id}>{l.nombre}</option>
                                                                                                      ))}
                                                                                    </select>
                                                                  </div>
                                                    <div>
                                                                    <label className="text-sm font-medium text-muted-foreground mb-1 block">Categoría</label>
                                                                    <select
                                                                                      className="border rounded-md px-3 py-2 text-sm bg-background"
                                                                                      value={selectedCategoria ?? ''}
                                                                                      onChange={e => setSelectedCategoria(Number(e.target.value) || null)}
                                                                                    >
                                                                                      <option value="">Seleccionar categoría...</option>
                                                                                      {categorias.map(c => (
                                                                                                        <option key={c.id} value={c.id}>{c.nombre}</option>
                                                                                                      ))}
                                                                                    </select>
                                                                  </div>
                                                  </div>
                                    </CardContent>
                        </Card>

                {/* Control Table */}
                {!selectedCategoria ? (
                  <Card>
                              <CardContent className="py-12 text-center text-muted-foreground">
                                            Seleccioná una categoría para ver los productos.
                                          </CardContent>
                            </Card>
                ) : loading ? (
                  <Card>
                              <CardContent className="py-12 text-center text-muted-foreground">
                                            Cargando...
                                          </CardContent>
                            </Card>
                ) : rows.length === 0 ? (
                  <Card>
                              <CardContent className="py-12 text-center text-muted-foreground">
                                            No hay productos visibles en control diario para esta categoría.
                                          </CardContent>
                            </Card>
                ) : (
                  <Card>
                              <CardHeader className="pb-2">
                                            <CardTitle className="text-lg">
                                                            {categorias.find(c => c.id === selectedCategoria)?.nombre ?? 'Productos'}
                                                          </CardTitle>
                                          </CardHeader>
                              <CardContent className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                            <thead>
                                                                              <tr className="border-b text-left text-muted-foreground">
                                                                                                  <th className="py-2 pr-2 font-medium min-w-[180px]">Producto</th>
                                                                                                  <th className="py-2 px-2 font-medium text-center w-[90px]">Stock Ini.</th>
                                                                                                  <th className="py-2 px-2 font-medium text-center min-w-[200px]">Horneadas</th>
                                                                                                  <th className="py-2 px-2 font-medium text-center w-[90px]">Merma</th>
                                                                                                  <th className="py-2 px-2 font-medium text-center w-[90px] bg-gray-50">Resto</th>
                                                                                                </tr>
                                                                            </thead>
                                                            <tbody>
                                                                              {rows.map((row, rowIdx) => {
                                      const totalH = row.horneadas.reduce((s, h) => s + (h.cantidad || 0), 0)
                                      return (
                                                            <tr key={row.producto_id} className={`border-b ${row.dirty ? 'bg-yellow-50/50' : ''}`}>
                                                                                    <td className="py-2 pr-2 font-medium text-foreground">
                                                                                                              {row.producto_nombre}
                                                                                                            </td>
                                                                                    <td className="py-2 px-2">
                                                                                                              <Input
                                                                                                                                          type="number"
                                                                                                                                          min={0}
                                                                                                                                          className="w-20 text-center mx-auto"
                                                                                                                                          value={row.stock_inicial || ''}
                                                                                                                                          onChange={e => updateStockInicial(rowIdx, e.target.value)}
                                                                                                                                          placeholder="0"
                                                                                                                                        />
                                                                                                            </td>
                                                                                    <td className="py-2 px-2">
                                                                                                              <div className="flex flex-wrap items-center gap-1">
                                                                                                                                          {row.horneadas.map((h, hIdx) => (
                                                                                          <div key={hIdx} className="flex items-center gap-0.5">
                                                                                                                          <span className="text-xs text-muted-foreground">H{hIdx + 1}</span>
                                                                                                                          <Input
                                                                                                                                                            type="number"
                                                                                                                                                            min={0}
                                                                                                                                                            className="w-16 text-center"
                                                                                                                                                            value={h.cantidad || ''}
                                                                                                                                                            onChange={e => updateHorneada(rowIdx, hIdx, e.target.value)}
                                                                                                                                                            placeholder="0"
                                                                                                                                                          />
                                                                                                                          {row.horneadas.length > 1 && (
                                                                                                                            <button
                                                                                                                                                                onClick={() => removeHorneada(rowIdx, hIdx)}
                                                                                                                                                                className="text-red-400 hover:text-red-600 p-0.5"
                                                                                                                                                              >
                                                                                                                                                                <Trash2 size={12} />
                                                                                                                                                              </button>
                                                                                                                          )}
                                                                                                                        </div>
                                                                                        ))}
                                                                                                                                          <button
                                                                                                                                                                        onClick={() => addHorneada(rowIdx)}
                                                                                                                                                                        className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                                                                                                                                                                        title="Agregar horneada"
                                                                                                                                                                      >
                                                                                                                                                                        <Plus size={14} />
                                                                                                                                                                      </button>
                                                                                                                                          {totalH > 0 && (
                                                                                          <span className="text-xs font-semibold text-green-700 ml-1">= {totalH}</span>
                                                                                        )}
                                                                                                                                        </div>
                                                                                                            </td>
                                                                                    <td className="py-2 px-2">
                                                                                                              <Input
                                                                                                                                          type="number"
                                                                                                                                          min={0}
                                                                                                                                          className="w-20 text-center mx-auto"
                                                                                                                                          value={row.merma || ''}
                                                                                                                                          onChange={e => updateMerma(rowIdx, e.target.value)}
                                                                                                                                          placeholder="0"
                                                                                                                                        />
                                                                                                            </td>
                                                                                    <td className="py-2 px-2 bg-gray-50">
                                                                                                              <div className={`text-center font-bold text-lg ${
                                                                                        row.resto < 0 ? 'text-red-600' : row.resto > 0 ? 'text-green-700' : 'text-muted-foreground'
                                                                                      }`}>
                                                                                                                                          {row.resto}
                                                                                                                                        </div>
                                                                                                            </td>
                                                                                  </tr>
                                                          )
                                    })}
                                                                            </tbody>
                                                            <tfoot>
                                                                              <tr className="border-t-2 font-bold">
                                                                                                  <td className="py-2 pr-2">TOTALES</td>
                                                                                                  <td className="py-2 px-2 text-center">
                                                                                                                        {rows.reduce((s, r) => s + r.stock_inicial, 0)}
                                                                                                                      </td>
                                                                                                  <td className="py-2 px-2 text-center">
                                                                                                                        {rows.reduce((s, r) => s + r.horneadas.reduce((sh, h) => sh + (h.cantidad || 0), 0), 0)}
                                                                                                                      </td>
                                                                                                  <td className="py-2 px-2 text-center">
                                                                                                                        {rows.reduce((s, r) => s + r.merma, 0)}
                                                                                                                      </td>
                                                                                                  <td className="py-2 px-2 text-center bg-gray-50 text-lg">
                                                                                                                        {rows.reduce((s, r) => s + r.resto, 0)}
                                                                                                                      </td>
                                                                                                </tr>
                                                                            </tfoot>
                                                          </table>
                                          </CardContent>
                            </Card>
                )}
              </div>
      )
}
