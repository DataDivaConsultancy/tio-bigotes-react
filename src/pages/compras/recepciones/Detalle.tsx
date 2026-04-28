import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, PackageCheck, Check, X as IconX, AlertCircle, Camera,
  Thermometer, Calendar, RefreshCw, AlertTriangle, CheckCircle2, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { obtenerRecepcion, actualizarLineaRecepcion, completarRecepcion } from '@/lib/compras/recepciones'
import { uploadFoto } from '@/lib/storage'
import {
  ESTADO_LINEA_LABELS, ESTADO_LINEA_COLORS, ESTADO_RECEPCION_LABELS, ESTADO_RECEPCION_COLORS,
  type EstadoLinea, type EstadoRecepcion,
} from '@/lib/schemas/recepciones'
import { useRealtimePedidos } from '@/hooks/compras/useRealtimePedidos'
import CrearIncidenciaModal from '@/components/compras/CrearIncidenciaModal'

interface Cabecera {
  id: string; numero: string; estado: EstadoRecepcion; iniciada_at: string; completada_at: string | null
  local_id: number; local_nombre: string | null
  proveedor_id: number; proveedor_nombre: string | null
  pedido_id: string; pedido_numero: string | null
  num_lineas: number; lineas_ok: number; num_incidencias: number
}
interface Linea {
  id: string
  formato_id: string
  producto_id: number
  factor_conversion: number
  cantidad_esperada: number
  cantidad_recibida: number
  unidades_recibidas: number
  estado: EstadoLinea
  lote: string | null
  fecha_caducidad: string | null
  temperatura: number | null
  foto_url: string | null
  notas: string | null
}
interface Producto { id: number; nombre: string; tipo_iva: string | null }

