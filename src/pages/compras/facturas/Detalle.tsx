import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { uploadFoto } from '@/lib/storage'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft, FileText, Save, Plus, Trash2, Camera, Link2,
  CheckCircle2, CreditCard, XCircle, AlertCircle,
} from 'lucide-react'

type Estado = 'borrador' | 'aprobada' | 'pagada' | 'rechazada'

interface Cabecera {
  id?: string
  numero: string
  numero_interno?: string
  proveedor_id: number | null
  local_id: number | null
  fecha_emision: string
  fecha_vencimiento: string
  importe_neto: string
  iva_total: string
  importe_total: string
  foto_url: string | null
  notas: string
  estado: Estado
  motivo_rechazo: string | null
  fecha_pago: string | null
}

interface Linea {
  key: string
  id?: string
  descripcion: string
  cantidad: string
  unidad: string
  precio_unitario: string
  descuento_pct: string
  iva_pct: string
  total_linea: string
  notas: string
}

interface RecepcionOption {
  id: string
  numero: string
  iniciada_at: string
  proveedor_id: number
  proveedor_nombre: string | null
  estado: string
  numero_albaran_papel: string | null
}

const emptyLinea = (): Linea => ({
  key: crypto.randomUUID(),
  descripcion: '',
  cantidad: '0',
  unidad: 'ud',
  precio_unitario: '0',
  descuento_pct: '0',
  iva_pct: '21',
  total_linea: '0',
  notas: '',
})

const emptyCabecera = (): Cabecera => ({
  numero: '',
  proveedor_id: null,
  local_id: null,
  fecha_emision: new Date().toISOString().slice(0, 10),
  fecha_vencimiento: '',
  importe_neto: '',
  iva_total: '',
  importe_total: '0',
  foto_url: null,
  notas: '',
  estado: 'borrador',
  motivo_rechazo: null,
  fecha_pago: null,
})

const ESTADO_LABEL: Record<Estado, string> = {
  borrador: 'Borrador', aprobada: 'Aprobada', pagada: 'Pagada', rechazada: 'Rechazada',
}
const ESTADO_COLOR: Record<Estado, string> = {
  borrador: 'bg-yellow-500/10 text-yellow-600',
  aprobada: 'bg-blue-500/10 text-blue-600',
  pagada: 'bg-green-500/10 text-green-600',
  rechazada: 'bg-red-500/10 text-red-600',
}

