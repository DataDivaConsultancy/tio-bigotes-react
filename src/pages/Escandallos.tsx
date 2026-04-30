import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Search, BookOpen, Copy, Eye, ChevronRight } from 'lucide-react'

interface EscandalloResumen {
  escandallo_id: number
  producto_id: number | null
  nombre: string
  cantidad_resultado: number
  unidad_resultado: string
  es_subreceta: boolean
  coste_total: number
  coste_por_unidad: number
  pvp_base: number | null
  iva_venta: string | null
  margen_bruto: number | null
  margen_pct: number | null
}

type FilterTipo = 'todos' | 'productos' | 'subrecetas'

export default function Escandallos() {
  const navigate = useNavigate()
  const [escandallos, setEscandallos] = useState<EscandalloResumen[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState<FilterTipo>('todos')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('vw_escandallo_resumen')
      .select('*')
      .order('nombre')
    if (!error && data) setEscandallos(data)
    setLoading(false)
  }

  async function duplicar(esc: EscandalloResumen) {
    const { data: lineas } = await supabase
      .from('escandallo_lineas')
      .select('*')
      .eq('escandallo_id', esc.escandallo_id)
      .order('orden')

    if (!lineas) return

    const jsonLineas = lineas.map(l => ({
      componente_producto_id: l.componente_producto_id,
      componente_escandallo_id: l.componente_escandallo_id,
      cantidad_bruta: l.cantidad_bruta,
      unidad: l.unidad,
      merma_pct: l.merma_pct,
      coste_override: l.coste_override,
      notas: l.notas,
      orden: l.orden,
    }))

    const { data, error } = await supabase.rpc('rpc_crear_escandallo', {
      p_producto_id: null,
      p_nombre: `${esc.nombre} (copia)`,
      p_unidad_resultado: esc.unidad_resultado,
      p_cantidad_resultado: esc.cantidad_resultado,
      p_es_subreceta: esc.es_subreceta,
      p_lineas: jsonLineas,
    })

    if (error) { alert(error.message); return }
    if (data?.id) navigate(`/escandallos/${data.id}`)
    else loadData()
  }

  const filtered = escandallos.filter(e => {
    const q = search.toLowerCase()
    const matchesSearch = e.nombre.toLowerCase().includes(q)
    const matchesTipo =
      filterTipo === 'todos' ||
      (filterTipo === 'subrecetas' ? e.es_subreceta : !e.es_subreceta)
    return matchesSearch && matchesTipo
  })

  function margenColor(pct: number | null) {
    if (pct == null) return 'text-muted-foreground'
    if (pct >= 60) return 'text-green-500'
    if (pct >= 40) return 'text-yellow-500'
    return 'text-red-500'
  }

  const totalEscandallos = escandallos.length
  const subrecetas = escandallos.filter(e => e.es_subreceta).length
  const conMargenBajo = escandallos.filter(e => e.margen_pct != null && e.margen_pct < 40).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Escandallos</h1>
          <p className="text-sm text-muted-foreground">
            Fichas de coste y composición de productos
          </p>
        </div>
        <Button onClick={() => navigate('/escandallos/nuevo')}>
          <Plus size={16} className="mr-2" /> Nuevo escandallo
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <BookOpen size={20} className="text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalEscandallos}</p>
                <p className="text-xs text-muted-foreground">Escandallos activos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Copy size={20} className="text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{subrecetas}</p>
                <p className="text-xs text-muted-foreground">Sub-recetas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Eye size={20} className="text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{conMargenBajo}</p>
                <p className="text-xs text-muted-foreground">Margen bajo (&lt;40%)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar escandallo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterTipo}
          onChange={e => setFilterTipo(e.target.value as FilterTipo)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="todos">Todos</option>
          <option value="productos">Solo productos</option>
          <option value="subrecetas">Solo sub-recetas</option>
        </select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {escandallos.length === 0
                ? 'No hay escandallos. Crea el primero.'
                : 'No se encontraron resultados'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium">Nombre</th>
                    <th className="text-left p-3 font-medium">Tipo</th>
                    <th className="text-right p-3 font-medium">Resultado</th>
                    <th className="text-right p-3 font-medium">Coste/ud</th>
                    <th className="text-right p-3 font-medium">PVP</th>
                    <th className="text-right p-3 font-medium">Margen</th>
                    <th className="text-center p-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => (
                    <tr
                      key={e.escandallo_id}
                      className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => navigate(`/escandallos/${e.escandallo_id}`)}
                    >
                      <td className="p-3">
                        <div className="font-medium">{e.nombre}</div>
                        {e.producto_id && (
                          <div className="text-xs text-muted-foreground">
                            Producto #{e.producto_id}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          e.es_subreceta
                            ? 'bg-purple-500/10 text-purple-500'
                            : 'bg-blue-500/10 text-blue-500'
                        }`}>
                          {e.es_subreceta ? 'Sub-receta' : 'Producto'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {e.cantidad_resultado} {e.unidad_resultado}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {formatCurrency(e.coste_por_unidad || 0)}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {e.pvp_base ? formatCurrency(e.pvp_base) : '—'}
                      </td>
                      <td className={`p-3 text-right font-mono font-medium ${margenColor(e.margen_pct)}`}>
                        {e.margen_pct != null ? `${e.margen_pct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1" onClick={ev => ev.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/escandallos/${e.escandallo_id}`)}
                            title="Ver/Editar"
                          >
                            <Eye size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => duplicar(e)}
                            title="Duplicar"
                          >
                            <Copy size={14} />
                          </Button>
                        </div>
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
