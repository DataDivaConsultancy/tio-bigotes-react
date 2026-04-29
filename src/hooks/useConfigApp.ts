import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface ConfigItem {
  clave: string
  valor: any
  categoria: string
  etiqueta: string
  descripcion: string | null
  tipo: string
  opciones: any[] | null
  orden: number
  editable: boolean
}

const listeners = new Set<(c: Record<string, any>) => void>()
let cache: Record<string, any> = {}
let loaded = false

async function fetchAll() {
  const { data } = await supabase
    .from('configuracion_app')
    .select('clave, valor')
  if (data) {
    cache = {}
    for (const r of data as any[]) cache[r.clave] = r.valor
    loaded = true
    listeners.forEach((l) => l(cache))
  }
}

// Carga inicial al primer uso
let initPromise: Promise<void> | null = null
function ensureLoaded() {
  if (loaded) return Promise.resolve()
  if (!initPromise) initPromise = fetchAll()
  return initPromise
}

// Realtime
if (typeof window !== 'undefined') {
  const ch = supabase.channel('config-app')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracion_app' }, () => fetchAll())
    .subscribe()
  // No removemos en hot reload — vive con la app
  void ch
}

/** Hook reactivo: devuelve un map clave→valor con el cache. */
export function useConfigApp() {
  const [config, setConfig] = useState<Record<string, any>>(cache)
  useEffect(() => {
    ensureLoaded().then(() => setConfig({ ...cache }))
    const cb = (c: Record<string, any>) => setConfig({ ...c })
    listeners.add(cb)
    return () => { listeners.delete(cb) }
  }, [])
  return config
}

/** Atajo: lee un valor con default */
export function useConfigValue<T = string>(clave: string, defaultValue?: T): T {
  const cfg = useConfigApp()
  return (cfg[clave] ?? defaultValue) as T
}
