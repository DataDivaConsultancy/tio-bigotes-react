import { useEffect, useState } from 'react'
import { Calendar, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { listarLocales, type LocalMin } from '@/lib/compras/maestros'
import { useFiltrosCompras } from '@/hooks/compras/useFiltrosCompras'

const PERIODOS: { value: NonNullable<ReturnType<typeof useFiltrosCompras>['filtros']['periodo']>; label: string }[] = [
  { value: 'mes_actual',   label: 'Mes actual' },
  { value: 'mes_anterior', label: 'Mes anterior' },
  { value: '7d',           label: 'Últimos 7 días' },
  { value: '30d',          label: 'Últimos 30 días' },
  { value: '90d',          label: 'Últimos 90 días' },
  { value: 'rango',        label: 'Rango personalizado' },
]

interface Props {
  showLocal?: boolean
  showPeriodo?: boolean
  className?: string
}

export default function FiltrosCompras({ showLocal = true, showPeriodo = true, className = '' }: Props) {
  const { filtros, setFiltros } = useFiltrosCompras()
  const [locales, setLocales] = useState<LocalMin[]>([])

  useEffect(() => {
    if (showLocal) listarLocales().then(setLocales).catch(() => {})
  }, [showLocal])

  return (
    <div className={`flex items-center gap-3 flex-wrap ${className}`}>
      {showLocal && (
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-muted-foreground" />
          <select
            value={filtros.local_id ?? ''}
            onChange={(e) => setFiltros({ local_id: e.target.value ? Number(e.target.value) : undefined })}
            className="px-3 py-2 text-sm bg-background border rounded-md"
          >
            <option value="">Todos los locales</option>
            {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </div>
      )}
      {showPeriodo && (
        <>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-muted-foreground" />
            <select
              value={filtros.periodo}
              onChange={(e) => setFiltros({ periodo: e.target.value as any })}
              className="px-3 py-2 text-sm bg-background border rounded-md"
            >
              {PERIODOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {filtros.periodo === 'rango' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={filtros.desde ?? ''} onChange={(e) => setFiltros({ desde: e.target.value })} className="w-36" />
              <span className="text-xs text-muted-foreground">a</span>
              <Input type="date" value={filtros.hasta ?? ''} onChange={(e) => setFiltros({ hasta: e.target.value })} className="w-36" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
