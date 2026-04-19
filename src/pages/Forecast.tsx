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
  subtipo: string
  label: string
}

interface VentaDia {
  producto_id: number
  fecha: string
  dia_semana: number
  cantidad: number
}

interface StockDiario {
  producto_id: number
  fecha: string
  resto: number | null
  stock_final: number | null
}

interface ForecastRow {
  producto_id: number
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
const WEEKS_HISTORY = 4
const DAYS_HISTORY = WEEKS_HISTORY * 7

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

function yesterdayStr(): string {
  return daysAgo(1)
}

function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay() // 0=Sun, 6=Sat
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

/* ------------------------------------------------------------------ */
/*  Forecasting engine: weighted day-of-week average                   */
/* ------------------------------------------------------------------ */
function computeForecast(
  ventasByProduct: Map<number, VentaDia[]>,
  targetDayOfWeek: number
): Map<number, number> {
  const forecasts = new Map<number, number>()

  for (const [productoId, ventas] of ventasByProduct) {
    // Filter to same day of week
    const sameDow = ventas.filter(v => v.dia_semana === targetDayOfWeek)

    if (sameDow.length === 0) {
      // Fallback: use overall average
      const total = ventas.reduce((s, v) => s + v.cantidad, 0)
      const avg = ventas.length > 0 ? total / ventas.length : 0
      forecasts.set(productoId, Math.round(avg))
      continue
    }

    // Sort by date descending (most recent first)
    sameDow.sort((a, b) => b.fecha.localeCompare(a.fecha))

    // Weighted average: week 1 (most recent) = weight 4, week 2 = 3, etc.
    let weightedSum = 0
    let weightTotal = 0
    for (let i = 0; i < sameDow.length && i < WEEKS_HISTORY; i++) {
      const weight = WEEKS_HISTORY - i
      weightedSum += sameDow[i].cantidad * weight
      weightTotal += weight
    }

    const forecast = weightTotal > 0 ? weightedSum / weightTotal : 0
    forecasts.set(productoId, Math.round(forecast))
  }

  return forecasts
}

/* ------------------------------------------------------------------ */
/*  Multi-select dropdown component                                    */
/* ------------------------------------------------------------------ */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  getKey,
  getLabel,
}: {
  label: string
  options: { key: number; label: string }[]
  selected: Set<number>
  onChange: (selected: Set<number>) => void
  getKey?: (o: { key: number; label: string }) => number
  getLabel?: (o: { key: number; label: string }) => string
}) {
  const [open, setOpen] = useState(false)

  const toggleItem = (key: number) => {
    const next = new Set(selected)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    onChange(next)
  }

  const selectAll = () => {
    onChange(new Set(options.map(o => o.key)))
  }

  const selectNone = () => {
    onChange(new Set())
  }

  const selectedCount = selected.size
  const summary =
    selectedCount === 0
      ? 'Ninguno seleccionado'
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
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-orange-600 hover:text-orange-800 font-medium"
            >
              Todos
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={selectNone}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              Ninguno
            </button>
          </div>
          {options.map(opt => (
            <label
              key={opt.key}
              className="flex items-center px-3 py-1.5 hover:bg-orange-50 cursor-pointer text-sm"
            >
              <div
                className={`w-4 h-4 rounded border mr-2 flex items-center justify-center shrink-0 ${
                  selected.has(opt.key) ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                }`}
              >
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
  const [ventasMap, setVentasMap] = useState<Map<number, VentaDia[]>>(new Map())
  const [stockMap, setStockMap] = useState<Map<number, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [prodsInitialized, setProdsInitialized] = useState(false)

  /* ---------- Load productos + build category list ---------- */
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('productos_v2')
        .select('id, nombre, categoria_id')
        .eq('visible_en_forecast', true)
        .order('categoria_id')
        .order('orden_visual')

      if (data) {
        setProductos(data)
        // Build category list from products
        const catSet = new Map<number, string>()
        for (const p of data) {
          if (!catSet.has(p.categoria_id)) {
            catSet.set(
              p.categoria_id,
              CATEGORY_LABELS[p.categoria_id] || `Categor\u00eda ${p.categoria_id}`
            )
          }
        }
        const cats: Categoria[] = Array.from(catSet.entries()).map(([id, label]) => ({
          id,
          subtipo: label,
          label,
        }))
        setCategorias(cats)
      }
    }
    load()
  }, [])

  /* ---------- Auto-select all products in selected categories ---------- */
  useEffect(() => {
    if (productos.length === 0) return
    const prodsInCats = productos
      .filter(p => selectedCats.has(p.categoria_id))
      .map(p => p.id)
    setSelectedProds(new Set(prodsInCats))
    if (!prodsInitialized) setProdsInitialized(true)
  }, [selectedCats, productos])

  /* ---------- Available products for multi-select (filtered by category) ---------- */
  const availableProducts = useMemo(() => {
    return productos.filter(p => selectedCats.has(p.categoria_id))
  }, [productos, selectedCats])

  /* ---------- Fetch ventas history + stock data ---------- */
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
      const fromDate = daysAgo(DAYS_HISTORY)
      const yesterday = yesterdayStr()

      // Fetch ventas with pagination
      const allVentas: VentaDia[] = []
      const pageSize = 1000

      for (const prodId of prodIds) {
        let offset = 0
        let hasMore = true
        while (hasMore) {
          const { data, error } = await supabase
            .from('ventas_raw_v2')
            .select('producto_id, fecha, dia_semana, cantidad')
            .eq('producto_id', prodId)
            .gte('fecha', fromDate)
            .lte('fecha', yesterday)
            .range(offset, offset + pageSize - 1)

          if (error || !data) {
            hasMore = false
          } else {
            allVentas.push(...data)
            hasMore = data.length === pageSize
            offset += pageSize
          }
        }
      }

      // Aggregate ventas: sum cantidad per producto_id + fecha
      const aggMap = new Map<string, VentaDia>()
      for (const v of allVentas) {
        const key = `${v.producto_id}_${v.fecha}`
        const existing = aggMap.get(key)
        if (existing) {
          existing.cantidad += v.cantidad
        } else {
          aggMap.set(key, { ...v })
        }
      }

      // Group by producto_id
      const byProduct = new Map<number, VentaDia[]>()
      for (const v of aggMap.values()) {
        if (!byProduct.has(v.producto_id)) byProduct.set(v.producto_id, [])
        byProduct.get(v.producto_id)!.push(v)
      }
      setVentasMap(byProduct)

      // Fetch stock inicial from control_diario (yesterday's resto/stock_final)
      const { data: stockData } = await supabase
        .from('control_diario')
        .select('producto_id, resto, stock_final')
        .eq('fecha', yesterday)
        .in('producto_id', prodIds)

      const sMap = new Map<number, number>()
      if (stockData) {
        for (const s of stockData) {
          const stock = s.resto ?? s.stock_final ?? 0
          sMap.set(s.producto_id, stock)
        }
      }
      setStockMap(sMap)
    } finally {
      setLoading(false)
    }
  }, [selectedProds, forecastDate])

  useEffect(() => {
    if (prodsInitialized) loadData()
  }, [loadData, prodsInitialized])

  /* ---------- Compute forecast results ---------- */
  const forecastRows: ForecastRow[] = useMemo(() => {
    if (ventasMap.size === 0 && !loading) return []

    const targetDow = getDayOfWeek(forecastDate)
    const forecasts = computeForecast(ventasMap, targetDow)

    const rows: ForecastRow[] = []
    for (const prodId of selectedProds) {
      const producto = productos.find(p => p.id === prodId)
      if (!producto) continue

      const prevision = forecasts.get(prodId) || 0
      const stock = stockMap.get(prodId) || 0
      const hornear = Math.max(0, prevision - stock)

      rows.push({
        producto_id: prodId,
        nombre: producto.nombre,
        prevision_venta: prevision,
        stock_inicial: stock,
        prevision_hornear: hornear,
      })
    }

    // Sort by prevision_hornear descending (most to bake first)
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

  /* ---------- Category options for multi-select ---------- */
  const catOptions = useMemo(
    () => categorias.map(c => ({ key: c.id, label: c.label })),
    [categorias]
  )

  /* ---------- Product options for multi-select ---------- */
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
          <p className="text-sm text-gray-500">
            Previsi&oacute;n de demanda y planificaci&oacute;n de horneado
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Category multi-select */}
            <MultiSelect
              label="Categor&iacute;as"
              options={catOptions}
              selected={selectedCats}
              onChange={setSelectedCats}
            />

            {/* Product multi-select */}
            <MultiSelect
              label="Productos"
              options={prodOptions}
              selected={selectedProds}
              onChange={setSelectedProds}
            />

            {/* Forecast date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha previsi&oacute;n
              </label>
              <input
                type="date"
                value={forecastDate}
                onChange={e => setForecastDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
              />
              <p className="text-xs text-gray-400 mt-1">
                {formatDateShort(forecastDate)}
              </p>
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
                <p className="text-sm text-gray-500">Previsi&oacute;n de venta</p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading ? '...' : formatNumber(totals.prevision_venta)} uds
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
                  {loading ? '...' : formatNumber(totals.stock_inicial)} uds
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
                <p className="text-sm text-gray-500">Previsi&oacute;n a hornear</p>
                <p className="text-2xl font-bold text-orange-600">
                  {loading ? '...' : formatNumber(totals.prevision_hornear)} uds
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
            <div className="text-center py-8 text-gray-500">Calculando previsi&oacute;n...</div>
          ) : forecastRows.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Selecciona categor&iacute;as y productos para ver la previsi&oacute;n
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Producto</th>
                    <th className="text-right py-3 px-4 font-semibold text-blue-700">
                      Previsi&oacute;n venta
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-green-700">
                      Stock inicial
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-orange-700">
                      Previsi&oacute;n hornear
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {forecastRows.map(row => (
                    <tr
                      key={row.producto_id}
                      className="border-b hover:bg-orange-50 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-medium text-gray-900">{row.nombre}</td>
                      <td className="py-2.5 px-4 text-right text-blue-600 font-medium">
                        {row.prevision_venta}
                      </td>
                      <td className="py-2.5 px-4 text-right text-green-600 font-medium">
                        {row.stock_inicial}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-orange-600">
                        {row.prevision_hornear}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-gray-50 font-bold">
                    <td className="py-3 px-4 text-gray-900">TOTAL</td>
                    <td className="py-3 px-4 text-right text-blue-700">
                      {totals.prevision_venta}
                    </td>
                    <td className="py-3 px-4 text-right text-green-700">
                      {totals.stock_inicial}
                    </td>
                    <td className="py-3 px-4 text-right text-orange-700">
                      {totals.prevision_hornear}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Algorithm info */}
          {!loading && forecastRows.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
              <strong>Motor de previsi&oacute;n:</strong> Media ponderada por d&iacute;a de la semana
              (Ãºltimas {WEEKS_HISTORY} semanas). Las semanas m&aacute;s recientes tienen mayor peso.
              <br />
              <strong>F&oacute;rmula:</strong> Previsi&oacute;n a hornear = Previsi&oacute;n de venta
              &minus; Stock inicial (m&iacute;nimo 0)
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
