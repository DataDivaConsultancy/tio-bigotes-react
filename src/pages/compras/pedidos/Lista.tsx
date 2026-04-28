import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, FileText, Filter, RefreshCw, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import EstadoBadge from '@/components/compras/EstadoBadge'
import { listarPedidos } from '@/lib/compras/pedidos'
import type { Pedido, EstadoPedido } from '@/lib/schemas/pedidos'
import { ESTADO_LABELS } from '@/lib/schemas/pedidos'

const ESTADOS_FILTRO: { value: EstadoPedido | ''; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'borrador', label: ESTADO_LABELS.borrador },
  { value: 'pendiente_aprobacion', label: ESTADO_LABELS.pendiente_aprobacion },
  { value: 'aprobado', label: ESTADO_LABELS.aprobado },
  { value: 'enviado', label: ESTADO_LABELS.enviado },
  { value: 'confirmado', label: ESTADO_LABELS.confirmado },
  { value: 'parcialmente_recibido', label: ESTADO_LABELS.parcialmente_recibido },
  { value: 'recibido', label: ESTADO_LABELS.recibido },
  { value: 'cancelado', label: ESTADO_LABELS.cancelado },
]

export default function ListaPedidos() {
  const navigate = useNavigate()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoPedido | ''>('')
  const [pendientes, setPendientes] = useState(0)

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const data = await listarPedidos({
        estado: estadoFiltro || undefined,
        buscar: search || undefined,
      })
      setPedidos(data)
      // Contar pendientes (siempre, independiente del filtro)
      try {
        const pendientesData = await listarPedidos({ estado: 'pendiente_aprobacion' })
        setPendientes(pendientesData.length)
      } catch { /* ignore */ }
    } catch (e: any) {
      setError(e.message || 'Error cargando pedidos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoFiltro])

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    cargar()
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Pedidos de Compra</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? 'Cargando…' : `${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cargar} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </Button>
          {pendientes > 0 && (
            <Button
              variant="outline"
              onClick={() => navigate('/compras/pedidos/aprobaciones')}
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <Inbox size={16} /> Aprobaciones
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold tabular-nums">
                {pendientes}
              </span>
            </Button>
          )}
          <Button onClick={() => navigate('/compras/pedidos/nuevo')}>
            <Plus size={16} /> Nuevo pedido
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={onSearchSubmit} className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número o proveedor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </form>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-muted-foreground" />
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value as EstadoPedido | '')}
            className="px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {ESTADOS_FILTRO.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && pedidos.length === 0 && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
              <FileText size={26} className="text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Aún no hay pedidos</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Crea el primero seleccionando un proveedor y añadiendo productos de su catálogo.
              </p>
            </div>
            <Button onClick={() => navigate('/compras/pedidos/nuevo')} className="mt-2">
              <Plus size={16} /> Nuevo pedido
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && pedidos.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold">Nº</th>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Local</th>
                    <th className="px-4 py-3 font-semibold">Proveedor</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold text-right">Líneas</th>
                    <th className="px-4 py-3 font-semibold text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/compras/pedidos/${p.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{p.numero}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{p.fecha_pedido}</td>
                      <td className="px-4 py-3">{p.local_nombre ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.proveedor_nombre ?? '—'}</div>
                        {p.proveedor_cif && <div className="text-xs text-muted-foreground">{p.proveedor_cif}</div>}
                      </td>
                      <td className="px-4 py-3"><EstadoBadge estado={p.estado} /></td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.num_lineas}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {Number(p.total).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && pedidos.length === 0 && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-6">
                <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
