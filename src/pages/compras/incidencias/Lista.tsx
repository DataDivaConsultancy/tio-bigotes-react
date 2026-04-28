import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Search, RefreshCw, Filter, Plus, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { listarIncidencias } from '@/lib/compras/incidencias'
import {
  TIPO_INCIDENCIA_LABELS, ESTADO_INCIDENCIA_LABELS, ESTADO_INCIDENCIA_COLORS,
  URGENCIA_LABELS, URGENCIA_COLORS,
  type TipoIncidencia, type EstadoIncidencia, type Urgencia,
} from '@/lib/schemas/incidencias'
import { supabase } from '@/lib/supabase'
import CrearIncidenciaModal from '@/components/compras/CrearIncidenciaModal'

interface Inc {
  id: string
  numero: string
  tipo: TipoIncidencia
  urgencia: Urgencia
  estado: EstadoIncidencia
  proveedor_nombre: string | null
  local_nombre: string | null
  recepcion_numero: string | null
  pedido_numero: string | null
  cantidad_afectada: number | null
  impacto_economico: number | null
  sla_deadline: string | null
  sla_vencido: boolean
  creada_at: string
  descripcion: string | null
}

function timeUntil(iso: string | null): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  const horas = Math.round(ms / (1000 * 60 * 60))
  if (horas < 0) return `${-horas}h vencido`
  if (horas < 24) return `${horas}h restantes`
  return `${Math.round(horas / 24)}d restantes`
}

export default function ListaIncidencias() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Inc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<string>('')
  const [urgenciaFiltro, setUrgenciaFiltro] = useState<string>('')
  const [soloAbiertas, setSoloAbiertas] = useState(true)
  const [showCrear, setShowCrear] = useState(false)

  async function cargar() {
    setLoading(true); setError(null)
    try {
      const data = await listarIncidencias({
        estado: estadoFiltro || undefined,
        urgencia: urgenciaFiltro || undefined,
        buscar: search || undefined,
        solo_abiertas: soloAbiertas,
      })
      setItems(data as any)
    } catch (e: any) {
      setError(e.message || 'Error cargando')
    } finally { setLoading(false) }
  }

  useEffect(() => { cargar() /* eslint-disable-next-line */ }, [estadoFiltro, urgenciaFiltro, soloAbiertas])

  useEffect(() => {
    const ch = supabase.channel('incidencias:list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias' }, () => cargar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line
  }, [])

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center"><AlertTriangle size={20} className="text-white" /></div>
          <div>
            <h1 className="text-xl font-bold">Incidencias</h1>
            <p className="text-sm text-muted-foreground">{loading ? 'Cargando…' : `${items.length} ${soloAbiertas ? 'abiertas' : 'totales'}`}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cargar} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar</Button>
          <Button onClick={() => setShowCrear(true)}><Plus size={16} /> Nueva incidencia</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); cargar() }} className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por número, proveedor o descripción…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </form>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted-foreground" />
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className="px-3 py-2 text-sm bg-background border rounded-md">
            <option value="">Todos los estados</option>
            {(Object.keys(ESTADO_INCIDENCIA_LABELS) as EstadoIncidencia[]).map((s) => <option key={s} value={s}>{ESTADO_INCIDENCIA_LABELS[s]}</option>)}
          </select>
          <select value={urgenciaFiltro} onChange={(e) => setUrgenciaFiltro(e.target.value)} className="px-3 py-2 text-sm bg-background border rounded-md">
            <option value="">Todas las urgencias</option>
            {(Object.keys(URGENCIA_LABELS) as Urgencia[]).map((u) => <option key={u} value={u}>{URGENCIA_LABELS[u]}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={soloAbiertas} onChange={(e) => setSoloAbiertas(e.target.checked)} className="rounded" />
            Solo abiertas
          </label>
        </div>
      </div>

      {error && <Card className="border-red-200 bg-red-50"><CardContent className="py-3 text-sm text-red-700">{error}</CardContent></Card>}

      {!loading && items.length === 0 && !error && (
        <Card><CardContent className="py-16 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center"><AlertTriangle size={26} className="text-emerald-500" /></div>
          <h2 className="text-lg font-semibold">No hay incidencias</h2>
          <p className="text-sm text-muted-foreground max-w-sm">Cuando registres una recepción con diferencias o problemas, aparecerá aquí.</p>
        </CardContent></Card>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((i) => (
            <Card key={i.id} className={i.sla_vencido ? 'border-red-300' : ''}>
              <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap min-w-0 flex-1">
                  <span className="font-mono text-xs text-muted-foreground">{i.numero}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${URGENCIA_COLORS[i.urgencia]}`}>{URGENCIA_LABELS[i.urgencia]}</span>
                  <span className="text-sm font-medium">{TIPO_INCIDENCIA_LABELS[i.tipo]}</span>
                  <span className="text-xs text-muted-foreground">· {i.proveedor_nombre}</span>
                  {i.recepcion_numero && <span className="text-xs text-muted-foreground font-mono">· {i.recepcion_numero}</span>}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {i.sla_deadline && (
                    <span className={`text-xs flex items-center gap-1 ${i.sla_vencido ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      <Clock size={11} /> {timeUntil(i.sla_deadline)}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_INCIDENCIA_COLORS[i.estado]}`}>{ESTADO_INCIDENCIA_LABELS[i.estado]}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de crear (manual, sin recepción asociada) */}
      <CrearIncidenciaModal
        open={showCrear}
        onClose={() => setShowCrear(false)}
        onCreated={cargar}
      />
    </div>
  )
}