export default function DetalleRecepcion() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [cab, setCab] = useState<Cabecera | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [productos, setProductos] = useState<Map<number, Producto>>(new Map())
  const [loading, setLoading] = useState(true)
  const [completando, setCompletando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [incidenciaPara, setIncidenciaPara] = useState<Linea | null>(null)

  async function cargar() {
    if (!id) return
    setLoading(true); setError(null)
    try {
      const { cabecera, lineas } = await obtenerRecepcion(id)
      setCab(cabecera as any)
      setLineas(lineas as any[])
      const ids = Array.from(new Set((lineas ?? []).map((l: any) => l.producto_id).filter(Boolean)))
      if (ids.length > 0) {
        const { data } = await supabase.from('productos_compra_v2').select('id, nombre, tipo_iva').in('id', ids)
        const m = new Map<number, Producto>()
        ;(data ?? []).forEach((p: any) => m.set(p.id, p))
        setProductos(m)
      }
    } catch (e: any) {
      setError(e.message || 'Error cargando recepción')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { cargar() /* eslint-disable-next-line */ }, [id])

  async function actualizarLinea(linea: Linea, patch: Partial<Linea>) {
    const next = { ...linea, ...patch }
    setLineas((prev) => prev.map((l) => (l.id === linea.id ? next : l)))
    const r = await actualizarLineaRecepcion({
      p_linea_id: linea.id,
      p_cantidad_recibida: next.cantidad_recibida,
      p_estado: next.estado,
      p_lote: next.lote,
      p_fecha_caducidad: next.fecha_caducidad,
      p_temperatura: next.temperatura,
      p_foto_url: next.foto_url,
      p_notas: next.notas,
    })
    if (!r.ok) {
      setError(r.error || 'Error actualizando línea')
      // revertir
      setLineas((prev) => prev.map((l) => (l.id === linea.id ? linea : l)))
    }
  }

  async function subirFotoLinea(linea: Linea, file: File) {
    try {
      const prefix = `prov-${cab?.proveedor_id}/${cab?.numero}`
      const { url } = await uploadFoto(file, 'recepciones', prefix)
      await actualizarLinea(linea, { foto_url: url })
    } catch (e: any) {
      setError(e.message || 'Error subiendo foto')
    }
  }

  async function completar() {
    if (!id) return
    if (!confirm('¿Completar la recepción? Se generarán los movimientos de stock y las incidencias automáticas.')) return
    setCompletando(true); setError(null); setMensaje(null)
    const r = await completarRecepcion(id)
    setCompletando(false)
    if (!r.ok) { setError(r.error || 'Error completando'); return }
    const data = (r as any).data
    setMensaje(`Recepción completada · ${data.movimientos_stock} movimientos de stock · ${data.incidencias_creadas} incidencias`)
    cargar()
  }

  const pendientes = useMemo(() => lineas.filter((l) => l.estado === 'pendiente').length, [lineas])
  const todasMarcadas = pendientes === 0 && lineas.length > 0

  if (loading && !cab) {
    return <div className="p-8 text-center text-muted-foreground">Cargando…</div>
  }
  if (!cab) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="mx-auto mb-2 text-amber-500" size={28} />
        <p>Recepción no encontrada</p>
        <Button onClick={() => navigate('/compras/recepciones')} className="mt-3"><ArrowLeft size={14} /> Volver</Button>
      </div>
    )
  }

  const editable = cab.estado === 'pendiente' || cab.estado === 'en_revision' || cab.estado === 'con_incidencias'
  const yaCompletada = cab.estado === 'aprobada' || cab.estado === 'cerrada'

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate('/compras/recepciones')}><ArrowLeft size={16} /></Button>
        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center"><PackageCheck size={20} className="text-white" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold font-mono">{cab.numero}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_RECEPCION_COLORS[cab.estado]}`}>
              {ESTADO_RECEPCION_LABELS[cab.estado]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {cab.proveedor_nombre} · {cab.local_nombre} · pedido <span className="font-mono">{cab.pedido_numero}</span>
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={cargar} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {mensaje && <Card className="border-emerald-200 bg-emerald-50"><CardContent className="py-3 text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 size={16} /> {mensaje}</CardContent></Card>}
      {error && <Card className="border-red-200 bg-red-50"><CardContent className="py-3 text-sm text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</CardContent></Card>}

      {/* Líneas (mobile-first card por línea) */}
      <div className="space-y-3">
        {lineas.map((l) => {
          const prod = productos.get(l.producto_id)
          const stockEntra = (l.cantidad_recibida ?? 0) * (l.factor_conversion ?? 1)
          return (
            <Card key={l.id} className={l.estado === 'ok' ? 'border-emerald-200 bg-emerald-50/30' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{prod?.nombre ?? `(producto ${l.producto_id})`}</div>
                    <div className="text-xs text-muted-foreground">
                      Esperado: <span className="font-medium">{Number(l.cantidad_esperada).toLocaleString('es-ES')}</span> uds compra
                      {l.factor_conversion > 1 && <> · factor ×{l.factor_conversion}</>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_LINEA_COLORS[l.estado]} whitespace-nowrap`}>
                    {ESTADO_LINEA_LABELS[l.estado]}
                  </span>
                </div>

                {/* Botones grandes mobile-first */}
                {editable && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <Button
                      type="button" variant={l.estado === 'ok' ? 'default' : 'outline'}
                      onClick={() => actualizarLinea(l, { cantidad_recibida: l.cantidad_esperada, estado: 'ok' })}
                      className={l.estado === 'ok' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                    ><Check size={16} /> OK</Button>
                    <Button
                      type="button" variant={l.estado === 'parcial' ? 'default' : 'outline'}
                      onClick={() => actualizarLinea(l, { estado: 'parcial' })}
                      className={l.estado === 'parcial' ? 'bg-amber-500 hover:bg-amber-600' : ''}
                    ><AlertTriangle size={16} /> Diferencia</Button>
                    <Button
                      type="button" variant={l.estado === 'rechazado' ? 'default' : 'outline'}
                      onClick={() => actualizarLinea(l, { cantidad_recibida: 0, estado: 'rechazado' })}
                      className={l.estado === 'rechazado' ? 'bg-red-600 hover:bg-red-700' : ''}
                    ><IconX size={16} /> Falta</Button>
                  </div>
                )}

                {/* Cantidad recibida + extras */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground tracking-wide">Cantidad recibida</label>
                    <Input
                      type="number" min={0} step="any"
                      value={l.cantidad_recibida || ''}
                      onChange={(e) => setLineas((prev) => prev.map((x) => x.id === l.id ? { ...x, cantidad_recibida: Number(e.target.value) || 0 } : x))}
                      onBlur={(e) => actualizarLinea(l, { cantidad_recibida: Number(e.target.value) || 0 })}
                      disabled={!editable}
                      className="mt-1"
                    />
                    {stockEntra > 0 && l.factor_conversion > 1 && (
                      <div className="text-[10px] text-muted-foreground mt-1">= {stockEntra.toLocaleString('es-ES')} ud stock</div>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1">
                      <Thermometer size={10} /> Temperatura (°C)
                    </label>
                    <Input
                      type="number" step="0.1"
                      value={l.temperatura ?? ''}
                      onChange={(e) => setLineas((prev) => prev.map((x) => x.id === l.id ? { ...x, temperatura: e.target.value ? Number(e.target.value) : null } : x))}
                      onBlur={(e) => actualizarLinea(l, { temperatura: e.target.value ? Number(e.target.value) : null })}
                      disabled={!editable}
                      className="mt-1"
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1">
                      <Calendar size={10} /> Caducidad
                    </label>
                    <Input
                      type="date"
                      value={l.fecha_caducidad ?? ''}
                      onChange={(e) => setLineas((prev) => prev.map((x) => x.id === l.id ? { ...x, fecha_caducidad: e.target.value || null } : x))}
                      onBlur={(e) => actualizarLinea(l, { fecha_caducidad: e.target.value || null })}
                      disabled={!editable}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground tracking-wide">Lote</label>
                    <Input
                      value={l.lote ?? ''}
                      onChange={(e) => setLineas((prev) => prev.map((x) => x.id === l.id ? { ...x, lote: e.target.value || null } : x))}
                      onBlur={(e) => actualizarLinea(l, { lote: e.target.value || null })}
                      disabled={!editable}
                      className="mt-1"
                      placeholder="—"
                    />
                  </div>
                </div>

                {/* Foto + crear incidencia */}
                {editable && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs border rounded-md cursor-pointer hover:bg-muted">
                      <Camera size={14} /> {l.foto_url ? 'Cambiar foto' : 'Hacer foto'}
                      <input type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={(e) => e.target.files?.[0] && subirFotoLinea(l, e.target.files[0])} />
                    </label>
                    {l.foto_url && (
                      <a href={l.foto_url} target="_blank" rel="noreferrer">
                        <img src={l.foto_url} alt="foto" className="w-12 h-12 object-cover rounded border" />
                      </a>
                    )}
                    <Button
                      type="button" variant="outline" size="sm"
                      onClick={() => setIncidenciaPara(l)}
                      className="ml-auto text-amber-700 border-amber-300 hover:bg-amber-50"
                    >
                      <AlertTriangle size={14} /> Crear incidencia
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Sticky footer con resumen + completar */}
      {!yaCompletada && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card border-t shadow-lg z-30">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold">{lineas.length - pendientes}</span> de <span className="font-semibold">{lineas.length}</span> líneas marcadas
              {pendientes > 0 && <span className="text-amber-600"> · {pendientes} pendientes</span>}
            </div>
            <Button onClick={completar} disabled={completando || !todasMarcadas}>
              <ChevronRight size={16} /> {completando ? 'Completando…' : 'Completar recepción'}
            </Button>
          </div>
        </div>
      )}

      <CrearIncidenciaModal
        open={!!incidenciaPara}
        onClose={() => setIncidenciaPara(null)}
        onCreated={() => { setMensaje('Incidencia creada'); setTimeout(() => setMensaje(null), 4000); cargar() }}
        defaults={incidenciaPara ? {
          proveedor_id: cab.proveedor_id,
          local_id: cab.local_id,
          recepcion_id: cab.id,
          recepcion_linea_id: incidenciaPara.id,
          pedido_id: cab.pedido_id,
          formato_id: incidenciaPara.formato_id,
          producto_id: incidenciaPara.producto_id,
        } : undefined}
      />
    </div>
  )
}
