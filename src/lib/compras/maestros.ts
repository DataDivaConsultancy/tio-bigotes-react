import { supabase } from '@/lib/supabase'

export interface LocalMin {
  id: number
  nombre: string
  activo: boolean
}

export interface ProveedorMin {
  id: number
  nombre_comercial: string
  cif: string | null
  activo: boolean
  forma_pago: string | null
  plazo_pago: string | null
}

export interface ItemCatalogo {
  proveedor_id: number
  formato_id: string
  producto_id: number
  producto_nombre: string
  cod_proveedor: string | null
  cod_interno: string | null
  formato_compra: string
  unidad_compra: string
  unidad_uso: string
  factor_conversion: number
  unidades_por_paquete: number | null
  precio: number | null
  precio_paquete: number | null
  iva_pct: number | null
  descuento_pct: number | null
  cantidad_minima_pedido: number | null
  multiplo_pedido: number | null
}

export async function listarLocales(soloActivos = true): Promise<LocalMin[]> {
  let q = supabase.from('locales_compra_v2').select('id, nombre, activo').order('nombre')
  if (soloActivos) q = q.eq('activo', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as LocalMin[]
}

export async function listarProveedores(soloActivos = true): Promise<ProveedorMin[]> {
  let q = supabase
    .from('proveedores_v2')
    .select('id, nombre_comercial, cif, activo, forma_pago, plazo_pago')
    .order('nombre_comercial')
  if (soloActivos) q = q.eq('activo', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as ProveedorMin[]
}

export async function obtenerCatalogoProveedor(proveedorId: number): Promise<ItemCatalogo[]> {
  const { data, error } = await supabase
    .from('v_catalogo_proveedor')
    .select('*')
    .eq('proveedor_id', proveedorId)
    .order('producto_nombre')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    ...r,
    precio: r.precio != null ? Number(r.precio) : null,
    precio_paquete: r.precio_paquete != null ? Number(r.precio_paquete) : null,
    iva_pct: r.iva_pct != null ? Number(r.iva_pct) : null,
    descuento_pct: r.descuento_pct != null ? Number(r.descuento_pct) : null,
    factor_conversion: Number(r.factor_conversion),
    cantidad_minima_pedido: r.cantidad_minima_pedido != null ? Number(r.cantidad_minima_pedido) : null,
    multiplo_pedido: r.multiplo_pedido != null ? Number(r.multiplo_pedido) : null,
  })) as ItemCatalogo[]
}


export interface ProductoUnico {
  producto_id: number
  producto_nombre: string
  proveedores: {
    proveedor_id: number
    proveedor_nombre: string
    precio: number | null
  }[]
}

/**
 * Lista todos los productos comprables agrupados por NOMBRE.
 * Para cada producto devuelve los proveedores que lo ofrecen
 * (con su precio activo) — sirve para el flujo
 * "Local → Producto → Proveedor" del Crear Pedido.
 */
export async function listarProductosUnicos(): Promise<ProductoUnico[]> {
  const { data, error } = await supabase
    .from('v_catalogo_proveedor')
    .select('producto_id, producto_nombre, proveedor_id, precio')
    .order('producto_nombre')
  if (error) throw new Error(error.message)
  const filas = data ?? []
  if (filas.length === 0) return []

  // Cargar nombres de proveedores en una sola query
  const provIds = Array.from(new Set(filas.map((r: any) => r.proveedor_id))).filter(
    (id) => id != null,
  )
  let provNombre = new Map<number, string>()
  if (provIds.length > 0) {
    const { data: provs, error: e2 } = await supabase
      .from('proveedores_v2')
      .select('id, nombre_comercial')
      .in('id', provIds)
    if (e2) throw new Error(e2.message)
    provNombre = new Map((provs ?? []).map((p: any) => [p.id, p.nombre_comercial]))
  }

  // Agrupar por nombre normalizado para colapsar duplicados de catálogo
  const groups = new Map<string, ProductoUnico>()
  for (const r of filas as any[]) {
    const key = (r.producto_nombre || '').toLowerCase().trim()
    if (!key) continue
    if (!groups.has(key)) {
      groups.set(key, {
        producto_id: r.producto_id,
        producto_nombre: r.producto_nombre,
        proveedores: [],
      })
    }
    const g = groups.get(key)!
    // Evitar duplicados (proveedor + producto)
    if (!g.proveedores.find((p) => p.proveedor_id === r.proveedor_id)) {
      g.proveedores.push({
        proveedor_id: r.proveedor_id,
        proveedor_nombre: provNombre.get(r.proveedor_id) ?? `#${r.proveedor_id}`,
        precio: r.precio != null ? Number(r.precio) : null,
      })
    }
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.producto_nombre.localeCompare(b.producto_nombre, 'es'),
  )
}
