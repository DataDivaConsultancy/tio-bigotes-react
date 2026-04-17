import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Plus, Search, Check, X } from 'lucide-react'

interface Pendiente {
  id: number
  descripcion: string
  responsable: string
  estado: string
  prioridad: string
  fecha_creacion: string
  fecha_resolucion: string | null
  notas: string | null
}

const PRIORIDAD_COLORS: Record<string, string> = {
  Alta: 'bg-red-100 text-red-700',
  Media: 'bg-amber-100 text-amber-700',
  Baja: 'bg-green-100 text-green-700',
}

const ESTADO_COLORS: Record<string, string> = {
  Pendiente: 'bg-amber-100 text-amber-700',
  Resuelto: 'bg-green-100 text-green-700',
}

type FiltroEstado = 'Pendiente' | 'Resuelto' | 'Todos'

export default function Pendientes() {
  const [items, setItems] = useState<Pendiente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('Pendiente')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    descripcion: '',
    responsable: '',
    prioridad: 'Media',
    notas: '',
  })

  useEffect(() => {
    loadData()
  }, [filtroEstado])

  async function loadData() {
    setLoading(true)
    let query = supabase
      .from('articulos_pendientes_v2')
      .select('id, descripcion, responsable, estado, prioridad, fecha_creacion, fecha_resolucion, notas')
      .order('fecha_creacion', { ascending: false })

    if (filtroEstado !== 'Todos') {
      query = query.eq('estado', filtroEstado)
    }

    const { data, error } = await query
    if (!error && data) setItems(data)
    setLoading(false)
  }

  const filtered = items.filter((item) => {
    const q = search.toLowerCase()
    return (
      (item.descripcion || '').toLowerCase().includes(q) ||
      (item.responsable || '').toLowerCase().includes(q)
    )
  })

  function startCreate() {
    setCreating(true)
    setForm({ descripcion: '', responsable: '', prioridad: 'Media', notas: '' })
  }

  function cancelCreate() {
    setCreating(false)
    setForm({ descripcion: '', responsable: '', prioridad: 'Media', notas: '' })
  }

  async function save() {
    if (!form.descripcion.trim()) return
    setSaving(true)

    const payload = {
      descripcion: form.descripcion.trim(),
      responsable: form.responsable.trim() || null,
      prioridad: form.prioridad,
      notas: form.notas.trim() || null,
      estado: 'Pendiente',
      fecha_creacion: new Date().toISOString(),
    }

    const { error } = await supabase.from('articulos_pendientes_v2').insert(payload)
    if (error) {
      alert(error.message || 'Error al crear pendiente')
      setSaving(false)
      return
    }

    setSaving(false)
    cancelCreate()
    loadData()
  }

  async function markResolved(id: number) {
    const { error } = await supabase
      .from('articulos_pendientes_v2')
      .update({ estado: 'Resuelto', fecha_resolucion: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      alert(error.message || 'Error al resolver')
      return
    }
    loadData()
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <AlertCircle size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Pendientes</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} items</p>
          </div>
        </div>
        <Button onClick={startCreate} disabled={creating}>
          <Plus size={16} /> Nuevo pendiente
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por descripcion o responsable..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}
        >
          <option value="Pendiente">Pendiente</option>
          <option value="Resuelto">Resuelto</option>
          <option value="Todos">Todos</option>
        </select>
      </div>

      {/* Create form */}
      {creating && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Nuevo pendiente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Descripcion *</label>
                <Input
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Responsable</label>
                <Input
                  value={form.responsable}
                  onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Prioridad</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.prioridad}
                  onChange={(e) => setForm({ ...form, prioridad: e.target.value })}
                >
                  <option value="Alta">Alta</option>
                  <option value="Media">Media</option>
                  <option value="Baja">Baja</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Notas</label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={cancelCreate} disabled={saving}>
                <X size={14} /> Cancelar
              </Button>
              <Button onClick={save} disabled={saving || !form.descripcion.trim()}>
                {saving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <Check size={14} />
                )}
                Crear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Descripcion</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Responsable</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Prioridad</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Estado</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Fecha</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${item.estado === 'Resuelto' ? 'opacity-60' : ''}`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium">{item.descripcion}</div>
                      {item.notas && (
                        <div className="text-xs text-muted-foreground truncate max-w-xs">{item.notas}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-muted-foreground">
                      {item.responsable || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORIDAD_COLORS[item.prioridad] || 'bg-gray-100 text-gray-700'}`}
                      >
                        {item.prioridad}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[item.estado] || 'bg-gray-100 text-gray-700'}`}
                      >
                        {item.estado}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-muted-foreground text-xs">
                      {formatDate(item.fecha_creacion)}
                      {item.fecha_resolucion && (
                        <div className="text-green-600">Resuelto: {formatDate(item.fecha_resolucion)}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {item.estado === 'Pendiente' && (
                        <button
                          onClick={() => markResolved(item.id)}
                          title="Marcar como resuelto"
                          className="p-1.5 rounded-lg hover:bg-green-100 transition-colors text-muted-foreground hover:text-green-700"
                        >
                          <Check size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      No se encontraron pendientes
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
