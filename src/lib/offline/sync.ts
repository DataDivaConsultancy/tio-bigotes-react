import { supabase } from '@/lib/supabase'
import { offlineDb, type OperacionPendiente } from './db'

let processing = false
const listeners = new Set<(pending: number) => void>()

export function onPendientes(cb: (n: number) => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

async function emitirPending() {
  const n = await offlineDb.cola.count()
  listeners.forEach((l) => l(n))
}

/** Encola una RPC para ejecutarla cuando haya conexión */
export async function encolarRpc(rpc: string, params: any, contexto?: string) {
  await offlineDb.cola.add({
    tipo: 'rpc', rpc, params, contexto,
    creado_at: Date.now(), intentos: 0,
  })
  emitirPending()
  // intentar enviar inmediatamente si hay red
  if (navigator.onLine) procesar()
}

/** Procesa la cola: intenta ejecutar las operaciones pendientes en orden */
export async function procesar(): Promise<{ ok: number; ko: number }> {
  if (processing) return { ok: 0, ko: 0 }
  processing = true
  let ok = 0, ko = 0
  try {
    while (true) {
      const op = await offlineDb.cola.orderBy('creado_at').first()
      if (!op) break
      const ejecutado = await ejecutar(op)
      if (ejecutado) { await offlineDb.cola.delete(op.id!); ok++ }
      else {
        // Si falla, incrementamos intentos. Si > 5, abortamos esta ronda.
        await offlineDb.cola.update(op.id!, {
          intentos: (op.intentos ?? 0) + 1,
          ultimo_error: 'no se pudo enviar',
        })
        ko++
        if ((op.intentos ?? 0) >= 5) break
      }
      emitirPending()
    }
  } finally {
    processing = false
    emitirPending()
  }
  return { ok, ko }
}

async function ejecutar(op: OperacionPendiente): Promise<boolean> {
  try {
    if (op.tipo === 'rpc' && op.rpc) {
      const { error } = await supabase.rpc(op.rpc, op.params ?? {})
      if (error) throw new Error(error.message)
      return true
    }
    return false
  } catch {
    return false
  }
}

// Auto-procesar al recuperar conexión
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { procesar() })
  // Y al cargar la app, intentar drenar lo pendiente si hay red
  if (navigator.onLine) {
    setTimeout(() => procesar(), 1500)
  }
}
