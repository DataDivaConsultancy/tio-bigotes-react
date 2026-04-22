import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/utils'
import { TrendingUp, Package, Flame, ChevronDown, ChevronUp, Check } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Producto {
  id: number
  nombre: string
  categoria_id: number
}

interface Categoria {
  id: number
  label: string
}

interface VentaDia {
  nombre: string
  fecha: string
  cantidad: number
}

interface ForecastRow {
  nombre: string
  prevision_venta: number
  stock_inicial: number
  prevision_hornear: number
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const CATEGORY_LABELS: Record<number, string> = {
  1: 'Empanada (legacy)',
  40: 'Empanada Cl\u00e1sica',
  41: 'Empanada Premium',
}
const DEFAULT_CATEGORIES = [40, 41]
const WEEKS_HISTORY = 6

/* ------------------------------------------------------------------ */
/*  Date helpers                                                       */
/* ------------------------------------------------------------------ */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function yesterdayStr(): string { return daysAgo(1) }
function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay()
}
function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

/* ------------------------------------------------------------------ */
/*  Forecasting engine: weighted day-of-week average                   */
/*  - Uses last N weeks of same day-of-week                           */
/*  - More recent weeks have higher weight                            */
/*  - Includes recency decay and outlier dampening                    */
/* ------------------------------------------------------------------ */
function computeForecast(
  ventasByProduct: Map<string, VentaDia[]>,
  targetDayOfWeek: number
): Map<string, number> {
  const forecasts = new Map<string, number>()

  for (const [nombre, ventas] of ventasByProduct) {
    // Aggregate by fecha first (sum if multiple rows per day)
    const dailyMap = new Map<string, number>()
    for (const v of ventas) {
      dailyMap.set(v.fecha, (dailyMap.get(v.fecha) || 0) + v.cantidad)
    }

    // Filter to same day of week
    const sameDow: { fecha: string; cantidad: number }[] = []
    for (const [fecha, cantidad] of dailyMap) {
      if (getDayOfWeek(fecha) === targetDayOfWeek) {
        sameDow.push({ fecha, cantidad })
      }
    }

    if (sameDow.length === 0) {
      // Fallback: use overall daily average
      const total = [...dailyMap.values()].reduce((s, v) => s + v, 0)
      const avg = dailyMap.size > 0 ? total / dailyMap.size : 0
      forecasts.set(nombre, Math.round(avg))
      continue
    }

    // Sort by date descending (most recent first)
    sameDow.sort((a, b) => b.fecha.localeCompare(a.fecha))

    // Weighted average: most recent = highest weight
    // Also dampen outliers: clamp to median \u00b1 2*IQR
    const values = sameDow.slice(0, WEEKS_HISTORY).map(v => v.cantidad)
    const sorted = [...values].sort((a, b) => a - b)
    const q1 = sorted[Math.floor(sorted.length * 0.25)]
    const q3 = sorted[Math.floor(sorted.length * 0.75)]
    const iqr = q3 - q1
    const lower = q1 - 2 * iqr
    const upper = q3 + 2 * iqr

    let weightedSum = 0
    let weightTotal = 0
    for (let i = 0; i < values.length; i++) {
      const clamped = Math.max(lower, Math.min(upper, values[i]))
      const weight = WEEKS_HISTORY - i
      weightedSum += clamped * weight
      weightTotal += weight
    }

    const forecast = weightTotal > 0 ? weightedSum / weightTotal : 0
    forecasts.set(nombre, Math.max(0, Math.round(forecast)))
  }

  return forecasts
}

