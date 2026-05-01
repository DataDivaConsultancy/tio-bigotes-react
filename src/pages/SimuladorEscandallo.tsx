import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Calculator, Search, Play, ArrowLeft, RotateCcw,
  AlertTriangle, BookOpen, Settings,
} from 'lucide-react'

/* ─── Types ─── */

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

interface Configuracion {
  margen_bajo_pct: number
  margen_medio_pct: number
}

const DEFAULT_CONFIG: Configuracion = { margen_bajo_pct: 40, margen_medio_pct: 60 }

export default function SimuladorEscandallo() {
  const navigate = useNavigate()

  /* ─── State ─── */
  const [productos, setProductos] = useState<ProductoCompra[]>([])
  const [search, setSearch] = useState('')
  const [selectedProducto, setSelectedProducto] = useState<ProductoCompra | null>(null)
  const [precioSimulado, setPrecioSimulado] = useState<string>('')
  const [impacto, setImpacto] = useState<ImpactoEscandallo[]>([])
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)
  const [config, setConfig] = useState<Configuracion>(DEFAULT_CONFIG)
  const [showConfig, setShowConfig] = useState(false)
  const [configEdit, setConfigEdit] = useState({ bajo: '40', medio: '60' })
  const [savingConfig, setSavingConfig] = useState(false)

  /* ─── Initial load ─── */
  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [productosRes, configBajoRes, configMedioRes] = await Promise.all([
      supabase
        .from('productos_v2')
        .select('id, nombre, codigo, tipo, precio_compra, proveedor_id')
        .in('tipo', ['compra', 'ambos'])
        .eq('activo', true)
        .order('nombre'),
      supabase.rpc('rpc_get_config_escandallo', { p_clave: 'margen_bajo_pct' }),
      supabase.rpc('rpc_get_config_escandallo', { p_clave: 'margen_medio_pct' }),
    ])

    if (productosRes.data) setProductos(productosRes.data)

    const bajo = Number(configBajoRes.data ?? DEFAULT_CONFIG.margen_bajo_pct)
    const medio = Number(configMedioRes.data ?? DEFAULT_CONFIG.margen_medio_pct)
    setConfig({ margen_bajo_pct: bajo, margen_medio_pct: medio })
    setConfigEdit({ bajo: String(bajo), medio: String(medio) })

    setLoading(false)
  }

  /* ─── Productos filtrados por búsqueda ─── */
  const productosFiltrados = useMemo(() => {
    if (!search) return productos.slice(0, 50)
    const q = search.toLowerCase()
    return productos
      .filter(
        p =>
          p.nombre.toLowerCase().includes(q) ||
          (p.codigo?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 50)
  }, [productos, search])

  /* ─── Selección de producto ─── */
  function selectProducto(p: ProductoCompra) {
    setSelectedProducto(p)
    setPrecioSimulado(p.precio_compra?.toString() ?? '')
    setImpacto([])
  }

  function clearSelection() {
    setSelectedProducto(null)
    setPrecioSimulado('')
    setImpacto([])
    setSearch('')
  }

  /* ─── Presets de cambio porcentual ─── */
  function aplicarDelta(pct: number) {
    if (!selectedProducto?.precio_compra) return
    const nuevo = selectedProducto.precio_compra * (1 + pct / 100)
    setPrecioSimulado(nuevo.toFixed(4))
  }

  /* ─── Ejecutar simulación ─── */
  async function simular() {
    if (!selectedProducto) return
    const precio = Number(precioSimulado)
    if (isNaN(precio) || precio < 0) {
      alert('Ingresá un precio válido')
      return
    }

    setSimulating(true)
    const { data, error } = await supabase.rpc('rpc_simular_cambio_precio', {
      p_producto_id: selectedProducto.id,
      p_precio_simulado: precio,
    })

    if (error) {
      alert(`Error: ${error.message}`)
      setSimulating(false)
      return
    }

    setImpacto((data ?? []) as ImpactoEscandallo[])
    setSimulating(false)
  }

  /* ─── Guardar configuración de umbrales ─── */
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
      supabase.rpc('rpc_set_config_escandallo', {
        p_clave: 'margen_bajo_pct',
        p_valor: String(bajo),
      }),
      supabase.rpc('rpc_set_config_escandallo', {
        p_clave: 'margen_medio_pct',
        p_valor: String(medio),
      }),
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

  /* ─── Helpers de color por umbral ─── */
  function colorMargen(pct: number | null) {
    if (pct == null) return 'text-muted-foreground'
    if (pct >= config.margen_medio_pct) return 'text-green-500'
    if (pct >= config.margen_bajo_pct) return 'text-yellow-500'
    return 'text-red-500'
  }

  function colorDelta(delta: number | null) {
    if (delta == null) return 'text-muted-foreground'
    if (delta > 0) return 'text-green-500'
    if (delta < 0) return 'text-red-500'
    return 'text-muted-foreground'
  }

  /* ─── KPIs agregados ─── */
  const kpis = useMemo(() => {
    if (impacto.length === 0) return null
    const conMargen = impacto.filter(i => i.margen_actual_pct != null)
    const pasanABajo = conMargen.filter(
      i =>
        i.margen_simulado_pct != null &&
        i.margen_actual_pct != null &&
        i.margen_simulado_pct < config.margen_bajo_pct &&
        i.margen_actual_pct >= config.margen_bajo_pct
    ).length
    const deltaCostePromedio =
      impacto.reduce((acc, i) => acc + i.delta_coste_unitario, 0) / impacto.length
    const deltaMargenPromedio = conMargen.length
      ? conMargen.reduce((acc, i) => acc + (i.delta_margen_pct ?? 0), 0) / conMargen.length
      : null
    return {
      total: impacto.length,
      pasanABajo,
      deltaCostePromedio,
      deltaMargenPromedio,
    }
  }, [impacto, config])

  /* ─── Cambio porcentual del precio ─── */
  const cambioPct = useMemo(() => {
    if (!selectedProducto?.precio_compra) return null
    const sim = Number(precioSimulado)
    if (isNaN(sim)) return null
    return ((sim - selectedProducto.precio_compra) / selectedProducto.precio_compra) * 100
  }, [selectedProducto, precioSimulado])

  /* ─── Render ─── */
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
              Cambiá el precio de un ingrediente y mirá el impacto en los escandallos que lo usan.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowConfig(!showConfig)}>
          <Settings size={14} className="mr-1" /> Umbrales
        </Button>
      </div>

      {/* Configuración de umbrales */}
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
                  type="number"
                  min={0}
                  max={100}
                  value={configEdit.bajo}
                  onChange={e => setConfigEdit({ ...configEdit, bajo: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Margen medio (% — verde por encima, amarillo por debajo)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={100}
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

      {/* Selector de ingrediente */}
      {!selectedProducto ? (
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
                      <tr
                        key={p.id}
                        className="border-t hover:bg-muted/30 cursor-pointer"
                        onClick={() => selectProducto(p)}
                      >
                        <td className="p-2 font-medium">{p.nombre}</td>
                        <td className="p-2 text-muted-foreground">{p.codigo ?? '—'}</td>
                        <td className="p-2 text-right font-mono">
                          {p.precio_compra != null ? formatCurrency(p.precio_compra) : '—'}
                        </td>
                        <td className="p-2">
                          <Button size="sm" variant="ghost">
                            Elegir
                          </Button>
                        </td>
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
      ) : (
        <>
          {/* Producto seleccionado */}
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

              {/* Input de precio simulado */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">Precio simulado (€/ud)</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.0001}
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

              {/* Presets */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground self-center mr-1">Atajos:</span>
                {[-20, -10, -5, +5, +10, +20].map(pct => (
                  <Button
                    key={pct}
                    variant="outline"
                    size="sm"
                    onClick={() => aplicarDelta(pct)}
                    disabled={!selectedProducto.precio_compra}
                  >
                    {pct > 0 ? '+' : ''}
                    {pct}%
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Resultados */}
          {impacto.length > 0 && kpis && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="text-2xl font-bold">{kpis.total}</div>
                    <p className="text-xs text-muted-foreground">Escandallos afectados</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className={`text-2xl font-bold ${kpis.pasanABajo > 0 ? 'text-red-500' : ''}`}>
                      {kpis.pasanABajo}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Pasan a margen bajo (&lt;{config.margen_bajo_pct}%)
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className={`text-2xl font-bold ${colorDelta(-kpis.deltaCostePromedio)}`}>
                      {kpis.deltaCostePromedio >= 0 ? '+' : ''}
                      {formatCurrency(kpis.deltaCostePromedio)}
                    </div>
                    <p className="text-xs text-muted-foreground">Δ coste/ud promedio</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div
                      className={`text-2xl font-bold ${
                        kpis.deltaMargenPromedio == null
                          ? 'text-muted-foreground'
                          : colorDelta(kpis.deltaMargenPromedio)
                      }`}
                    >
                      {kpis.deltaMargenPromedio == null
                        ? '—'
                        : `${kpis.deltaMargenPromedio >= 0 ? '+' : ''}${kpis.deltaMargenPromedio.toFixed(1)} pp`}
                    </div>
                    <p className="text-xs text-muted-foreground">Δ margen promedio</p>
                  </CardContent>
                </Card>
              </div>

              {/* Tabla de impacto */}
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
                          <tr
                            key={imp.escandallo_id}
                            className="border-b hover:bg-muted/20 cursor-pointer"
                            onClick={() => navigate(`/escandallos/${imp.escandallo_id}`)}
                          >
                            <td className="p-3">
                              <div className="font-medium">{imp.nombre}</div>
                              <div className="text-xs text-muted-foreground">
                                {formatNumber(imp.cantidad_resultado, 3)} {imp.unidad_resultado}
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono text-xs">
                              {formatNumber(imp.cantidad_total_afectada, 4)} {imp.unidad_afectada ?? ''}
                            </td>
                            <td className="p-3 text-right font-mono">
                              {formatCurrency(imp.coste_por_unidad_actual)}
                            </td>
                            <td className="p-3 text-right font-mono">
                              {formatCurrency(imp.coste_por_unidad_simulado)}
                            </td>
                            <td className={`p-3 text-right font-mono font-medium ${colorDelta(-imp.delta_coste_unitario)}`}>
                              {imp.delta_coste_unitario >= 0 ? '+' : ''}
                              {formatCurrency(imp.delta_coste_unitario)}
                            </td>
                            <td className="p-3 text-right font-mono">
                              {imp.pvp_base != null ? formatCurrency(imp.pvp_base) : '—'}
                            </td>
                            <td className={`p-3 text-right font-mono ${colorMargen(imp.margen_actual_pct)}`}>
                              {imp.margen_actual_pct != null
                                ? `${imp.margen_actual_pct.toFixed(1)}%`
                                : '—'}
                            </td>
                            <td className={`p-3 text-right font-mono font-semibold ${colorMargen(imp.margen_simulado_pct)}`}>
                              {imp.margen_simulado_pct != null
                                ? `${imp.margen_simulado_pct.toFixed(1)}%`
                                : '—'}
                            </td>
                            <td className={`p-3 text-right font-mono font-medium ${colorDelta(imp.delta_margen_pct)}`}>
                              {imp.delta_margen_pct != null
                                ? `${imp.delta_margen_pct >= 0 ? '+' : ''}${imp.delta_margen_pct.toFixed(1)} pp`
                                : '—'}
                            </td>
                            <td className="p-3 text-center">
                              {imp.margen_simulado_pct != null &&
                                imp.margen_simulado_pct < config.margen_bajo_pct && (
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
      )}
    </div>
  )
}
