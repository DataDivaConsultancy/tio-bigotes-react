import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackageCheck, Search, RefreshCw, AlertCircle, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { listarRecepciones } from '@/lib/compras/recepciones'
import { ESTADO_RECEPCION_LABELS, ESTADO_RECEPCION_COLORS, type EstadoRecepcion } from '@/lib/schemas/recepciones'
import { supabase } from '@/lib/supabase'

interface Recepcion {
  id: string
  numero: string
  estado: EstadoRecepcion
  iniciada_at: string
  completada_at: string | null
  local_nombre: string | null
  proveedor_nombre: string | null
  pedido_numero: string | null
  num_lineas: number
  lineas_ok: number
  num_incidencias: number
}

export default function ListaRecepciones() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Recepcion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoRecepcion | ''>('')

  async function cargar() {
    setLoading(true); setError(null)
    try {
      const data = await listarRecepciones({ estado: estadoFiltro || undefined, buscar: search || undefined })
      setItems(data as any)
    } catch (e: any) {
      setError(e.message || 'Error cargando')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { cargar() /* eslint-disable-next-line */ }, [estadoFiltro])

  // Realtime: cuando cambia recepciones o lineas, recarga
  useEffect(() => {
    const ch = supabase.channel('recepciones:list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recepciones' }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recepcion_lineas' }, () => cargar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line
  }, [])

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <PackageCheck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Recepciones</h1>
            <p className="text-sm text-muted-foreground">{loading ? 'Cargando…' : `${items.length} recepción${items.length === 1 ? '' : 'es'}`}</p>
          </div>
        </div>
        <Button variant="outline" onClick={cargar} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); cargar() }} className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por número, pedido o proveedor…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </form>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted-foreground" />
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value as any)}
                  className="px-3 py-2 text-sm bg-background border rounded-md">
            <option value="">Todos los estados</option>
            {(Object.keys(ESTADO_RECEPCION_LABELS) as EstadoRecepcion[]).map((s) => (
              <option key={s} value={s}>{ESTADO_RECEPCION_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <Card className="border-red-200 bg-red-50"><CardContent className="py-3 text-sm text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</CardContent></Card>}

      {!loading && items.length === 0 && !error && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center"><PackageCheck size={26} className="text-emerald-500" /></div>
            <div>
              <h2 className="text-lg font-semibold">Sin recepciones todavía</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Cuando un pedido en estado <em>enviado</em> o <em>confirmado</em> tenga "Recibir" pulsado, aparecerá aquí.
              </p>
            </div>
            <Button onClick={() => navigate('/compras/pedidos')} className="mt-2">Ver pedidos</Button>
          </CardContent>
        </Card>
      )}

      {!loading && items.length > 0 && (
        <Card><CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Nº</th>
                  <th className="px-4 py-3 font-semibold">Pedido</th>
                  <th className="px-4 py-3 font-semibold">Local</th>
                  <th className="px-4 py-3 font-semibold">Proveedor</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold text-right">Líneas</th>
                  <th className="px-4 py-3 font-semibold text-right">Incid.</th>
                  <th className="px-4 py-3 font-semibold">Iniciada</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/compras/recepciones/${r.id}`)}>
                    <td className="px-4 py-3 font-mono text-xs">{r.numero}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.pedido_numero ?? '—'}</td>
                    <td className="px-4 py-3">{r.local_nombre ?? '—'}</td>
                    <td className="px-4 py-3">{r.proveedor_nombre ?? '—'}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_RECEPCION_COLORS[r.estado]}`}>{ESTADO_RECEPCION_LABELS[r.estado]}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.lineas_ok}/{r.num_lineas}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.num_incidencias > 0 ? <span className="text-amber-700 font-medium">{r.num_incidencias}</span> : '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.iniciada_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent></Card>
      )}
    </div>
  )
}
