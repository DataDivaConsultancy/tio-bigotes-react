import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { ClipboardList, RefreshCw } from 'lucide-react'

interface Local {
  id: number
  nombre: string
}

interface VentaRow {
  id: number
  fecha: string
  producto: string
  local: string
  local_id: number
  cantidad: number
  precio_unitario: number
  importe_total: number
}

function todayStr(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

export default function Operativa() {
  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [locales, setLocales] = useState<Local[]>([])
  const [selectedLocal, setSelectedLocal] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [hornadas, setHornadas] = useState('')

  const today = todayStr()

  // ── Load hornadas from localStorage ──
  useEffect(() => {
    const saved = localStorage.getItem('tb_hornadas_' + today)
    if (saved) setHornadas(saved)
  }, [today])

  // ── Save hornadas to localStorage ──
  function saveHornadas(value: string) {
    setHornadas(value)
    localStorage.setItem('tb_hornadas_' + today, value)
  }

  // ── Load locales ──
  useEffect(() => {
    async function loadLocales() {
      const { data, error } = await supabase
        .from('locales_v2')
        .select('id, nombre')
        .order('nombre')
      if (!error && data) setLocales(data)
    }
    loadLocales()
  }, [])

  // ── Load today's sales ──
  useEffect(() => {
    loadVentas()
  }, [selectedLocal, today])

  async function loadVentas() {
    setLoading(true)
    let query = supabase
      .from('ventas_raw_v2')
      .select('*')
      .eq('fecha', today)
      .order('id', { ascending: false })

    if (selectedLocal) {
      query = query.eq('local_id', Number(selectedLocal))
    }

    const { data, error } = await query
    if (!error && data) setVentas(data)
    setLoading(false)
  }

  // ── Summary calculations ──
  const totalVentas = ventas.length
  const importeTotal = ventas.reduce((sum, v) => sum + (v.importe_total || 0), 0)
  const ticketMedio = totalVentas > 0 ? importeTotal / totalVentas : 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
            <ClipboardList size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Control Operativa</h1>
            <p className="text-muted-foreground text-sm">
              {formatDate(new Date(), 'long')}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadVentas} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin mr-1' : 'mr-1'} />
          Actualizar
        </Button>
      </div>

      {/* ── Filter by local ── */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-foreground">Local:</label>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background text-foreground"
          value={selectedLocal}
          onChange={(e) => setSelectedLocal(e.target.value)}
        >
          <option value="">Todos los locales</option>
          {locales.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total ventas hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{formatNumber(totalVentas, 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Importe total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{formatCurrency(importeTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ticket medio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{formatCurrency(ticketMedio)}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Sales Table ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventas de hoy</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Cargando…</p>
          ) : ventas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay ventas registradas hoy.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Producto</th>
                    <th className="py-2 pr-4">Local</th>
                    <th className="py-2 pr-4 text-right">Cantidad</th>
                    <th className="py-2 pr-4 text-right">Precio unit.</th>
                    <th className="py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2 pr-4 font-medium">{v.producto}</td>
                      <td className="py-2 pr-4">{v.local}</td>
                      <td className="py-2 pr-4 text-right">{formatNumber(v.cantidad, 0)}</td>
                      <td className="py-2 pr-4 text-right">{formatCurrency(v.precio_unitario)}</td>
                      <td className="py-2 text-right font-medium">{formatCurrency(v.importe_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Hornadas Section ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hornadas — Notas de producción</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[160px] border rounded-md p-3 text-sm bg-background text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="Registra aquí las hornadas del día…&#10;Ejemplo: 08:00 — 3 bandejas croissants, 2 bandejas medialunas&#10;10:30 — 2 bandejas empanadas"
            value={hornadas}
            onChange={(e) => saveHornadas(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Se guarda automáticamente en tu navegador (localStorage).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
