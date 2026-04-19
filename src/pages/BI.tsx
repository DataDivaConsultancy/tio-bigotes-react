import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { BarChart3, RefreshCw, Calendar } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts'

interface Local {
  id: number
  nombre: string
}

interface VentaRow {
  id: number
  fecha: string
  producto: string
  local: string
  local_id: number
  cantidad: number
  precio_unitario: number
  importe_total: number
}

interface DailySales {
  fecha: string
  total: number
}

interface ProductoRanking {
  producto: string
  total: number
}

interface LocalSales {
  local: string
  total: number
}

interface ProductBreakdown {
  producto: string
  cantidad: number
  importe: number
  porcentaje: number
}

const COLORS = [
  '#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899',
  '#f59e0b', '#06b6d4', '#84cc16', '#ef4444', '#6366f1',
]

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

function startOfMonth(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function startOfYear(): string {
  const d = new Date()
  return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10)
}

type DatePreset = 'ayer' | '7dias' | '30dias' | 'este_mes' | 'este_ano' | 'personalizado'

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'ayer', label: 'Ayer' },
  { key: '7dias', label: '\u00DAltimos 7 d\u00EDas' },
  { key: '30dias', label: '\u00DAltimos 30 d\u00EDas' },
  { key: 'este_mes', label: 'Este mes' },
  { key: 'este_ano', label: 'Este A\u00F1o' },
  { key: 'personalizado', label: 'Personalizado' },
]

function yesterdayStr(): string {
  return daysAgo(1)
}

