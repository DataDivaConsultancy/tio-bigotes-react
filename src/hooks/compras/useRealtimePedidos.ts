import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Options {
  /** Si se pasa, solo escucha cambios en ese pedido */
  pedidoId?: string
  /** Callback cuando hay cualquier cambio relevante */
  onChange: () => void
  /** Activar o no la suscripción (default true) */
  enabled?: boolean
}

/**
 * Suscripción Realtime a las tablas de pedidos.
 * Llama onChange() cuando hay INSERT/UPDATE/DELETE en pedidos_compra,
 * pedido_compra_lineas o pedido_compra_aprobaciones.
 *
 * Si pedidoId está definido, filtra los eventos al pedido concreto.
 */
export function useRealtimePedidos({ pedidoId, onChange, enabled = true }: Options) {
  const cbRef = useRef(onChange)
  cbRef.current = onChange

  useEffect(() => {
    if (!enabled) return

    const channelName = pedidoId ? `pedidos:${pedidoId}` : 'pedidos:all'
    const channel = supabase.channel(channelName)

    const trigger = () => cbRef.current()

    if (pedidoId) {
      channel
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'pedidos_compra',
          filter: `id=eq.${pedidoId}`,
        }, trigger)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'pedido_compra_lineas',
          filter: `pedido_id=eq.${pedidoId}`,
        }, trigger)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'pedido_compra_aprobaciones',
          filter: `pedido_id=eq.${pedidoId}`,
        }, trigger)
    } else {
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_compra' }, trigger)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_compra_aprobaciones' }, trigger)
    }

    channel.subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [pedidoId, enabled])
}
