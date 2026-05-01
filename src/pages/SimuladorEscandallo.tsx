import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Calculator, Search, Play, ArrowLeft, RotateCcw,
  AlertTriangle, BookOpen, Settings, Target, Save,
  Package2,
} from 'lucide-react'

/* ─── Types compartidos ─── */
interface Configuracion {
  margen_bajo_pct: number
  margen_medio_pct: number
}
const DEFAULT_CONFIG: Configuracion = { margen_bajo_pct: 40, margen_medio_pct: 60 }
type Tab = 'ingrediente' | 'escandallo'

/* ─── Types tab ingrediente ─── */
interface ProductoCompra {
  id: number
  nombre: string
  codigo: string | null
  tipo: string
  precio_compra: number | null
  proveedor_id: number | null
}
interface ImpactoEscandallo {
  escandallo_id: number
  producto_id: number | null
  nombre: string
  cantidad_resultado: number
  unidad_resultado: string
  pvp_base: number | null
  coste_total_actual: number
  coste_total_simulado: number
  coste_por_unidad_actual: number
  coste_por_unidad_simulado: number
  delta_coste_unitario: number
  margen_actual_pct: number | null
  margen_simulado_pct: number | null
  delta_margen_pct: number | null
  cantidad_total_afectada: number
  unidad_afectada: string | null
}

/* ─── Types tab escandallo ─── */
interface EscandalloOption {
  escandallo_id: number
  producto_id: number | null
  nombre: string
  cantidad_resultado: number
  unidad_resultado: string
  coste_por_unidad: number | null
  pvp_base: number | null
  iva_venta: string | null
  margen_pct: number | null
}
interface SimulacionPvp {
  escandallo_id: number
  producto_id: number | null
  nombre: string
  cantidad_resultado: number
  unidad_resultado: string
  coste_por_unidad: number | null
  tipo_iva: string
  iva_pct: number
  pvp_actual_con_iva: number | null
  pvp_actual_sin_iva: number | null
  margen_actual_eur: number | null
  margen_actual_pct: number | null
  pvp_simulado_con_iva: number
  pvp_simulado_sin_iva: number
  margen_simulado_eur: number | null
  margen_simulado_pct: number | null
  delta_pvp_con_iva: number | null
  delta_pvp_pct: number | null
  delta_margen_pp: number | null
}
interface ObjetivoMargen {
  escandallo_id: number
  producto_id: number | null
  nombre: string
  coste_por_unidad: number | null
  tipo_iva: string
  iva_pct: number
  margen_objetivo_pct: number
  pvp_objetivo_sin_iva: number
  pvp_objetivo_con_iva: number
  pvp_objetivo_redondeo_5c: number
  pvp_objetivo_redondeo_10c: number
  pvp_actual_con_iva: number | null
  delta_pvp_con_iva: number | null
}

/* ═══════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL — header, tabs, config compartida
   ═══════════════════════════════════════════════════════════ */
