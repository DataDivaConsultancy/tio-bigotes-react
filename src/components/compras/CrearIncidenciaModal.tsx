import { useEffect, useState } from 'react'
import { X as IconX, Camera, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { crearIncidencia } from '@/lib/compras/incidencias'
import { uploadFoto } from '@/lib/storage'
import { TIPO_INCIDENCIA_LABELS, type TipoIncidencia, type Urgencia } from '@/lib/schemas/incidencias'
import { listarProveedores, type ProveedorMin } from '@/lib/compras/maestros'

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (id: string, numero: string) => void
  defaults?: {
    proveedor_id?: number
    local_id?: number
    recepcion_id?: string | null
    recepcion_linea_id?: string | null
    pedido_id?: string | null
    formato_id?: string | null
    producto_id?: number | null
    descripcion?: string
  }
}

const TIPOS_RAPIDOS: TipoIncidencia[] = ['faltante', 'danado', 'caducado', 'temp_incorrecta', 'no_solicitado', 'otro']

export default function CrearIncidenciaModal({ open, onClose, onCreated, defaults = {} }: Props) {
  const [tipo, setTipo] = useState<TipoIncidencia | ''>('')
  const [descripcion, setDescripcion] = useState(defaults.descripcion || '')
  const [cantidadAfectada, setCantidadAfectada] = useState<number | ''>('')
  const [urgencia, setUrgencia] = useState<Urgencia>('media')
  const [fotos, setFotos] = useState<string[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proveedorPick, setProveedorPick] = useState<number | undefined>(defaults.proveedor_id)
  const [proveedores, setProveedores] = useState<ProveedorMin[]>([])

  // Cargar proveedores cuando hace falta selector
  useEffect(() => {
    if (open && !defaults.proveedor_id) {
      listarProveedores().then(setProveedores).catch(() => {})
    }
    if (open) setProveedorPick(defaults.proveedor_id)
  }, [open, defaults.proveedor_id])

  if (!open) return null

  async function handleFile(files: FileList | null) {
    if (!files || files.length === 0) return
    setSubiendo(true); setError(null)
    try {
      const prefix = `prov-${defaults.proveedor_id ?? 'x'}/${new Date().toISOString().slice(0, 10)}`
      const ups = await Promise.all(Array.from(files).map((f) => uploadFoto(f, 'incidencias', prefix)))
      setFotos((prev) => [...prev, ...ups.map((u) => u.url)])
    } catch (e: any) {
      setError(e.message || 'Error subiendo foto')
    } finally {
      setSubiendo(false)
    }
  }

  async function guardar() {
    if (!tipo) { setError('Selecciona un tipo'); return }
    if (!proveedorPick) { setError('Falta el proveedor'); return }
    if (fotos.length === 0 && tipo !== 'otro') {
      setError('La foto es obligatoria (excepto en tipo "otro")'); return
    }

    setGuardando(true); setError(null)
    const r = await crearIncidencia({
      p_tipo: tipo,
      p_proveedor_id: proveedorPick,
      p_descripcion: descripcion || null,
      p_recepcion_id: defaults.recepcion_id ?? null,
      p_recepcion_linea_id: defaults.recepcion_linea_id ?? null,
      p_pedido_id: defaults.pedido_id ?? null,
      p_local_id: defaults.local_id ?? null,
      p_formato_id: defaults.formato_id ?? null,
      p_producto_id: defaults.producto_id ?? null,
      p_cantidad_afectada: cantidadAfectada || null,
      p_urgencia: urgencia,
      p_fotos_urls: fotos,
    })
    setGuardando(false)
    if (!r.ok) { setError(r.error || 'Error al crear incidencia'); return }
    const data = (r as any).data
    onCreated?.(data?.id, data?.numero)
    cerrar()
  }

  function cerrar() {
    setTipo(''); setDescripcion(''); setCantidadAfectada(''); setUrgencia('media'); setFotos([]); setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/50" onClick={cerrar}>
      <div
        className="w-full md:w-[600px] max-h-[90vh] overflow-y-auto bg-card rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between sticky top-0 bg-card">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            <h2 className="font-semibold">Nueva incidencia</h2>
          </div>
          <button onClick={cerrar} className="p-1 hover:bg-muted rounded"><IconX size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Selector de proveedor — solo si no viene en defaults */}
          {!defaults.proveedor_id && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Proveedor *</label>
              <select
                value={proveedorPick ?? ''}
                onChange={(e) => setProveedorPick(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2 text-sm bg-background border rounded-md"
              >
                <option value="">— Seleccionar —</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial}</option>)}
              </select>
            </div>
          )}

          {/* Tipo */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Tipo *</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {TIPOS_RAPIDOS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                    tipo === t
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-background border-border hover:border-amber-400'
                  }`}
                >
                  {TIPO_INCIDENCIA_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Foto */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Foto {tipo !== 'otro' ? '*' : '(opcional)'}
            </label>
            <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer hover:border-amber-400 transition-colors">
              <Camera size={20} className="text-muted-foreground" />
              <span className="text-sm font-medium">{subiendo ? 'Subiendo…' : 'Hacer foto / Subir'}</span>
              <input
                type="file" accept="image/*" capture="environment" multiple
                onChange={(e) => handleFile(e.target.files)} className="hidden"
              />
            </label>
            {fotos.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {fotos.map((u, i) => (
                  <div key={i} className="relative group">
                    <img src={u} alt={`foto-${i}`} className="w-full h-20 object-cover rounded border" />
                    <button
                      type="button"
                      onClick={() => setFotos(fotos.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                    ><IconX size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cantidad afectada */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cantidad afectada</label>
              <Input
                type="number" min={0} step="any"
                value={cantidadAfectada}
                onChange={(e) => setCantidadAfectada(e.target.value ? Number(e.target.value) : '')}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Urgencia</label>
              <select
                value={urgencia}
                onChange={(e) => setUrgencia(e.target.value as Urgencia)}
                className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Descripción / comentarios</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              placeholder="Cualquier detalle relevante…"
              className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md"
            />
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2 sticky bottom-0 bg-card">
          <Button variant="outline" onClick={cerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || subiendo || !tipo}>
            {guardando ? 'Guardando…' : 'Crear incidencia'}
          </Button>
        </div>
      </div>
    </div>
  )
}
