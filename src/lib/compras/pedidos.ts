import { supabase, rpcCall } from '@/lib/supabase'
import type { Pedido, FiltrosPedidos, CrearPedidoInput, DecisionAprobacion } from '@/lib/schemas/pedidos'

// ============================================================
// Data access — Pedidos de Compra
// ============================================================

/** Lista pedidos desde la vista v_pedidos_compra_listado, con filtros opcionales */
export async function listarPedidos(filtros: FiltrosPedidos = {}): Promise<Pedido[]> {
  let q = supabase
    .from('v_pedidos_compra_listado')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (filtros.estado)        q = q.eq('estado', filtros.estado)
  if (filtros.proveedor_id)  q = q.eq('proveedor_id', filtros.proveedor_id)
  if (filtros.local_id)      q = q.eq('local_id', filtros.local_id)
  if (filtros.desde)         q = q.gte('fecha_pedido', filtros.desde)
  if (filtros.hasta)         q = q.lte('fecha_pedido', filtros.hasta)
  if (filtros.buscar?.trim()) {
    const s = `%${filtros.buscar.trim()}%`
    q = q.or(`numero.ilike.${s},proveedor_nombre.ilike.${s}`)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as Pedido[]
}

/** Obtiene un pedido con sus líneas y aprobaciones */
export async function obtenerPedido(id: string) {
  const [{ data: cabecera, error: e1 }, { data: lineas, error: e2 }, { data: aprobs, error: e3 }] =
    await Promise.all([
      supabase.from('v_pedidos_compra_listado').select('*').eq('id', id).single(),
      supabase.from('pedido_compra_lineas').select('*').eq('pedido_id', id).order('orden', { ascending: true }),
      supabase.from('pedido_compra_aprobaciones').select('*').eq('pedido_id', id).order('decidido_at', { ascending: false }),
    ])
  if (e1) throw new Error(e1.message)
  if (e2) throw new Error(e2.message)
  if (e3) throw new Error(e3.message)
  return { cabecera, lineas: lineas ?? [], aprobaciones: aprobs ?? [] }
}

export async function crearPedido(input: CrearPedidoInput) {
  return rpcCall<{ id: string; numero: string; estado: string; total: number; requiere_aprobacion: boolean; lineas: number }>(
    'rpc_crear_pedido',
    input,
  )
}

export async function actualizarPedido(params: {
  p_id: string
  p_lineas?: any[]
  p_fecha_entrega_solicitada?: string | null
  p_portes?: number
  p_notas?: string | null
}) {
  return rpcCall('rpc_actualizar_pedido', params)
}

export async function enviarPedido(p_id: string, p_via: 'email' | 'portal' | 'whatsapp' | 'telefono' | 'edi' = 'email') {
  return rpcCall('rpc_enviar_pedido', { p_id, p_via })
}

export async function aprobarPedido(p_id: string, p_decision: DecisionAprobacion, p_comentarios?: string) {
  return rpcCall('rpc_aprobar_pedido', { p_id, p_decision, p_comentarios: p_comentarios ?? null })
}

export async function cancelarPedido(p_id: string, p_motivo?: string) {
  return rpcCall('rpc_cancelar_pedido', { p_id, p_motivo: p_motivo ?? null })
}

export async function duplicarPedido(p_id: string) {
  return rpcCall<{ id: string; numero: string; total: number }>('rpc_duplicar_pedido', { p_id })
}
