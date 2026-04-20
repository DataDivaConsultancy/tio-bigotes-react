import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { BarChart3, RefreshCw, ChevronDown, X } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts'

/* ââ Types ââ */
interface Local { id: number; nombre: string }
interface Categoria { id: number; nombre: string }
interface ProductoCat { id: number; nombre: string; categoria_id: number | null }

interface VentaRow {
  fecha: string
  local_nombre: string
  local_id: number
  ticket_numero: string
  producto: string
  producto_id: number | null
  cantidad: number
  importe_total: number
  precio_unitario: number
}

interface DailySales { fecha: string; total: number }
interface ProductoRanking { producto: string; total: number }
interface LocalSales { local: string; total: number }
interface ProductBreakdown {
  producto: string; cantidad: number; importe: number; porcentaje: number
}

const COLORS = [
  '#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899',
  '#f59e0b', '#06b6d4', '#84cc16', '#ef4444', '#6366f1',
]

/* ââ Date helpers ââ */
function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function todayStr(): string { return new Date().toISOString().slice(0, 10) }
function yesterdayStr(): string { return daysAgo(1) }
function firstOfMonth(): string {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function prevMonthRange(): [string, string] {
  const d = new Date()
  d.setDate(1); d.setMonth(d.getMonth() - 1)
  const desde = d.toISOString().slice(0, 10)
  d.setMonth(d.getMonth() + 1); d.setDate(0)
  const hasta = d.toISOString().slice(0, 10)
  return [desde, hasta]
}

type DatePreset = { label: string; desde: string; hasta: string }
function getPresets(): DatePreset[] {
  const [pmDesde, pmHasta] = prevMonthRange()
  return [
    { label: 'Hoy', desde: todayStr(), hasta: todayStr() },
    { label: 'Ayer', desde: yesterdayStr(), hasta: yesterdayStr() },
    { label: '7 d\u00edas', desde: daysAgo(7), hasta: yesterdayStr() },
    { label: '30 d\u00edas', desde: daysAgo(30), hasta: yesterdayStr() },
    { label: 'Este mes', desde: firstOfMonth(), hasta: todayStr() },
    { label: 'Mes anterior', desde: pmDesde, hasta: pmHasta },
    { label: 'Este a\u00f1o', desde: `${new Date().getFullYear()}-01-01`, hasta: todayStr() },
  ]
}

/* ââ MultiSelect component ââ */
interface MultiSelectProps {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (vals: string[]) => void
  allLabel?: string
}

function MultiSelect({ label, options, selected, onChange, allLabel = 'Todos' }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const allSelected = options.length > 0 && selected.length === options.length

  const toggleAll = () => {
    if (allSelected) onChange([])
    else onChange(options.map((o) => o.value))
  }

  const toggle = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter((v) => v !== val))
    else onChange([...selected, val])
  }

  const displayText = selected.length === 0
    ? allLabel
    : selected.length <= 2
      ? selected.map((v) => options.find((o) => o.value === v)?.label || v).join(', ')
      : `${selected.length} seleccionados`

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-foreground whitespace-nowrap">{label}:</label>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 border rounded-md px-3 py-2 text-sm bg-background text-foreground min-w-[160px] justify-between"
        >
          <span className="truncate">{displayText}</span>
          <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange([]) }}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
          >
            <X size={10} />
          </button>
        )}
        {open && (
          <div className="absolute z-50 mt-1 w-full min-w-[200px] max-h-60 overflow-y-auto bg-background border rounded-md shadow-lg">
            {options.length > 0 && (
              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-sm font-medium border-b">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded"
                />
                Seleccionar todo
              </label>
            )}
            {options.map((o) => (
              <label
                key={o.value}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                  className="rounded"
                />
                {o.label}
              </label>
            ))}
            {options.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Sin opciones</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ââ Component ââ */
export default function BI() {
  const [fechaDesde, setFechaDesde] = useState(daysAgo(30))
  const [fechaHasta, setFechaHasta] = useState(yesterdayStr())
  const [locales, setLocales] = useState<Local[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [productosCat, setProductosCat] = useState<ProductoCat[]>([])
  const [selectedLocal, setSelectedLocal] = useState<string>('')
  const [selectedCategorias, setSelectedCategorias] = useState<string[]>([])
  const [selectedProductos, setSelectedProductos] = useState<string[]>([])
  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [loading, setLoading] = useState(true)

  const presets = useMemo(() => getPresets(), [])

  /* ââ Load reference data ââ */
  useEffect(() => {
    async function load() {
      const [locRes, catRes, prodRes] = await Promise.all([
        supabase.from('locales_v2').select('id, nombre').order('nombre'),
        supabase.from('categorias_producto_v2').select('id, nombre').order('nombre'),
        supabase.from('vw_productos_dim').select('id, nombre, categoria_id'),
      ])
      if (locRes.data) setLocales(locRes.data)
      if (catRes.data) setCategorias(catRes.data)
      if (prodRes.data) setProductosCat(prodRes.data as ProductoCat[])
    }
    load()
  }, [])

  /* ââ Load ventas (paginated) ââ */
  useEffect(() => { loadVentas() }, [fechaDesde, fechaHasta, selectedLocal])

  async function loadVentas() {
    setLoading(true)
    const PAGE = 1000
    let allRows: VentaRow[] = []
    let from = 0
    let keepGoing = true

    while (keepGoing) {
      let query = supabase
        .from('ventas_raw_v2')
        .select('fecha, local_nombre:local, local_id, ticket_numero, producto, producto_id, cantidad, importe_total, precio_unitario')
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha')
        .range(from, from + PAGE - 1)

      if (selectedLocal) query = query.eq('local_id', Number(selectedLocal))

      const { data, error } = await query
      if (error || !data || data.length === 0) {
        keepGoing = false
      } else {
        allRows = allRows.concat(data as VentaRow[])
        from += PAGE
        if (data.length < PAGE) keepGoing = false
      }
    }
    setVentas(allRows)
    setLoading(false)
  }

  /* ââ Build productoâcategoria map (by ID and by name) ââ */
  const prodToCat = useMemo(() => {
    const byId = new Map<number, number>()
    const byName = new Map<string, number>()
    productosCat.forEach((p) => {
      if (p.categoria_id) {
        byId.set(p.id, p.categoria_id)
        byName.set(p.nombre.toLowerCase(), p.categoria_id)
      }
    })
    return { byId, byName }
  }, [productosCat])

  /* helper: get catId for a venta row */
  function getCatId(v: VentaRow): number | null {
    if (v.producto_id) {
      const c = prodToCat.byId.get(v.producto_id)
      if (c) return c
    }
    return prodToCat.byName.get(v.producto.toLowerCase()) || null
  }

  /* ââ Products filtered by selected categories ââ */
  const productosEnCategorias = useMemo(() => {
    if (selectedCategorias.length === 0) return productosCat
    const catIds = new Set(selectedCategorias.map(Number))
    return productosCat.filter((p) => p.categoria_id && catIds.has(p.categoria_id))
  }, [productosCat, selectedCategorias])

  /* ââ Filtered ventas (client-side category + product filter) ââ */
  const filteredVentas = useMemo(() => {
    let rows = ventas
    if (selectedCategorias.length > 0) {
      const catIds = new Set(selectedCategorias.map(Number))
      rows = rows.filter((v) => {
        const cid = getCatId(v)
        return cid !== null && catIds.has(cid)
      })
    }
    if (selectedProductos.length > 0) {
      const prodSet = new Set(selectedProductos.map((s) => s.toLowerCase()))
      rows = rows.filter((v) => prodSet.has(v.producto.toLowerCase()))
    }
    return rows
  }, [ventas, selectedCategorias, selectedProductos, prodToCat])

  /* ââ Derived data ââ */
  const totalImporte = filteredVentas.reduce((s, v) => s + (v.importe_total || 0), 0)
  const ticketsUnicos = new Set(filteredVentas.map((v) => v.ticket_numero)).size
  const numTransacciones = ticketsUnicos
  const ticketMedio = numTransacciones > 0 ? totalImporte / numTransacciones : 0

  const productoMap = new Map<string, number>()
  filteredVentas.forEach((v) => {
    productoMap.set(v.producto, (productoMap.get(v.producto) || 0) + v.importe_total)
  })
  const topProducto = [...productoMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '\u2014'

  const dailyMap = new Map<string, number>()
  filteredVentas.forEach((v) => {
    dailyMap.set(v.fecha, (dailyMap.get(v.fecha) || 0) + v.importe_total)
  })
  const dailySales: DailySales[] = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, total]) => ({ fecha, total: Math.round(total * 100) / 100 }))

  const topProductos: ProductoRanking[] = [...productoMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([producto, total]) => ({ producto, total: Math.round(total * 100) / 100 }))

  const localMap = new Map<string, number>()
  filteredVentas.forEach((v) => {
    localMap.set(v.local_nombre, (localMap.get(v.local_nombre) || 0) + v.importe_total)
  })
  const localSales: LocalSales[] = [...localMap.entries()]
    .map(([local, total]) => ({ local, total: Math.round(total * 100) / 100 }))

  const cantidadMap = new Map<string, number>()
  filteredVentas.forEach((v) => {
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

  /* ââ Preset click handler ââ */
  function applyPreset(p: DatePreset) {
    setFechaDesde(p.desde)
    setFechaHasta(p.hasta)
  }

  /* ââ Options for multi-selects ââ */
  const catOptions = categorias.map((c) => ({ value: String(c.id), label: c.nombre }))
  const prodOptions = productosEnCategorias.map((p) => ({ value: p.nombre, label: p.nombre }))

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ââ Header ââ */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
          <BarChart3 size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Business Intelligence</h1>
          <p className="text-muted-foreground text-sm">{`An\u00e1lisis de ventas`}</p>
        </div>
      </div>

      {/* ââ Date presets ââ */}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              fechaDesde === p.desde && fechaHasta === p.hasta
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-background text-foreground border-border hover:bg-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ââ Filters ââ */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground">Desde:</label>
          <input type="date" className="border rounded-md px-3 py-2 text-sm bg-background text-foreground"
            value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground">Hasta:</label>
          <input type="date" className="border rounded-md px-3 py-2 text-sm bg-background text-foreground"
            value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground">Local:</label>
          <select className="border rounded-md px-3 py-2 text-sm bg-background text-foreground"
            value={selectedLocal} onChange={(e) => setSelectedLocal(e.target.value)}>
            <option value="">Todos</option>
            {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
        <MultiSelect
          label={`Categor\u00eda`}
          options={catOptions}
          selected={selectedCategorias}
          onChange={(vals) => { setSelectedCategorias(vals); setSelectedProductos([]) }}
          allLabel="Todas"
        />
        <MultiSelect
          label="Producto"
          options={prodOptions}
          selected={selectedProductos}
          onChange={setSelectedProductos}
          allLabel="Todos"
        />
      </div>

      {/* ââ Summary Cards ââ */}
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
            <CardTitle className="text-sm font-medium text-muted-foreground">{`N\u00ba transacciones`}</CardTitle>
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
          <span className="ml-2 text-sm text-muted-foreground">Cargando datos\u2026</span>
        </div>
      )}

      {!loading && filteredVentas.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No hay datos en el rango seleccionado.</p>
      )}

      {!loading && filteredVentas.length > 0 && (
        <>
          {/* ââ Chart 1: Ventas por dÃ­a ââ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{`Ventas por d\u00eda`}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailySales}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Importe']}
                      labelFormatter={(label: string) => formatDate(label)}
                    />
                    <Line type="monotone" dataKey="total" stroke={COLORS[0]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ââ Charts row: Bar + Pie ââ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                      <YAxis type="category" dataKey="producto" width={120} tick={{ fontSize: 10 }} />
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
                        cx="50%" cy="50%"
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

          {/* ââ Product breakdown table ââ */}
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
