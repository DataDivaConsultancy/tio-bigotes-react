import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, FileText, Send, X as IconX, Copy, Check, RotateCcw, Clock,
  RefreshCw, AlertCircle, Calendar, Truck, CheckCircle2, XCircle, MapPin, User,
  PackageCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import EstadoBadge from '@/components/compras/EstadoBadge'
import {
  obtenerPedido, enviarPedido, aprobarPedido, cancelarPedido, duplicarPedido,
} from '@/lib/compras/pedidos'
import { iniciarRecepcion } from '@/lib/compras/recepciones'
import type { EstadoPedido } from '@/lib/schemas/pedidos'
import { useRealtimePedidos } from '@/hooks/compras/useRealtimePedidos'

interface PedidoCabecera {
  id: string
  numero: string
  estado: EstadoPedido
  fecha_pedido: string
  fecha_entrega_solicitada: string | null
  fecha_entrega_confirmada: string | null
  local_id: number
  local_nombre: string | null
  proveedor_id: number
  proveedor_nombre: string | null
  proveedor_cif: string | null
  subtotal: number
  iva_total: number
  portes: number
  total: number
  origen: string
  enviado_via: string | null
  enviado_at: string | null
  confirmado_at: string | null
  num_lineas: number
  creado_por: string | null
  created_at: string
  updated_at: string
}

interface Linea {
  id: string
  pedido_id: string
  formato_id: string
  producto_id: number
  cantidad: number
  precio_unitario: number
  descuento_pct: number
  iva_pct: number
  total_linea: number
  cantidad_sugerida: number | null
  motivo_modificacion: string | null
  notas: string | null
  orden: number
}

interface Aprobacion {
  id: string
  pedido_id: string
  aprobador_id: string | null
  decision: 'aprobado' | 'rechazado' | 'devuelto'
  comentarios: string | null
  decidido_at: string
}

interface Producto {
  id: number
  nombre: string
}

interface Formato {
  id: string
  formato_compra: string
  unidad_compra: string
}

function formatEUR(n: number | string | null | undefined) {
  if (n == null) return '—'
  return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
}

