import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, PackageCheck, AlertTriangle, TrendingUp,
  ArrowRight, Factory, ShoppingCart, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Kpi {
  gasto_mes: number
  pedidos_mes: number
  pedidos_pendientes: number
  recepciones_abiertas: number
  incidencias_abiertas: number
  incidencias_sla_vencido: number
  productos_bajo_minimo: number
}

interface MesGasto { mes: string; gasto_total: number; num_pedidos: number }
interface TopProv  { proveedor_id: number; nombre_comercial: string; num_pedidos: number; gasto: number }

const eur = (n: number | string | null | undefined) => {
  if (n == null) return '—'
  return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}
const eurFull = (n: number | string | null | undefined) => {
  if (n == null) return '—'
  return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const labelMes = (mes: string) => {
  const [y, m] = mes.split('-')
  return `${MESES[Number(m) - 1]} ${y.slice(-2)}`
}

export default function ComprasDashboard() {
  const navigate = useNavigate()
  const [kpi, setKpi] = useState<Kpi | null>(null)
  const [meses, setMeses] = useState<MesGasto[]>([])
  const [topProv, setTopProv] = useState<TopProv[]>([])
  const [loading, setLoading] = useState(true)

  async function cargar() {
    setLoading(true)
    try {
      const [k, m, t] = await Promise.all([
        supabase.from('v_compras_kpi_mes').select('*').single(),
        supabase.from('v_compras_gasto_mensual').select('mes, gasto_total, num_pedidos').order('mes'),
        supabase.from('v_compras_top_proveedores_mes').select('*'),
      ])
      if (k.data) setKpi({
        ...k.data,
        gasto_mes: Number(k.data.gasto_mes),
      } as Kpi)
      if (m.data) setMeses(m.data.map((r: any) => ({ ...r, gasto_total: Number(r.gasto_total) })))
      if (t.data) setTopProv(t.data.map((r: any) => ({ ...r, gasto: Number(r.gasto) })))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { cargar() }, [])

  // Realtime suave: refresca KPIs cuando cambia algo
  useEffect(() => {
    const ch = supabase.channel('dashboard-compras')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_compra' }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recepciones' }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias' }, () => cargar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const mesActual = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })


  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center"><LayoutDashboard size={20} className="text-white" /></div>
          <div>
            <h1 className="text-xl font-bold">Dashboard de Compras</h1>
            <p className="text-sm text-muted-foreground capitalize">{mesActual}</p>
          </div>
        </div>
        <Button variant="outline" onClick={cargar} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
        </Button>
      </div>

      {/* KPI Tarjetas principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Gasto del mes */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="text-xs text-blue-700 font-medium uppercase tracking-wide">Gasto del mes</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{loading ? '…' : eurFull(kpi?.gasto_mes ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">{kpi?.pedidos_mes ?? 0} pedido{kpi?.pedidos_mes === 1 ? '' : 's'}</div>
          </CardContent>
        </Card>

        {/* Pedidos pendientes */}
        <Card
          className={`cursor-pointer hover:shadow-md transition-shadow ${kpi && kpi.pedidos_pendientes > 0 ? 'border-amber-300 bg-amber-50/50' : ''}`}
          onClick={() => navigate('/compras/pedidos/aprobaciones')}
        >
          <CardContent className="p-4">
            <div className="text-xs text-amber-700 font-medium uppercase tracking-wide">Pedidos pendientes</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{loading ? '…' : (kpi?.pedidos_pendientes ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">esperando aprobación <ArrowRight size={11} /></div>
          </CardContent>
        </Card>

        {/* Recepciones abiertas */}
        <Card
          className={`cursor-pointer hover:shadow-md transition-shadow ${kpi && kpi.recepciones_abiertas > 0 ? 'border-emerald-300 bg-emerald-50/50' : ''}`}
          onClick={() => navigate('/compras/recepciones')}
        >
          <CardContent className="p-4">
            <div className="text-xs text-emerald-700 font-medium uppercase tracking-wide">Recepciones abiertas</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{loading ? '…' : (kpi?.recepciones_abiertas ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">en curso <ArrowRight size={11} /></div>
          </CardContent>
        </Card>

        {/* Incidencias abiertas */}
        <Card
          className={`cursor-pointer hover:shadow-md transition-shadow ${kpi && kpi.incidencias_sla_vencido > 0 ? 'border-red-300 bg-red-50/50' : kpi && kpi.incidencias_abiertas > 0 ? 'border-amber-300 bg-amber-50/50' : ''}`}
          onClick={() => navigate('/compras/incidencias')}
        >
          <CardContent className="p-4">
            <div className="text-xs text-amber-700 font-medium uppercase tracking-wide">Incidencias abiertas</div>
            <div className="mt-1 text-2xl font-bold tabular-nums flex items-baseline gap-2">
              {loading ? '…' : (kpi?.incidencias_abiertas ?? 0)}
              {kpi && kpi.incidencias_sla_vencido > 0 && (
                <span className="text-xs text-red-600 font-medium">{kpi.incidencias_sla_vencido} SLA vencido</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">ver todas <ArrowRight size={11} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Aviso productos bajo mínimo */}
      {kpi && kpi.productos_bajo_minimo > 0 && (
        <Card className="border-orange-300 bg-orange-50">
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-orange-900 text-sm">
              <AlertTriangle size={16} />
              <span><strong>{kpi.productos_bajo_minimo}</strong> producto{kpi.productos_bajo_minimo === 1 ? '' : 's'} bajo stock mínimo</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/stock')}>Ver stock</Button>
          </CardContent>
        </Card>
      )}

      {/* Gráfico evolución gasto */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp size={16} /> Evolución del gasto · últimos 12 meses</CardTitle></CardHeader>
          <CardContent>
            {meses.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Sin datos todavía</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={meses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                  <XAxis dataKey="mes" tickFormatter={labelMes} fontSize={11} />
                  <YAxis tickFormatter={(v) => eur(v)} fontSize={11} width={70} />
                  <Tooltip
                    formatter={(v: any) => [eurFull(v), 'Gasto']}
                    labelFormatter={(v) => `Mes ${labelMes(v as string)}`}
                    contentStyle={{ borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="gasto_total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top proveedores del mes */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Factory size={16} /> Top proveedores del mes</CardTitle></CardHeader>
          <CardContent>
            {topProv.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Sin datos del mes</div>
            ) : (
              <div className="space-y-2">
                {topProv.slice(0, 5).map((p, i) => {
                  const max = topProv[0].gasto || 1
                  const pct = (p.gasto / max) * 100
                  return (
                    <div key={p.proveedor_id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="truncate font-medium">{i + 1}. {p.nombre_comercial}</span>
                        <span className="tabular-nums text-muted-foreground ml-2">{eur(p.gasto)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{p.num_pedidos} pedido{p.num_pedidos === 1 ? '' : 's'}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Accesos rápidos */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Accesos rápidos</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button variant="outline" className="h-auto py-3 flex-col items-start gap-1" onClick={() => navigate('/compras/pedidos/nuevo')}>
              <FileText size={18} className="text-blue-500" />
              <span className="font-medium">Nuevo pedido</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col items-start gap-1" onClick={() => navigate('/compras/recepciones')}>
              <PackageCheck size={18} className="text-emerald-500" />
              <span className="font-medium">Recepciones</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col items-start gap-1" onClick={() => navigate('/compras/incidencias')}>
              <AlertTriangle size={18} className="text-amber-500" />
              <span className="font-medium">Incidencias</span>
            </Button>
            <Button variant="outline" className="h-auto py-3 flex-col items-start gap-1" onClick={() => navigate('/productos-compra')}>
              <ShoppingCart size={18} className="text-emerald-600" />
              <span className="font-medium">Productos</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
