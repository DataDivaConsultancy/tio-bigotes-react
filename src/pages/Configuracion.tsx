import { useEffect, useMemo, useState } from 'react'
import { supabase, rpcCall } from '@/lib/supabase'
import { Settings, Save, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ConfigItem {
  clave: string
  valor: any
  categoria: string
  etiqueta: string
  descripcion: string | null
  tipo: string
  opciones: any[] | null
  orden: number
  editable: boolean
}

const CAT_LABELS: Record<string, string> = {
  branding: 'Marca y aspecto',
  email: 'Correos electrónicos',
  general: 'General',
}

export default function Configuracion() {
  const [items, setItems] = useState<ConfigItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editado, setEditado] = useState<Record<string, any>>({})  // clave -> nuevo valor
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    setLoading(true); setError(null)
    const { data, error: e } = await supabase.from('configuracion_app').select('*').order('categoria').order('orden')
    if (e) setError(e.message)
    else setItems((data ?? []) as ConfigItem[])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  function setLocal(clave: string, valor: any) {
    setEditado((prev) => ({ ...prev, [clave]: valor }))
  }

  async function guardar() {
    if (Object.keys(editado).length === 0) return
    setGuardando(true); setError(null); setMensaje(null)
    const errores: string[] = []
    for (const [clave, valor] of Object.entries(editado)) {
      const r = await rpcCall('rpc_actualizar_configuracion', { p_clave: clave, p_valor: valor })
      if (!r.ok) errores.push(`${clave}: ${r.error}`)
    }
    setGuardando(false)
    if (errores.length > 0) setError(errores.join(' · '))
    else {
      setMensaje(`${Object.keys(editado).length} cambio${Object.keys(editado).length === 1 ? '' : 's'} guardado${Object.keys(editado).length === 1 ? '' : 's'}`)
      setEditado({})
      cargar()
      setTimeout(() => setMensaje(null), 4000)
    }
  }

  const grupos = useMemo(() => {
    const g = new Map<string, ConfigItem[]>()
    for (const it of items) {
      const arr = g.get(it.categoria) ?? []
      arr.push(it); g.set(it.categoria, arr)
    }
    return Array.from(g.entries())
  }, [items])

  function valorActual(it: ConfigItem) {
    return editado[it.clave] !== undefined ? editado[it.clave] : it.valor
  }

  function inputFor(it: ConfigItem) {
    const v = valorActual(it)
    const onChange = (val: any) => setLocal(it.clave, val)
    if (!it.editable) return <Input value={typeof v === 'string' ? v : JSON.stringify(v)} disabled className="bg-muted" />
    switch (it.tipo) {
      case 'color':
        return (
          <div className="flex items-center gap-2">
            <input type="color" value={v ?? '#000000'} onChange={(e) => onChange(e.target.value)}
                   className="w-12 h-10 rounded border cursor-pointer" />
            <Input value={v ?? ''} onChange={(e) => onChange(e.target.value)} className="flex-1 font-mono text-sm" />
          </div>
        )
      case 'textarea':
        return <textarea value={v ?? ''} onChange={(e) => onChange(e.target.value)} rows={3}
                         className="w-full px-3 py-2 text-sm bg-background border rounded-md" />
      case 'boolean':
        return <input type="checkbox" checked={!!v} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 rounded" />
      case 'number':
        return <Input type="number" value={v ?? ''} onChange={(e) => onChange(Number(e.target.value))} />
      case 'select':
        return (
          <select value={v ?? ''} onChange={(e) => onChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border rounded-md">
            {(it.opciones ?? []).map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
          </select>
        )
      default:
        return <Input type={it.tipo === 'email' ? 'email' : it.tipo === 'url' ? 'url' : 'text'}
                      value={v ?? ''} onChange={(e) => onChange(e.target.value)} />
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center"><Settings size={20} className="text-white" /></div>
          <div>
            <h1 className="text-xl font-bold">Configuración</h1>
            <p className="text-sm text-muted-foreground">Marca, correos y opciones generales de la app</p>
          </div>
        </div>
        <Button variant="outline" onClick={cargar} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
        </Button>
      </div>

      {mensaje && <Card className="border-emerald-200 bg-emerald-50"><CardContent className="py-3 text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 size={16} /> {mensaje}</CardContent></Card>}
      {error && <Card className="border-red-200 bg-red-50"><CardContent className="py-3 text-sm text-red-700 flex items-center gap-2"><AlertCircle size={16} /> {error}</CardContent></Card>}

      {grupos.map(([cat, list]) => (
        <Card key={cat}>
          <CardHeader className="pb-3"><CardTitle className="text-base">{CAT_LABELS[cat] ?? cat}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {list.map((it) => (
              <div key={it.clave} className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 items-start py-3 border-t first:border-0">
                <div>
                  <div className="text-sm font-medium">{it.etiqueta}</div>
                  {it.descripcion && <div className="text-xs text-muted-foreground mt-1">{it.descripcion}</div>}
                  <div className="text-[10px] font-mono text-muted-foreground/60 mt-1">{it.clave}</div>
                </div>
                <div>{inputFor(it)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Sticky save bar */}
      {Object.keys(editado).length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card border-t shadow-lg z-30">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm">
              <strong>{Object.keys(editado).length}</strong> cambio{Object.keys(editado).length === 1 ? '' : 's'} sin guardar
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditado({})}>Descartar</Button>
              <Button onClick={guardar} disabled={guardando}>
                <Save size={16} /> {guardando ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
