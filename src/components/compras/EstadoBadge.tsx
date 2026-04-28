import { ESTADO_LABELS, ESTADO_COLORS, type EstadoPedido } from '@/lib/schemas/pedidos'

interface Props {
  estado: EstadoPedido
  size?: 'sm' | 'md'
}

export default function EstadoBadge({ estado, size = 'md' }: Props) {
  const cls = ESTADO_COLORS[estado] ?? 'bg-gray-100 text-gray-700'
  const label = ESTADO_LABELS[estado] ?? estado
  const sizing = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizing} ${cls}`}>
      {label}
    </span>
  )
}
