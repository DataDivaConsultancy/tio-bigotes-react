import { useState, useEffect } from 'react'
import { rpcCall } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Shield, Search, RefreshCw } from 'lucide-react'

interface AuditEntry {
  id: number
  empleado_nombre: string
  tipo: string
  detalle: string
  fecha: string
}

const TIPO_COLORS: Record<string, string> = {
  login: 'bg-blue-100 text-blue-700',
  create: 'bg-green-100 text-green-700',
  update: 'bg-amber-100 text-amber-700',
  delete: 'bg-red-100 text-red-700',
  import: 'bg-purple-100 text-purple-700',
}

const TIPOS_FILTRO = ['Todos', 'login', 'create', 'update', 'delete', 'import']

export default function Auditoria() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('Todos')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const result = await rpcCall<AuditEntry[]>('rpc_obtener_audit_log', { p_limit: 200 })
    if (result.ok && result.data) {
      setEntries(Array.isArray(result.data) ? result.data : [])
    }
    setLoading(false)
  }

  async function handleRefresh() {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  const filtered = entries.filter((entry) => {
    if (filtroTipo !== 'Todos' && entry.tipo !== filtroTipo) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (entry.detalle || '').toLowerCase().includes(q) ||
        (entry.empleado_nombre || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-500 flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Auditoria</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} registros</p>
          </div>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing || loading}>
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Actualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por detalle o empleado..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
        >
          {TIPOS_FILTRO.map((t) => (
            <option key={t} value={t}>
              {t === 'Todos' ? 'Todos los tipos' : t}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Fecha</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Empleado</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-3 px-4 text-muted-foreground text-xs whitespace-nowrap">
                      {formatDate(entry.fecha)}
                    </td>
                    <td className="py-3 px-4 font-medium whitespace-nowrap">
                      {entry.empleado_nombre || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_COLORS[entry.tipo] || 'bg-gray-100 text-gray-700'}`}
                      >
                        {entry.tipo}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      <div className="max-w-md truncate">{entry.detalle || '—'}</div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-muted-foreground">
                      No se encontraron registros de auditoria
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
