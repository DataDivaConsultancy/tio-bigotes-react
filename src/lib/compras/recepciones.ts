import { supabase, rpcCall } from '@/lib/supabase'

export async function listarRecepciones(filtros: {
  estado?: string
  local_id?: number
  proveedor_id?: number
  buscar?: string
} = {}) {
  let q = supabase.from('v_recepciones_listado').select('*').order('iniciada_at', { ascending: false }).limit(500)
  if (filtros.estado)       q = q.eq('estado', filtros.estado)
  if (filtros.local_id)     q = q.eq('local_id', filtros.local_id)
  if (filtros.proveedor_id) q = q.eq('proveedor_id', filtros.proveedor_id)
  if (filtros.buscar?.trim()) {
    const s = `%${filtros.buscar.trim()}%`
    q = q.or(`numero.ilike.${s},pedido_numero.ilike.${s},proveedor_nombre.ilike.${s}`)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function obtenerRecepcion(id: string) {
  const [{ data: cabecera, error: e1 }, { data: lineas, error: e2 }] = await Promise.all([
    supabase.from('v_recepciones_listado').select('*').eq('id', id).single(),
    supabase.from('recepcion_lineas').select('*').eq('recepcion_id', id).order('created_at'),
  ])
  if (e1) throw new Error(e1.message)
  if (e2) throw new Error(e2.message)
  return { cabecera, lineas: lineas ?? [] }
}

export async function iniciarRecepcion(p_pedido_id: string) {
  return rpcCall<{ id: string }>('rpc_iniciar_recepcion', { p_pedido_id })
}

export async function actualizarLineaRecepcion(params: {
  p_linea_id: string
  p_cantidad_recibida: number
  p_estado: string
  p_lote?: string | null
  p_fecha_caducidad?: string | null
  p_temperatura?: number | null
  p_foto_url?: string | null
  p_notas?: string | null
}) {
  // Si offline, encolar la operación y devolver ok local
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const { encolarRpc } = await import('@/lib/offline/sync')
    await encolarRpc('rpc_actualizar_linea_recepcion', params, `linea:${params.p_linea_id}`)
    return { ok: true, data: { offline: true } } as any
  }
  return rpcCall('rpc_actualizar_linea_recepcion', params)
}

export async function completarRecepcion(p_recepcion_id: string) {
  return rpcCall('rpc_completar_recepcion', { p_recepcion_id })
}