function getPresetDates(preset: DatePreset): { desde: string; hasta: string } {
  const yesterday = yesterdayStr()
  switch (preset) {
    case 'ayer':
      return { desde: yesterday, hasta: yesterday }
    case '7dias':
      return { desde: daysAgo(8), hasta: yesterday }
    case '30dias':
      return { desde: daysAgo(30), hasta: yesterday }
    case 'este_mes':
      return { desde: startOfMonth(), hasta: yesterday }
    case 'este_ano':
      return { desde: startOfYear(), hasta: yesterday }
    case 'personalizado':
      return { desde: daysAgo(30), hasta: yesterday }
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function BI() {
  const [datePreset, setDatePreset] = useState<DatePreset>('30dias')
  const [fechaDesde, setFechaDesde] = useState(daysAgo(30))
  const [fechaHasta, setFechaHasta] = useState(todayStr())
  const [locales, setLocales] = useState<Local[]>([])
  const [selectedLocal, setSelectedLocal] = useState<string>('')
  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [loading, setLoading] = useState(true)

  /* ---------- Load locales ---------- */
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('locales_v2')
        .select('id, nombre')
        .order('nombre')
      if (data) setLocales(data)
    }
    load()
  }, [])

  /* ---------- Handle preset change ---------- */
  function handlePresetChange(preset: DatePreset) {
    setDatePreset(preset)
    if (preset !== 'personalizado') {
      const { desde, hasta } = getPresetDates(preset)
      setFechaDesde(desde)
      setFechaHasta(hasta)
    }
  }

  /* ---------- Handle custom date change ---------- */
  function handleCustomDesde(val: string) {
    setDatePreset('personalizado')
    setFechaDesde(val)
  }

  function handleCustomHasta(val: string) {
    setDatePreset('personalizado')
    setFechaHasta(val)
  }

  /* ---------- Fetch ALL ventas with pagination ---------- */
  const loadVentas = useCallback(async () => {
    setLoading(true)
    try {
      const allRows: VentaRow[] = []
      const pageSize = 1000
      let offset = 0
      let hasMore = true

      while (hasMore) {
        let query = supabase
          .from('ventas_raw_v2')
          .select('*')
          .gte('fecha', fechaDesde)
          .lte('fecha', fechaHasta)
          .order('fecha')
          .range(offset, offset + pageSize - 1)

        if (selectedLocal) {
          query = query.eq('local_id', Number(selectedLocal))
        }

        const { data, error } = await query
        if (error || !data) {
          hasMore = false
        } else {
          allRows.push(...data)
          if (data.length < pageSize) {
            hasMore = false
          } else {
            offset += pageSize
          }
        }
      }

      setVentas(allRows)
    } finally {
      setLoading(false)
    }
  }, [fechaDesde, fechaHasta, selectedLocal])

  useEffect(() => {
    loadVentas()
  }, [loadVentas])

  /* ---------- Derived data ---------- */
  const totalImporte = ventas.reduce((s, v) => s + (v.importe_total || 0), 0)
  const numTransacciones = ventas.length
  const ticketMedio = numTransacciones > 0 ? totalImporte / numTransacciones : 0

  // Top producto
  const productoMap = new Map<string, number>()
  ventas.forEach((v) => {
    productoMap.set(v.producto, (productoMap.get(v.producto) || 0) + v.importe_total)
  })
  const topProducto = [...productoMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '\u2014'

  // Chart 1: daily sales
  const dailyMap = new Map<string, number>()
  ventas.forEach((v) => {
    dailyMap.set(v.fecha, (dailyMap.get(v.fecha) || 0) + v.importe_total)
  })
  const dailySales: DailySales[] = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, total]) => ({ fecha, total: Math.round(total * 100) / 100 }))

  // Chart 2: top 10 productos
  const topProductos: ProductoRanking[] = [...productoMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([producto, total]) => ({ producto, total: Math.round(total * 100) / 100 }))

  // Chart 3: ventas por local
  const localMap = new Map<string, number>()
  ventas.forEach((v) => {
    localMap.set(v.local, (localMap.get(v.local) || 0) + v.importe_total)
  })
  const localSales: LocalSales[] = [...localMap.entries()]
    .map(([local, total]) => ({ local, total: Math.round(total * 100) / 100 }))

  // Product breakdown table
  const cantidadMap = new Map<string, number>()
  ventas.forEach((v) => {
    cantidadMap.set(v.producto, (cantidadMap.get(v.producto) || 0) + v.cantidad)
  })
  const productBreakdown: ProductBreakdown[] = [...productoMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([producto, importe]) => ({
      producto,
      cantidad: cantidadMap.get(producto) || 0,
      importe: Math.round(importe * 100) / 100,
      porcentaje: totalImporte > 0 ? Math.round((importe / totalImporte) * 10000) / 100 : 0,
    }))

  /* ---------- Render ---------- */
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
          <BarChart3 size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Business Intelligence</h1>
          <p className="text-muted-foreground text-sm">Analisis de ventas</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          {/* Date preset buttons */}
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => handlePresetChange(p.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  datePreset === p.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date range + local filter */}
          <div className="flex flex-wrap items-end gap-4">
            {datePreset === 'personalizado' && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Desde</label>
                  <input
                    type="date"
                    className="border rounded-md px-3 py-2 text-sm bg-background text-foreground"
                    value={fechaDesde}
                    onChange={(e) => handleCustomDesde(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Hasta</label>
                  <input
                    type="date"
                    className="border rounded-md px-3 py-2 text-sm bg-background text-foreground"
                    value={fechaHasta}
                    onChange={(e) => handleCustomHasta(e.target.value)}
                  />
                </div>
              </>
            )}
            {datePreset !== 'personalizado' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar size={14} />
                <span>{fechaDesde} — {fechaHasta}</span>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Local</label>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background text-foreground"
                value={selectedLocal}
                onChange={(e) => setSelectedLocal(e.target.value)}
              >
                <option value="">Todos los locales</option>
                {locales.map(l => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </select>
            </div>
            <button
              onClick={loadVentas}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Cargando datos...
          </CardContent>
        </Card>
      ) : ventas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay datos de ventas para el periodo seleccionado.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ventas totales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatCurrency(totalImporte)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Transacciones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatNumber(numTransacciones)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ticket medio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatCurrency(ticketMedio)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Top producto</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-foreground truncate">{topProducto}</div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Sales Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ventas diarias</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailySales}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(val: number) => formatCurrency(val)} />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Productos + Ventas por Local */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 productos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topProductos} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="producto" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip formatter={(val: number) => formatCurrency(val)} />
                    <Bar dataKey="total" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ventas por local</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={localSales}
                      dataKey="total"
                      nameKey="local"
                      cx="50%" cy="50%"
                      outerRadius={100}
                      label={({ local, percent }) => `${local} ${(percent * 100).toFixed(0)}%`}
                    >
                      {localSales.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number) => formatCurrency(val)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Product breakdown table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desglose por producto</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Producto</th>
                    <th className="py-2 px-4 font-medium text-right">Cantidad</th>
                    <th className="py-2 px-4 font-medium text-right">Importe</th>
                    <th className="py-2 pl-4 font-medium text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {productBreakdown.slice(0, 20).map((p) => (
                    <tr key={p.producto} className="border-b">
                      <td className="py-2 pr-4 font-medium text-foreground">{p.producto}</td>
                      <td className="py-2 px-4 text-right">{formatNumber(p.cantidad)}</td>
                      <td className="py-2 px-4 text-right">{formatCurrency(p.importe)}</td>
                      <td className="py-2 pl-4 text-right text-muted-foreground">{p.porcentaje}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {productBreakdown.length > 20 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Mostrando 20 de {productBreakdown.length} productos
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
