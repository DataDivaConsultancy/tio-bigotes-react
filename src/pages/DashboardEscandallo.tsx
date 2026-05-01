import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft, BookOpen, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, XCircle, Search, BarChart3, Settings, Calculator,
} from 'lucide-react'

/* ─── Types ─── */
interface ResumenRow {
  escandallo_id: number
  producto_id: number | null
  nombre: string
  cantidad_resultado: number
  unidad_resultado: string
  es_subreceta: boolean
  coste_total: number | null
  coste_por_unidad: number | null
  pvp_base: number | null
  iva_venta: string | null
  margen_bruto: number | null
  margen_pct: number | null
}
interface ProductoVentaSinEscandallo {
  id: number
  nombre: string
  codigo: string | null
}
interface Configuracion {
  margen_bajo_pct: number
  margen_medio_pct: number
}
const DEFAULT_CONFIG: Configuracion = { margen_bajo_pct: 40, margen_medio_pct: 60 }

type FiltroMargen = 'todos' | 'bajo' | 'medio' | 'alto' | 'sin_pvp'

export default function DashboardEscandallo() {
  const navigate = useNavigate()
  const [resumen, setResumen] = useState<ResumenRow[]>([])
  const [sinEscandallo, setSinEscandallo] = useState<ProductoVentaSinEscandallo[]>([])
  const [config, setConfig] = useState<Configuracion>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<FiltroMargen>('todos')

  useEffect(() => { void loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [resumenRes, configBajoRes, configMedioRes] = await Promise.all([
      supabase.from('vw_escandallo_resumen').select('*').order('margen_pct', { ascending: false, nullsFirst: false }),
      supabase.rpc('rpc_get_config_escandallo', { p_clave: 'margen_bajo_pct' }),
      supabase.rpc('rpc_get_config_escandallo', { p_clave: 'margen_medio_pct' }),
    ])
    if (resumenRes.data) setResumen(resumenRes.data)

    setConfig({
      margen_bajo_pct: Number(configBajoRes.data ?? DEFAULT_CONFIG.margen_bajo_pct),
      margen_medio_pct: Number(configMedioRes.data ?? DEFAULT_CONFIG.margen_medio_pct),
    })

    // Productos vendibles sin escandallo: tipo IN ('venta','ambos') y NOT EXISTS escandallos.producto_id
    const productosVenta = await supabase
      .from('productos_v2')
      .select('id, nombre, codigo, tipo')
      .in('tipo', ['venta', 'ambos'])
      .eq('activo', true)
    const escIds = new Set(
      (resumenRes.data ?? [])
        .filter((e: ResumenRow) => !e.es_subreceta && e.producto_id != null)
        .map((e: ResumenRow) => e.producto_id)
    )
    if (productosVenta.data) {
      setSinEscandallo(
        productosVenta.data
          .filter((p: any) => !escIds.has(p.id))
          .map((p: any) => ({ id: p.id, nombre: p.nombre, codigo: p.codigo }))
      )
    }
    setLoading(false)
  }

  /* ─── Categorías de margen ─── */
  function categoriaDe(m: number | null) {
    if (m == null) return 'sin_pvp'
    if (m < config.margen_bajo_pct) return 'bajo'
    if (m < config.margen_medio_pct) return 'medio'
    return 'alto'
  }
  function colorMargen(pct: number | null) {
    if (pct == null) return 'text-muted-foreground'
    if (pct >= config.margen_medio_pct) return 'text-green-500'
    if (pct >= config.margen_bajo_pct) return 'text-yellow-500'
    return 'text-red-500'
  }

  /* ─── Datos derivados ─── */
  // Solo escandallos de productos finales (no sub-recetas)
  const productos = useMemo(() => resumen.filter(r => !r.es_subreceta), [resumen])

  const kpis = useMemo(() => {
    const conMargen = productos.filter(p => p.margen_pct != null).map(p => Number(p.margen_pct))
    const sinPvp = productos.filter(p => p.pvp_base == null).length
    const margenBajo = productos.filter(p => p.margen_pct != null && Number(p.margen_pct) < config.margen_bajo_pct).length
    const margenAlto = productos.filter(p => p.margen_pct != null && Number(p.margen_pct) >= config.margen_medio_pct).length
    const promedio = conMargen.length ? conMargen.reduce((a, b) => a + b, 0) / conMargen.length : null
    const minimo = conMargen.length ? Math.min(...conMargen) : null
    const maximo = conMargen.length ? Math.max(...conMargen) : null
    return {
      total: productos.length,
      conPvp: productos.length - sinPvp,
      sinPvp,
      promedio, minimo, maximo,
      margenBajo, margenAlto,
    }
  }, [productos, config])

  const distribucion = useMemo(() => {
    const buckets = { bajo: 0, medio: 0, alto: 0, sin_pvp: 0 }
    productos.forEach(p => {
      const cat = categoriaDe(p.margen_pct != null ? Number(p.margen_pct) : null)
      // @ts-ignore
      buckets[cat]++
    })
    return buckets
  }, [productos, config])

  const top5Mejor = useMemo(() => {
    return productos
      .filter(p => p.margen_pct != null)
      .slice() // copia
      .sort((a, b) => Number(b.margen_pct) - Number(a.margen_pct))
      .slice(0, 5)
  }, [productos])

  const top5Peor = useMemo(() => {
    return productos
      .filter(p => p.margen_pct != null)
      .slice()
      .sort((a, b) => Number(a.margen_pct) - Number(b.margen_pct))
      .slice(0, 5)
  }, [productos])

  const filtrados = useMemo(() => {
    let arr = productos
    if (filtro !== 'todos') {
      arr = arr.filter(p => categoriaDe(p.margen_pct != null ? Number(p.margen_pct) : null) === filtro)
    }
    if (search) {
      const q = search.toLowerCase()
      arr = arr.filter(p => p.nombre.toLowerCase().includes(q))
    }
    return arr
  }, [productos, filtro, search, config])

  /* ─── Render ─── */
  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Cargando dashboard...</div>
  }

  const totalDist = distribucion.bajo + distribucion.medio + distribucion.alto + distribucion.sin_pvp
  const pctBucket = (n: number) => totalDist === 0 ? 0 : (n / totalDist) * 100

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/escandallos')}>
            <ArrowLeft size={16} className="mr-1" /> Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 size={22} />
              Dashboard de márgenes
            </h1>
            <p className="text-sm text-muted-foreground">
              Salud económica de tus escandallos. Umbrales: bajo &lt; {config.margen_bajo_pct}% &lt; medio &lt; {config.margen_medio_pct}% ≤ alto
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/escandallos/simulador')}>
          <Calculator size={14} className="mr-1" /> Simulador
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{kpis.total}</div>
            <p className="text-xs text-muted-foreground">Productos con escandallo</p>
            {sinEscandallo.length > 0 && (
              <p className="text-[10px] text-orange-500 mt-1">
                +{sinEscandallo.length} sin escandallo
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${
              kpis.promedio == null ? 'text-muted-foreground'
              : kpis.promedio >= config.margen_medio_pct ? 'text-green-500'
              : kpis.promedio >= config.margen_bajo_pct ? 'text-yellow-500'
              : 'text-red-500'
            }`}>
              {kpis.promedio != null ? `${kpis.promedio.toFixed(1)}%` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">Margen promedio</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${kpis.margenBajo > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
              {kpis.margenBajo}
            </div>
            <p className="text-xs text-muted-foreground">
              Margen bajo (&lt;{config.margen_bajo_pct}%)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${kpis.margenAlto > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
              {kpis.margenAlto}
            </div>
            <p className="text-xs text-muted-foreground">
              Margen alto (≥{config.margen_medio_pct}%)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${kpis.sinPvp > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
              {kpis.sinPvp}
            </div>
            <p className="text-xs text-muted-foreground">Sin PVP definido</p>
          </CardContent>
        </Card>
      </div>

      {/* Min/Max */}
      {kpis.minimo != null && kpis.maximo != null && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <TrendingDown size={20} className="text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Margen mínimo</p>
                <p className={`text-xl font-bold ${colorMargen(kpis.minimo)}`}>
                  {kpis.minimo.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <TrendingUp size={20} className="text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Margen máximo</p>
                <p className={`text-xl font-bold ${colorMargen(kpis.maximo)}`}>
                  {kpis.maximo.toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Distribución (barras horizontales) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Distribución por margen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { key: 'alto', label: `Alto (≥${config.margen_medio_pct}%)`, count: distribucion.alto, color: 'bg-green-500', textColor: 'text-green-500' },
            { key: 'medio', label: `Medio (${config.margen_bajo_pct}-${config.margen_medio_pct}%)`, count: distribucion.medio, color: 'bg-yellow-500', textColor: 'text-yellow-500' },
            { key: 'bajo', label: `Bajo (<${config.margen_bajo_pct}%)`, count: distribucion.bajo, color: 'bg-red-500', textColor: 'text-red-500' },
            { key: 'sin_pvp', label: 'Sin PVP', count: distribucion.sin_pvp, color: 'bg-muted-foreground/40', textColor: 'text-muted-foreground' },
          ].map(b => (
            <div key={b.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className={b.textColor}>{b.label}</span>
                <span className="font-mono">
                  {b.count} ({pctBucket(b.count).toFixed(0)}%)
                </span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full ${b.color} transition-all`}
                  style={{ width: `${pctBucket(b.count)}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Top 5 mejor / peor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-500" />
              Top 5 mejor margen
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {top5Mejor.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Sin datos</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {top5Mejor.map(e => (
                    <tr key={e.escandallo_id} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer"
                        onClick={() => navigate(`/escandallos/${e.escandallo_id}`)}>
                      <td className="p-2 px-3">{e.nombre}</td>
                      <td className={`p-2 px-3 text-right font-mono font-semibold ${colorMargen(Number(e.margen_pct))}`}>
                        {Number(e.margen_pct).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <XCircle size={16} className="text-red-500" />
              Top 5 peor margen
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {top5Peor.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Sin datos</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {top5Peor.map(e => (
                    <tr key={e.escandallo_id} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer"
                        onClick={() => navigate(`/escandallos/${e.escandallo_id}`)}>
                      <td className="p-2 px-3">{e.nombre}</td>
                      <td className={`p-2 px-3 text-right font-mono font-semibold ${colorMargen(Number(e.margen_pct))}`}>
                        {Number(e.margen_pct).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Productos vendibles sin escandallo (alerta) */}
      {sinEscandallo.length > 0 && (
        <Card className="border-orange-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-500">
              <AlertTriangle size={16} />
              Productos vendibles sin escandallo ({sinEscandallo.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {sinEscandallo.slice(0, 10).map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-2 px-3">{p.nombre}</td>
                      <td className="p-2 px-3 text-xs text-muted-foreground">{p.codigo ?? '—'}</td>
                      <td className="p-2 px-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => navigate('/escandallos/nuevo')}>
                          Crear
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sinEscandallo.length > 10 && (
                <p className="p-2 text-xs text-muted-foreground text-center">
                  ...y {sinEscandallo.length - 10} más
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla completa filtrable */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="text-base">Todos los escandallos</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 w-full sm:w-44 text-sm"
                />
              </div>
              <select
                value={filtro}
                onChange={e => setFiltro(e.target.value as FiltroMargen)}
                className="h-8 rounded-md border bg-background px-3 text-sm"
              >
                <option value="todos">Todos los márgenes</option>
                <option value="alto">Solo alto</option>
                <option value="medio">Solo medio</option>
                <option value="bajo">Solo bajo</option>
                <option value="sin_pvp">Sin PVP</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtrados.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No hay escandallos con esos filtros
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium">Escandallo</th>
                    <th className="text-right p-3 font-medium">Coste/ud</th>
                    <th className="text-right p-3 font-medium">PVP c/IVA</th>
                    <th className="text-right p-3 font-medium">Margen</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(e => (
                    <tr key={e.escandallo_id}
                        className="border-b hover:bg-muted/20 cursor-pointer"
                        onClick={() => navigate(`/escandallos/${e.escandallo_id}`)}>
                      <td className="p-3 font-medium">{e.nombre}</td>
                      <td className="p-3 text-right font-mono">
                        {e.coste_por_unidad != null ? formatCurrency(Number(e.coste_por_unidad)) : '—'}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {e.pvp_base != null ? formatCurrency(Number(e.pvp_base)) : '—'}
                      </td>
                      <td className={`p-3 text-right font-mono font-semibold ${colorMargen(e.margen_pct != null ? Number(e.margen_pct) : null)}`}>
                        {e.margen_pct != null ? `${Number(e.margen_pct).toFixed(1)}%` : '—'}
                      </td>
                      <td className="p-3 text-center">
                        {e.margen_pct != null && Number(e.margen_pct) < config.margen_bajo_pct && (
                          <AlertTriangle size={14} className="text-red-500 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
