import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Search, CheckCircle2, AlertTriangle, Link2, Trash2,
  Sparkles, Filter, RefreshCw,
} from 'lucide-react'

/* ─── Types ─── */
interface AliasPendiente {
  alias_tpv: string
  alias_normalizado: string
  n_ventas: number
  primera_venta: string | null
  ultima_venta: string | null
  unidades_totales: number | null
  importe_total: number | null
}
interface AliasActivo {
  alias_id: number
  alias_tpv: string
  alias_normalizado: string
  producto_id: number
  producto_nombre: string
  producto_codigo: string | null
  notas: string | null
  created_at: string
  updated_at: string
  n_ventas_mapeadas: number
  importe_total_mapeado: number | null
}
interface ProductoOption {
  id: number
  nombre: string
  codigo: string | null
}
interface Sugerencia {
  producto_id: number
  nombre: string
  codigo: string | null
  tipo: string
  tipo_match: 'exacto' | 'normalizado' | 'parcial'
  confianza: number
}

type Tab = 'pendientes' | 'activos'

export default function MapeoVentas() {
  const [activeTab, setActiveTab] = useState<Tab>('pendientes')
  const [pendientes, setPendientes] = useState<AliasPendiente[]>([])
  const [activos, setActivos] = useState<AliasActivo[]>([])
  const [productos, setProductos] = useState<ProductoOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Sugerencias por alias_tpv (cache)
  const [sugerencias, setSugerencias] = useState<Record<string, Sugerencia[]>>({})
  // Selección manual del usuario por alias_tpv
  const [selecciones, setSelecciones] = useState<Record<string, number | null>>({})
  // Estado de aplicación
  const [aplicando, setAplicando] = useState<Record<string, boolean>>({})

  useEffect(() => { void loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    setErrorMsg(null)
    const [pendRes, actRes, prodRes] = await Promise.all([
      supabase.from('vw_alias_pendientes').select('*'),
      supabase.from('vw_alias_activos').select('*').order('n_ventas_mapeadas', { ascending: false }),
      supabase
        .from('productos_v2')
        .select('id, nombre, codigo')
        .in('tipo', ['venta', 'ambos'])
        .eq('activo', true)
        .order('nombre'),
    ])
    const errors: string[] = []
    if (pendRes.error) errors.push(`vw_alias_pendientes: ${pendRes.error.message}`)
    if (actRes.error)  errors.push(`vw_alias_activos: ${actRes.error.message}`)
    if (prodRes.error) errors.push(`productos_v2: ${prodRes.error.message}`)
    if (errors.length > 0) {
      console.error('[MapeoVentas] errors:', errors)
      setErrorMsg(errors.join(' | '))
    }
    setPendientes((pendRes.data ?? []) as AliasPendiente[])
    setActivos((actRes.data ?? []) as AliasActivo[])
    setProductos(prodRes.data ?? [])
    setLoading(false)
  }

  /* ─── Cargar sugerencia de un alias (cacheada) ─── */
  async function loadSugerencia(alias: string) {
    if (sugerencias[alias]) return
    const { data, error } = await supabase.rpc('rpc_sugerir_producto_para_alias', { p_alias_tpv: alias })
    if (error) return
    const sugs = (data ?? []) as Sugerencia[]
    setSugerencias(prev => ({ ...prev, [alias]: sugs }))
    // Pre-seleccionar la sugerencia con confianza ≥ 90 (exacto/normalizado)
    if (sugs.length > 0 && sugs[0].confianza >= 90 && selecciones[alias] === undefined) {
      setSelecciones(prev => ({ ...prev, [alias]: sugs[0].producto_id }))
    }
  }

  /* ─── Pre-cargar sugerencias visibles al renderizar pendientes ─── */
  useEffect(() => {
    if (activeTab !== 'pendientes' || pendientes.length === 0) return
    // Cargamos las primeras 30 (las más frecuentes)
    pendientes.slice(0, 30).forEach(p => {
      if (!sugerencias[p.alias_tpv]) void loadSugerencia(p.alias_tpv)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, pendientes])

  async function aplicarMapeo(alias: string) {
    const productoId = selecciones[alias]
    if (!productoId) {
      alert('Elegí un producto destino')
      return
    }
    setAplicando(prev => ({ ...prev, [alias]: true }))
    const { data, error } = await supabase.rpc('rpc_crear_alias_y_reprocesar', {
      p_alias_tpv: alias,
      p_producto_id: productoId,
      p_notas: null,
    })
    if (error) {
      alert(`Error: ${error.message}`)
      setAplicando(prev => ({ ...prev, [alias]: false }))
      return
    }
    if (data?.error) {
      alert(`Error: ${data.error}`)
      setAplicando(prev => ({ ...prev, [alias]: false }))
      return
    }
    // Quitar de pendientes optimisticamente
    setPendientes(prev => prev.filter(p => p.alias_tpv !== alias))
    setAplicando(prev => ({ ...prev, [alias]: false }))
    // Refrescar la materialized view (no bloqueante; en backend tarda ~5s)
    void supabase.rpc('rpc_refresh_alias_pendientes')
    // Refrescar activos
    const { data: actData } = await supabase.from('vw_alias_activos').select('*').order('n_ventas_mapeadas', { ascending: false })
    if (actData) setActivos(actData as AliasActivo[])
  }

  async function aplicarBulkAutomatico() {
    const pendientesAuto = pendientes.filter(p => {
      const sug = sugerencias[p.alias_tpv]
      return sug && sug.length > 0 && sug[0].confianza >= 90
    })
    if (pendientesAuto.length === 0) {
      alert('No hay sugerencias automáticas con alta confianza pendientes')
      return
    }
    if (!confirm(`Aplicar ${pendientesAuto.length} mapeos automáticos (confianza ≥ 90)?`)) return
    let okCount = 0
    let errCount = 0
    for (const p of pendientesAuto) {
      const sug = sugerencias[p.alias_tpv]
      if (!sug || sug.length === 0) continue
      const { error } = await supabase.rpc('rpc_crear_alias_y_reprocesar', {
        p_alias_tpv: p.alias_tpv,
        p_producto_id: sug[0].producto_id,
        p_notas: null,
      })
      if (error) errCount++
      else okCount++
    }
    alert(`Aplicados: ${okCount} · Errores: ${errCount}`)
    // Refrescar materialized view antes del reload final
    await supabase.rpc('rpc_refresh_alias_pendientes')
    await loadAll()
  }

  async function eliminarAlias(aliasId: number, aliasTpv: string) {
    if (!confirm(`Eliminar alias "${aliasTpv}"?\n\nLas ventas históricas quedarán "sin_match" otra vez.`)) return
    const { data, error } = await supabase.rpc('rpc_eliminar_alias_y_revertir', { p_alias_id: aliasId })
    if (error) { alert(`Error: ${error.message}`); return }
    if (data?.error) { alert(`Error: ${data.error}`); return }
    alert(`OK. ${data?.ventas_revertidas ?? 0} ventas revertidas a sin_match.`)
    await supabase.rpc('rpc_refresh_alias_pendientes')
    await loadAll()
  }

  /* ─── Filtros ─── */
  const pendientesFiltrados = useMemo(() => {
    if (!search) return pendientes
    const q = search.toLowerCase()
    return pendientes.filter(p => p.alias_tpv.toLowerCase().includes(q))
  }, [pendientes, search])

  const activosFiltrados = useMemo(() => {
    if (!search) return activos
    const q = search.toLowerCase()
    return activos.filter(
      a => a.alias_tpv.toLowerCase().includes(q) || a.producto_nombre.toLowerCase().includes(q)
    )
  }, [activos, search])

  const stats = useMemo(() => {
    const totalPendientes = pendientes.length
    const totalVentasSinMapear = pendientes.reduce((s, p) => s + p.n_ventas, 0)
    const totalImporteSinMapear = pendientes.reduce((s, p) => s + (Number(p.importe_total) || 0), 0)
    const conSugerenciaAlta = pendientes.filter(p => {
      const sug = sugerencias[p.alias_tpv]
      return sug && sug.length > 0 && sug[0].confianza >= 90
    }).length
    return { totalPendientes, totalVentasSinMapear, totalImporteSinMapear, conSugerenciaAlta }
  }, [pendientes, sugerencias])

  function colorConfianza(c: number) {
    if (c >= 90) return 'text-green-500'
    if (c >= 70) return 'text-yellow-500'
    return 'text-orange-500'
  }

  /* ─── Render ─── */
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Link2 size={22} />
            Mapeo TPV → Productos
          </h1>
          <p className="text-sm text-muted-foreground">
            Asociá los nombres del CSV de ventas con tus productos canónicos.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            ℹ️ Mapear un alias con muchas ventas (ej. 28k filas) puede tardar ~5-10s. La pantalla se actualiza al instante; los datos se sincronizan en segundo plano.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll}>
          <RefreshCw size={14} className="mr-1" /> Refrescar
        </Button>
      </div>

      {errorMsg && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="p-3 text-sm text-red-500">
            <strong>Error de carga:</strong> {errorMsg}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${stats.totalPendientes > 0 ? 'text-orange-500' : 'text-muted-foreground'}`}>
              {stats.totalPendientes}
            </div>
            <p className="text-xs text-muted-foreground">Alias pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className={`text-2xl font-bold ${stats.conSugerenciaAlta > 0 ? 'text-green-500' : 'text-muted-foreground'}`}>
              {stats.conSugerenciaAlta}
            </div>
            <p className="text-xs text-muted-foreground">Con sugerencia ≥ 90</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">
              {formatNumber(stats.totalVentasSinMapear, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Ventas sin mapear</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">
              {formatCurrency(stats.totalImporteSinMapear)}
            </div>
            <p className="text-xs text-muted-foreground">Importe sin mapear</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('pendientes')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'pendientes'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <AlertTriangle size={14} className="inline mr-1.5 -mt-0.5" />
          Pendientes ({pendientes.length})
        </button>
        <button
          onClick={() => setActiveTab('activos')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'activos'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <CheckCircle2 size={14} className="inline mr-1.5 -mt-0.5" />
          Alias activos ({activos.length})
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={activeTab === 'pendientes' ? 'Buscar alias...' : 'Buscar alias o producto...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        {activeTab === 'pendientes' && stats.conSugerenciaAlta > 0 && (
          <Button onClick={aplicarBulkAutomatico} disabled={loading}>
            <Sparkles size={14} className="mr-1.5" />
            Aplicar {stats.conSugerenciaAlta} sugerencias auto
          </Button>
        )}
      </div>

      {/* Contenido */}
      {loading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Cargando...</CardContent></Card>
      ) : activeTab === 'pendientes' ? (
        <PendientesList
          pendientes={pendientesFiltrados}
          sugerencias={sugerencias}
          selecciones={selecciones}
          aplicando={aplicando}
          productos={productos}
          colorConfianza={colorConfianza}
          onSelectChange={(alias, pid) => setSelecciones(prev => ({ ...prev, [alias]: pid }))}
          onAplicar={aplicarMapeo}
          onLoadSugerencia={loadSugerencia}
        />
      ) : (
        <ActivosList
          activos={activosFiltrados}
          onEliminar={eliminarAlias}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Pendientes
   ═══════════════════════════════════════════════════════════ */
function PendientesList({
  pendientes, sugerencias, selecciones, aplicando, productos,
  colorConfianza, onSelectChange, onAplicar, onLoadSugerencia,
}: {
  pendientes: AliasPendiente[]
  sugerencias: Record<string, Sugerencia[]>
  selecciones: Record<string, number | null>
  aplicando: Record<string, boolean>
  productos: ProductoOption[]
  colorConfianza: (c: number) => string
  onSelectChange: (alias: string, pid: number | null) => void
  onAplicar: (alias: string) => void
  onLoadSugerencia: (alias: string) => void
}) {
  if (pendientes.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
          No hay alias pendientes. Todas las ventas están mapeadas.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Alias TPV</th>
                <th className="text-right p-3 font-medium">Ventas</th>
                <th className="text-right p-3 font-medium">Importe</th>
                <th className="text-left p-3 font-medium">Sugerencia / Producto destino</th>
                <th className="text-center p-3 font-medium w-32">Acción</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map(p => {
                const sug = sugerencias[p.alias_tpv]
                const seleccionado = selecciones[p.alias_tpv]
                const isApplying = aplicando[p.alias_tpv]
                return (
                  <tr key={p.alias_tpv} className="border-b hover:bg-muted/10">
                    <td className="p-3">
                      <div className="font-mono">{p.alias_tpv}</div>
                      <div className="text-[10px] text-muted-foreground">
                        norm: {p.alias_normalizado}
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono">{formatNumber(p.n_ventas, 0)}</td>
                    <td className="p-3 text-right font-mono text-xs">
                      {p.importe_total != null ? formatCurrency(Number(p.importe_total)) : '—'}
                    </td>
                    <td className="p-3 min-w-[280px]">
                      {sug === undefined ? (
                        <button
                          className="text-xs text-primary hover:underline"
                          onClick={() => onLoadSugerencia(p.alias_tpv)}
                        >
                          Cargar sugerencias
                        </button>
                      ) : (
                        <div className="space-y-1.5">
                          {sug.length === 0 && (
                            <div className="text-xs text-muted-foreground">Sin sugerencias automáticas</div>
                          )}
                          {sug.length > 0 && (
                            <div className="text-xs">
                              <span className={colorConfianza(sug[0].confianza)}>
                                ✨ Sugerido: <strong>{sug[0].nombre}</strong> ({sug[0].confianza}% · {sug[0].tipo_match})
                              </span>
                            </div>
                          )}
                          <select
                            value={seleccionado ?? ''}
                            onChange={e => onSelectChange(p.alias_tpv, e.target.value ? Number(e.target.value) : null)}
                            className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                          >
                            <option value="">— Elegir producto destino —</option>
                            {/* Sugerencias primero */}
                            {sug.length > 0 && (
                              <optgroup label="Sugerencias">
                                {sug.map(s => (
                                  <option key={`s-${s.producto_id}`} value={s.producto_id}>
                                    {s.nombre} · {s.confianza}% ({s.tipo_match})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="Todos los productos de venta">
                              {productos
                                .filter(prod => !sug.some(s => s.producto_id === prod.id))
                                .map(prod => (
                                  <option key={prod.id} value={prod.id}>
                                    {prod.nombre}
                                  </option>
                                ))}
                            </optgroup>
                          </select>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        onClick={() => onAplicar(p.alias_tpv)}
                        disabled={!seleccionado || isApplying}
                      >
                        {isApplying ? '...' : 'Mapear'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

/* ═══════════════════════════════════════════════════════════
   Activos
   ═══════════════════════════════════════════════════════════ */
function ActivosList({
  activos, onEliminar,
}: {
  activos: AliasActivo[]
  onEliminar: (id: number, alias: string) => void
}) {
  if (activos.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Aún no hay alias creados. Empezá mapeando los pendientes.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Alias TPV</th>
                <th className="text-left p-3 font-medium">→ Producto canónico</th>
                <th className="text-right p-3 font-medium">Ventas mapeadas</th>
                <th className="text-right p-3 font-medium">Importe</th>
                <th className="text-center p-3 font-medium w-24">Acción</th>
              </tr>
            </thead>
            <tbody>
              {activos.map(a => (
                <tr key={a.alias_id} className="border-b hover:bg-muted/10">
                  <td className="p-3 font-mono">{a.alias_tpv}</td>
                  <td className="p-3">
                    <div className="font-medium">{a.producto_nombre}</div>
                    {a.producto_codigo && (
                      <div className="text-[10px] text-muted-foreground">cod: {a.producto_codigo}</div>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono">{formatNumber(a.n_ventas_mapeadas, 0)}</td>
                  <td className="p-3 text-right font-mono text-xs">
                    {a.importe_total_mapeado != null
                      ? formatCurrency(Number(a.importe_total_mapeado))
                      : '—'}
                  </td>
                  <td className="p-3 text-center">
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => onEliminar(a.alias_id, a.alias_tpv)}
                      title="Eliminar alias"
                    >
                      <Trash2 size={14} className="text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
