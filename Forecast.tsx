import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

interface Producto {
  id: number
  nombre: string
  codigo: string
}

interface VentaRow {
  fecha: string
  cantidad: number
  importe_total: number
}

interface ChartPoint {
  fecha: string
  actual: number | null
  ma7: number | null
  ma30: number | null
  forecast?: number | null
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Compute simple moving average over a numeric array
function movingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null
    const slice = values.slice(i - window + 1, i + 1)
    return slice.reduce((s, v) => s + v, 0) / window
  })
}

export default function Forecast() {
  const [fechaDesde, setFechaDesde] = useState(daysAgo(90))
  const [fechaHasta, setFechaHasta] = useState(todayStr())
  const [productos, setProductos] = useState<Producto[]>([])
  const [selectedProducto, setSelectedProducto] = useState<string>('')
  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadProductos() {
      const { data, error } = await supabase
        .from('vw_productos_dim')
        .select('id, nombre, codigo')
        .eq('activo', true)
        .order('nombre')
      if (!error && data) setProductos(data)
    }
    loadProductos()
  }, [])

  useEffect(() => {
    if (!selectedProducto) {
      setVentas([])
      return
    }
    loadVentas()
  }, [selectedProducto, fechaDesde, fechaHasta])

  async function loadVentas() {
    setLoading(true)
    const { data, error } = await supabase
      .from('ventas_raw_v2')
      .select('fecha, cantidad, importe_total')
      .eq('producto_id', Number(selectedProducto))
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('fecha')

    if (!error && data) setVentas(data)
    setLoading(false)
  }

  const dailyMap = new Map<string, number>()
  ventas.forEach((v) => {
    dailyMap.set(v.fecha, (dailyMap.get(v.fecha) || 0) + v.cantidad)
  })

  const allDates: string[] = []
  if (dailyMap.size > 0) {
    const sortedDates = [...dailyMap.keys()].sort()
    let current = sortedDates[0]
    const end = sortedDates[sortedDates.length - 1]
    while (current <= end) {
      allDates.push(current)
      current = addDays(current, 1)
    }
  }

  const dailyValues = allDates.map((d) => dailyMap.get(d) || 0)
  const ma7 = movingAverage(dailyValues, 7)
  const ma30 = movingAverage(dailyValues, 30)

  const chartData: ChartPoint[] = allDates.map((fecha, i) => ({
    fecha,
    actual: dailyValues[i],
    ma7: ma7[i] !== null ? Math.round(ma7[i]! * 100) / 100 : null,
    ma30: ma30[i] !== null ? Math.round(ma30[i]! * 100) / 100 : null,
  }))

  const validMa30 = ma30.filter((v): v is number => v !== null)
  let forecastPoints: ChartPoint[] = []

  if (validMa30.length >= 2) {
    const recent = validMa30.slice(-7)
    const slope =
      recent.length >= 2
        ? (recent[recent.length - 1] - recent[0]) / (recent.length - 1)
        : 0
    const lastMa30 = validMa30[validMa30.length - 1]
    const lastDate = allDates[allDates.length - 1]

    for (let i = 1; i <= 7; i++) {
      const forecastDate = addDays(lastDate, i)
      const forecastValue = Math.max(0, Math.round((lastMa30 + slope * i) * 100) / 100)
      forecastPoints.push({
        fecha: forecastDate,
        actual: null,
        ma7: null,
        ma30: null,
        forecast: forecastValue,
      })
    }
  }

  const fullChartData = [...chartData, ...forecastPoints]

  const promedioDiario = dailyValues.length > 0
    ? dailyValues.reduce((s, v) => s + v, 0) / dailyValues.length
    : 0

  let tendencia: 'up' | 'down' | 'stable' = 'stable'
  if (validMa30.length >= 6) {
    const thirdLen = Math.floor(validMa30.length / 3)
    const firstThird = validMa30.slice(0, thirdLen)
    const lastThird = validMa30.slice(-thirdLen)
    const avgFirst = firstThird.reduce((s, v) => s + v, 0) / firstThird.length
    const avgLast = lastThird.reduce((s, v) => s + v, 0) / lastThird.length
    const pctChange = ((avgLast - avgFirst) / avgFirst) * 100
    if (pctChange > 5) tendencia = 'up'
    else if (pctChange < -5) tendencia = 'down'
  }

  const forecastSemana = forecastPoints.length > 0
    ? forecastPoints.reduce((s, p) => s + (p.forecast || 0), 0)
    : 0

  const TrendIcon = tendencia === 'up' ? TrendingUp : tendencia === 'down' ? TrendingDown : Minus
  const trendColor = tendencia === 'up' ? 'text-green-600' : tendencia === 'down' ? 'text-red-600' : 'text-yellow-600'
  const trendLabel = tendencia === 'up' ? 'Al alza' : tendencia === 'down' ? 'A la baja' : 'Estable'

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center">
          <TrendingUp size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Forecast</h1>
          <p className="text-muted-foreground text-sm">Previsión de demanda</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground">Producto:</label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-background text-foreground min-w[200px]"
            value={selectedProducto}
            onChange={(e) => setSelectedProducto(e.target.value)}
          >
            <option value="">Seleccionar producto…</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground">Desde:</label>
          <input
            type="date"
            className="border rounded-md px-3 py-2 text-sm bg-background text-foreground"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground">Hasta:</label>
          <input
            type="date"
            className="border rounded-md px-3 py-2 text-sm bg-background text-foreground"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </div>
      </div>

      {!selectedProducto && (
        <p className="text-center text-muted-foreground py-12">
          Selecciona un producto para ver su forecast.
        </p>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={20} className="animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Cargando datos…</span>
        </div>
      )}

      {selectedProducto && !loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Promedio diario
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">
                  {formatNumber(promedioDiario)} uds
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Tendencia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <TrendIcon size={24} className={trendColor} />
                  <p className={`text-2xl font-bold ${trendColor}`}>{trendLabel}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Forecast próxima semana
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-purple-600">
                  {forecastPoints.length > 0 ? `${formatNumber(forecastSemana, 0)} uds` : '—'}
                </p>
              </CardContent>
            </Card>
          </div>

          {dailyValues.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ventas diarias y medias móviles</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={fullChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: string) => v.slice(5)}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        labelFormatter={(label: string) => label}
                        formatter={(value: number | null, name: string) => {
                          if (value === null) return ['—', name]
                          const labels: Record<string, string> = {
                            actual: 'Venta real',
                            ma7: 'MM 7 días',
                            ma30: 'MM 30 días',
                            forecast: 'Forecast',
                          }
                          return [formatNumber(value), labels[name] || name]
                        }}
                      />
                      <Legend
                        formatter={(value: string) => {
                          const labels: Record<string, string> = {
                            actual: 'Venta real',
                            ma7: 'MM 7 días',
                            ma30: 'MM 30 días',
                            forecast: 'Forecast',
                          }
                          return labels[value] || value
                        }}
                      />
                      <Line type="monotone" dataKey="actual" stroke="#94a3b8" strokeWidth={1} dot={false} connectNulls={false} />
                      <Line type="monotone" dataKey="ma7" stroke="#f97316" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="ma30" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="forecast" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#8b5cf6' }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No hay datos de ventas para este producto en el rango seleccionado.
            </p>
          )}
        </>
      )}
    </div>
  )
}