/* ------------------------------------------------------------------ */
/*  Multi-select dropdown                                              */
/* ------------------------------------------------------------------ */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { key: number; label: string }[]
  selected: Set<number>
  onChange: (selected: Set<number>) => void
}) {
  const [open, setOpen] = useState(false)

  const toggleItem = (key: number) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }

  const selectAll = () => onChange(new Set(options.map(o => o.key)))
  const selectNone = () => onChange(new Set())

  const selectedCount = selected.size
  const summary =
    selectedCount === 0
      ? 'Ninguno'
      : selectedCount === options.length
        ? 'Todos seleccionados'
        : `${selectedCount} seleccionado${selectedCount > 1 ? 's' : ''}`

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 border rounded-lg bg-white text-sm hover:border-orange-400 transition-colors"
      >
        <span className="truncate">{summary}</span>
        {open ? <ChevronUp className="w-4 h-4 ml-2 shrink-0" /> : <ChevronDown className="w-4 h-4 ml-2 shrink-0" />}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="flex gap-2 px-3 py-2 border-b bg-gray-50 sticky top-0">
            <button type="button" onClick={selectAll} className="text-xs text-orange-600 hover:text-orange-800 font-medium">
              Todos
            </button>
            <span className="text-gray-300">|</span>
            <button type="button" onClick={selectNone} className="text-xs text-gray-500 hover:text-gray-700 font-medium">
              Ninguno
            </button>
          </div>
          {options.map(opt => (
            <label
              key={opt.key}
              className="flex items-center px-3 py-1.5 hover:bg-orange-50 cursor-pointer text-sm"
            >
              <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center shrink-0 ${
                selected.has(opt.key) ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
              }`}>
                {selected.has(opt.key) && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function Forecast() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [selectedCats, setSelectedCats] = useState<Set<number>>(new Set(DEFAULT_CATEGORIES))
  const [selectedProds, setSelectedProds] = useState<Set<number>>(new Set())
  const [forecastDate, setForecastDate] = useState(todayStr())
  const [ventasMap, setVentasMap] = useState<Map<string, VentaDia[]>>(new Map())
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [prodsInitialized, setProdsInitialized] = useState(false)

  /* ---------- Load productos + build category list ---------- */
  useEffect(() => {
    async function load() {
      // Try visible_en_forecast first, fallback to all
      let { data, error } = await supabase
        .from('productos_v2')
        .select('id, nombre, categoria_id')
        .eq('visible_en_forecast', true)
        .order('categoria_id')
        .order('nombre')

      if (error || !data || data.length === 0) {
        // Fallback: load all active products
        const res = await supabase
          .from('productos_v2')
          .select('id, nombre, categoria_id')
          .order('categoria_id')
          .order('nombre')
        data = res.data
      }

      if (data && data.length > 0) {
        setProductos(data)
        const catSet = new Map<number, string>()
        for (const p of data) {
          if (!catSet.has(p.categoria_id)) {
            catSet.set(p.categoria_id, CATEGORY_LABELS[p.categoria_id] || `Categor\u00eda ${p.categoria_id}`)
          }
        }
        setCategorias(Array.from(catSet.entries()).map(([id, label]) => ({ id, label })))
      }
    }
    load()
  }, [])

  /* ---------- Auto-select products in selected categories ---------- */
  useEffect(() => {
    if (productos.length === 0) return
    const prodsInCats = productos
      .filter(p => selectedCats.has(p.categoria_id))
      .map(p => p.id)
    setSelectedProds(new Set(prodsInCats))
    if (!prodsInitialized) setProdsInitialized(true)
  }, [selectedCats, productos])

  const availableProducts = useMemo(() => {
    return productos.filter(p => selectedCats.has(p.categoria_id))
  }, [productos, selectedCats])

  /* ---------- Fetch ventas using PRODUCT NAME (not producto_id) ---------- */
  const loadData = useCallback(async () => {
    if (selectedProds.size === 0) {
      setVentasMap(new Map())
      setStockMap(new Map())
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const prodIds = Array.from(selectedProds)
      const prodNames = prodIds
        .map(id => productos.find(p => p.id === id)?.nombre)
        .filter(Boolean) as string[]

      const fromDate = daysAgo(WEEKS_HISTORY * 7 + 7)
      const yesterday = yesterdayStr()

      // Fetch ventas by product NAME since producto_id is often null
      const allVentas: VentaDia[] = []
      const pageSize = 1000

      // Fetch all ventas in date range, then filter client-side by name
      let offset = 0
      let hasMore = true
      while (hasMore) {
        const { data, error } = await supabase
          .from('ventas_raw_v2')
          .select('producto, fecha, cantidad')
          .gte('fecha', fromDate)
          .lte('fecha', yesterday)
          .range(offset, offset + pageSize - 1)

        if (error || !data || data.length === 0) {
          hasMore = false
        } else {
          // Filter by product name (case-insensitive)
          const nameSet = new Set(prodNames.map(n => n.toLowerCase()))
          for (const row of data) {
            if (nameSet.has(row.producto.toLowerCase())) {
              allVentas.push({
                nombre: row.producto,
                fecha: row.fecha,
                cantidad: row.cantidad,
              })
            }
          }
          hasMore = data.length === pageSize
          offset += pageSize
        }
      }

      // Group by product name (normalized)
      const byProduct = new Map<string, VentaDia[]>()
      for (const v of allVentas) {
        // Find canonical name from productos list
        const canonical = prodNames.find(n => n.toLowerCase() === v.nombre.toLowerCase()) || v.nombre
        if (!byProduct.has(canonical)) byProduct.set(canonical, [])
        byProduct.get(canonical)!.push({ ...v, nombre: canonical })
      }
      setVentasMap(byProduct)

      // Fetch stock from control_diario
      const { data: stockData } = await supabase
        .from('control_diario')
        .select('producto_id, resto, stock_final')
        .eq('fecha', yesterday)
        .in('producto_id', prodIds)

      const sMap = new Map<string, number>()
      if (stockData) {
        for (const s of stockData) {
          const prod = productos.find(p => p.id === s.producto_id)
          if (prod) {
            const stock = s.resto ?? s.stock_final ?? 0
            sMap.set(prod.nombre, stock)
          }
        }
      }
      setStockMap(sMap)
    } finally {
      setLoading(false)
    }
  }, [selectedProds, forecastDate, productos])

  useEffect(() => {
    if (prodsInitialized) loadData()
  }, [loadData, prodsInitialized])

  /* ---------- Compute forecast ---------- */
  const forecastRows: ForecastRow[] = useMemo(() => {
    if (ventasMap.size === 0 && !loading) return []

    const targetDow = getDayOfWeek(forecastDate)
    const forecasts = computeForecast(ventasMap, targetDow)

    const rows: ForecastRow[] = []
    for (const prodId of selectedProds) {
      const producto = productos.find(p => p.id === prodId)
      if (!producto) continue

      const prevision = forecasts.get(producto.nombre) || 0
      const stock = stockMap.get(producto.nombre) || 0
      const hornear = Math.max(0, prevision - stock)

      rows.push({
        nombre: producto.nombre,
        prevision_venta: prevision,
        stock_inicial: stock,
        prevision_hornear: hornear,
      })
    }

    rows.sort((a, b) => b.prevision_hornear - a.prevision_hornear)
    return rows
  }, [ventasMap, stockMap, forecastDate, selectedProds, productos, loading])

  /* ---------- Totals ---------- */
  const totals = useMemo(() => {
    return forecastRows.reduce(
      (acc, r) => ({
        prevision_venta: acc.prevision_venta + r.prevision_venta,
        stock_inicial: acc.stock_inicial + r.stock_inicial,
        prevision_hornear: acc.prevision_hornear + r.prevision_hornear,
      }),
      { prevision_venta: 0, stock_inicial: 0, prevision_hornear: 0 }
    )
  }, [forecastRows])

  const catOptions = useMemo(
    () => categorias.map(c => ({ key: c.id, label: c.label })),
    [categorias]
  )

  const prodOptions = useMemo(
    () => availableProducts.map(p => ({ key: p.id, label: p.nombre })),
    [availableProducts]
  )

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Forecast</h1>
          <p className="text-sm text-gray-500">{`Previsi\u00f3n de demanda y planificaci\u00f3n de horneado`}</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MultiSelect
              label={`Categor\u00edas`}
              options={catOptions}
              selected={selectedCats}
              onChange={setSelectedCats}
            />
            <MultiSelect
              label="Productos"
              options={prodOptions}
              selected={selectedProds}
              onChange={setSelectedProds}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{`Fecha previsi\u00f3n`}</label>
              <input
                type="date"
                value={forecastDate}
                onChange={e => setForecastDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
              />
              <p className="text-xs text-gray-400 mt-1">{formatDateShort(forecastDate)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{`Previsi\u00f3n de venta`}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : `${formatNumber(totals.prevision_venta, 0)} uds`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Stock inicial</p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : `${formatNumber(totals.stock_inicial, 0)} uds`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Flame className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{`Previsi\u00f3n a hornear`}</p>
                <p className="text-2xl font-bold text-orange-600">
                  {loading ? '...' : `${formatNumber(totals.prevision_hornear, 0)} uds`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Forecast table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detalle por producto</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">{`Calculando previsi\u00f3n\u2026`}</div>
          ) : forecastRows.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {`Selecciona categor\u00edas y productos para ver la previsi\u00f3n`}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Producto</th>
                    <th className="text-right py-3 px-4 font-semibold text-blue-700">{`Previsi\u00f3n venta`}</th>
                    <th className="text-right py-3 px-4 font-semibold text-green-700">Stock inicial</th>
                    <th className="text-right py-3 px-4 font-semibold text-orange-700">{`Previsi\u00f3n hornear`}</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastRows.map(row => (
                    <tr key={row.nombre} className="border-b hover:bg-orange-50 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-gray-900">{row.nombre}</td>
                      <td className="py-2.5 px-4 text-right text-blue-600 font-medium">{row.prevision_venta}</td>
                      <td className="py-2.5 px-4 text-right text-green-600 font-medium">{row.stock_inicial}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-orange-600">{row.prevision_hornear}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-gray-50 font-bold">
                    <td className="py-3 px-4 text-gray-900">TOTAL</td>
                    <td className="py-3 px-4 text-right text-blue-700">{totals.prevision_venta}</td>
                    <td className="py-3 px-4 text-right text-green-700">{totals.stock_inicial}</td>
                    <td className="py-3 px-4 text-right text-orange-700">{totals.prevision_hornear}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {!loading && forecastRows.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
              <strong>{`Motor de previsi\u00f3n:`}</strong>{` Media ponderada por d\u00eda de la semana (\u00faltimas ${WEEKS_HISTORY} semanas). Las semanas m\u00e1s recientes tienen mayor peso. Se aplica control de outliers (IQR).`}
              <br />
              <strong>{`F\u00f3rmula:`}</strong>{` Previsi\u00f3n a hornear = Previsi\u00f3n de venta \u2212 Stock inicial (m\u00ednimo 0)`}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
