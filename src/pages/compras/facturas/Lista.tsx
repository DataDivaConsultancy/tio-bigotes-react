import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  FileText, Plus, Search, RefreshCw, Filter,
  AlertCircle, CheckCircle2, CreditCard, XCircle,
} from 'lucide-react'

type Estado = 'borrador' | 'aprobada' | 'pagada' | 'rechazada'

interface Factura {
  id: string
  numero: string
  numero_interno: string
  estado: Estado
  fecha_emision: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  importe_total: number
  proveedor_id: number | null
  proveedor_nombre: string | null
  local_id: number | null
  local_nombre: string | null
  num_lineas: number
  num_recepciones: number
}

interface Proveedor { id: number; nombre_comercial: string }
interface Local { id: number; nombre: string }

const ESTADO_LABEL: Record<Estado, string> = {
  borrador: 'Borrador',
  aprobada: 'Aprobada',
  pagada: 'Pagada',
  rechazada: 'Rechazada',
}
const ESTADO_COLOR: Record<Estado, string> = {
  borrador: 'bg-yellow-500/10 text-yellow-600',
  aprobada: 'bg-blue-500/10 text-blue-600',
  pagada: 'bg-green-500/10 text-green-600',
  rechazada: 'bg-red-500/10 text-red-600',
}
const ESTADO_ICON: Record<Estado, React.ElementType> = {
  borrador: AlertCircle,
  aprobada: CheckCircle2,
  pagada: CreditCard,
  rechazada: XCircle,
}

export default function ListaFacturas() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Factura[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [locales, setLocales] = useState<Local[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState<Estado | 'todos'>('todos')
  const [filterProveedor, setFilterProveedor] = useState<string>('todos')
  const [filterLocal, setFilterLocal] = useState<string>('todos')

  useEffect(() => { void loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [facRes, provRes, locRes] = await Promise.all([
      supabase.from('vw_facturas_compra').select('*').order('fecha_emision', { ascending: false }),
      supabase.from('proveedores_v2').select('id, nombre_comercial').eq('activo', true).order('nombre_comercial'),
      supabase.from('locales_compra_v2').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    if (facRes.data) setItems(facRes.data as Factura[])
    if (provRes.data) setProveedores(provRes.data)
    if (locRes.data) setLocales(locRes.data)
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return items.filter(f => {
      if (filterEstado !== 'todos' && f.estado !== filterEstado) return false
      if (filterProveedor !== 'todos' && String(f.proveedor_id) !== filterProveedor) return false
      if (filterLocal !== 'todos' && String(f.local_id) !== filterLocal) return false
      if (search) {
        const q = search.toLowerCase()
        const hits =
          f.numero?.toLowerCase().includes(q) ||
          f.numero_interno?.toLowerCase().includes(q) ||
          (f.proveedor_nombre?.toLowerCase().includes(q) ?? false)
        if (!hits) return false
      }
      return true
    })
  }, [items, filterEstado, filterProveedor, filterLocal, search])

  const kpis = useMemo(() => {
    const por = (e: Estado) => filtered.filter(f => f.estado === e)
    const sum = (arr: Factura[]) => arr.reduce((s, f) => s + Number(f.importe_total ?? 0), 0)
    return {
      borrador:  { n: por('borrador').length,  total: sum(por('borrador'))  },
      aprobada:  { n: por('aprobada').length,  total: sum(por('aprobada'))  },
      pagada:    { n: por('pagada').length,    total: sum(por('pagada'))    },
      rechazada: { n: por('rechazada').length, total: sum(por('rechazada')) },
    }
  }, [filtered])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText size={22} />
            Facturas de compra
          </h1>
          <p className="text-sm text-muted-foreground">
            Registro de facturas de proveedores. Vinculá cada factura a las recepciones que cubre.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAll}>
            <RefreshCw size={14} className="mr-1" /> Refrescar
          </Button>
          <Button onClick={() => navigate('/compras/facturas/nueva')}>
            <Plus size={16} className="mr-2" /> Nueva factura
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['borrador','aprobada','pagada','rechazada'] as Estado[]).map(e => {
          const Icon = ESTADO_ICON[e]
          return (
            <Card key={e}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-2xl font-bold">{kpis[e].n}</div>
                    <p className="text-xs text-muted-foreground">{ESTADO_LABEL[e]}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {formatCurrency(kpis[e].total)}
                    </p>
                  </div>
                  <Icon size={18} className={
                    e === 'borrador' ? 'text-yellow-500' :
                    e === 'aprobada' ? 'text-blue-500' :
                    e === 'pagada'   ? 'text-green-500' : 'text-red-500'
                  } />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nº factura, nº interno o proveedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterEstado}
          onChange={e => setFilterEstado(e.target.value as Estado | 'todos')}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="todos">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="aprobada">Aprobada</option>
          <option value="pagada">Pagada</option>
          <option value="rechazada">Rechazada</option>
        </select>
        <select
          value={filterProveedor}
          onChange={e => setFilterProveedor(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="todos">Todos los proveedores</option>
          {proveedores.map(p => (
            <option key={p.id} value={String(p.id)}>{p.nombre_comercial}</option>
          ))}
        </select>
        <select
          value={filterLocal}
          onChange={e => setFilterLocal(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="todos">Todos los locales</option>
          {locales.map(l => (
            <option key={l.id} value={String(l.id)}>{l.nombre}</option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {items.length === 0 ? 'Aún no hay facturas. Creá la primera.' : 'No hay coincidencias con los filtros.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium">Nº interno</th>
                    <th className="text-left p-3 font-medium">Nº proveedor</th>
                    <th className="text-left p-3 font-medium">Proveedor</th>
                    <th className="text-left p-3 font-medium">Local</th>
                    <th className="text-left p-3 font-medium">Emisión</th>
                    <th className="text-left p-3 font-medium">Vencim.</th>
                    <th className="text-right p-3 font-medium">Importe</th>
                    <th className="text-center p-3 font-medium">Estado</th>
                    <th className="text-center p-3 font-medium">Recep.</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(f => (
                    <tr
                      key={f.id}
                      className="border-b hover:bg-muted/20 cursor-pointer"
                      onClick={() => navigate(`/compras/facturas/${f.id}`)}
                    >
                      <td className="p-3 font-mono text-xs">{f.numero_interno ?? '—'}</td>
                      <td className="p-3 font-mono text-xs">{f.numero}</td>
                      <td className="p-3">{f.proveedor_nombre ?? '—'}</td>
                      <td className="p-3 text-xs">{f.local_nombre ?? '—'}</td>
                      <td className="p-3 text-xs">{formatDate(f.fecha_emision)}</td>
                      <td className="p-3 text-xs">
                        {f.fecha_vencimiento ? formatDate(f.fecha_vencimiento) : '—'}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold">
                        {formatCurrency(Number(f.importe_total ?? 0))}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_COLOR[f.estado]}`}>
                          {ESTADO_LABEL[f.estado]}
                        </span>
                      </td>
                      <td className="p-3 text-center text-xs text-muted-foreground">
                        {f.num_recepciones ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
