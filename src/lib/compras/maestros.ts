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
    iva_pct: r.iva_pct != null ? Number(r.iva_pct) : null,
    descuento_pct: r.descuento_pct != null ? Number(r.descuento_pct) : null,
    factor_conversion: Number(r.factor_conversion),
    cantidad_minima_pedido: r.cantidad_minima_pedido != null ? Number(r.cantidad_minima_pedido) : null,
    multiplo_pedido: r.multiplo_pedido != null ? Number(r.multiplo_pedido) : null,
  })) as ItemCatalogo[]
}
