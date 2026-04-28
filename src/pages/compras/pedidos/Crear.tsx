import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Plus, Minus, Search, AlertCircle, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { listarLocales, listarProveedores, obtenerCatalogoProveedor, type LocalMin, type ProveedorMin, type ItemCatalogo } from '@/lib/compras/maestros'
import { crearPedido } from '@/lib/compras/pedidos'

type Cantidades = Record<string, number>

export default function CrearPedido() {
  const navigate = useNavigate()
  const [locales, setLocales] = useState<LocalMin[]>([])
  const [proveedores, setProveedores] = useState<ProveedorMin[]>([])
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [localId, setLocalId] = useState<number | null>(null)
  const [proveedorId, setProveedorId] = useState<number | null>(null)
  const [cantidades, setCantidades] = useState<Cantidades>({})
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [portes, setPortes] = useState(0)
  const [notas, setNotas] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [soloConPrecio, setSoloConPrecio] = useState(false)
  const [loadingMaestros, setLoadingMaestros] = useState(true)
  const [loadingCatalogo, setLoadingCatalogo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listarLocales(), listarProveedores()])
      .then(([l, p]) => {
        setLocales(l)
        setProveedores(p)
        if (l.length === 1) setLocalId(l[0].id)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMaestros(false))
  }, [])

  useEffect(() => {
    if (!proveedorId) {
      setCatalogo([])
      setCantidades({})
      return
    }
    setLoadingCatalogo(true)
    obtenerCatalogoProveedor(proveedorId)
      .then(setCatalogo)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingCatalogo(false))
  }, [proveedorId])

  function ajustarCantidad(formatoId: string, delta: number, multiplo?: number | null) {
    setCantidades((prev) => {
      const actual = prev[formatoId] ?? 0
      const paso = multiplo && multiplo > 0 ? multiplo : 1
      const nueva = Math.max(0, actual + delta * paso)
      const next = { ...prev }
      if (nueva === 0) delete next[formatoId]
      else next[formatoId] = nueva
      return next
    })
  }
  function setCantidad(formatoId: string, valor: number) {
    setCantidades((prev) => {
      const next = { ...prev }
      if (!valor || valor <= 0) delete next[formatoId]
      else next[formatoId] = valor
      return next
    })
  }

  const catalogoFiltrado = useMemo(() => {
    let items = catalogo
    if (soloConPrecio) items = items.filter((c) => c.precio != null)
    const q = busqueda.toLowerCase().trim()
    if (q) {
      items = items.filter((c) =>
        c.producto_nombre.toLowerCase().includes(q) ||
        (c.cod_proveedor || '').toLowerCase().includes(q) ||
        (c.cod_interno || '').toLowerCase().includes(q),
      )
    }
    return items
  }, [catalogo, busqueda, soloConPrecio])

  const lineasActivas = useMemo(
    () => catalogo.filter((c) => (cantidades[c.formato_id] ?? 0) > 0 && c.precio != null),
    [catalogo, cantidades],
  )
  const totales = useMemo(() => {
    let subtotal = 0
    let ivaTotal = 0
    for (const c of lineasActivas) {
      const qty = cantidades[c.formato_id] ?? 0
      const desc = c.descuento_pct ?? 0
      const iva = c.iva_pct ?? 21
      const base = qty * (c.precio ?? 0) * (1 - desc / 100)
      subtotal += base
      ivaTotal += base * (iva / 100)
    }
    const total = subtotal + ivaTotal + (portes || 0)
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      ivaTotal: Math.round(ivaTotal * 100) / 100,
      total: Math.round(total * 100) / 100,
    }
  }, [lineasActivas, cantidades, portes])

  const sinPrecio = catalogo.length - catalogo.filter((c) => c.precio != null).length

  async function guardar() {
    setError(null)
    if (!localId) { setError('Selecciona un local'); return }
    if (!proveedorId) { setError('Selecciona un proveedor'); return }
    if (lineasActivas.length === 0) { setError('Añade al menos un producto con cantidad'); return }

    setGuardando(true)
    try {
      const res = await crearPedido({
        p_local_id: localId,
        p_proveedor_id: proveedorId,
        p_lineas: lineasActivas.map((c) => ({
          formato_id: c.formato_id,
          cantidad: cantidades[c.formato_id],
          precio_unitario: c.precio ?? 0,
          descuento_pct: c.descuento_pct ?? 0,
          iva_pct: c.iva_pct ?? 21,
        })),
        p_fecha_entrega_solicitada: fechaEntrega || null,
        p_portes: portes || 0,
        p_notas: notas || null,
        p_origen: 'manual',
      })
      if (!res.ok) {
        setError(res.error || 'Error al crear el pedido')
        return
      }
      navigate('/compras/pedidos')
    } catch (e: any) {
      setError(e.message || 'Error al crear el pedido')
    } finally {
      setGuardando(false)
    }
  }

  if (loadingMaestros) {
    return <div className="p-8 text-center text-muted-foreground">Cargando…</div>
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => navigate('/compras/pedidos')}>
          <ArrowLeft size={16} />
        </Button>
        <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
          <FileText size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Nuevo pedido</h1>
          <p className="text-sm text-muted-foreground">Selecciona local, proveedor y añade productos del catálogo</p>
        </div>
      </div>

      <Card>
        <CardContent className="py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Local *</label>
            <select
              value={localId ?? ''}
              onChange={(e) => setLocalId(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— Seleccionar —</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Proveedor *</label>
            <select
              value={proveedorId ?? ''}
              onChange={(e) => setProveedorId(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">— Seleccionar —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre_comercial}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Fecha entrega solicitada</label>
            <Input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {proveedorId && (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="pl-9"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloConPrecio}
                  onChange={(e) => setSoloConPrecio(e.target.checked)}
                  className="rounded"
                />
                Solo con precio
              </label>
              <span className="text-xs text-muted-foreground">
                {catalogoFiltrado.length} de {catalogo.length} productos
                {sinPrecio > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                    {sinPrecio} sin precio
                  </span>
                )}
              </span>
            </div>

            {loadingCatalogo ? (
              <div className="p-8 text-center text-muted-foreground">Cargando catálogo…</div>
            ) : catalogo.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <AlertCircle className="mx-auto mb-2" size={24} />
                Este proveedor aún no tiene productos en el catálogo. Añade productos desde
                <span className="font-medium"> Productos Compra</span>.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-semibold">Producto</th>
                      <th className="px-4 py-2 font-semibold">Formato</th>
                      <th className="px-4 py-2 font-semibold text-right">Precio</th>
                      <th className="px-4 py-2 font-semibold text-center">IVA</th>
                      <th className="px-4 py-2 font-semibold text-center w-44">Cantidad <span className="text-[10px] font-normal text-muted-foreground">(en unidad de compra)</span></th>
                      <th className="px-4 py-2 font-semibold text-right">Total línea</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogoFiltrado.map((c) => {
                      const qty = cantidades[c.formato_id] ?? 0
                      const tienePrecio = c.precio != null
                      const desc = c.descuento_pct ?? 0
                      const iva = c.iva_pct ?? 21
                      const base = qty * (c.precio ?? 0) * (1 - desc / 100)
                      const totalLinea = base * (1 + iva / 100)
                      return (
                        <tr key={c.formato_id} className={`border-b last:border-0 ${qty > 0 ? 'bg-blue-50/30' : ''} ${!tienePrecio ? 'opacity-60' : ''}`}>
                          <td className="px-4 py-2">
                            <div className="font-medium">{c.producto_nombre}</div>
                            {c.cod_proveedor && <div className="text-xs text-muted-foreground">{c.cod_proveedor}</div>}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            <div>{c.formato_compra}</div>
                            {c.factor_conversion && c.factor_conversion !== 1 && (
                              <div className="text-[10px]">× {c.factor_conversion} {c.unidad_uso}/{c.unidad_compra}</div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {tienePrecio
                              ? (c.precio as number).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
                              : <span className="text-amber-600 text-xs font-medium">Sin precio</span>}
                          </td>
                          <td className="px-4 py-2 text-center">{tienePrecio ? `${iva}%` : '—'}</td>
                          <td className="px-4 py-2">
                            {tienePrecio ? (
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="outline" size="icon" type="button"
                                    onClick={() => ajustarCantidad(c.formato_id, -1, c.multiplo_pedido)}
                                    className="w-8 h-8"
                                  ><Minus size={14} /></Button>
                                  <Input
                                    type="number" min={0} step="any"
                                    value={qty || ''}
                                    onChange={(e) => setCantidad(c.formato_id, Number(e.target.value))}
                                    className="w-20 text-center"
                                    placeholder="0"
                                  />
                                  <Button
                                    variant="outline" size="icon" type="button"
                                    onClick={() => ajustarCantidad(c.formato_id, 1, c.multiplo_pedido)}
                                    className="w-8 h-8"
                                  ><Plus size={14} /></Button>
                                </div>
                                {qty > 0 && c.factor_conversion && c.factor_conversion !== 1 && (
                                  <div className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                                    = {(qty * c.factor_conversion).toLocaleString('es-ES')} {c.unidad_uso} en stock
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center text-xs text-muted-foreground">Asigna precio en Productos Compra</div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {qty > 0 && tienePrecio
                              ? totalLinea.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {proveedorId && (
        <Card>
          <CardContent className="py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Notas (opcional)</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={2}
                placeholder="Comentarios para el proveedor…"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Portes (€)</label>
              <Input
                type="number" step="0.01" min={0}
                value={portes || ''}
                onChange={(e) => setPortes(Number(e.target.value) || 0)}
                className="mt-1"
                placeholder="0.00"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card border-t shadow-lg z-30">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <div>
              <span className="text-muted-foreground">Líneas: </span>
              <span className="font-semibold">{lineasActivas.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Subtotal: </span>
              <span className="font-semibold tabular-nums">
                {totales.subtotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">IVA: </span>
              <span className="font-semibold tabular-nums">
                {totales.ivaTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-bold text-lg tabular-nums">
                {totales.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {error && (
              <span className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle size={14} /> {error}
              </span>
            )}
            <Button variant="outline" onClick={() => navigate('/compras/pedidos')} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando || lineasActivas.length === 0}>
              <Save size={16} /> {guardando ? 'Creando…' : 'Crear pedido'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
