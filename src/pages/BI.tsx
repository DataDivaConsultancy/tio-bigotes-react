import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { BarChart3, RefreshCw } from 'lucide-react'
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

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function BI() {
  const [fechaDesde, setFechaDesde] = useState(daysAgo(30))
  const [fechaHasta, setFechaHasta] = useState(todayStr())
  const [locales, setLocales] = useState<Local[]>([])
  const [selectedLocal, setSelectedLocal] = useState<string>('')
  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [loading, setLoading] = useState(true)

  // ── Load locales ──
  useEffect(() => {
    async function loadLocales() {
      const { data, error } = await supabase
        .from('locales_v2')
        .select('id, nombre')
        .order('nombre')
      if (!error && data) setLocales(data)
    }
    loadLocales()
  }, [])

  // ── Load ventas ──
  useEffect(() => {
    loadVentas()
  }, [fechaDesde, fechaHasta, selectedLocal])

  async function loadVentas() {
    setLoading(true)
    let query = supabase
      .from('ventas_raw_v2')
      .select('*')
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('fecha')
      .limit(50000)

    if (selectedLocal) {
      query = query.eq('local_id', Number(selectedLocal))
    }

    const { data, error } = await query
    if (!error && data) setVentas(data)
    setLoading(false)
  }

  // ── Derived data ──
  const totalImporte = ventas.reduce((s, v) => s + (v.importe_total || 0), 0)
  const ticketsUnicos = new Set(ventas.map((v: any) => v.ticket_numero)).size
  const numTransacciones = ticketsUnicos
  const ticketMedio = numTransacciones > 0 ? totalImporte / numTransacciones : 0

  // Top producto
  const productoMap = new Map<string, number>()
  ventas.forEach((v) => {
    productoMap.set(v.producto, (productoMap.get(v.producto) || 0) + v.importe_total)
  })
  const topProducto = [...productoMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
          <BarChart3 size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Business Intelligence</h1>
          <p className="text-muted-foreground text-sm">Análisis de ventas</p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-4">
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
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground">Local:</label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-background text-foreground"
            value={selectedLocal}
            onChange={(e) => setSelectedLocal(e.target.value)}
          >
            <option value="">Todos</option>
            {locales.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalImporte)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Nº transacciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{formatNumber(numTransacciones, 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ticket medio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(ticketMedio)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top producto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-foreground truncate" title={topProducto}>{topProducto}</p>
          </CardContent>
        </Card>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw size={20} className="animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Cargando datos…</span>
        </div>
      )}

      {!loading && ventas.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No hay datos en el rango seleccionado.</p>
      )}

      {!loading && ventas.length > 0 && (
        <>
          {/* ── Chart 1: Ventas por día ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ventas por día</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailySales}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="fecha"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Importe']}
                      labelFormatter={(label: string) => formatDate(label)}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke={COLORS[0]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ── Charts row: Bar + Pie ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Chart 2: Top 10 productos */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 productos por importe</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProductos} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="producto"
                        width={120}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), 'Importe']} />
                      <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                        {topProductos.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Chart 3: Ventas por local */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ventas por local</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={localSales}
                        dataKey="total"
                        nameKey="local"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ local, percent }: { local: string; percent: number }) =>
                          `${local} ${(percent * 100).toFixed(0)}%`
                        }
                        labelLine
                      >
                        {localSales.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [formatCurrency(value), 'Importe']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Product breakdown table ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desglose por producto</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4">Producto</th>
                      <th className="py-2 pr-4 text-right">Cantidad total</th>
                      <th className="py-2 pr-4 text-right">Importe total</th>
                      <th className="py-2 text-right">% del total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productBreakdown.map((row) => (
                      <tr key={row.producto} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2 pr-4 font-medium">{row.producto}</td>
                        <td className="py-2 pr-4 text-right">{formatNumber(row.cantidad, 0)}</td>
                        <td className="py-2 pr-4 text-right">{formatCurrency(row.importe)}</td>
                        <td className="py-2 text-right">{formatNumber(row.porcentaje)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
