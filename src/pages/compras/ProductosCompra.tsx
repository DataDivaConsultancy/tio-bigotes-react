import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Plus, Search, Pencil, X, ShoppingCart, Trash2, ChevronDown, ChevronRight, Save,
} from 'lucide-react'

interface ProductoCompra {
  id: number
  nombre: string
  cod_interno: string | null
  unidad_medida: string | null
  unidad_minima_compra: number | null
  unidades_por_paquete: number | null
  stock_minimo: number | null
  producto_venta_id: number | null
  activo: boolean
}

interface Proveedor {
  id: number
  nombre_comercial: string
}

interface RelacionPP {
  producto_id: number
  proveedor_id: number
  cod_proveedor: string | null
  dia_pedido: string | null
  dia_entrega: string | null
  forma_pago: string | null
  plazo_pago: string | null
  es_principal: boolean
  activo: boolean
}

const UNIDADES = ['unidad','kg','g','l','ml','caja','pack','saco','garrafa','palet','bandeja','bidon','docena']

export default function ProductosCompra() {
  const [productos, setProductos] = useState<ProductoCompra[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [relaciones, setRelaciones] = useState<RelacionPP[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<Record<number, boolean>>({})
  const [busqueda, setBusqueda] = useState('')

  // Modal añadir/editar relación
  const [modalRel, setModalRel] = useState<{ open: boolean; producto: ProductoCompra | null; rel: Partial<RelacionPP>; isNew: boolean }>({
    open: false, producto: null, rel: {}, isNew: true,
  })

  // Modal añadir/editar producto
  const [modalProd, setModalProd] = useState<{ open: boolean; data: Partial<ProductoCompra>; isNew: boolean }>({
    open: false, data: {}, isNew: true,
  })

  // Modal precio: edita el precio activo del par (proveedor, formato_predeterminado_del_producto)
  const [modalPrecio, setModalPrecio] = useState<{
    open: boolean
    producto: ProductoCompra | null
    proveedor_id: number | null
    proveedor_nombre: string
    precio: string
    iva_pct: string
    descuento_pct: string
    cantidad_minima_pedido: string
    multiplo_pedido: string
  }>({ open: false, producto: null, proveedor_id: null, proveedor_nombre: '', precio: '', iva_pct: '21', descuento_pct: '', cantidad_minima_pedido: '', multiplo_pedido: '' })

  useEffect(() => { void cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const [pRes, provRes, relRes] = await Promise.all([
        supabase.from('productos_compra_v2')
          .select('id, nombre, cod_interno, unidad_medida, unidad_minima_compra, unidades_por_paquete, stock_minimo, producto_venta_id, activo')
          .order('nombre'),
        supabase.from('proveedores_v2').select('id, nombre_comercial').eq('activo', true).order('nombre_comercial'),
        supabase.from('producto_proveedor').select('*'),
      ])
      if (pRes.error) throw new Error(pRes.error.message)
      if (provRes.error) throw new Error(provRes.error.message)
      if (relRes.error) throw new Error(relRes.error.message)
      setProductos((pRes.data ?? []) as ProductoCompra[])
      setProveedores((provRes.data ?? []) as Proveedor[])
      setRelaciones((relRes.data ?? []) as RelacionPP[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const productosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return productos
    return productos.filter((p) =>
      p.nombre.toLowerCase().includes(q) ||
      (p.cod_interno || '').toLowerCase().includes(q),
    )
  }, [productos, busqueda])

  function relacionesDe(producto_id: number) {
    return relaciones.filter((r) => r.producto_id === producto_id)
  }
  function nombreProveedor(id: number) {
    return proveedores.find((p) => p.id === id)?.nombre_comercial ?? `#${id}`
  }

  /* ───── Producto: crear/editar ───── */
  function abrirNuevoProducto() {
    setModalProd({ open: true, isNew: true, data: { nombre: '', cod_interno: '', unidad_medida: 'unidad', activo: true } })
  }
  function abrirEditarProducto(p: ProductoCompra) {
    setModalProd({ open: true, isNew: false, data: { ...p } })
  }
  async function guardarProducto() {
    const d = modalProd.data
    const nombre = (d.nombre || '').trim()
    if (!nombre) { alert('El nombre es obligatorio'); return }
    const payload: Record<string, unknown> = {
      nombre,
      cod_interno: d.cod_interno || null,
      unidad_medida: d.unidad_medida || null,
      unidad_minima_compra: d.unidad_minima_compra ?? null,
      unidades_por_paquete: d.unidades_por_paquete ?? null,
      stock_minimo: d.stock_minimo ?? null,
      activo: d.activo !== false,
    }
    try {
      if (modalProd.isNew) {
        const { error } = await supabase.from('productos_compra_v2').insert(payload)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('productos_compra_v2').update(payload).eq('id', d.id!)
        if (error) throw new Error(error.message)
      }
      setModalProd({ open: false, isNew: true, data: {} })
      await cargar()
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  async function borrarProducto(p: ProductoCompra) {
    const rels = relacionesDe(p.id).length
    if (rels > 0) {
      if (!confirm(`Este producto tiene ${rels} proveedor${rels === 1 ? '' : 'es'} asociado${rels === 1 ? '' : 's'}. ¿Desactivar el producto en lugar de borrar? (Se preservan referencias históricas.)`)) return
      const { error } = await supabase.from('productos_compra_v2').update({ activo: false }).eq('id', p.id)
      if (error) { alert(error.message); return }
      await cargar()
      return
    }
    if (!confirm(`¿Borrar "${p.nombre}"?`)) return
    const { error } = await supabase.from('productos_compra_v2').delete().eq('id', p.id)
    if (error) { alert(error.message); return }
    await cargar()
  }

  /* ───── Relación producto-proveedor: crear/editar/borrar ───── */
  function abrirNuevaRelacion(producto: ProductoCompra) {
    setModalRel({
      open: true, isNew: true, producto,
      rel: { producto_id: producto.id, es_principal: relacionesDe(producto.id).length === 0, activo: true },
    })
  }
  function abrirEditarRelacion(producto: ProductoCompra, r: RelacionPP) {
    setModalRel({ open: true, isNew: false, producto, rel: { ...r } })
  }
  async function guardarRelacion() {
    const r = modalRel.rel
    if (!r.producto_id || !r.proveedor_id) { alert('Falta el proveedor'); return }
    const payload = {
      producto_id: r.producto_id,
      proveedor_id: r.proveedor_id,
      cod_proveedor: r.cod_proveedor || null,
      dia_pedido: r.dia_pedido || null,
      dia_entrega: r.dia_entrega || null,
      forma_pago: r.forma_pago || null,
      plazo_pago: r.plazo_pago || null,
      es_principal: !!r.es_principal,
      activo: r.activo !== false,
    }
    try {
      if (modalRel.isNew) {
        const { error } = await supabase.from('producto_proveedor').insert(payload)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('producto_proveedor')
          .update(payload)
          .eq('producto_id', r.producto_id).eq('proveedor_id', r.proveedor_id)
        if (error) throw new Error(error.message)
      }
      // Si marcó "es_principal", desmarcar los demás del mismo producto
      if (payload.es_principal) {
        await supabase.from('producto_proveedor')
          .update({ es_principal: false })
          .eq('producto_id', payload.producto_id)
          .neq('proveedor_id', payload.proveedor_id)
      }
      setModalRel({ open: false, isNew: true, producto: null, rel: {} })
      await cargar()
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  async function borrarRelacion(r: RelacionPP) {
    if (!confirm(`¿Quitar al proveedor "${nombreProveedor(r.proveedor_id)}" de este producto?`)) return
    const { error } = await supabase.from('producto_proveedor').delete()
      .eq('producto_id', r.producto_id).eq('proveedor_id', r.proveedor_id)
    if (error) { alert(error.message); return }
    await cargar()
  }

  /* ───── Precios por (proveedor, formato_predeterminado) ───── */
  async function abrirPrecio(producto: ProductoCompra, r: RelacionPP) {
    const provNom = nombreProveedor(r.proveedor_id)
    // Buscar el formato predeterminado del producto
    const { data: fmt } = await supabase
      .from('producto_formatos')
      .select('id')
      .eq('producto_id', producto.id)
      .eq('es_predeterminado', true)
      .limit(1)
      .maybeSingle()
    if (!fmt?.id) {
      alert('Este producto no tiene formato predeterminado. Crea uno en producto_formatos antes de asignar precio.')
      return
    }
    // Buscar precio activo (si existe)
    const { data: precioRow } = await supabase
      .from('proveedor_producto_precios')
      .select('precio, iva_pct, descuento_pct, cantidad_minima_pedido, multiplo_pedido')
      .eq('proveedor_id', r.proveedor_id)
      .eq('formato_id', fmt.id)
      .eq('activa', true)
      .order('vigente_desde', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    setModalPrecio({
      open: true,
      producto,
      proveedor_id: r.proveedor_id,
      proveedor_nombre: provNom,
      precio: precioRow?.precio != null ? String(precioRow.precio) : '',
      iva_pct: precioRow?.iva_pct != null ? String(precioRow.iva_pct) : '21',
      descuento_pct: precioRow?.descuento_pct != null ? String(precioRow.descuento_pct) : '',
      cantidad_minima_pedido: precioRow?.cantidad_minima_pedido != null ? String(precioRow.cantidad_minima_pedido) : '',
      multiplo_pedido: precioRow?.multiplo_pedido != null ? String(precioRow.multiplo_pedido) : '',
    })
  }

  async function guardarPrecio() {
    const m = modalPrecio
    if (!m.producto || !m.proveedor_id) return
    const precioNum = parseFloat(m.precio.replace(',', '.'))
    if (isNaN(precioNum) || precioNum < 0) { alert('Precio inválido'); return }
    const { data: fmt } = await supabase
      .from('producto_formatos')
      .select('id')
      .eq('producto_id', m.producto.id)
      .eq('es_predeterminado', true)
      .limit(1)
      .maybeSingle()
    if (!fmt?.id) { alert('Sin formato predeterminado'); return }

    // Cerrar precios anteriores activos (vigente_hasta = ayer)
    await supabase
      .from('proveedor_producto_precios')
      .update({ activa: false, vigente_hasta: new Date().toISOString().slice(0, 10) })
      .eq('proveedor_id', m.proveedor_id)
      .eq('formato_id', fmt.id)
      .eq('activa', true)

    // Insertar nuevo precio activo desde hoy
    const num = (s: string) => {
      const v = parseFloat(s.replace(',', '.'))
      return isNaN(v) ? null : v
    }
    const { error } = await supabase.from('proveedor_producto_precios').insert({
      proveedor_id: m.proveedor_id,
      formato_id: fmt.id,
      precio: precioNum,
      iva_pct: num(m.iva_pct) ?? 21,
      descuento_pct: num(m.descuento_pct),
      cantidad_minima_pedido: num(m.cantidad_minima_pedido),
      multiplo_pedido: num(m.multiplo_pedido),
      moneda: 'EUR',
      vigente_desde: new Date().toISOString().slice(0, 10),
      activa: true,
    })
    if (error) { alert(`Error: ${error.message}`); return }
    setModalPrecio({ ...m, open: false })
  }

  /* ───── Render ───── */
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-7 w-7 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">Productos Compra</h1>
            <p className="text-sm text-muted-foreground">
              Catálogo de productos comprables y los proveedores que los ofrecen.
            </p>
          </div>
        </div>
        <Button onClick={abrirNuevoProducto}>
          <Plus size={16} className="mr-1.5" /> Nuevo producto
        </Button>
      </div>

      {error && (
        <Card><CardContent className="p-4 text-sm text-red-600">{error}</CardContent></Card>
      )}

      <Card>
        <CardContent className="py-3">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar producto…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? 'Cargando…' : `${productosFiltrados.length} de ${productos.length} producto${productos.length === 1 ? '' : 's'}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && productos.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay productos comprables. Pulsa <strong>"Nuevo producto"</strong> para empezar.
            </div>
          ) : (
            <div className="rounded-lg border divide-y">
              {productosFiltrados.map((p) => {
                const rels = relacionesDe(p.id)
                const open = !!expandido[p.id]
                return (
                  <div key={p.id}>
                    <div className="flex items-center gap-2 p-3 hover:bg-muted/30">
                      <button
                        onClick={() => setExpandido({ ...expandido, [p.id]: !open })}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        aria-label={open ? 'Cerrar' : 'Abrir'}
                      >
                        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.nombre}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          {p.cod_interno && <span className="font-mono">{p.cod_interno}</span>}
                          <span>{p.unidad_medida ?? '—'}</span>
                          <span className="px-1.5 rounded-full bg-muted">
                            {rels.length} proveedor{rels.length === 1 ? '' : 'es'}
                          </span>
                          {!p.activo && <span className="text-amber-600">Inactivo</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => abrirEditarProducto(p)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Editar producto"
                      ><Pencil size={14} /></button>
                      <button
                        onClick={() => borrarProducto(p)}
                        className="p-1.5 rounded hover:bg-red-50 hover:text-red-600 text-muted-foreground"
                        title="Borrar / desactivar producto"
                      ><Trash2 size={14} /></button>
                    </div>

                    {open && (
                      <div className="px-3 pb-3 pl-10 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">Proveedores que ofrecen este producto:</p>
                          <Button size="sm" variant="outline" onClick={() => abrirNuevaRelacion(p)}>
                            <Plus size={12} className="mr-1" /> Añadir proveedor
                          </Button>
                        </div>
                        {rels.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">
                            Sin proveedores. Añade al menos uno para poder comprarlo.
                          </p>
                        ) : (
                          <div className="rounded border divide-y bg-background">
                            {rels.map((r) => (
                              <div key={`${r.producto_id}-${r.proveedor_id}`} className="p-2 flex items-center gap-2 text-sm">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{nombreProveedor(r.proveedor_id)}</span>
                                    {r.es_principal && (
                                      <span className="text-[10px] uppercase bg-orange-100 text-orange-700 px-1.5 rounded-full">Principal</span>
                                    )}
                                    {!r.activo && <span className="text-amber-600 text-xs">Inactivo</span>}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
                                    {r.cod_proveedor && <span>Cód: {r.cod_proveedor}</span>}
                                    {r.dia_pedido && <span>Pedido: {r.dia_pedido}</span>}
                                    {r.dia_entrega && <span>Entrega: {r.dia_entrega}</span>}
                                    {r.forma_pago && <span>{r.forma_pago}</span>}
                                  </div>
                                </div>
                                <button
                                  onClick={() => abrirPrecio(p, r)}
                                  className="px-2 py-1 rounded text-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground border"
                                  title="Asignar / cambiar precio"
                                >Precio</button>
                                <button
                                  onClick={() => abrirEditarRelacion(p, r)}
                                  className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                                  title="Editar relación"
                                ><Pencil size={12} /></button>
                                <button
                                  onClick={() => borrarRelacion(r)}
                                  className="p-1.5 rounded hover:bg-red-50 hover:text-red-600 text-muted-foreground"
                                  title="Quitar proveedor"
                                ><Trash2 size={12} /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: producto */}
      {modalProd.open && (
        <ModalShell title={modalProd.isNew ? 'Nuevo producto' : 'Editar producto'} onClose={() => setModalProd({ ...modalProd, open: false })}>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1">Nombre *</label>
              <Input
                value={modalProd.data.nombre || ''}
                onChange={(e) => setModalProd({ ...modalProd, data: { ...modalProd.data, nombre: e.target.value } })}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium block mb-1">Código interno</label>
                <Input
                  value={modalProd.data.cod_interno || ''}
                  onChange={(e) => setModalProd({ ...modalProd, data: { ...modalProd.data, cod_interno: e.target.value } })}
                  className="font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Unidad medida</label>
                <select
                  value={modalProd.data.unidad_medida || 'unidad'}
                  onChange={(e) => setModalProd({ ...modalProd, data: { ...modalProd.data, unidad_medida: e.target.value } })}
                  className="w-full px-2 py-1.5 text-sm border rounded-md bg-background"
                >
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium block mb-1">U. mín. compra</label>
                <Input
                  type="number" step="any" min={0}
                  value={modalProd.data.unidad_minima_compra ?? ''}
                  onChange={(e) => setModalProd({ ...modalProd, data: { ...modalProd.data, unidad_minima_compra: e.target.value === '' ? null : Number(e.target.value) } })}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Uds/paquete</label>
                <Input
                  type="number" step="any" min={0}
                  value={modalProd.data.unidades_por_paquete ?? ''}
                  onChange={(e) => setModalProd({ ...modalProd, data: { ...modalProd.data, unidades_por_paquete: e.target.value === '' ? null : Number(e.target.value) } })}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Stock mín.</label>
                <Input
                  type="number" step="any" min={0}
                  value={modalProd.data.stock_minimo ?? ''}
                  onChange={(e) => setModalProd({ ...modalProd, data: { ...modalProd.data, stock_minimo: e.target.value === '' ? null : Number(e.target.value) } })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="prod-activo"
                checked={modalProd.data.activo !== false}
                onChange={(e) => setModalProd({ ...modalProd, data: { ...modalProd.data, activo: e.target.checked } })}
              />
              <label htmlFor="prod-activo" className="text-sm">Activo</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalProd({ ...modalProd, open: false })}>Cancelar</Button>
              <Button onClick={guardarProducto}><Save size={14} className="mr-1.5" />Guardar</Button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Modal: precio del par (proveedor, formato predeterminado) */}
      {modalPrecio.open && modalPrecio.producto && (
        <ModalShell
          title={`Precio — ${modalPrecio.producto.nombre} · ${modalPrecio.proveedor_nombre}`}
          onClose={() => setModalPrecio({ ...modalPrecio, open: false })}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1">Precio unitario (€) *</label>
              <Input
                type="text" inputMode="decimal" autoFocus
                value={modalPrecio.precio}
                onChange={(e) => setModalPrecio({ ...modalPrecio, precio: e.target.value })}
                placeholder="0,00"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium block mb-1">IVA (%)</label>
                <Input
                  type="text" inputMode="decimal"
                  value={modalPrecio.iva_pct}
                  onChange={(e) => setModalPrecio({ ...modalPrecio, iva_pct: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Descuento (%)</label>
                <Input
                  type="text" inputMode="decimal"
                  value={modalPrecio.descuento_pct}
                  onChange={(e) => setModalPrecio({ ...modalPrecio, descuento_pct: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium block mb-1">Cantidad mín. pedido</label>
                <Input
                  type="text" inputMode="decimal"
                  value={modalPrecio.cantidad_minima_pedido}
                  onChange={(e) => setModalPrecio({ ...modalPrecio, cantidad_minima_pedido: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Múltiplo pedido</label>
                <Input
                  type="text" inputMode="decimal"
                  value={modalPrecio.multiplo_pedido}
                  onChange={(e) => setModalPrecio({ ...modalPrecio, multiplo_pedido: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Al guardar se cierra el precio anterior con vigente_hasta = hoy
              y se crea uno nuevo activo desde hoy (histórico preservado).
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalPrecio({ ...modalPrecio, open: false })}>Cancelar</Button>
              <Button onClick={guardarPrecio}><Save size={14} className="mr-1.5" />Guardar precio</Button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Modal: relación producto↔proveedor */}
      {modalRel.open && modalRel.producto && (
        <ModalShell
          title={`${modalRel.isNew ? 'Añadir' : 'Editar'} proveedor — ${modalRel.producto.nombre}`}
          onClose={() => setModalRel({ ...modalRel, open: false })}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1">Proveedor *</label>
              <select
                value={modalRel.rel.proveedor_id ?? ''}
                onChange={(e) => setModalRel({ ...modalRel, rel: { ...modalRel.rel, proveedor_id: e.target.value ? Number(e.target.value) : undefined } })}
                disabled={!modalRel.isNew}
                className="w-full px-2 py-1.5 text-sm border rounded-md bg-background"
              >
                <option value="">— Elegir —</option>
                {proveedores
                  .filter((p) => modalRel.isNew
                    ? !relacionesDe(modalRel.producto!.id).some((r) => r.proveedor_id === p.id)
                    : true)
                  .map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Código del producto en este proveedor</label>
              <Input
                value={modalRel.rel.cod_proveedor || ''}
                onChange={(e) => setModalRel({ ...modalRel, rel: { ...modalRel.rel, cod_proveedor: e.target.value } })}
                placeholder="Ref. del proveedor"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium block mb-1">Día pedido</label>
                <Input
                  value={modalRel.rel.dia_pedido || ''}
                  onChange={(e) => setModalRel({ ...modalRel, rel: { ...modalRel.rel, dia_pedido: e.target.value } })}
                  placeholder="Lunes"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Día entrega</label>
                <Input
                  value={modalRel.rel.dia_entrega || ''}
                  onChange={(e) => setModalRel({ ...modalRel, rel: { ...modalRel.rel, dia_entrega: e.target.value } })}
                  placeholder="Miércoles"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium block mb-1">Forma pago</label>
                <Input
                  value={modalRel.rel.forma_pago || ''}
                  onChange={(e) => setModalRel({ ...modalRel, rel: { ...modalRel.rel, forma_pago: e.target.value } })}
                  placeholder="Transferencia"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Plazo pago</label>
                <Input
                  value={modalRel.rel.plazo_pago || ''}
                  onChange={(e) => setModalRel({ ...modalRel, rel: { ...modalRel.rel, plazo_pago: e.target.value } })}
                  placeholder="30 días"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={!!modalRel.rel.es_principal}
                  onChange={(e) => setModalRel({ ...modalRel, rel: { ...modalRel.rel, es_principal: e.target.checked } })}
                />
                Proveedor principal
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={modalRel.rel.activo !== false}
                  onChange={(e) => setModalRel({ ...modalRel, rel: { ...modalRel.rel, activo: e.target.checked } })}
                />
                Activo
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              El precio se gestiona aparte en la tabla de precios por (proveedor, formato), con histórico
              de vigencias. Al añadir un proveedor aquí, después podrás asignarle precios.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalRel({ ...modalRel, open: false })}>Cancelar</Button>
              <Button onClick={guardarRelacion}><Save size={14} className="mr-1.5" />Guardar</Button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

/* Modal genérico simple */
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground"><X size={16} /></button>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}
