import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Inbox, Check, X as IconX, RotateCcw, AlertCircle, RefreshCw,
  CheckCircle2, ExternalLink, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { listarPedidos, aprobarPedido } from '@/lib/compras/pedidos'
import type { Pedido } from '@/lib/schemas/pedidos'
import { useRealtimePedidos } from '@/hooks/compras/useRealtimePedidos'

function formatEUR(n: number | string | null | undefined) {
  if (n == null) return '—'
  return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function diasDesde(iso: string | null | undefined): number {
  if (!iso) return 0
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function colorAntiguedad(dias: number): string {
  if (dias >= 3) return 'text-red-600'
  if (dias >= 1) return 'text-amber-600'
  return 'text-muted-foreground'
}

export default function AprobacionesPedidos() {
  const navigate = useNavigate()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [actuandoId, setActuandoId] = useState<string | null>(null)

  async function cargar() {
    setLoading(true); setError(null)
    try {
      const data = await listarPedidos({ estado: 'pendiente_aprobacion' })
      setPedidos(data)
    } catch (e: any) {
      setError(e.message || 'Error cargando aprobaciones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  useRealtimePedidos({ onChange: cargar })

  async function ejecutar(p: Pedido, decision: 'aprobado' | 'rechazado' | 'devuelto') {
    const labels = { aprobado: 'aprobar', rechazado: 'rechazar', devuelto: 'devolver a borrador' }
    const comentarios = prompt(`Comentarios para ${labels[decision]} el pedido ${p.numero} (opcional):`, '')
    if (comentarios === null) return

    setActuandoId(p.id); setError(null); setMensaje(null)
    const r = await aprobarPedido(p.id, decision, comentarios || undefined)
    setActuandoId(null)
    if (!r.ok) {
      setError(r.error || 'Error al procesar la decisión')
      return
    }
    const verbo = decision === 'aprobado' ? 'aprobado' : (decision === 'rechazado' ? 'rechazado' : 'devuelto a borrador')
    setMensaje(`Pedido ${p.numero} ${verbo}`)
    setTimeout(() => setMensaje(null), 4000)
    cargar()
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <Inbox size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Aprobaciones pendientes</h1>
            <p className="text-sm text-muted-foreground">
              {loading ? 'Cargando…' : `${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'} esperando decisión`}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={cargar} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </Button>
      </div>

      {/* Mensajes */}
      {mensaje && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="py-3 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={16} /> {mensaje}
          </CardContent>
        </Card>
      )}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </CardContent>
        </Card>
      )}

      {/* Vacío */}
      {!loading && pedidos.length === 0 && !error && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 size={26} className="text-emerald-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Todo al día</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                No hay pedidos esperando aprobación. Los que superen el umbral configurado en{' '}
                <span className="font-medium">configuración</span> aparecerán aquí.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/compras/pedidos')} className="mt-2">
              Ver todos los pedidos
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tarjetas de pedidos pendientes */}
      {!loading && pedidos.length > 0 && (
        <div className="space-y-3">
          {pedidos.map((p) => {
            const dias = diasDesde(p.created_at)
            const actuando = actuandoId === p.id
            return (
              <Card key={p.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-0">
                    {/* Info del pedido */}
                    <div className="p-4 md:p-5">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => navigate(`/compras/pedidos/${p.id}`)}
                              className="font-mono text-sm font-semibold hover:underline text-blue-600 inline-flex items-center gap-1"
                            >
                              {p.numero}
                              <ExternalLink size={12} />
                            </button>
                            <span className={`text-xs inline-flex items-center gap-1 ${colorAntiguedad(dias)}`}>
                              <Clock size={11} />
                              {dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`}
                            </span>
                          </div>
                          <div className="mt-1 font-medium">{p.proveedor_nombre ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{p.local_nombre ?? '—'} · {p.num_lineas} línea{p.num_lineas === 1 ? '' : 's'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold tabular-nums">{formatEUR(p.total)}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">{formatEUR(p.subtotal)} + {formatEUR(p.iva_total)} IVA</div>
                        </div>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="p-4 md:p-5 bg-muted/20 border-t md:border-t-0 md:border-l flex md:flex-col items-stretch gap-2 justify-end">
                      <Button
                        size="sm"
                        onClick={() => ejecutar(p, 'aprobado')}
                        disabled={actuando}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Check size={14} /> Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => ejecutar(p, 'devuelto')}
                        disabled={actuando}
                      >
                        <RotateCcw size={14} /> Devolver
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => ejecutar(p, 'rechazado')}
                        disabled={actuando}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <IconX size={14} /> Rechazar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Skeleton loading */}
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
