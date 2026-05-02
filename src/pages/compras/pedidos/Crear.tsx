import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, FileText, Plus, Minus, Search, AlertCircle, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  listarLocales,
  listarProductosUnicos,
  obtenerCatalogoProveedor,
  type LocalMin,
  type ProductoUnico,
  type ItemCatalogo,
} from '@/lib/compras/maestros'
import { crearPedido } from '@/lib/compras/pedidos'

type Cantidades = Record<string, number>

export default function CrearPedido() {
  const navigate = useNavigate()
  const { localesEditables, isSuperadmin } = useAuth()
  const [locales, setLocales] = useState<LocalMin[]>([])
  const [productosUnicos, setProductosUnicos] = useState<ProductoUnico[]>([])
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [localId, setLocalId] = useState<number | null>(null)
  // Producto inicial elegido en el flujo guiado: dispara la selección de proveedor
  const [productoSel, setProductoSel] = useState<ProductoUnico | null>(null)
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [proveedorId, setProveedorId] = useState<number | null>(null)
  const [cantidades, setCantidades] = useState<Cantidades>({})
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [portes, setPortes] = useState(0)
  const [notas, setNotas] = useState('')
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('')
  const [soloConPrecio, setSoloConPrecio] = useState(false)
  const [loadingMaestros, setLoadingMaestros] = useState(true)
  const [loadingCatalogo, setLoadingCatalogo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listarLocales(), listarProductosUnicos()])
      .then(([l, p]) => {
        const editIds = localesEditables('Pedidos')
        const todos = isSuperadmin || (editIds.length === 1 && editIds[0] === -1)
        const filtered = todos ? l : l.filter(li => editIds.includes(li.id))
        setLocales(filtered)
        setProductosUnicos(p)
        if (filtered.length === 1) setLocalId(filtered[0].id)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMaestros(false))
  }, [])

  // Cuando el usuario selecciona un proveedor, carga su catálogo completo
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

  // Cuando cambia el producto inicial, si solo hay un proveedor para ese
  // producto lo elegimos automáticamente (acelera el flujo).
  useEffect(() => {
    if (productoSel && productoSel.proveedores.length === 1) {
      setProveedorId(productoSel.proveedores[0].proveedor_id)
    } else {
      setProveedorId(null)
    }
  }, [productoSel])

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

  // Búsqueda en el desplegable de productos (paso 2)
  const productosFiltrados = useMemo(() => {
    const q = busquedaProducto.toLowerCase().trim()
    if (!q) return productosUnicos.slice(0, 30)
    return productosUnicos.filter((p) => p.producto_nombre.toLowerCase().includes(q)).slice(0, 30)
  }, [productosUnicos, busquedaProducto])

  // Búsqueda dentro del catálogo del proveedor seleccionado (paso 5)
  const catalogoFiltrado = useMemo(() => {
    let items = catalogo
    if (soloConPrecio) items = items.filter((c) => c.precio != null)
    const q = busquedaCatalogo.toLowerCase().trim()
    if (q) {
      items = items.filter((c) =>
        c.producto_nombre.toLowerCase().includes(q) ||
        (c.cod_proveedor || '').toLowerCase().includes(q) ||
        (c.cod_interno || '').toLowerCase().includes(q),
      )
    }
    return items
  }, [catalogo, busquedaCatalogo, soloConPrecio])

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
      const factor = c.factor_conversion ?? 1
      const base = qty * factor * (c.precio ?? 0) * (1 - desc / 100)
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
  const proveedorNombre = productoSel?.proveedores.find((p) => p.proveedor_id === proveedorId)?.proveedor_nombre

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

  // Helpers de UI: cada paso se habilita solo cuando los anteriores están completos
  const paso1Listo = !!localId
  const paso2Listo = !!productoSel
  const paso3Listo = !!proveedorId

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
          <p className="text-sm text-muted-foreground">
            1) Local → 2) Producto → 3) Proveedor → 4) Fecha entrega
          </p>
        </div>
      </div>

      {/* PASO 1 — Local */}
      <Card>
        <CardContent className="py-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">1. Local *</label>
          <select
            value={localId ?? ''}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null
              setLocalId(v)
              // Reset cascada si cambia el local
              setProductoSel(null)
              setProveedorId(null)
              setCantidades({})
            }}
            className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">— Seleccionar local —</option>
            {locales.map((l) => (
              <option key={l.id} value={l.id}>{l.nombre}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* PASO 2 — Producto inicial */}
      <Card className={!paso1Listo ? 'opacity-50 pointer-events-none' : ''}>
        <CardContent className="py-4 space-y-3">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            2. Producto a comprar *
          </label>

          {productoSel ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30">
              <span className="font-medium flex-1">{productoSel.producto_nombre}</span>
              <span className="text-xs text-muted-foreground">
                {productoSel.proveedores.length} proveedor
                {productoSel.proveedores.length === 1 ? '' : 'es'}
              </span>
              <button
                onClick={() => { setProductoSel(null); setProveedorId(null); setCantidades({}) }}
                className="p-1 rounded hover:bg-background text-muted-foreground"
                title="Cambiar producto"
                aria-label="Cambiar producto"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={
                    productosUnicos.length === 0
                      ? 'Aún no hay productos comprables. Crea uno en "Productos" con tipo Compra o Ambos.'
                      : 'Buscar producto…'
                  }
                  value={busquedaProducto}
                  onChange={(e) => setBusquedaProducto(e.target.value)}
                  className="pl-9"
                  disabled={productosUnicos.length === 0}
                />
              </div>
              {busquedaProducto && productosFiltrados.length === 0 && (
                <p className="text-xs text-muted-foreground px-1">
                  Sin resultados para "{busquedaProducto}".
                </p>
              )}
              {productosFiltrados.length > 0 && (
                <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                  {productosFiltrados.map((p) => (
                    <button
                      key={p.producto_id}
                      onClick={() => { setProductoSel(p); setBusquedaProducto('') }}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between text-sm"
                    >
                      <span className="font-medium">{p.producto_nombre}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.proveedores.length === 1
                          ? p.proveedores[0].proveedor_nombre
                          : `${p.proveedores.length} proveedores`}
                      </span>
                    </button>
                  ))}
                  {productosUnicos.length > productosFiltrados.length && !busquedaProducto && (
                    <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                      Mostrando 30 de {productosUnicos.length}. Escribe para filtrar.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* PASO 3 — Proveedor */}
      <Card className={!paso2Listo ? 'opacity-50 pointer-events-none' : ''}>
        <CardContent className="py-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            3. Proveedor *
          </label>
          {productoSel && productoSel.proveedores.length === 0 ? (
            <p className="mt-2 text-sm text-amber-600 flex items-center gap-1">
              <AlertCircle size={14} />
              Este producto no tiene proveedores con precio. Asigna uno desde "Productos Compra".
            </p>
          ) : (
            <select
              value={proveedorId ?? ''}
              onChange={(e) => setProveedorId(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={!productoSel}
            >
              <option value="">— Seleccionar proveedor —</option>
              {(productoSel?.proveedores ?? []).map((p) => (
                <option key={p.proveedor_id} value={p.proveedor_id}>
                  {p.proveedor_nombre}
                  {p.precio != null ? ` · ${p.precio.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}` : ' · sin precio'}
                </option>
              ))}
            </select>
          )}
          {productoSel && productoSel.proveedores.length > 1 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Este producto se puede comprar a varios proveedores. Elige uno y todas las
              líneas del pedido serán a ese proveedor.
            </p>
          )}
        </CardContent>
      </Card>

      {/* PASO 4 — Fecha entrega */}
      <Card className={!paso3Listo ? 'opacity-50 pointer-events-none' : ''}>
        <CardContent className="py-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            4. Fecha entrega solicitada
          </label>
          <Input
            type="date"
            value={fechaEntrega}
            onChange={(e) => setFechaEntrega(e.target.value)}
            className="mt-1 max-w-xs"
            disabled={!proveedorId}
          />
        </CardContent>
      </Card>

      {/* PASO 5 — Catálogo del proveedor (cantidades) */}
      {proveedorId && (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Catálogo de {proveedorNombre ?? 'proveedor'}
              </span>
              <div className="relative flex-1 max-w-md">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto en catálogo…"
                  value={busquedaCatalogo}
                  onChange={(e) => setBusquedaCatalogo(e.target.value)}
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
                Este proveedor aún no tiene productos en el catálogo.
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
                      <th className="px-4 py-2 font-semibold text-center w-44">
                        Cantidad
                        <div className="text-[10px] font-normal text-muted-foreground">paquetes / cajas</div>
                      </th>
                      <th className="px-4 py-2 font-semibold text-center w-28">
                        Unidades
                        <div className="text-[10px] font-normal text-muted-foreground">en stock</div>
                      </th>
                      <th className="px-4 py-2 font-semibold text-right">Total línea</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogoFiltrado.map((c) => {
                      const qty = cantidades[c.formato_id] ?? 0
                      const tienePrecio = c.precio != null
                      const desc = c.descuento_pct ?? 0
                      const iva = c.iva_pct ?? 21
                      const factor = c.factor_conversion ?? 1
                      const base = qty * factor * (c.precio ?? 0) * (1 - desc / 100)
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
                            {tienePrecio ? (
                              <div>
                                <div className="font-medium">
                                  {((c.precio_paquete ?? (c.precio as number) * factor)).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })}
                                  <span className="text-[10px] text-muted-foreground"> /paq</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  unidad: {(c.precio as number).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                                </div>
                              </div>
                            ) : (
                              <span className="text-amber-600 text-xs font-medium">Sin precio</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">{tienePrecio ? `${iva}%` : '—'}</td>
                          <td className="px-4 py-2">
                            {tienePrecio ? (
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
                            ) : (
                              <div className="text-center text-xs text-muted-foreground">Asigna precio en Productos Compra</div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center tabular-nums">
                            {tienePrecio ? (
                              qty > 0 ? (
                                <div>
                                  <div className="font-medium">
                                    {(qty * (c.factor_conversion || 1)).toLocaleString('es-ES')}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">{c.unidad_uso}</div>
                                </div>
                              ) : <span className="text-muted-foreground">—</span>
                            ) : <span className="text-muted-foreground">—</span>}
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

      {/* Notas + portes (después de elegir proveedor) */}
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

      {/* Footer fijo: totales + crear */}
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