export default function DetalleFactura() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'nueva'
  const { user } = useAuth()
  const empleadoId = (user as any)?.empleado_id ?? null

  const [cab, setCab] = useState<Cabecera>(emptyCabecera())
  const [lineas, setLineas] = useState<Linea[]>([emptyLinea()])
  const [proveedores, setProveedores] = useState<{ id: number; nombre_comercial: string }[]>([])
  const [locales, setLocales] = useState<{ id: number; nombre: string }[]>([])
  const [recepcionesDisponibles, setRecepcionesDisponibles] = useState<RecepcionOption[]>([])
  const [recepcionesVinculadas, setRecepcionesVinculadas] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrConfianza, setOcrConfianza] = useState<number | null>(null)
  const [ocrCamposBajos, setOcrCamposBajos] = useState<Set<string>>(new Set())

  useEffect(() => { void load() }, [id])

  async function load() {
    setLoading(true)
    setError(null)
    const [provRes, locRes] = await Promise.all([
      supabase.from('proveedores_v2').select('id, nombre_comercial').eq('activo', true).order('nombre_comercial'),
      supabase.from('locales_compra_v2').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    if (provRes.data) setProveedores(provRes.data)
    if (locRes.data) setLocales(locRes.data)

    if (!isNew && id) {
      const [facRes, linRes, recRes] = await Promise.all([
        supabase.from('facturas_compra').select('*').eq('id', id).maybeSingle(),
        supabase.from('factura_compra_lineas').select('*').eq('factura_id', id).order('orden'),
        supabase.from('factura_recepciones').select('recepcion_id').eq('factura_id', id),
      ])
      if (facRes.error || !facRes.data) {
        setError('Factura no encontrada')
        setLoading(false)
        return
      }
      const f = facRes.data as any
      setCab({
        id: f.id,
        numero: f.numero,
        numero_interno: f.numero_interno,
        proveedor_id: f.proveedor_id,
        local_id: f.local_id,
        fecha_emision: f.fecha_emision,
        fecha_vencimiento: f.fecha_vencimiento ?? '',
        importe_neto: f.importe_neto?.toString() ?? '',
        iva_total: f.iva_total?.toString() ?? '',
        importe_total: f.importe_total?.toString() ?? '0',
        foto_url: f.foto_url,
        notas: f.notas ?? '',
        estado: f.estado,
        motivo_rechazo: f.motivo_rechazo,
        fecha_pago: f.fecha_pago,
      })
      if (linRes.data) {
        setLineas(linRes.data.map((l: any) => ({
          key: l.id,
          id: l.id,
          descripcion: l.descripcion,
          cantidad: l.cantidad?.toString() ?? '0',
          unidad: l.unidad ?? 'ud',
          precio_unitario: l.precio_unitario?.toString() ?? '0',
          descuento_pct: l.descuento_pct?.toString() ?? '0',
          iva_pct: l.iva_pct?.toString() ?? '21',
          total_linea: l.total_linea?.toString() ?? '0',
          notas: l.notas ?? '',
        })))
      }
      if (recRes.data) {
        setRecepcionesVinculadas(new Set(recRes.data.map((r: any) => r.recepcion_id)))
      }
    }
    setLoading(false)
  }

  // Cargar recepciones disponibles (mismo proveedor, ya completadas, sin factura asignada) cuando se elige proveedor
  useEffect(() => {
    if (!cab.proveedor_id) { setRecepcionesDisponibles([]); return }
    void supabase
      .from('recepciones')
      .select('id, numero, iniciada_at, proveedor_id, estado, numero_albaran_papel, proveedores_v2!inner(nombre_comercial)')
      .eq('proveedor_id', cab.proveedor_id)
      .in('estado', ['aprobada', 'cerrada'])
      .order('iniciada_at', { ascending: false })
      .limit(50)
      .then(r => {
        if (r.data) {
          setRecepcionesDisponibles(r.data.map((d: any) => ({
            id: d.id,
            numero: d.numero,
            iniciada_at: d.iniciada_at,
            proveedor_id: d.proveedor_id,
            proveedor_nombre: d.proveedores_v2?.nombre_comercial ?? null,
            estado: d.estado,
            numero_albaran_papel: d.numero_albaran_papel,
          })))
        }
      })
  }, [cab.proveedor_id])

  const totalCalculado = useMemo(() => {
    return lineas.reduce((s, l) => s + (Number(l.total_linea) || 0), 0)
  }, [lineas])

  function updateLinea(idx: number, field: keyof Linea, value: string) {
    setLineas(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      // Auto-calcular total_linea si cambió cantidad / precio / descuento / iva
      if (['cantidad', 'precio_unitario', 'descuento_pct', 'iva_pct'].includes(field)) {
        const l = next[idx]
        const cant = Number(l.cantidad) || 0
        const pu = Number(l.precio_unitario) || 0
        const desc = Number(l.descuento_pct) || 0
        const iva = Number(l.iva_pct) || 0
        const subtotal = cant * pu * (1 - desc / 100)
        const total = subtotal * (1 + iva / 100)
        next[idx].total_linea = total.toFixed(2)
      }
      return next
    })
  }

  function addLinea() {
    setLineas(prev => [...prev, emptyLinea()])
  }
  function removeLinea(idx: number) {
    setLineas(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleFotoUpload(file: File) {
    setUploadingFoto(true)
    try {
      const { url } = await uploadFoto(file, 'facturas', cab.id ?? 'temp')
      setCab(c => ({ ...c, foto_url: url }))
      // Disparar OCR automáticamente tras la subida
      void runOcr(url)
    } catch (e: any) {
      alert(`Error al subir foto: ${e.message}`)
    }
    setUploadingFoto(false)
  }

  async function runOcr(documentoUrl: string) {
    setOcrLoading(true)
    setOcrConfianza(null)
    setOcrCamposBajos(new Set())
    try {
      const { data, error } = await supabase.functions.invoke('ocr-documento', {
        body: { documento_url: documentoUrl, tipo: 'factura' },
      })
      if (error) {
        alert(`OCR error: ${error.message}`)
        setOcrLoading(false); return
      }
      if (!data?.ok) {
        alert(`OCR error: ${data?.error ?? 'desconocido'}`)
        setOcrLoading(false); return
      }
      // Pre-llenar campos. Marcar 'bajos' los que tengan datos pero confianza < 50
      const cab2 = data.cabecera || {}
      const camposBajos = new Set<string>()
      const baja = data.confianza < 50

      setCab(prev => {
        const next = { ...prev }
        if (cab2.numero && !next.numero) {
          next.numero = cab2.numero
          if (baja) camposBajos.add('numero')
        }
        if (cab2.fecha) {
          next.fecha_emision = cab2.fecha
          if (baja) camposBajos.add('fecha_emision')
        }
        if (cab2.importe_total != null) {
          next.importe_total = String(cab2.importe_total)
          if (baja) camposBajos.add('importe_total')
        }
        if (cab2.importe_neto != null) {
          next.importe_neto = String(cab2.importe_neto)
        }
        if (cab2.iva_total != null) {
          next.iva_total = String(cab2.iva_total)
        }
        return next
      })

      // Pre-llenar líneas si vienen del OCR y aún no hay líneas con descripción real
      if (Array.isArray(data.lineas) && data.lineas.length > 0) {
        const yaTieneLineasReales = lineas.some(l => l.descripcion.trim().length > 0)
        if (!yaTieneLineasReales) {
          setLineas(data.lineas.map((l: any, i: number) => ({
            key: crypto.randomUUID(),
            descripcion: l.descripcion ?? '',
            cantidad: String(l.cantidad ?? 0),
            unidad: 'ud',
            precio_unitario: String(l.precio_unitario ?? 0),
            descuento_pct: '0',
            iva_pct: '21',
            total_linea: String(l.total_linea ?? 0),
            notas: '',
          })))
        }
      }

      // Match proveedor por CIF (frontend)
      if (cab2.cif_proveedor) {
        const r = await supabase
          .from('proveedores_v2')
          .select('id, cif, nombre_comercial')
          .ilike('cif', `%${cab2.cif_proveedor}%`)
          .limit(1)
          .maybeSingle()
        if (r.data?.id) {
          setCab(prev => ({ ...prev, proveedor_id: r.data!.id }))
        }
      }

      setOcrConfianza(data.confianza ?? 0)
      setOcrCamposBajos(camposBajos)
    } catch (e: any) {
      alert(`OCR error: ${e.message}`)
    }
    setOcrLoading(false)
  }

  function toggleRecepcion(recId: string) {
    setRecepcionesVinculadas(prev => {
      const next = new Set(prev)
      if (next.has(recId)) next.delete(recId)
      else next.add(recId)
      return next
    })
  }

  async function save() {
    if (!cab.numero.trim()) { alert('Falta número de factura'); return }
    if (!cab.proveedor_id || !cab.local_id) { alert('Falta proveedor o local'); return }
    if (!cab.fecha_emision) { alert('Falta fecha de emisión'); return }
    setSaving(true)

    const lineasPayload = lineas
      .filter(l => l.descripcion.trim() && Number(l.cantidad) > 0)
      .map((l, i) => ({
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        unidad: l.unidad,
        precio_unitario: Number(l.precio_unitario),
        descuento_pct: Number(l.descuento_pct) || 0,
        iva_pct: Number(l.iva_pct) || 0,
        total_linea: Number(l.total_linea),
        orden: i,
        notas: l.notas || null,
      }))

    if (isNew) {
      const { data, error } = await supabase.rpc('rpc_crear_factura', {
        p_numero: cab.numero,
        p_proveedor_id: cab.proveedor_id,
        p_local_id: cab.local_id,
        p_fecha_emision: cab.fecha_emision,
        p_importe_total: Number(cab.importe_total) || totalCalculado,
        p_lineas: lineasPayload,
        p_recepcion_ids: Array.from(recepcionesVinculadas),
        p_fecha_vencimiento: cab.fecha_vencimiento || null,
        p_importe_neto: cab.importe_neto ? Number(cab.importe_neto) : null,
        p_iva_total: cab.iva_total ? Number(cab.iva_total) : null,
        p_foto_url: cab.foto_url,
        p_notas: cab.notas || null,
        p_creado_por: empleadoId,
      })
      if (error) { alert(`Error: ${error.message}`); setSaving(false); return }
      if (data?.error) { alert(`Error: ${data.error} ${data.mensaje ?? ''}`); setSaving(false); return }
      navigate(`/compras/facturas/${data.id}`, { replace: true })
    } else if (id) {
      // Update directo (no hay RPC de update completo todavía, hacemos UPDATE simple a la tabla)
      const { error: errH } = await supabase.from('facturas_compra').update({
        numero: cab.numero,
        proveedor_id: cab.proveedor_id,
        local_id: cab.local_id,
        fecha_emision: cab.fecha_emision,
        fecha_vencimiento: cab.fecha_vencimiento || null,
        importe_neto: cab.importe_neto ? Number(cab.importe_neto) : null,
        iva_total: cab.iva_total ? Number(cab.iva_total) : null,
        importe_total: Number(cab.importe_total),
        foto_url: cab.foto_url,
        notas: cab.notas || null,
      }).eq('id', id)
      if (errH) { alert(`Error: ${errH.message}`); setSaving(false); return }

      // Reemplazar líneas
      await supabase.from('factura_compra_lineas').delete().eq('factura_id', id)
      if (lineasPayload.length > 0) {
        await supabase.from('factura_compra_lineas').insert(
          lineasPayload.map(l => ({ ...l, factura_id: id }))
        )
      }

      // Sincronizar recepciones vinculadas
      await supabase.rpc('rpc_vincular_recepciones_a_factura', {
        p_factura_id: id,
        p_recepcion_ids: Array.from(recepcionesVinculadas),
      })

      await load()
    }
    setSaving(false)
  }

  async function aprobar() {
    if (!id) return
    if (!confirm('¿Aprobar esta factura?')) return
    const { data, error } = await supabase.rpc('rpc_aprobar_factura', {
      p_factura_id: id,
      p_empleado_id: empleadoId,
    })
    if (error) { alert(`Error: ${error.message}`); return }
    if (data?.error) { alert(`Error: ${data.error}`); return }
    await load()
  }

  async function pagar() {
    if (!id) return
    const fecha = prompt('Fecha de pago (YYYY-MM-DD):', new Date().toISOString().slice(0, 10))
    if (!fecha) return
    const { data, error } = await supabase.rpc('rpc_pagar_factura', {
      p_factura_id: id,
      p_fecha_pago: fecha,
      p_empleado_id: empleadoId,
    })
    if (error) { alert(`Error: ${error.message}`); return }
    if (data?.error) { alert(`Error: ${data.error}`); return }
    await load()
  }

  async function rechazar() {
    if (!id) return
    const motivo = prompt('Motivo del rechazo:')
    if (!motivo) return
    const { data, error } = await supabase.rpc('rpc_rechazar_factura', {
      p_factura_id: id,
      p_motivo: motivo,
      p_empleado_id: empleadoId,
    })
    if (error) { alert(`Error: ${error.message}`); return }
    if (data?.error) { alert(`Error: ${data.error}`); return }
    await load()
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Cargando...</div>
  }
  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        {error}
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate('/compras/facturas')}>Volver</Button>
        </div>
      </div>
    )
  }

  const readonly = !isNew && cab.estado !== 'borrador'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/compras/facturas')}>
            <ArrowLeft size={16} className="mr-1" /> Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText size={22} />
              {isNew ? 'Nueva factura de compra' : `Factura ${cab.numero_interno ?? ''}`}
            </h1>
            {!isNew && (
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_COLOR[cab.estado]}`}>
                  {ESTADO_LABEL[cab.estado]}
                </span>
                {cab.fecha_pago && (
                  <span className="text-xs text-muted-foreground">
                    Pagada el {formatDate(cab.fecha_pago)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!isNew && cab.estado === 'borrador' && (
            <>
              <Button variant="outline" onClick={rechazar}>
                <XCircle size={14} className="mr-1" /> Rechazar
              </Button>
              <Button onClick={aprobar}>
                <CheckCircle2 size={14} className="mr-1" /> Aprobar
              </Button>
            </>
          )}
          {!isNew && cab.estado === 'aprobada' && (
            <>
              <Button variant="outline" onClick={rechazar}>
                <XCircle size={14} className="mr-1" /> Rechazar
              </Button>
              <Button onClick={pagar}>
                <CreditCard size={14} className="mr-1" /> Marcar como pagada
              </Button>
            </>
          )}
          {!readonly && (
            <Button onClick={save} disabled={saving}>
              <Save size={16} className="mr-2" />
              {saving ? 'Guardando...' : (isNew ? 'Crear' : 'Guardar')}
            </Button>
          )}
        </div>
      </div>

      {ocrLoading && (
        <Card className="border-blue-500/40 bg-blue-500/5">
          <CardContent className="p-3 text-sm flex items-center gap-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
            <span className="text-blue-700">Analizando el documento con OCR (3-10 segundos)...</span>
          </CardContent>
        </Card>
      )}

      {ocrConfianza != null && !ocrLoading && (
        <Card className={
          ocrConfianza >= 75 ? "border-green-500/40 bg-green-500/5" :
          ocrConfianza >= 50 ? "border-yellow-500/40 bg-yellow-500/5" :
                                "border-red-500/40 bg-red-500/5"
        }>
          <CardContent className="p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>
                ✨ OCR aplicado · Confianza <strong>{ocrConfianza}%</strong>
                {ocrConfianza < 50 && " · Verificá los campos pre-llenados"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => { setOcrConfianza(null); setOcrCamposBajos(new Set()) }}>
                Ocultar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {cab.motivo_rechazo && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-3 text-sm">
            <strong className="text-red-500">Motivo de rechazo:</strong> {cab.motivo_rechazo}
          </CardContent>
        </Card>
      )}

      {/* Cabecera */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Datos de factura</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Nº factura del proveedor *</label>
              <Input
                value={cab.numero}
                onChange={e => setCab(c => ({ ...c, numero: e.target.value }))}
                disabled={readonly}
                placeholder="A-2026-001"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Proveedor *</label>
              <select
                value={cab.proveedor_id ?? ''}
                onChange={e => setCab(c => ({ ...c, proveedor_id: e.target.value ? Number(e.target.value) : null }))}
                disabled={readonly}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Elegir proveedor —</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre_comercial}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Local *</label>
              <select
                value={cab.local_id ?? ''}
                onChange={e => setCab(c => ({ ...c, local_id: e.target.value ? Number(e.target.value) : null }))}
                disabled={readonly}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Elegir local —</option>
                {locales.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha emisión *</label>
              <Input
                type="date"
                value={cab.fecha_emision}
                onChange={e => setCab(c => ({ ...c, fecha_emision: e.target.value }))}
                disabled={readonly}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha vencimiento</label>
              <Input
                type="date"
                value={cab.fecha_vencimiento}
                onChange={e => setCab(c => ({ ...c, fecha_vencimiento: e.target.value }))}
                disabled={readonly}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Importe total (EUR) *</label>
              <Input
                type="number" min={0} step={0.01}
                value={cab.importe_total}
                onChange={e => setCab(c => ({ ...c, importe_total: e.target.value }))}
                disabled={readonly}
                className="font-mono"
              />
              {Math.abs(Number(cab.importe_total) - totalCalculado) > 0.01 && (
                <p className="text-xs text-orange-500 mt-1">
                  Líneas suman {formatCurrency(totalCalculado)}
                </p>
              )}
            </div>
          </div>

          {/* Foto / PDF */}
          <div className="flex items-center gap-3 pt-3 border-t">
            {cab.foto_url ? (
              <a href={cab.foto_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Camera size={14} /> Ver factura adjunta
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">Sin foto/PDF adjunto</span>
            )}
            {!readonly && (
              <>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*,application/pdf,.pdf"
                    onChange={e => e.target.files?.[0] && handleFotoUpload(e.target.files[0])}
                    className="hidden"
                  />
                  <Button variant="outline" size="sm" disabled={uploadingFoto || ocrLoading} asChild>
                    <span>
                      <Camera size={12} className="mr-1" />
                      {uploadingFoto ? 'Subiendo...' : (cab.foto_url ? 'Cambiar archivo' : 'Adjuntar foto/PDF')}
                    </span>
                  </Button>
                </label>
                {cab.foto_url && (
                  <Button variant="ghost" size="sm" disabled={ocrLoading} onClick={() => runOcr(cab.foto_url!)}>
                    {ocrLoading ? 'Analizando...' : '✨ Re-aplicar OCR'}
                  </Button>
                )}
              </>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Notas</label>
            <Input
              value={cab.notas}
              onChange={e => setCab(c => ({ ...c, notas: e.target.value }))}
              disabled={readonly}
              placeholder="Notas internas"
            />
          </div>
        </CardContent>
      </Card>

      {/* Líneas */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Líneas de factura</CardTitle>
          {!readonly && (
            <Button variant="outline" size="sm" onClick={addLinea}>
              <Plus size={12} className="mr-1" /> Añadir línea
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-2">Descripción</th>
                  <th className="text-right p-2 w-20">Cant.</th>
                  <th className="text-left p-2 w-16">Ud.</th>
                  <th className="text-right p-2 w-24">Precio</th>
                  <th className="text-right p-2 w-16">Dto%</th>
                  <th className="text-right p-2 w-16">IVA%</th>
                  <th className="text-right p-2 w-24">Total</th>
                  {!readonly && <th className="w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, idx) => (
                  <tr key={l.key} className="border-b">
                    <td className="p-2">
                      <Input
                        value={l.descripcion}
                        onChange={e => updateLinea(idx, 'descripcion', e.target.value)}
                        disabled={readonly}
                        className="h-8 text-sm"
                        placeholder="Concepto..."
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step={0.001}
                        value={l.cantidad}
                        onChange={e => updateLinea(idx, 'cantidad', e.target.value)}
                        disabled={readonly}
                        className="h-8 text-sm font-mono text-right"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={l.unidad}
                        onChange={e => updateLinea(idx, 'unidad', e.target.value)}
                        disabled={readonly}
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} step={0.0001}
                        value={l.precio_unitario}
                        onChange={e => updateLinea(idx, 'precio_unitario', e.target.value)}
                        disabled={readonly}
                        className="h-8 text-sm font-mono text-right"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} max={100} step={0.1}
                        value={l.descuento_pct}
                        onChange={e => updateLinea(idx, 'descuento_pct', e.target.value)}
                        disabled={readonly}
                        className="h-8 text-sm font-mono text-right"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number" min={0} max={100} step={0.1}
                        value={l.iva_pct}
                        onChange={e => updateLinea(idx, 'iva_pct', e.target.value)}
                        disabled={readonly}
                        className="h-8 text-sm font-mono text-right"
                      />
                    </td>
                    <td className="p-2 text-right font-mono text-sm">
                      {formatCurrency(Number(l.total_linea) || 0)}
                    </td>
                    {!readonly && (
                      <td className="p-2 text-center">
                        <Button variant="ghost" size="sm" onClick={() => removeLinea(idx)}>
                          <Trash2 size={12} className="text-red-500" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/20 font-medium">
                  <td colSpan={6} className="p-2 text-right">Total líneas</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(totalCalculado)}</td>
                  {!readonly && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recepciones vinculadas */}
      {cab.proveedor_id && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 size={16} />
              Recepciones cubiertas por esta factura
              {recepcionesVinculadas.size > 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  ({recepcionesVinculadas.size} vinculadas)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recepcionesDisponibles.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay recepciones aprobadas/cerradas de este proveedor para vincular.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/40">
                    <tr>
                      <th className="text-left p-2 w-8"></th>
                      <th className="text-left p-2">Recepción</th>
                      <th className="text-left p-2">Albarán papel</th>
                      <th className="text-left p-2">Fecha</th>
                      <th className="text-left p-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recepcionesDisponibles.map(r => (
                      <tr key={r.id}
                          className={`border-t cursor-pointer hover:bg-muted/30 ${recepcionesVinculadas.has(r.id) ? 'bg-blue-500/5' : ''}`}
                          onClick={() => !readonly && toggleRecepcion(r.id)}>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={recepcionesVinculadas.has(r.id)}
                            onChange={() => toggleRecepcion(r.id)}
                            disabled={readonly}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="p-2 font-mono text-xs">{r.numero}</td>
                        <td className="p-2 text-xs">{r.numero_albaran_papel ?? '—'}</td>
                        <td className="p-2 text-xs">{formatDate(r.iniciada_at)}</td>
                        <td className="p-2 text-xs">{r.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
