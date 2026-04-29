import { useEffect, useState } from 'react'
import { offlineDb } from '@/lib/offline/db'
import { onPendientes } from '@/lib/offline/sync'

export function useColaPendiente() {
  const [pendientes, setPendientes] = useState(0)
  useEffect(() => {
    offlineDb.cola.count().then(setPendientes)
    return onPendientes(setPendientes)
  }, [])
  return pendientes
}
