import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Save, ArrowLeft, Plus, Trash2, GripVertical, AlertTriangle,
  BookOpen, ChevronDown, ChevronUp
} from 'lucide-react'

/* ─── Types ─── */

interface Linea {
  key: string // client-side key for React
  componente_producto_id: number | null
  componente_escandallo_id: number | null
  cantidad_bruta: number
  unidad: string
  merma_pct: number
  coste_override: number | null
  notas: string
  orden: number
  // display helpers (resolved from lookups)
  componente_nombre?: string
  coste_unitario?: number // resolved cost
}

interface Cabecera {
  producto_id: number | null
  nombre: string
  descripcion: string
  unidad_resultado: string
  cantidad_resultado: number
  es_subreceta: boolean
  notas: string
}

interface ProductoOption {
  id: number
  nombre: string
  tipo: string
  precio_compra: number | null
}

interface SubrecetaOption {
  id: number
  nombre: string
  coste_por_unidad: number
  unidad_resultado: string
  cantidad_resultado: number
}

interface UnidadOption {
  codigo: string
  nombre: string
  tipo: string
}

const emptyLinea = (): Linea => ({
  key: crypto.randomUUID(),
  componente_producto_id: null,
  componente_escandallo_id: null,
  cantidad_bruta: 0,
  unidad: 'ud',
  merma_pct: 0,
  coste_override: null,
  notas: '',
  orden: 0,
})

const emptyCabecera: Cabecera = {
  producto_id: null,
  nombre: '',
  descripcion: '',
  unidad_resultado: 'ud',
  cantidad_resultado: 1,
  es_subreceta: false,
  notas: '',
}

