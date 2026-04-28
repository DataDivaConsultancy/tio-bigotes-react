import { supabase, rpcCall } from '@/lib/supabase'

export async function listarIncidencias(filtros: {
  estado?: string
  urgencia?: string
  proveedor_id?: number
  local_id?: number
  buscar?: string
  solo_abiertas?: boolean
} = {}) {
  let q = supabase.from('v_incidencias_listado').select('*').order('creada_at', { ascending: false }).limit(500)
  if (filtros.estado)       q = q.eq('estado', filtros.estado)
  if (filtros.urgencia)     q = q.eq('urgencia', filtros.urgencia)
  if (filtros.proveedor_id) q = q.eq('proveedor_id', filtros.proveedor_id)
  if (filtros.local_id)     q = q.eq('local_id', filtros.local_id)
  if (filtros.solo_abiertas) q = q.in('estado', ['abierta','asignada','esperando_proveedor','en_resolucion','reabierta','escalada'])
  if (filtros.buscar?.trim()) {
    const s = `%${filtros.buscar.trim()}%`
    q = q.or(`numero.ilike.${s},proveedor_nombre.ilike.${s},descripcion.ilike.${s}`)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function crearIncidencia(params: any) {
  return rpcCall<{ id: string; numero: string }>('rpc_crear_incidencia', params)
}

export async function resolverIncidencia(p_id: string, p_tipo_resolucion: string, p_importe?: number, p_notas?: string) {
  return rpcCall('rpc_resolver_incidencia', { p_id, p_tipo_resolucion, p_importe: p_importe ?? null, p_notas: p_notas ?? null })
}

export async function cerrarIncidencia(p_id: string) {
  return rpcCall('rpc_cerrar_incidencia', { p_id })
}
