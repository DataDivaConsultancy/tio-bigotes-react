import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export interface FiltrosCompras {
  local_id?: number
  desde?: string  // YYYY-MM-DD
  hasta?: string
  periodo?: 'mes_actual' | 'mes_anterior' | '7d' | '30d' | '90d' | 'rango'
}

const DEFAULT: FiltrosCompras = { periodo: 'mes_actual' }

function rangoPeriodo(p: FiltrosCompras['periodo']): { desde?: string; hasta?: string } {
  const hoy = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  switch (p) {
    case 'mes_actual': {
      const i = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      return { desde: fmt(i), hasta: fmt(hoy) }
    }
    case 'mes_anterior': {
      const i = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
      const f = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
      return { desde: fmt(i), hasta: fmt(f) }
    }
    case '7d':  return { desde: fmt(new Date(hoy.getTime() - 7  * 86400000)), hasta: fmt(hoy) }
    case '30d': return { desde: fmt(new Date(hoy.getTime() - 30 * 86400000)), hasta: fmt(hoy) }
    case '90d': return { desde: fmt(new Date(hoy.getTime() - 90 * 86400000)), hasta: fmt(hoy) }
    default: return {}
  }
}

export function useFiltrosCompras() {
  const [sp, setSp] = useSearchParams()
  const [filtros, setFiltrosState] = useState<FiltrosCompras>(DEFAULT)

  useEffect(() => {
    const f: FiltrosCompras = {}
    const local = sp.get('local')
    if (local) f.local_id = Number(local)
    const periodo = sp.get('periodo') as FiltrosCompras['periodo'] | null
    f.periodo = (periodo ?? 'mes_actual') as any
    if (f.periodo === 'rango') {
      f.desde = sp.get('desde') || undefined
      f.hasta = sp.get('hasta') || undefined
    } else {
      const r = rangoPeriodo(f.periodo)
      f.desde = r.desde; f.hasta = r.hasta
    }
    setFiltrosState(f)
  }, [sp])

  function setFiltros(next: Partial<FiltrosCompras>) {
    const newSp = new URLSearchParams(sp)
    if ('local_id' in next) {
      if (next.local_id) newSp.set('local', String(next.local_id))
      else newSp.delete('local')
    }
    if ('periodo' in next && next.periodo) {
      newSp.set('periodo', next.periodo)
      if (next.periodo !== 'rango') {
        newSp.delete('desde'); newSp.delete('hasta')
      }
    }
    if ('desde' in next) {
      if (next.desde) newSp.set('desde', next.desde); else newSp.delete('desde')
    }
    if ('hasta' in next) {
      if (next.hasta) newSp.set('hasta', next.hasta); else newSp.delete('hasta')
    }
    setSp(newSp, { replace: true })
  }

  return { filtros, setFiltros }
}