function formatFecha(s: string | null | undefined, conHora = false) {
  if (!s) return '—'
  try {
    const d = new Date(s)
    if (conHora) {
      return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return s }
}

export default function DetallePedido() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [cabecera, setCabecera] = useState<PedidoCabecera | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [aprobaciones, setAprobaciones] = useState<Aprobacion[]>([])
  const [productos, setProductos] = useState<Map<number, Producto>>(new Map())
  const [formatos, setFormatos] = useState<Map<string, Formato>>(new Map())
  const [loading, setLoading] = useState(true)
  const [actuando, setActuando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function cargar() {
    if (!id) return
    setLoading(true); setError(null)
    try {
      const data = await obtenerPedido(id)
      setCabecera(data.cabecera as any)
      setLineas(data.lineas as any[])
      setAprobaciones(data.aprobaciones as any[])

      // Resolver nombres de productos y formatos
      const productoIds = Array.from(new Set((data.lineas ?? []).map((l: any) => l.producto_id))).filter((x): x is number => x != null)
      const formatoIds = Array.from(new Set((data.lineas ?? []).map((l: any) => l.formato_id))).filter((x): x is string => !!x)

      const [{ supabase }] = await Promise.all([import('@/lib/supabase')])
      const promises: Promise<any>[] = []
      if (productoIds.length > 0) {
        promises.push(supabase.from('productos_compra_v2').select('id, nombre').in('id', productoIds))
      } else promises.push(Promise.resolve({ data: [] }))
      if (formatoIds.length > 0) {
        promises.push(supabase.from('producto_formatos').select('id, formato_compra, unidad_compra').in('id', formatoIds))
      } else promises.push(Promise.resolve({ data: [] }))

      const [prodRes, fmtRes] = await Promise.all(promises)
      const pmap = new Map<number, Producto>()
      ;(prodRes.data ?? []).forEach((p: any) => pmap.set(p.id, p))
      setProductos(pmap)
      const fmap = new Map<string, Formato>()
      ;(fmtRes.data ?? []).forEach((f: any) => fmap.set(f.id, f))
      setFormatos(fmap)
    } catch (e: any) {
      setError(e.message || 'Error cargando pedido')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() /* eslint-disable-next-line */ }, [id])

  useRealtimePedidos({ pedidoId: id, onChange: cargar, enabled: !!id })

  // ── Acciones ──
  async function accionEnviar() {
    if (!cabecera) return
    if (!confirm(`¿Enviar el pedido ${cabecera.numero} al proveedor por email?`)) return
    setActuando(true); setError(null); setMensaje(null)
    const r = await enviarPedido(cabecera.id, 'email')
    setActuando(false)
    if (!r.ok) setError(r.error || 'Error al enviar el pedido')
    else { setMensaje('Pedido marcado como enviado'); cargar() }
  }

  async function accionCancelar() {
    if (!cabecera) return
    const motivo = prompt('Motivo de cancelación (opcional):', '')
    if (motivo === null) return // usuario canceló prompt
    setActuando(true); setError(null); setMensaje(null)
    const r = await cancelarPedido(cabecera.id, motivo || undefined)
    setActuando(false)
    if (!r.ok) setError(r.error || 'Error al cancelar')
    else { setMensaje('Pedido cancelado'); cargar() }
  }

  async function accionAprobar(decision: 'aprobado' | 'rechazado' | 'devuelto') {
    if (!cabecera) return
    const labels = { aprobado: 'aprobar', rechazado: 'rechazar', devuelto: 'devolver a borrador' }
    const comentarios = prompt(`Comentarios para ${labels[decision]} (opcional):`, '')
    if (comentarios === null) return
    setActuando(true); setError(null); setMensaje(null)
    const r = await aprobarPedido(cabecera.id, decision, comentarios || undefined)
    setActuando(false)
    if (!r.ok) setError(r.error || 'Error al procesar la decisión')
    else { setMensaje(`Pedido ${decision}`); cargar() }
  }

  async function accionDuplicar() {
    if (!cabecera) return
    if (!confirm(`¿Crear un nuevo pedido como copia de ${cabecera.numero}?`)) return
    setActuando(true); setError(null); setMensaje(null)
    const r = await duplicarPedido(cabecera.id)
    setActuando(false)
    if (!r.ok) { setError(r.error || 'Error al duplicar'); return }
    const nuevo = (r as any).data
    if (nuevo?.id) navigate(`/compras/pedidos/${nuevo.id}`)
    else navigate('/compras/pedidos')
  }

  async function accionRecepcionar() {
    if (!cabecera) return
    setActuando(true); setError(null); setMensaje(null)
    const r = await iniciarRecepcion(cabecera.id)
    setActuando(false)
    if (!r.ok) { setError(r.error || 'Error iniciando recepción'); return }
    const data = (r as any).data ?? r
    if (data?.id) navigate(`/compras/recepciones/${data.id}`)
  }

  if (loading && !cabecera) {
    return <div className="p-8 text-center text-muted-foreground">Cargando pedido…</div>
  }

  if (!cabecera) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <AlertCircle className="mx-auto mb-3 text-amber-500" size={32} />
        <p className="font-medium">No se encontró el pedido</p>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <Button onClick={() => navigate('/compras/pedidos')} className="mt-4">
          <ArrowLeft size={16} /> Volver a la lista
        </Button>
      </div>
    )
  }

  // Acciones disponibles según estado
  const e = cabecera.estado
  const puedeEnviar       = e === 'borrador' || e === 'aprobado'
  const puedeAprobar      = e === 'pendiente_aprobacion'
  const puedeCancelar     = !['cancelado','cerrado','recibido'].includes(e) && !cabecera.confirmado_at
  const puedeDuplicar     = true
  const puedeRecepcionar  = ['enviado','confirmado','parcialmente_recibido'].includes(e)

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="icon" onClick={() => navigate('/compras/pedidos')}>
          <ArrowLeft size={16} />
        </Button>
        <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
          <FileText size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold font-mono">{cabecera.numero}</h1>
            <EstadoBadge estado={cabecera.estado} />
          </div>
          <p className="text-sm text-muted-foreground">
            {cabecera.proveedor_nombre} · {cabecera.local_nombre} · {formatFecha(cabecera.fecha_pedido)}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={cargar} disabled={loading || actuando}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
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

      {/* Acciones */}
      <Card>
        <CardContent className="py-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-2">Acciones:</span>
          {puedeEnviar && (
            <Button size="sm" onClick={accionEnviar} disabled={actuando}>
              <Send size={14} /> Enviar al proveedor
            </Button>
          )}
          {puedeAprobar && (
            <>
              <Button size="sm" onClick={() => accionAprobar('aprobado')} disabled={actuando}>
                <Check size={14} /> Aprobar
              </Button>
              <Button size="sm" variant="outline" onClick={() => accionAprobar('rechazado')} disabled={actuando}>
                <XCircle size={14} /> Rechazar
              </Button>
              <Button size="sm" variant="outline" onClick={() => accionAprobar('devuelto')} disabled={actuando}>
                <RotateCcw size={14} /> Devolver a borrador
              </Button>
            </>
          )}
          {puedeCancelar && (
            <Button size="sm" variant="outline" onClick={accionCancelar} disabled={actuando}>
              <IconX size={14} /> Cancelar
            </Button>
          )}
          {puedeRecepcionar && (
            <Button size="sm" onClick={accionRecepcionar} disabled={actuando} className="bg-emerald-600 hover:bg-emerald-700">
              <PackageCheck size={14} /> Recepcionar
            </Button>
          )}
          {puedeDuplicar && (
            <Button size="sm" variant="ghost" onClick={accionDuplicar} disabled={actuando}>
              <Copy size={14} /> Duplicar
            </Button>
          )}
          {!puedeEnviar && !puedeAprobar && !puedeCancelar && !puedeRecepcionar && (
            <span className="text-xs text-muted-foreground">Sin acciones disponibles para el estado actual.</span>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Datos */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-base">Datos del pedido</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={12} /> Local</div>
                <div className="font-medium">{cabecera.local_nombre ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><User size={12} /> Proveedor</div>
                <div className="font-medium">{cabecera.proveedor_nombre ?? '—'}</div>
                {cabecera.proveedor_cif && <div className="text-xs text-muted-foreground">{cabecera.proveedor_cif}</div>}
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar size={12} /> Fecha pedido</div>
                <div className="font-medium">{formatFecha(cabecera.fecha_pedido)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Truck size={12} /> Entrega solicitada</div>
                <div className="font-medium">{formatFecha(cabecera.fecha_entrega_solicitada)}</div>
              </div>
              {cabecera.fecha_entrega_confirmada && (
                <div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 size={12} /> Entrega confirmada</div>
                  <div className="font-medium">{formatFecha(cabecera.fecha_entrega_confirmada)}</div>
                </div>
              )}
              <div>
                <div className="text-xs text-muted-foreground">Origen</div>
                <div className="font-medium capitalize">{cabecera.origen}</div>
              </div>
              {cabecera.enviado_at && (
                <div>
                  <div className="text-xs text-muted-foreground">Enviado</div>
                  <div className="font-medium">{formatFecha(cabecera.enviado_at, true)}{cabecera.enviado_via && <span className="text-muted-foreground"> · {cabecera.enviado_via}</span>}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Totales */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Totales</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatEUR(cabecera.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span className="tabular-nums">{formatEUR(cabecera.iva_total)}</span></div>
              {cabecera.portes > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Portes</span><span className="tabular-nums">{formatEUR(cabecera.portes)}</span></div>
              )}
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-lg tabular-nums">{formatEUR(cabecera.total)}</span>
              </div>
              <div className="text-xs text-muted-foreground pt-1">{cabecera.num_lineas} línea{cabecera.num_lineas === 1 ? '' : 's'}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Líneas */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Líneas del pedido</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2 font-semibold">#</th>
                  <th className="px-4 py-2 font-semibold">Producto</th>
                  <th className="px-4 py-2 font-semibold">Formato</th>
                  <th className="px-4 py-2 font-semibold text-right">Cant.</th>
                  <th className="px-4 py-2 font-semibold text-right">Precio</th>
                  <th className="px-4 py-2 font-semibold text-right">Dto.</th>
                  <th className="px-4 py-2 font-semibold text-right">IVA</th>
                  <th className="px-4 py-2 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {lineas.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Sin líneas</td></tr>
                ) : lineas.map((l, idx) => {
                  const prod = productos.get(l.producto_id)
                  const fmt  = formatos.get(l.formato_id)
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{prod?.nombre ?? `(producto ${l.producto_id})`}</div>
                        {l.notas && <div className="text-xs text-muted-foreground">{l.notas}</div>}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{fmt?.formato_compra ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(l.cantidad).toLocaleString('es-ES')}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatEUR(l.precio_unitario)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(l.descuento_pct) > 0 ? `${Number(l.descuento_pct)}%` : '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(l.iva_pct)}%</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{formatEUR(l.total_linea)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Clock size={16} /> Historial</CardTitle></CardHeader>
        <CardContent>
          <ol className="relative border-l border-muted pl-5 space-y-4">
            <li>
              <div className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-blue-500" />
              <div className="text-sm font-medium">Pedido creado</div>
              <div className="text-xs text-muted-foreground">{formatFecha(cabecera.created_at, true)}</div>
              <div className="text-xs text-muted-foreground capitalize">Origen: {cabecera.origen}</div>
            </li>
            {aprobaciones.slice().reverse().map((a) => (
              <li key={a.id}>
                <div className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full ${a.decision === 'aprobado' ? 'bg-emerald-500' : a.decision === 'rechazado' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <div className="text-sm font-medium capitalize">{a.decision}</div>
                <div className="text-xs text-muted-foreground">{formatFecha(a.decidido_at, true)}</div>
                {a.comentarios && <div className="text-xs italic text-muted-foreground mt-0.5">"{a.comentarios}"</div>}
              </li>
            ))}
            {cabecera.enviado_at && (
              <li>
                <div className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-blue-500" />
                <div className="text-sm font-medium">Enviado al proveedor</div>
                <div className="text-xs text-muted-foreground">{formatFecha(cabecera.enviado_at, true)}{cabecera.enviado_via && ` · vía ${cabecera.enviado_via}`}</div>
              </li>
            )}
            {cabecera.confirmado_at && (
              <li>
                <div className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <div className="text-sm font-medium">Confirmado por el proveedor</div>
                <div className="text-xs text-muted-foreground">{formatFecha(cabecera.confirmado_at, true)}</div>
              </li>
            )}
            {cabecera.estado === 'cancelado' && (
              <li>
                <div className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-red-500" />
                <div className="text-sm font-medium">Cancelado</div>
                <div className="text-xs text-muted-foreground">{formatFecha(cabecera.updated_at, true)}</div>
              </li>
            )}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
