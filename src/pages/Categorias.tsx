import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FolderTree, Plus, Pencil, Trash2, X, Save, AlertCircle } from 'lucide-react'

interface Categoria {
  id: number
  codigo: string
  nombre: string
}

interface UsageRow {
  categoria_id: number
  cnt: number
}

function normalizeCodigo(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export default function Categorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [usage, setUsage] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estado del modal (crear / editar)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Categoria | null>(null)
  const [formNombre, setFormNombre] = useState('')
  const [formCodigo, setFormCodigo] = useState('')
  const [saving, setSaving] = useState(false)
  const [codigoTouched, setCodigoTouched] = useState(false)

  useEffect(() => { void loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [catRes, usageRes] = await Promise.all([
        supabase.from('categorias_producto_v2').select('id, codigo, nombre').order('nombre'),
        supabase.from('productos_v2').select('categoria_id'),
      ])
      if (catRes.error) throw new Error(`Categorías: ${catRes.error.message}`)
      setCategorias((catRes.data ?? []) as Categoria[])

      // Conteo de productos por categoría (para mostrar en la tabla y prevenir borrado)
      const counts: Record<number, number> = {}
      ;(usageRes.data ?? []).forEach((row: { categoria_id: number | null }) => {
        if (row.categoria_id != null) counts[row.categoria_id] = (counts[row.categoria_id] || 0) + 1
      })
      setUsage(counts)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function openNueva() {
    setEditing(null)
    setFormNombre('')
    setFormCodigo('')
    setCodigoTouched(false)
    setModalOpen(true)
  }

  function openEditar(c: Categoria) {
    setEditing(c)
    setFormNombre(c.nombre)
    setFormCodigo(c.codigo)
    setCodigoTouched(true)
    setModalOpen(true)
  }

  function onChangeNombre(v: string) {
    setFormNombre(v)
    if (!codigoTouched) setFormCodigo(normalizeCodigo(v))
  }

  async function guardar() {
    const nombre = formNombre.trim()
    const codigo = (formCodigo.trim() || normalizeCodigo(nombre))
    if (!nombre) { alert('El nombre es obligatorio'); return }
    if (!codigo) { alert('El código no puede quedar vacío'); return }

    // Validar código único (excepto si estamos editando la misma fila)
    const existe = categorias.some(c => c.codigo === codigo && (!editing || c.id !== editing.id))
    if (existe) { alert(`Ya existe una categoría con el código "${codigo}"`); return }

    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase
          .from('categorias_producto_v2')
          .update({ nombre, codigo })
          .eq('id', editing.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('categorias_producto_v2')
          .insert({ nombre, codigo })
        if (error) throw new Error(error.message)
      }
      setModalOpen(false)
      await loadAll()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`Error al guardar: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  async function borrar(c: Categoria) {
    const enUso = usage[c.id] ?? 0
    if (enUso > 0) {
      alert(`No se puede borrar: hay ${enUso} producto${enUso === 1 ? '' : 's'} usando esta categoría. Reasígnalos primero.`)
      return
    }
    if (!confirm(`¿Borrar la categoría "${c.nombre}"?`)) return
    try {
      const { error } = await supabase
        .from('categorias_producto_v2')
        .delete()
        .eq('id', c.id)
      if (error) throw new Error(error.message)
      await loadAll()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`Error al borrar: ${msg}`)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderTree className="h-7 w-7 text-emerald-500" />
          <div>
            <h1 className="text-2xl font-bold">Categorías de productos</h1>
            <p className="text-sm text-muted-foreground">
              Agrupan los productos para el BI, el catálogo y los escandallos.
            </p>
          </div>
        </div>
        <Button onClick={openNueva}>
          <Plus size={16} className="mr-1.5" />
          Nueva categoría
        </Button>
      </div>

      {/* Error global */}
      {error && (
        <Card>
          <CardContent className="p-4 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle size={16} /> {error}
          </CardContent>
        </Card>
      )}

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? 'Cargando…' : `${categorias.length} categoría${categorias.length === 1 ? '' : 's'}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && categorias.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay categorías. Pulsa <strong>"Nueva categoría"</strong> para empezar.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase">Nombre</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase">Código</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase">Productos</th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map((c) => {
                    const u = usage[c.id] ?? 0
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{c.nombre}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{c.codigo}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{u}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => openEditar(c)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => borrar(c)}
                            className={`p-1.5 rounded hover:bg-red-50 hover:text-red-600 ml-1 ${u > 0 ? 'opacity-30 cursor-not-allowed' : 'text-muted-foreground'}`}
                            title={u > 0 ? `No se puede borrar: ${u} productos usan esta categoría` : 'Borrar'}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !saving && setModalOpen(false)}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">
                {editing ? 'Editar categoría' : 'Nueva categoría'}
              </CardTitle>
              <button
                onClick={() => !saving && setModalOpen(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                disabled={saving}
              >
                <X size={16} />
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formNombre}
                  onChange={(e) => onChangeNombre(e.target.value)}
                  placeholder="Ej: Empanada Clásica"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">
                  Código <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formCodigo}
                  onChange={(e) => { setFormCodigo(e.target.value); setCodigoTouched(true) }}
                  placeholder="empanada_clasica"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Identificador único (sin espacios ni tildes). Se autogenera del nombre.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={guardar} disabled={saving || !formNombre.trim()}>
                  <Save size={14} className="mr-1.5" />
                  {saving ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
