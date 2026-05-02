import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Pencil, KeyRound, Trash2, Search, Save, X, Lock } from 'lucide-react'

interface Pantalla { codigo: string; nombre: string; modulo: string | null; orden: number }
interface Local    { id: number; nombre: string }
interface Rol      { id: string; rol: string; descripcion: string | null; es_sistema: boolean; activo: boolean }
interface Permiso  { rol: string; pantalla: string; local_id: number | null; modo: 'ver' | 'escribir' }

type Modo = '' | 'ver' | 'escribir'

export default function Roles() {
  const [roles, setRoles] = useState<Rol[]>([])
  const [pantallas, setPantallas] = useState<Pantalla[]>([])
  const [locales, setLocales] = useState<Local[]>([])
  const [permisos, setPermisos] = useState<Permiso[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Editor del rol seleccionado
  const [editing, setEditing] = useState<Rol | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editDesc, setEditDesc] = useState('')
  // Matriz de permisos en edición: matrix[pantalla][localId|'global'] = '' | 'ver' | 'escribir'
  const [matrix, setMatrix] = useState<Record<string, Record<string, Modo>>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { void cargar() }, [])

  async function cargar() {
    setLoading(true)
    setError(null)
    try {
      const [rRes, pRes, lRes, permRes] = await Promise.all([
        supabase.from('roles_v2').select('id, rol:nombre, descripcion, es_sistema, activo').order('nombre'),
        supabase.from('pantallas_app').select('codigo, nombre, modulo, orden').order('orden'),
        supabase.from('locales_compra_v2').select('id, nombre').eq('activo', true).order('nombre'),
        supabase.from('rol_permiso').select('rol, pantalla, local_id, modo'),
      ])
      if (rRes.error) throw new Error(`Roles: ${rRes.error.message}`)
      if (pRes.error) throw new Error(`Pantallas: ${pRes.error.message}`)
      if (lRes.error) throw new Error(`Locales: ${lRes.error.message}`)
      if (permRes.error) throw new Error(`Permisos: ${permRes.error.message}`)
      setRoles((rRes.data ?? []) as Rol[])
      setPantallas((pRes.data ?? []) as Pantalla[])
      setLocales((lRes.data ?? []) as Local[])
      setPermisos((permRes.data ?? []) as Permiso[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const rolesFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    if (!q) return roles
    return roles.filter((r) =>
      r.rol.toLowerCase().includes(q) || (r.descripcion || '').toLowerCase().includes(q),
    )
  }, [roles, busqueda])

  const permisosPorRol = useMemo(() => {
    const m = new Map<string, number>()
    permisos.forEach((p) => m.set(p.rol, (m.get(p.rol) || 0) + 1))
    return m
  }, [permisos])

  /* ───── Editor: cargar permisos en matriz ───── */
  function abrirEditor(r: Rol) {
    setEditing(r)
    setEditNombre(r.rol)
    setEditDesc(r.descripcion || '')
    const mx: Record<string, Record<string, Modo>> = {}
    pantallas.forEach((p) => {
      mx[p.codigo] = { global: '' }
      locales.forEach((l) => { mx[p.codigo][String(l.id)] = '' })
    })
    permisos.filter((p) => p.rol === r.rol).forEach((p) => {
      const key = p.local_id == null ? 'global' : String(p.local_id)
      if (!mx[p.pantalla]) mx[p.pantalla] = { global: '' }
      mx[p.pantalla][key] = p.modo
    })
    setMatrix(mx)
  }

  function abrirNuevo() {
    setEditing({ id: '', rol: '', descripcion: null, es_sistema: false, activo: true })
    setEditNombre('')
    setEditDesc('')
    const mx: Record<string, Record<string, Modo>> = {}
    pantallas.forEach((p) => {
      mx[p.codigo] = { global: '' }
      locales.forEach((l) => { mx[p.codigo][String(l.id)] = '' })
    })
    setMatrix(mx)
  }

  function setCelda(pantalla: string, localKey: string, modo: Modo) {
    setMatrix((prev) => ({
      ...prev,
      [pantalla]: { ...prev[pantalla], [localKey]: modo },
    }))
  }

  /** Setear toda la fila (todos los locales) — útil para los presets de la columna 'Todos' */
  function setFilaGlobal(pantalla: string, modo: Modo) {
    setMatrix((prev) => {
      const next: Record<string, Modo> = { ...prev[pantalla], global: modo }
      // Cuando se setea global, los específicos se vacían (redundantes)
      locales.forEach((l) => { next[String(l.id)] = '' })
      return { ...prev, [pantalla]: next }
    })
  }

  async function guardar() {
    if (!editing) return
    const nombre = editNombre.trim()
    if (!nombre) { alert('El nombre del rol es obligatorio'); return }

    setSaving(true)
    try {
      const isNew = !editing.id || editing.rol === ''
      // 1) Upsert rol
      if (isNew) {
        // Validar unicidad
        if (roles.some((r) => r.rol === nombre)) {
          alert(`Ya existe un rol con el nombre "${nombre}"`); setSaving(false); return
        }
        const { error } = await supabase.from('roles_v2').insert({
          nombre, descripcion: editDesc || null, es_sistema: false, activo: true, permisos: [],
        })
        if (error) throw new Error(error.message)
      } else if (editing.rol !== nombre) {
        // Si cambia el nombre del rol, ojo con FK CASCADE en rol_permiso
        const { error } = await supabase.from('roles_v2')
          .update({ nombre, descripcion: editDesc || null })
          .eq('id', editing.id)
        if (error) throw new Error(error.message)
      } else if ((editing.descripcion || '') !== editDesc) {
        const { error } = await supabase.from('roles_v2')
          .update({ descripcion: editDesc || null })
          .eq('id', editing.id)
        if (error) throw new Error(error.message)
      }

      const rolKey = nombre

      // 2) Borrar permisos actuales del rol y reinsertar la matriz
      const { error: delErr } = await supabase.from('rol_permiso').delete().eq('rol', rolKey)
      if (delErr) throw new Error(delErr.message)

      const filas: Permiso[] = []
      for (const pantalla of Object.keys(matrix)) {
        const fila = matrix[pantalla]
        if (fila.global) {
          filas.push({ rol: rolKey, pantalla, local_id: null, modo: fila.global as 'ver' | 'escribir' })
        } else {
          for (const lk of Object.keys(fila)) {
            if (lk === 'global') continue
            const m = fila[lk]
            if (m) filas.push({ rol: rolKey, pantalla, local_id: Number(lk), modo: m })
          }
        }
      }
      if (filas.length > 0) {
        const { error: insErr } = await supabase.from('rol_permiso').insert(filas)
        if (insErr) throw new Error(insErr.message)
      }

      // 3) Refrescar también el array legacy `permisos` (jsonb) en roles_v2
      const pantallasUnicas = Array.from(new Set(filas.map((f) => f.pantalla)))
      await supabase.from('roles_v2')
        .update({ permisos: pantallasUnicas })
        .eq('rol', rolKey)

      setEditing(null)
      await cargar()
    } catch (e: unknown) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  async function borrar(r: Rol) {
    if (r.es_sistema) { alert('Este rol es del sistema y no se puede borrar.'); return }
    if (!confirm(`¿Borrar el rol "${r.rol}"? Sus permisos también se eliminarán.`)) return
    const { error } = await supabase.from('roles_v2').delete().eq('id', r.id)
    if (error) { alert(error.message); return }
    await cargar()
  }

  /* ───── Render ───── */
  if (editing) {
    // Agrupar pantallas por módulo para el editor
    const grupos = pantallas.reduce<Record<string, Pantalla[]>>((acc, p) => {
      const k = p.modulo || 'Otros'
      if (!acc[k]) acc[k] = []
      acc[k].push(p)
      return acc
    }, {})

    return (
      <div className="max-w-7xl mx-auto space-y-4 pb-24">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <KeyRound className="h-7 w-7 text-violet-500" />
            <div>
              <h1 className="text-xl font-bold">
                {editing.id ? 'Editar rol' : 'Nuevo rol'}
              </h1>
              <p className="text-sm text-muted-foreground">
                Define qué puede ver y editar este rol en cada local.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              <X size={14} className="mr-1.5" /> Cancelar
            </Button>
            <Button onClick={guardar} disabled={saving}>
              <Save size={14} className="mr-1.5" /> {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="text-xs font-medium block mb-1">Nombre del rol *</label>
              <Input
                value={editNombre}
                onChange={(e) => setEditNombre(e.target.value)}
                placeholder="Ej: encargado_diputacion"
                disabled={editing.es_sistema}
              />
              {editing.es_sistema && (
                <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                  <Lock size={12} /> Rol del sistema — el nombre no se puede cambiar.
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium block mb-1">Descripción</label>
              <Input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Ej: encargado del local Diputación"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permisos por pantalla y local</CardTitle>
            <p className="text-xs text-muted-foreground">
              <strong>Todos</strong> = aplica a todos los locales (incluso futuros). Si se rellena
              "Todos" se ignoran las celdas individuales. Usa <strong>Ver</strong> para solo
              consultar, <strong>Escribir</strong> para consultar+modificar.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded border">
              <table className="text-sm w-full min-w-max">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-muted/50 z-10">Pantalla</th>
                    <th className="px-3 py-2 text-center font-semibold border-l">
                      <span className="block">Todos</span>
                      <span className="block text-[10px] font-normal text-muted-foreground">(wildcard)</span>
                    </th>
                    {locales.map((l) => (
                      <th key={l.id} className="px-3 py-2 text-center font-semibold border-l">
                        {l.nombre}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grupos).map(([modulo, lista]) => (
                    <>
                      <tr key={`g-${modulo}`} className="bg-muted/30">
                        <td colSpan={2 + locales.length} className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                          {modulo}
                        </td>
                      </tr>
                      {lista.map((p) => {
                        const fila = matrix[p.codigo] || { global: '' }
                        const tieneGlobal = !!fila.global
                        return (
                          <tr key={p.codigo} className="border-t hover:bg-muted/10">
                            <td className="px-3 py-1.5 sticky left-0 bg-background font-medium">{p.nombre}</td>
                            <td className="px-2 py-1.5 text-center border-l">
                              <CeldaSelect
                                value={fila.global}
                                onChange={(m) => setFilaGlobal(p.codigo, m)}
                                preset
                              />
                            </td>
                            {locales.map((l) => {
                              const lk = String(l.id)
                              return (
                                <td key={lk} className="px-2 py-1.5 text-center border-l">
                                  {tieneGlobal ? (
                                    <span className="text-xs text-muted-foreground italic">heredado</span>
                                  ) : (
                                    <CeldaSelect
                                      value={fila[lk] || ''}
                                      onChange={(m) => setCelda(p.codigo, lk, m)}
                                    />
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Lista de roles
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <KeyRound className="h-7 w-7 text-violet-500" />
          <div>
            <h1 className="text-2xl font-bold">Roles y permisos</h1>
            <p className="text-sm text-muted-foreground">
              Cada rol define qué pantallas puede ver/editar el empleado, y en qué locales.
            </p>
          </div>
        </div>
        <Button onClick={abrirNuevo}>
          <Plus size={14} className="mr-1.5" /> Nuevo rol
        </Button>
      </div>

      {error && <Card><CardContent className="p-4 text-sm text-red-600">{error}</CardContent></Card>}

      <Card>
        <CardContent className="py-3">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar rol…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? 'Cargando…' : `${rolesFiltrados.length} de ${roles.length} rol${roles.length === 1 ? '' : 'es'}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!loading && roles.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay roles. Pulsa <strong>"Nuevo rol"</strong> para crear el primero.
            </div>
          ) : (
            <div className="rounded-lg border divide-y">
              {rolesFiltrados.map((r) => (
                <div key={r.id} className="flex items-center gap-2 p-3 hover:bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium font-mono">{r.rol}</span>
                      {r.es_sistema && (
                        <span className="text-[10px] uppercase bg-violet-100 text-violet-700 px-1.5 rounded-full flex items-center gap-1">
                          <Lock size={9} /> Sistema
                        </span>
                      )}
                      {!r.activo && <span className="text-amber-600 text-xs">Inactivo</span>}
                    </div>
                    {r.descripcion && (
                      <p className="text-xs text-muted-foreground mt-0.5">{r.descripcion}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {permisosPorRol.get(r.rol) ?? 0} permiso{(permisosPorRol.get(r.rol) ?? 0) === 1 ? '' : 's'} configurados
                    </p>
                  </div>
                  <button
                    onClick={() => abrirEditor(r)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Editar permisos"
                  ><Pencil size={14} /></button>
                  <button
                    onClick={() => borrar(r)}
                    disabled={r.es_sistema}
                    className={`p-1.5 rounded hover:bg-red-50 hover:text-red-600 text-muted-foreground ${r.es_sistema ? 'opacity-30 cursor-not-allowed' : ''}`}
                    title={r.es_sistema ? 'No se puede borrar un rol del sistema' : 'Borrar rol'}
                  ><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* Selector compacto de modo: —, Ver, Escribir */
function CeldaSelect({
  value, onChange, preset,
}: { value: Modo; onChange: (m: Modo) => void; preset?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Modo)}
      className={`w-24 px-1.5 py-1 text-xs rounded border bg-background ${
        value === 'escribir' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' :
        value === 'ver' ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/30' :
        preset ? 'border-dashed' : ''
      }`}
    >
      <option value="">—</option>
      <option value="ver">Ver</option>
      <option value="escribir">Escribir</option>
    </select>
  )
}