export default function SimuladorEscandallo() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('ingrediente')
  const [config, setConfig] = useState<Configuracion>(DEFAULT_CONFIG)
  const [showConfig, setShowConfig] = useState(false)
  const [configEdit, setConfigEdit] = useState({ bajo: '40', medio: '60' })
  const [savingConfig, setSavingConfig] = useState(false)

  useEffect(() => {
    void loadConfig()
  }, [])

  async function loadConfig() {
    const [bajoRes, medioRes] = await Promise.all([
      supabase.rpc('rpc_get_config_escandallo', { p_clave: 'margen_bajo_pct' }),
      supabase.rpc('rpc_get_config_escandallo', { p_clave: 'margen_medio_pct' }),
    ])
    const bajo = Number(bajoRes.data ?? DEFAULT_CONFIG.margen_bajo_pct)
    const medio = Number(medioRes.data ?? DEFAULT_CONFIG.margen_medio_pct)
    setConfig({ margen_bajo_pct: bajo, margen_medio_pct: medio })
    setConfigEdit({ bajo: String(bajo), medio: String(medio) })
  }

  async function saveConfig() {
    setSavingConfig(true)
    const bajo = Number(configEdit.bajo)
    const medio = Number(configEdit.medio)
    if (isNaN(bajo) || isNaN(medio) || bajo < 0 || medio < 0 || bajo > medio) {
      alert('Valores inválidos. El umbral medio debe ser ≥ al bajo.')
      setSavingConfig(false)
      return
    }
    const [r1, r2] = await Promise.all([
      supabase.rpc('rpc_set_config_escandallo', { p_clave: 'margen_bajo_pct', p_valor: String(bajo) }),
      supabase.rpc('rpc_set_config_escandallo', { p_clave: 'margen_medio_pct', p_valor: String(medio) }),
    ])
    if (r1.error || r2.error) {
      alert(`Error: ${r1.error?.message ?? r2.error?.message}`)
      setSavingConfig(false)
      return
    }
    setConfig({ margen_bajo_pct: bajo, margen_medio_pct: medio })
    setShowConfig(false)
    setSavingConfig(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/escandallos')}>
            <ArrowLeft size={16} className="mr-1" /> Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calculator size={22} />
              Simulador de impacto
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeTab === 'ingrediente'
                ? 'Cambiá el precio de un ingrediente y mirá el impacto en los escandallos que lo usan.'
                : 'Cambiá el PVP de un escandallo y calculá el margen resultante.'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowConfig(!showConfig)}>
          <Settings size={14} className="mr-1" /> Umbrales
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('ingrediente')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'ingrediente'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Package2 size={14} className="inline mr-1.5 -mt-0.5" />
          Por ingrediente
        </button>
        <button
          onClick={() => setActiveTab('escandallo')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'escandallo'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <BookOpen size={14} className="inline mr-1.5 -mt-0.5" />
          Por escandallo (cambio de PVP)
        </button>
      </div>

      {/* Configuración de umbrales (compartida) */}
      {showConfig && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Umbrales de margen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  Margen bajo (% — alerta roja por debajo)
                </label>
                <Input
                  type="number" min={0} max={100}
                  value={configEdit.bajo}
                  onChange={e => setConfigEdit({ ...configEdit, bajo: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Margen medio (% — verde por encima, amarillo por debajo)
                </label>
                <Input
                  type="number" min={0} max={100}
                  value={configEdit.medio}
                  onChange={e => setConfigEdit({ ...configEdit, medio: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveConfig} disabled={savingConfig}>
                {savingConfig ? 'Guardando...' : 'Guardar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowConfig(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contenido del tab activo */}
      {activeTab === 'ingrediente' ? (
        <TabIngrediente config={config} />
      ) : (
        <TabEscandallo config={config} />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   TAB 1 — Cambio de precio de un ingrediente
   ═══════════════════════════════════════════════════════════ */
function TabIngrediente({ config }: { config: Configuracion }) {
  const navigate = useNavigate()
  const [productos, setProductos] = useState<ProductoCompra[]>([])
  const [search, setSearch] = useState('')
  const [selectedProducto, setSelectedProducto] = useState<ProductoCompra | null>(null)
  const [precioSimulado, setPrecioSimulado] = useState<string>('')
  const [impacto, setImpacto] = useState<ImpactoEscandallo[]>([])
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const r = await supabase
      .from('productos_v2')
      .select('id, nombre, codigo, tipo, precio_compra, proveedor_id')
      .in('tipo', ['compra', 'ambos'])
      .eq('activo', true)
      .order('nombre')
    if (r.data) setProductos(r.data)
    setLoading(false)
  }

  const productosFiltrados = useMemo(() => {
    if (!search) return productos.slice(0, 50)
    const q = search.toLowerCase()
    return productos
      .filter(p => p.nombre.toLowerCase().includes(q) || (p.codigo?.toLowerCase().includes(q) ?? false))
      .slice(0, 50)
  }, [productos, search])

  function selectProducto(p: ProductoCompra) {
    setSelectedProducto(p)
    setPrecioSimulado(p.precio_compra?.toString() ?? '')
    setImpacto([])
  }
  function clearSelection() {
    setSelectedProducto(null); setPrecioSimulado(''); setImpacto([]); setSearch('')
  }
  function aplicarDelta(pct: number) {
    if (!selectedProducto?.precio_compra) return
    const nuevo = selectedProducto.precio_compra * (1 + pct / 100)
    setPrecioSimulado(nuevo.toFixed(4))
  }
  async function simular() {
    if (!selectedProducto) return
    const precio = Number(precioSimulado)
    if (isNaN(precio) || precio < 0) { alert('Ingresá un precio válido'); return }
    setSimulating(true)
    const { data, error } = await supabase.rpc('rpc_simular_cambio_precio', {
      p_producto_id: selectedProducto.id,
      p_precio_simulado: precio,
    })
    if (error) { alert(`Error: ${error.message}`); setSimulating(false); return }
    setImpacto((data ?? []) as ImpactoEscandallo[])
    setSimulating(false)
  }

  function colorMargen(pct: number | null) {
    if (pct == null) return 'text-muted-foreground'
    if (pct >= config.margen_medio_pct) return 'text-green-500'
    if (pct >= config.margen_bajo_pct) return 'text-yellow-500'
    return 'text-red-500'
  }
  function colorDelta(d: number | null) {
    if (d == null) return 'text-muted-foreground'
    if (d > 0) return 'text-green-500'
    if (d < 0) return 'text-red-500'
    return 'text-muted-foreground'
  }

  const kpis = useMemo(() => {
    if (impacto.length === 0) return null
    const conMargen = impacto.filter(i => i.margen_actual_pct != null)
    const pasanABajo = conMargen.filter(
      i => i.margen_simulado_pct != null && i.margen_actual_pct != null
        && i.margen_simulado_pct < config.margen_bajo_pct
        && i.margen_actual_pct >= config.margen_bajo_pct
    ).length
    const deltaCostePromedio = impacto.reduce((a, i) => a + i.delta_coste_unitario, 0) / impacto.length
    const deltaMargenPromedio = conMargen.length
      ? conMargen.reduce((a, i) => a + (i.delta_margen_pct ?? 0), 0) / conMargen.length
      : null
    return { total: impacto.length, pasanABajo, deltaCostePromedio, deltaMargenPromedio }
  }, [impacto, config])

  const cambioPct = useMemo(() => {
    if (!selectedProducto?.precio_compra) return null
    const sim = Number(precioSimulado)
    if (isNaN(sim)) return null
    return ((sim - selectedProducto.precio_compra) / selectedProducto.precio_compra) * 100
  }, [selectedProducto, precioSimulado])

  if (!selectedProducto) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Elegí el ingrediente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar producto de compra (nombre o código)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">Cargando productos...</div>
          ) : productosFiltrados.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              {search ? 'No se encontraron productos' : 'No hay productos de compra'}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                  <tr>
                    <th className="text-left p-2">Producto</th>
                    <th className="text-left p-2 w-24">Código</th>
                    <th className="text-right p-2 w-28">Precio actual</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {productosFiltrados.map(p => (
                    <tr key={p.id} className="border-t hover:bg-muted/30 cursor-pointer"
                        onClick={() => selectProducto(p)}>
                      <td className="p-2 font-medium">{p.nombre}</td>
                      <td className="p-2 text-muted-foreground">{p.codigo ?? '—'}</td>
                      <td className="p-2 text-right font-mono">
                        {p.precio_compra != null ? formatCurrency(p.precio_compra) : '—'}
                      </td>
                      <td className="p-2"><Button size="sm" variant="ghost">Elegir</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {productos.length > 50 && !search && (
            <p className="text-xs text-muted-foreground text-center">
              Mostrando primeros 50. Usá la búsqueda para acotar.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">2. Producto seleccionado</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Estás simulando un cambio de precio de este ingrediente.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            <RotateCcw size={14} className="mr-1" /> Cambiar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
            <div className="p-2 rounded bg-blue-500/10">
              <BookOpen size={18} className="text-blue-500" />
            </div>
            <div className="flex-1">
              <div className="font-semibold">{selectedProducto.nombre}</div>
              <div className="text-xs text-muted-foreground">
                {selectedProducto.codigo ?? '—'} · tipo: {selectedProducto.tipo}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Precio actual</div>
              <div className="font-mono font-bold">
                {selectedProducto.precio_compra != null
                  ? formatCurrency(selectedProducto.precio_compra)
                  : '—'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Precio simulado (€/ud)</label>
              <Input
                type="number" min={0} step={0.0001}
                value={precioSimulado}
                onChange={e => setPrecioSimulado(e.target.value)}
                placeholder="0.00"
                className="font-mono"
              />
              {cambioPct != null && !isNaN(cambioPct) && (
                <p className={`text-xs mt-1 font-medium ${
                  cambioPct > 0 ? 'text-red-500' : cambioPct < 0 ? 'text-green-500' : 'text-muted-foreground'
                }`}>
                  {cambioPct > 0 ? '↑' : cambioPct < 0 ? '↓' : '='} {cambioPct.toFixed(2)}% vs precio actual
                </p>
              )}
            </div>
            <Button onClick={simular} disabled={simulating || !precioSimulado}>
              <Play size={16} className="mr-2" />
              {simulating ? 'Simulando...' : 'Simular'}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center mr-1">Atajos:</span>
            {[-20, -10, -5, +5, +10, +20].map(pct => (
              <Button key={pct} variant="outline" size="sm"
                onClick={() => aplicarDelta(pct)}
                disabled={!selectedProducto.precio_compra}>
                {pct > 0 ? '+' : ''}{pct}%
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {impacto.length > 0 && kpis && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{kpis.total}</div>
              <p className="text-xs text-muted-foreground">Escandallos afectados</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3">
              <div className={`text-2xl font-bold ${kpis.pasanABajo > 0 ? 'text-red-500' : ''}`}>
                {kpis.pasanABajo}
              </div>
              <p className="text-xs text-muted-foreground">
                Pasan a margen bajo (&lt;{config.margen_bajo_pct}%)
              </p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3">
              <div className={`text-2xl font-bold ${colorDelta(-kpis.deltaCostePromedio)}`}>
                {kpis.deltaCostePromedio >= 0 ? '+' : ''}{formatCurrency(kpis.deltaCostePromedio)}
              </div>
              <p className="text-xs text-muted-foreground">Δ coste/ud promedio</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4 pb-3">
              <div className={`text-2xl font-bold ${
                kpis.deltaMargenPromedio == null ? 'text-muted-foreground' : colorDelta(kpis.deltaMargenPromedio)
              }`}>
                {kpis.deltaMargenPromedio == null
                  ? '—'
                  : `${kpis.deltaMargenPromedio >= 0 ? '+' : ''}${kpis.deltaMargenPromedio.toFixed(1)} pp`}
              </div>
              <p className="text-xs text-muted-foreground">Δ margen promedio</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                Impacto por escandallo
                {kpis.pasanABajo > 0 && (
                  <span className="flex items-center gap-1 text-xs text-red-500 font-normal">
                    <AlertTriangle size={14} />
                    {kpis.pasanABajo} en alerta
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-medium">Escandallo</th>
                      <th className="text-right p-3 font-medium">Cant. afectada</th>
                      <th className="text-right p-3 font-medium">Coste/ud actual</th>
                      <th className="text-right p-3 font-medium">Coste/ud nuevo</th>
                      <th className="text-right p-3 font-medium">Δ Coste</th>
                      <th className="text-right p-3 font-medium">PVP</th>
                      <th className="text-right p-3 font-medium">Margen actual</th>
                      <th className="text-right p-3 font-medium">Margen nuevo</th>
                      <th className="text-right p-3 font-medium">Δ Margen</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {impacto.map(imp => (
                      <tr key={imp.escandallo_id}
                          className="border-b hover:bg-muted/20 cursor-pointer"
                          onClick={() => navigate(`/escandallos/${imp.escandallo_id}`)}>
                        <td className="p-3">
                          <div className="font-medium">{imp.nombre}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatNumber(imp.cantidad_resultado, 3)} {imp.unidad_resultado}
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono text-xs">
                          {formatNumber(imp.cantidad_total_afectada, 4)} {imp.unidad_afectada ?? ''}
                        </td>
                        <td className="p-3 text-right font-mono">{formatCurrency(imp.coste_por_unidad_actual)}</td>
                        <td className="p-3 text-right font-mono">{formatCurrency(imp.coste_por_unidad_simulado)}</td>
                        <td className={`p-3 text-right font-mono font-medium ${colorDelta(-imp.delta_coste_unitario)}`}>
                          {imp.delta_coste_unitario >= 0 ? '+' : ''}{formatCurrency(imp.delta_coste_unitario)}
                        </td>
                        <td className="p-3 text-right font-mono">
                          {imp.pvp_base != null ? formatCurrency(imp.pvp_base) : '—'}
                        </td>
                        <td className={`p-3 text-right font-mono ${colorMargen(imp.margen_actual_pct)}`}>
                          {imp.margen_actual_pct != null ? `${imp.margen_actual_pct.toFixed(1)}%` : '—'}
                        </td>
                        <td className={`p-3 text-right font-mono font-semibold ${colorMargen(imp.margen_simulado_pct)}`}>
                          {imp.margen_simulado_pct != null ? `${imp.margen_simulado_pct.toFixed(1)}%` : '—'}
                        </td>
                        <td className={`p-3 text-right font-mono font-medium ${colorDelta(imp.delta_margen_pct)}`}>
                          {imp.delta_margen_pct != null
                            ? `${imp.delta_margen_pct >= 0 ? '+' : ''}${imp.delta_margen_pct.toFixed(1)} pp`
                            : '—'}
                        </td>
                        <td className="p-3 text-center">
                          {imp.margen_simulado_pct != null && imp.margen_simulado_pct < config.margen_bajo_pct && (
                            <AlertTriangle size={14} className="text-red-500 mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {impacto.length === 0 && !simulating && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Ajustá el precio simulado y pulsá <strong>Simular</strong> para ver el impacto.
          </CardContent>
        </Card>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════
   TAB 2 — Cambio de PVP de un escandallo
   ═══════════════════════════════════════════════════════════ */
function TabEscandallo({ config }: { config: Configuracion }) {
  const [escandallos, setEscandallos] = useState<EscandalloOption[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<EscandalloOption | null>(null)
  const [pvpInput, setPvpInput] = useState<string>('')
  const [margenObjetivo, setMargenObjetivo] = useState<string>('')
  const [resultado, setResultado] = useState<SimulacionPvp | null>(null)
  const [objetivo, setObjetivo] = useState<ObjetivoMargen | null>(null)
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [calcInverso, setCalcInverso] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [aplicado, setAplicado] = useState(false)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('vw_escandallo_resumen')
      .select('escandallo_id, producto_id, nombre, cantidad_resultado, unidad_resultado, coste_por_unidad, pvp_base, iva_venta, margen_pct')
      .order('nombre')
    if (data) setEscandallos(data as EscandalloOption[])
    setLoading(false)
  }

  const filtrados = useMemo(() => {
    if (!search) return escandallos.slice(0, 50)
    const q = search.toLowerCase()
    return escandallos.filter(e => e.nombre.toLowerCase().includes(q)).slice(0, 50)
  }, [escandallos, search])

  function selectEscandallo(e: EscandalloOption) {
    setSelected(e)
    setPvpInput(e.pvp_base?.toString() ?? '')
    setResultado(null)
    setObjetivo(null)
    setAplicado(false)
  }
  function clear() {
    setSelected(null); setPvpInput(''); setMargenObjetivo('')
    setResultado(null); setObjetivo(null); setSearch(''); setAplicado(false)
  }
  function aplicarDelta(pct: number) {
    if (!selected?.pvp_base) return
    const nuevo = selected.pvp_base * (1 + pct / 100)
    setPvpInput(nuevo.toFixed(2))
  }
  function redondear(decimales: number) {
    const v = Number(pvpInput)
    if (isNaN(v)) return
    const factor = Math.pow(10, decimales)
    setPvpInput((Math.round(v * factor) / factor).toFixed(decimales))
  }

  async function simular() {
    if (!selected) return
    const pvp = Number(pvpInput)
    if (isNaN(pvp) || pvp < 0) { alert('PVP inválido'); return }
    setSimulating(true)
    setAplicado(false)
    const { data, error } = await supabase.rpc('rpc_simular_cambio_pvp', {
      p_escandallo_id: selected.escandallo_id,
      p_pvp_simulado: pvp,
    })
    if (error) { alert(`Error: ${error.message}`); setSimulating(false); return }
    if (data?.error) { alert(data.error); setSimulating(false); return }
    setResultado(data as SimulacionPvp)
    setSimulating(false)
  }

  async function calcularInverso() {
    if (!selected) return
    const m = Number(margenObjetivo)
    if (isNaN(m) || m < 0 || m >= 100) { alert('Margen objetivo inválido (0-99)'); return }
    setSimulating(true)
    const { data, error } = await supabase.rpc('rpc_calcular_pvp_para_margen', {
      p_escandallo_id: selected.escandallo_id,
      p_margen_objetivo_pct: m,
    })
    if (error) { alert(`Error: ${error.message}`); setSimulating(false); return }
    if (data?.error) { alert(data.error); setSimulating(false); return }
    setObjetivo(data as ObjetivoMargen)
    setSimulating(false)
  }

  function aplicarObjetivoAlInput(redondeo: '5c' | '10c' | 'exacto') {
    if (!objetivo) return
    const val = redondeo === '5c'
      ? objetivo.pvp_objetivo_redondeo_5c
      : redondeo === '10c'
      ? objetivo.pvp_objetivo_redondeo_10c
      : objetivo.pvp_objetivo_con_iva
    setPvpInput(val.toFixed(2))
    setObjetivo(null)
    setMargenObjetivo('')
    setCalcInverso(false)
  }

  async function aplicarPrecio() {
    if (!selected || !resultado) return
    if (!confirm(`Aplicar PVP ${formatCurrency(resultado.pvp_simulado_con_iva)} a "${selected.nombre}"?\n\nEsto crea un nuevo precio activo en precios_venta y desactiva el anterior.`)) return
    setAplicando(true)
    const { error } = await supabase.rpc('rpc_set_precio_venta', {
      p_producto_id: selected.producto_id,
      p_precio: resultado.pvp_simulado_con_iva,
      p_tipo_iva: resultado.tipo_iva,
    })
    if (error) {
      alert(`Error: ${error.message}`)
      setAplicando(false)
      return
    }
    setAplicado(true)
    setAplicando(false)
    await load()
    // Refrescar datos del escandallo seleccionado
    const updated = (await supabase
      .from('vw_escandallo_resumen')
      .select('escandallo_id, producto_id, nombre, cantidad_resultado, unidad_resultado, coste_por_unidad, pvp_base, iva_venta, margen_pct')
      .eq('escandallo_id', selected.escandallo_id)
      .maybeSingle()).data
    if (updated) setSelected(updated as EscandalloOption)
  }

  function colorMargen(pct: number | null) {
    if (pct == null) return 'text-muted-foreground'
    if (pct >= config.margen_medio_pct) return 'text-green-500'
    if (pct >= config.margen_bajo_pct) return 'text-yellow-500'
    return 'text-red-500'
  }

  if (!selected) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Elegí el escandallo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar escandallo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">Cargando...</div>
          ) : filtrados.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              {search ? 'No hay resultados' : 'No hay escandallos. Creá uno primero.'}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                  <tr>
                    <th className="text-left p-2">Escandallo</th>
                    <th className="text-right p-2 w-24">Coste/ud</th>
                    <th className="text-right p-2 w-24">PVP base</th>
                    <th className="text-right p-2 w-20">Margen</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(e => (
                    <tr key={e.escandallo_id}
                        className="border-t hover:bg-muted/30 cursor-pointer"
                        onClick={() => selectEscandallo(e)}>
                      <td className="p-2 font-medium">{e.nombre}</td>
                      <td className="p-2 text-right font-mono">
                        {e.coste_por_unidad != null ? formatCurrency(e.coste_por_unidad) : '—'}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {e.pvp_base != null ? formatCurrency(e.pvp_base) : '—'}
                      </td>
                      <td className={`p-2 text-right font-mono ${colorMargen(e.margen_pct)}`}>
                        {e.margen_pct != null ? `${e.margen_pct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="p-2"><Button size="sm" variant="ghost">Elegir</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const cambioPct = (() => {
    if (!selected.pvp_base) return null
    const v = Number(pvpInput)
    if (isNaN(v)) return null
    return ((v - selected.pvp_base) / selected.pvp_base) * 100
  })()

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">2. Escandallo seleccionado</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Trabajá con PVP <strong>con IVA</strong> (lo que ve el cliente).
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={clear}>
            <RotateCcw size={14} className="mr-1" /> Cambiar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded bg-muted/30 border">
              <div className="text-xs text-muted-foreground">Escandallo</div>
              <div className="font-semibold truncate">{selected.nombre}</div>
            </div>
            <div className="p-3 rounded bg-muted/30 border">
              <div className="text-xs text-muted-foreground">Coste/ud (s/IVA)</div>
              <div className="font-mono font-semibold">
                {selected.coste_por_unidad != null ? formatCurrency(selected.coste_por_unidad) : '—'}
              </div>
            </div>
            <div className="p-3 rounded bg-muted/30 border">
              <div className="text-xs text-muted-foreground">PVP actual (c/IVA)</div>
              <div className="font-mono font-semibold">
                {selected.pvp_base != null ? formatCurrency(selected.pvp_base) : '—'}
              </div>
              <div className="text-[10px] text-muted-foreground">{selected.iva_venta ?? '—'}</div>
            </div>
            <div className="p-3 rounded bg-muted/30 border">
              <div className="text-xs text-muted-foreground">Margen actual</div>
              <div className={`font-mono font-semibold ${colorMargen(selected.margen_pct)}`}>
                {selected.margen_pct != null ? `${selected.margen_pct.toFixed(1)}%` : '—'}
              </div>
            </div>
          </div>

          {/* Modo: input directo o cálculo inverso */}
          <div className="flex gap-2 border-b pb-2">
            <button
              onClick={() => setCalcInverso(false)}
              className={`text-xs px-3 py-1 rounded ${!calcInverso ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
            >
              <Play size={12} className="inline mr-1" />
              Probar un PVP
            </button>
            <button
              onClick={() => setCalcInverso(true)}
              className={`text-xs px-3 py-1 rounded ${calcInverso ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
            >
              <Target size={12} className="inline mr-1" />
              ¿PVP para X% de margen?
            </button>
          </div>

          {!calcInverso ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">PVP simulado (€ con IVA)</label>
                  <Input
                    type="number" min={0} step={0.01}
                    value={pvpInput}
                    onChange={e => setPvpInput(e.target.value)}
                    placeholder="0.00"
                    className="font-mono"
                  />
                  {cambioPct != null && !isNaN(cambioPct) && (
                    <p className={`text-xs mt-1 font-medium ${
                      cambioPct > 0 ? 'text-green-500' : cambioPct < 0 ? 'text-red-500' : 'text-muted-foreground'
                    }`}>
                      {cambioPct > 0 ? '↑' : cambioPct < 0 ? '↓' : '='} {cambioPct.toFixed(2)}% vs PVP actual
                    </p>
                  )}
                </div>
                <Button onClick={simular} disabled={simulating || !pvpInput}>
                  <Play size={16} className="mr-2" />
                  {simulating ? 'Simulando...' : 'Simular'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground self-center mr-1">Atajos:</span>
                {[-10, -5, +5, +10, +20].map(pct => (
                  <Button key={pct} variant="outline" size="sm"
                    onClick={() => aplicarDelta(pct)}
                    disabled={!selected.pvp_base}>
                    {pct > 0 ? '+' : ''}{pct}%
                  </Button>
                ))}
                <Button variant="outline" size="sm" onClick={() => redondear(1)}>Redondear 10c</Button>
                <Button variant="outline" size="sm" onClick={() => redondear(2)}>Redondear céntimo</Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">Margen objetivo (%)</label>
                  <Input
                    type="number" min={0} max={99} step={0.5}
                    value={margenObjetivo}
                    onChange={e => setMargenObjetivo(e.target.value)}
                    placeholder="65"
                    className="font-mono"
                  />
                </div>
                <Button onClick={calcularInverso} disabled={simulating || !margenObjetivo}>
                  <Target size={16} className="mr-2" />
                  Calcular PVP
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground self-center mr-1">Atajos:</span>
                {[40, 50, 60, 65, 70, 75].map(pct => (
                  <Button key={pct} variant="outline" size="sm" onClick={() => setMargenObjetivo(String(pct))}>
                    {pct}%
                  </Button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Resultado del modo "probar un PVP" */}
      {resultado && !calcInverso && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resultado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium">ACTUAL</div>
                <div className="p-3 rounded bg-muted/20 border space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">PVP c/IVA</span>
                    <span className="font-mono">
                      {resultado.pvp_actual_con_iva != null
                        ? formatCurrency(resultado.pvp_actual_con_iva)
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">PVP s/IVA</span>
                    <span className="font-mono">
                      {resultado.pvp_actual_sin_iva != null
                        ? formatCurrency(resultado.pvp_actual_sin_iva)
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Coste s/IVA</span>
                    <span className="font-mono">
                      {resultado.coste_por_unidad != null
                        ? formatCurrency(resultado.coste_por_unidad)
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t mt-1">
                    <span className="font-medium">Margen</span>
                    <span className={`font-mono font-semibold ${colorMargen(resultado.margen_actual_pct)}`}>
                      {resultado.margen_actual_pct != null
                        ? `${resultado.margen_actual_pct.toFixed(1)}% (${formatCurrency(resultado.margen_actual_eur ?? 0)})`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-primary font-medium">SIMULADO</div>
                <div className="p-3 rounded bg-primary/5 border border-primary/30 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">PVP c/IVA</span>
                    <span className="font-mono font-bold">
                      {formatCurrency(resultado.pvp_simulado_con_iva)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">PVP s/IVA</span>
                    <span className="font-mono">{formatCurrency(resultado.pvp_simulado_sin_iva)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Coste s/IVA</span>
                    <span className="font-mono">
                      {resultado.coste_por_unidad != null
                        ? formatCurrency(resultado.coste_por_unidad)
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t mt-1">
                    <span className="font-medium">Margen</span>
                    <span className={`font-mono font-semibold ${colorMargen(resultado.margen_simulado_pct)}`}>
                      {resultado.margen_simulado_pct != null
                        ? `${resultado.margen_simulado_pct.toFixed(1)}% (${formatCurrency(resultado.margen_simulado_eur ?? 0)})`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Deltas */}
            {resultado.delta_pvp_con_iva != null && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t">
                <div>
                  <div className="text-xs text-muted-foreground">Δ PVP</div>
                  <div className={`font-mono font-semibold ${
                    resultado.delta_pvp_con_iva > 0 ? 'text-green-500'
                    : resultado.delta_pvp_con_iva < 0 ? 'text-red-500'
                    : 'text-muted-foreground'
                  }`}>
                    {resultado.delta_pvp_con_iva >= 0 ? '+' : ''}
                    {formatCurrency(resultado.delta_pvp_con_iva)}
                    {resultado.delta_pvp_pct != null
                      && ` (${resultado.delta_pvp_pct >= 0 ? '+' : ''}${resultado.delta_pvp_pct.toFixed(1)}%)`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Δ Margen</div>
                  <div className={`font-mono font-semibold ${
                    resultado.delta_margen_pp != null && resultado.delta_margen_pp > 0 ? 'text-green-500'
                    : resultado.delta_margen_pp != null && resultado.delta_margen_pp < 0 ? 'text-red-500'
                    : 'text-muted-foreground'
                  }`}>
                    {resultado.delta_margen_pp != null
                      ? `${resultado.delta_margen_pp >= 0 ? '+' : ''}${resultado.delta_margen_pp.toFixed(2)} pp`
                      : '—'}
                  </div>
                </div>
              </div>
            )}

            {/* Aplicar */}
            <div className="flex items-center gap-3 pt-3 border-t">
              {aplicado ? (
                <span className="text-sm text-green-500 font-medium">
                  ✓ Aplicado. PVP actualizado en Precios de Venta.
                </span>
              ) : (
                <>
                  <Button onClick={aplicarPrecio} disabled={aplicando || !selected.producto_id}>
                    <Save size={16} className="mr-2" />
                    {aplicando ? 'Aplicando...' : 'Aplicar este PVP'}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Crea un precio nuevo en <code>precios_venta</code> y desactiva el anterior.
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultado del modo "calcular para X% margen" */}
      {objetivo && calcInverso && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target size={16} />
              PVP para {objetivo.margen_objetivo_pct}% de margen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded bg-primary/5 border border-primary/30">
                <div className="text-xs text-muted-foreground">PVP exacto</div>
                <div className="font-mono font-bold text-lg">
                  {formatCurrency(objetivo.pvp_objetivo_con_iva)}
                </div>
                <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs"
                  onClick={() => aplicarObjetivoAlInput('exacto')}>
                  Probar este PVP →
                </Button>
              </div>
              <div className="p-3 rounded bg-muted/20 border">
                <div className="text-xs text-muted-foreground">Redondeado a 10c</div>
                <div className="font-mono font-bold text-lg">
                  {formatCurrency(objetivo.pvp_objetivo_redondeo_10c)}
                </div>
                <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs"
                  onClick={() => aplicarObjetivoAlInput('10c')}>
                  Probar este PVP →
                </Button>
              </div>
              <div className="p-3 rounded bg-muted/20 border">
                <div className="text-xs text-muted-foreground">Redondeado a 5c</div>
                <div className="font-mono font-bold text-lg">
                  {formatCurrency(objetivo.pvp_objetivo_redondeo_5c)}
                </div>
                <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs"
                  onClick={() => aplicarObjetivoAlInput('5c')}>
                  Probar este PVP →
                </Button>
              </div>
            </div>
            {objetivo.delta_pvp_con_iva != null && objetivo.pvp_actual_con_iva != null && (
              <div className="text-sm pt-2 border-t">
                <span className="text-muted-foreground">Subida vs PVP actual ({formatCurrency(objetivo.pvp_actual_con_iva)}): </span>
                <span className={`font-mono font-semibold ${
                  objetivo.delta_pvp_con_iva > 0 ? 'text-orange-500' : 'text-muted-foreground'
                }`}>
                  {objetivo.delta_pvp_con_iva >= 0 ? '+' : ''}
                  {formatCurrency(objetivo.delta_pvp_con_iva)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!resultado && !objetivo && !simulating && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {calcInverso
              ? 'Ingresá el % de margen objetivo y pulsá Calcular PVP.'
              : 'Ajustá el PVP simulado y pulsá Simular para ver el margen resultante.'}
          </CardContent>
        </Card>
      )}
    </>
  )
}