export default function EditorEscandallo() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'nuevo'

  const [cabecera, setCabecera] = useState<Cabecera>({ ...emptyCabecera })
  const [lineas, setLineas] = useState<Linea[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Lookup data
  const [productosVenta, setProductosVenta] = useState<ProductoOption[]>([])
  const [productosCompra, setProductosCompra] = useState<ProductoOption[]>([])
  const [subrecetas, setSubrecetas] = useState<SubrecetaOption[]>([])
  const [unidades, setUnidades] = useState<UnidadOption[]>([])

  // Component selector state
  const [selectorOpen, setSelectorOpen] = useState<number | null>(null)
  const [selectorSearch, setSelectorSearch] = useState('')

  /* ─── Load lookup data ─── */

  useEffect(() => {
    Promise.all([
      supabase.from('productos_v2').select('id, nombre, tipo, precio_compra')
        .in('tipo', ['venta', 'ambos']).eq('activo', true).order('nombre'),
      supabase.from('productos_v2').select('id, nombre, tipo, precio_compra')
        .in('tipo', ['compra', 'ambos']).eq('activo', true).order('nombre'),
      supabase.from('vw_escandallo_resumen').select('escandallo_id, nombre, coste_por_unidad, unidad_resultado, cantidad_resultado')
        .eq('es_subreceta', true),
      supabase.from('unidades_medida').select('codigo, nombre, tipo').order('codigo'),
    ]).then(([pvRes, pcRes, srRes, uRes]) => {
      if (pvRes.data) setProductosVenta(pvRes.data)
      if (pcRes.data) setProductosCompra(pcRes.data)
      if (srRes.data) setSubrecetas(srRes.data.map((s: any) => ({
        id: s.escandallo_id,
        nombre: s.nombre,
        coste_por_unidad: s.coste_por_unidad || 0,
        unidad_resultado: s.unidad_resultado,
        cantidad_resultado: s.cantidad_resultado,
      })))
      if (uRes.data) setUnidades(uRes.data)
    })
  }, [])

  /* ─── Load existing escandallo ─── */

  useEffect(() => {
    if (isNew) return
    loadEscandallo()
  }, [id])

  async function loadEscandallo() {
    setLoading(true)
    // Load header
    const { data: esc, error: errEsc } = await supabase
      .from('escandallos')
      .select('*')
      .eq('id', Number(id))
      .single()

    if (errEsc || !esc) {
      setError('No se encontró el escandallo')
      setLoading(false)
      return
    }

    setCabecera({
      producto_id: esc.producto_id,
      nombre: esc.nombre,
      descripcion: esc.descripcion || '',
      unidad_resultado: esc.unidad_resultado,
      cantidad_resultado: esc.cantidad_resultado,
      es_subreceta: esc.es_subreceta,
      notas: esc.notas || '',
    })

    // Load lines with component names
    const { data: lineasData } = await supabase
      .from('escandallo_lineas')
      .select(`
        id, escandallo_id, orden,
        componente_producto_id, componente_escandallo_id,
        cantidad_bruta, unidad, merma_pct, coste_override, notas
      `)
      .eq('escandallo_id', Number(id))
      .order('orden')

    if (lineasData) {
      setLineas(lineasData.map(l => ({
        key: crypto.randomUUID(),
        componente_producto_id: l.componente_producto_id,
        componente_escandallo_id: l.componente_escandallo_id,
        cantidad_bruta: Number(l.cantidad_bruta),
        unidad: l.unidad,
        merma_pct: Number(l.merma_pct),
        coste_override: l.coste_override ? Number(l.coste_override) : null,
        notas: l.notas || '',
        orden: l.orden,
      })))
    }
    setLoading(false)
  }

  /* ─── Resolve component names & costs ─── */

  const resolveComponente = useCallback((linea: Linea) => {
    if (linea.componente_producto_id) {
      const p = productosCompra.find(x => x.id === linea.componente_producto_id)
      return {
        nombre: p?.nombre || `Producto #${linea.componente_producto_id}`,
        coste: linea.coste_override ?? (p?.precio_compra || 0),
      }
    }
    if (linea.componente_escandallo_id) {
      const s = subrecetas.find(x => x.id === linea.componente_escandallo_id)
      return {
        nombre: s ? `SUB: ${s.nombre}` : `Sub-receta #${linea.componente_escandallo_id}`,
        coste: linea.coste_override ?? (s?.coste_por_unidad || 0),
      }
    }
    return { nombre: '— Seleccionar —', coste: 0 }
  }, [productosCompra, subrecetas])

  /* ─── Cost calculations ─── */

  const calcCosteLinea = (linea: Linea) => {
    const { coste } = resolveComponente(linea)
    return linea.cantidad_bruta * coste
  }

  const costeTotal = lineas.reduce((sum, l) => sum + calcCosteLinea(l), 0)
  const costePorUnidad = cabecera.cantidad_resultado > 0
    ? costeTotal / cabecera.cantidad_resultado : 0

  /* ─── Line operations ─── */

  function addLinea() {
    const newLinea = emptyLinea()
    newLinea.orden = lineas.length
    setLineas([...lineas, newLinea])
  }

  function removeLinea(key: string) {
    setLineas(lineas.filter(l => l.key !== key).map((l, i) => ({ ...l, orden: i })))
  }

  function updateLinea(key: string, updates: Partial<Linea>) {
    setLineas(lineas.map(l => l.key === key ? { ...l, ...updates } : l))
  }

  function moveLinea(key: string, direction: 'up' | 'down') {
    const idx = lineas.findIndex(l => l.key === key)
    if (idx < 0) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= lineas.length) return
    const newLineas = [...lineas]
    ;[newLineas[idx], newLineas[newIdx]] = [newLineas[newIdx], newLineas[idx]]
    setLineas(newLineas.map((l, i) => ({ ...l, orden: i })))
  }

  function selectComponente(key: string, tipo: 'producto' | 'subreceta', componenteId: number) {
    if (tipo === 'producto') {
      const p = productosCompra.find(x => x.id === componenteId)
      updateLinea(key, {
        componente_producto_id: componenteId,
        componente_escandallo_id: null,
        unidad: 'kg', // default
      })
    } else {
      const s = subrecetas.find(x => x.id === componenteId)
      updateLinea(key, {
        componente_producto_id: null,
        componente_escandallo_id: componenteId,
        unidad: s?.unidad_resultado || 'ud',
      })
    }
    setSelectorOpen(null)
    setSelectorSearch('')
  }

  /* ─── Save ─── */

  async function handleSave() {
    if (!cabecera.nombre.trim()) {
      setError('El nombre es obligatorio')
      return
    }

    setSaving(true)
    setError('')

    try {
      // Check for cycles if we have sub-recipe components
      const subComponents = lineas
        .filter(l => l.componente_escandallo_id)
        .map(l => l.componente_escandallo_id!)

      if (subComponents.length > 0 && !isNew) {
        const { data: cycleCheck } = await supabase
          .rpc('rpc_detectar_ciclos_escandallo', {
            p_escandallo_id: Number(id),
            p_componentes_escandallo: subComponents,
          })
        if (cycleCheck && cycleCheck.length > 0) {
          setError(`Ciclo detectado: ${cycleCheck.map((c: any) => c.nombre).join(' → ')}`)
          setSaving(false)
          return
        }
      }

      const payload = {
        p_nombre: cabecera.nombre.trim(),
        p_descripcion: cabecera.descripcion || null,
        p_producto_id: cabecera.producto_id,
        p_unidad_resultado: cabecera.unidad_resultado,
        p_cantidad_resultado: cabecera.cantidad_resultado,
        p_es_subreceta: cabecera.es_subreceta,
        p_notas: cabecera.notas || null,
        p_lineas: lineas.map((l, i) => ({
          componente_producto_id: l.componente_producto_id,
          componente_escandallo_id: l.componente_escandallo_id,
          cantidad_bruta: l.cantidad_bruta,
          unidad: l.unidad,
          merma_pct: l.merma_pct,
          coste_override: l.coste_override,
          notas: l.notas || null,
          orden: i,
        })),
      }

      if (isNew) {
        const { data, error: err } = await supabase.rpc('rpc_crear_escandallo', payload)
        if (err) throw err
        navigate(`/escandallos/${data}`, { replace: true })
      } else {
        // Update: delete old lines, update header, insert new lines
        const escId = Number(id)

        const { error: errUpd } = await supabase
          .from('escandallos')
          .update({
            nombre: cabecera.nombre.trim(),
            descripcion: cabecera.descripcion || null,
            producto_id: cabecera.producto_id,
            unidad_resultado: cabecera.unidad_resultado,
            cantidad_resultado: cabecera.cantidad_resultado,
            es_subreceta: cabecera.es_subreceta,
            notas: cabecera.notas || null,
          })
          .eq('id', escId)

        if (errUpd) throw errUpd

        // Delete old lines
        await supabase.from('escandallo_lineas').delete().eq('escandallo_id', escId)

        // Insert new lines
        if (lineas.length > 0) {
          const { error: errLines } = await supabase
            .from('escandallo_lineas')
            .insert(lineas.map((l, i) => ({
              escandallo_id: escId,
              componente_producto_id: l.componente_producto_id,
              componente_escandallo_id: l.componente_escandallo_id,
              cantidad_bruta: l.cantidad_bruta,
              unidad: l.unidad,
              merma_pct: l.merma_pct,
              coste_override: l.coste_override,
              notas: l.notas || null,
              orden: i,
            })))
          if (errLines) throw errLines
        }

        // Reload to get fresh data
        await loadEscandallo()
      }
    } catch (err: any) {
      setError(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  /* ─── Render ─── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const filteredProductos = productosCompra.filter(p =>
    p.nombre.toLowerCase().includes(selectorSearch.toLowerCase())
  )
  const filteredSubrecetas = subrecetas.filter(s =>
    s.nombre.toLowerCase().includes(selectorSearch.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/escandallos')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">
            {isNew ? 'Nuevo Escandallo' : cabecera.nombre}
          </h1>
          {cabecera.es_subreceta && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              Sub-receta
            </span>
          )}
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Main content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Cabecera */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Datos generales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nombre *</label>
                  <Input
                    value={cabecera.nombre}
                    onChange={e => setCabecera({ ...cabecera, nombre: e.target.value })}
                    placeholder="Nombre del escandallo"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Producto vinculado</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    value={cabecera.producto_id || ''}
                    onChange={e => setCabecera({
                      ...cabecera,
                      producto_id: e.target.value ? Number(e.target.value) : null,
                    })}
                  >
                    <option value="">— Sin vincular —</option>
                    {productosVenta.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Unidad resultado</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    value={cabecera.unidad_resultado}
                    onChange={e => setCabecera({ ...cabecera, unidad_resultado: e.target.value })}
                  >
                    {unidades.map(u => (
                      <option key={u.codigo} value={u.codigo}>{u.codigo} - {u.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cantidad resultado</label>
                  <Input
                    type="number"
                    min={0.001}
                    step={0.001}
                    value={cabecera.cantidad_resultado}
                    onChange={e => setCabecera({
                      ...cabecera,
                      cantidad_resultado: Number(e.target.value) || 1,
                    })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Descripción</label>
                  <Input
                    value={cabecera.descripcion}
                    onChange={e => setCabecera({ ...cabecera, descripcion: e.target.value })}
                    placeholder="Descripción opcional"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="es_subreceta"
                    checked={cabecera.es_subreceta}
                    onChange={e => setCabecera({ ...cabecera, es_subreceta: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="es_subreceta" className="text-sm">
                    Es sub-receta (puede usarse como componente en otros escandallos)
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Líneas */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Ingredientes / Componentes</CardTitle>
                <Button variant="outline" size="sm" onClick={addLinea}>
                  <Plus className="h-4 w-4 mr-1" /> Añadir línea
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {lineas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No hay ingredientes. Pulsa &quot;Añadir línea&quot; para empezar.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="p-2 w-8"></th>
                        <th className="p-2 text-left">Componente</th>
                        <th className="p-2 text-right">Cantidad</th>
                        <th className="p-2 text-left">Unidad</th>
                        <th className="p-2 text-right">Merma %</th>
                        <th className="p-2 text-right">Coste/ud</th>
                        <th className="p-2 text-right">Coste línea</th>
                        <th className="p-2 w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((linea, idx) => {
                        const resolved = resolveComponente(linea)
                        const costeLinea = calcCosteLinea(linea)

                        return (
                          <tr key={linea.key} className="border-b hover:bg-muted/30">
                            {/* Drag handle */}
                            <td className="p-2 text-muted-foreground">
                              <div className="flex flex-col">
                                <button
                                  onClick={() => moveLinea(linea.key, 'up')}
                                  disabled={idx === 0}
                                  className="hover:text-foreground disabled:opacity-20"
                                >
                                  <ChevronUp className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => moveLinea(linea.key, 'down')}
                                  disabled={idx === lineas.length - 1}
                                  className="hover:text-foreground disabled:opacity-20"
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                              </div>
                            </td>

                            {/* Component selector */}
                            <td className="p-2 relative">
                              <button
                                onClick={() => {
                                  setSelectorOpen(selectorOpen === idx ? null : idx)
                                  setSelectorSearch('')
                                }}
                                className="text-left w-full h-8 px-2 border rounded text-sm hover:bg-muted/50 truncate"
                              >
                                {resolved.nombre}
                              </button>

                              {selectorOpen === idx && (
                                <div className="absolute z-50 top-full left-2 mt-1 w-80 bg-popover border rounded-lg shadow-lg p-2">
                                  <Input
                                    autoFocus
                                    placeholder="Buscar componente..."
                                    value={selectorSearch}
                                    onChange={e => setSelectorSearch(e.target.value)}
                                    className="h-8 mb-2"
                                  />
                                  <div className="max-h-60 overflow-y-auto space-y-1">
                                    {filteredProductos.length > 0 && (
                                      <div>
                                        <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                                          Productos de compra
                                        </div>
                                        {filteredProductos.map(p => (
                                          <button
                                            key={`p-${p.id}`}
                                            onClick={() => selectComponente(linea.key, 'producto', p.id)}
                                            className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted truncate"
                                          >
                                            {p.nombre}
                                            {p.precio_compra != null && (
                                              <span className="text-muted-foreground ml-2">
                                                {formatCurrency(p.precio_compra)}/ud
                                              </span>
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {filteredSubrecetas.length > 0 && (
                                      <div>
                                        <div className="text-xs font-medium text-purple-600 px-2 py-1">
                                          Sub-recetas
                                        </div>
                                        {filteredSubrecetas.map(s => (
                                          <button
                                            key={`s-${s.id}`}
                                            onClick={() => selectComponente(linea.key, 'subreceta', s.id)}
                                            className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted truncate"
                                          >
                                            SUB: {s.nombre}
                                            <span className="text-muted-foreground ml-2">
                                              {formatCurrency(s.coste_por_unidad)}/{s.unidad_resultado}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Cantidad */}
                            <td className="p-2">
                              <Input
                                type="number"
                                min={0}
                                   step={0.001}
                                value={linea.cantidad_bruta || ''}
                                onChange={e => updateLinea(linea.key, {
                                  cantidad_bruta: Number(e.target.value) || 0,
                                })}
                                className="h-8 text-right text-sm"
                              />
                            </td>

                            {/* Unidad */}
                            <td className="p-2">
                              <select
                                value={linea.unidad}
                                onChange={e => updateLinea(linea.key, { unidad: e.target.value })}
                                className="h-8 rounded border border-input bg-transparent px-2 text-sm"
                              >
                                {unidades.map(u => (
                                  <option key={u.codigo} value={u.codigo}>{u.codigo}</option>
                                ))}
                              </select>
                            </td>

                            {/* Merma % */}
                            <td className="p-2">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                value={linea.merma_pct || ''}
                                onChange={e => updateLinea(linea.key, {
                                  merma_pct: Number(e.target.value) || 0,
                                })}
                                className="h-8 text-right text-sm w-20"
                              />
                            </td>

                            {/* Coste unitario */}
                            <td className="p-2 text-right font-mono text-muted-foreground">
                              {formatCurrency(resolved.coste)}
                            </td>

                            {/* Coste línea */}
                            <td className="p-2 text-right font-mono font-medium">
                              {formatCurrency(costeLinea)}
                            </td>

                            {/* Actions */}
                            <td className="p-2">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => removeLinea(linea.key)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30 font-medium">
                        <td colSpan={6} className="p-3 text-right">
                          Coste total del escandallo:
                        </td>
                        <td className="p-3 text-right font-mono">
                          {formatCurrency(costeTotal)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Cost summary panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumen de coste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Líneas</span>
                  <span>{lineas.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Coste total</span>
                  <span className="font-mono font-medium">{formatCurrency(costeTotal)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="font-medium">Coste / {cabecera.unidad_resultado}</span>
                  <span className="font-mono text-lg font-bold text-primary">
                    {formatCurrency(costePorUnidad)}
                  </span>
                </div>
              </div>

              {cabecera.cantidad_resultado > 1 && (
                <div className="text-xs text-muted-foreground">
                  Para {formatNumber(cabecera.cantidad_resultado)} {cabecera.unidad_resultado}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={cabecera.notas}
                onChange={e => setCabecera({ ...cabecera, notas: e.target.value })}
                placeholder="Notas internas..."
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
