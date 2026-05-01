import { useState, useEffect } from 'react'
import { supabase, rpcCall } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BoxesIcon, ArrowLeftRight, ClipboardCheck, History, Package, RefreshCw } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import * as XLSX from 'xlsx'
import { Download, Upload as UploadIcon, AlertTriangle, CheckCircle2 } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface StockActual {
  producto_compra_id: number
  producto_nombre: string
  proveedor_nombre: string
  local_nombre: string
  stock_actual: number
  unidad_medida: string | null
  precio: number | null
}

interface Producto {
  id: number
  nombre: string
}

interface Local {
  id: number
  nombre: string
}

interface Movimiento {
  id: number
  fecha: string
  producto_id: number
  producto_nombre?: string
  local_id: number
  local_nombre?: string
  tipo: string
  cantidad: number
  notas?: string
}

// ─── Tab definitions ────────────────────────────────────────────────────────

type TabKey = 'stock' | 'movimiento' | 'traspaso' | 'regularizacion' | 'movimientos'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'stock', label: 'Stock Actual', icon: <Package size={16} /> },
  { key: 'movimiento', label: 'Movimiento Rápido', icon: <RefreshCw size={16} /> },
  { key: 'traspaso', label: 'Traspasos', icon: <ArrowLeftRight size={16} /> },
  { key: 'regularizacion', label: 'Regularización', icon: <ClipboardCheck size={16} /> },
  { key: 'movimientos', label: 'Movimientos', icon: <History size={16} /> },
]

// ─── Badge helper ───────────────────────────────────────────────────────────

function tipoBadge(tipo: string) {
  const styles: Record<string, string> = {
    entrada: 'bg-green-50 text-green-700',
    salida: 'bg-red-50 text-red-700',
    traspaso: 'bg-blue-50 text-blue-700',
    regularización: 'bg-amber-50 text-amber-700',
    regularizacion: 'bg-amber-50 text-amber-700',
  }
  const cls = styles[tipo.toLowerCase()] || 'bg-gray-50 text-gray-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {tipo}
    </span>
  )
}

// ─── Select component helper ────────────────────────────────────────────────

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

// ─── Component ──────────────────────────────────────────────────────────────

export default function Stock() {
  const [activeTab, setActiveTab] = useState<TabKey>('stock')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Shared data
  const [productos, setProductos] = useState<Producto[]>([])
  const [locales, setLocales] = useState<Local[]>([])

  // Tab 1 — Stock Actual
  const [stockData, setStockData] = useState<StockActual[]>([])
  const [stockFilter, setStockFilter] = useState<string>('todos')

  // Tab 2 — Movimiento Rápido
  const [movForm, setMovForm] = useState({ producto_id: '', local_id: '', tipo: 'entrada', cantidad: '', notas: '' })

  // Tab 3 — Traspasos
  const [trasForm, setTrasForm] = useState({ producto_id: '', local_origen_id: '', local_destino_id: '', cantidad: '', notas: '' })

  // Tab 4 — Regularización
  const [regForm, setRegForm] = useState({ producto_id: '', local_id: '', cantidad_real: '', notas: '' })

  // Tab 5 — Movimientos
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])

  // Importar Excel
  const [importPreview, setImportPreview] = useState<{
    rows: { producto_compra_id: number; local_id: number; producto_nombre: string; local_nombre: string; stock_actual: number; conteo_real: number; diff: number }[]
    sin_match: { row: number; valor: string }[]
    motivo: string
  } | null>(null)
  const [importing, setImporting] = useState(false)

  // ─── Load shared data (productos + locales) ─────────────────────────────

  useEffect(() => {
    loadProductos()
    loadLocales()
  }, [])

  useEffect(() => {
    if (activeTab === 'stock') loadStock()
    if (activeTab === 'movimientos') loadMovimientos()
  }, [activeTab])

  async function loadProductos() {
    const { data } = await supabase
      .from('productos_compra_v2')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
    if (data) setProductos(data)
  }

  async function loadLocales() {
    const { data } = await supabase
      .from('locales_compra_v2')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre')
    if (data) setLocales(data)
  }

  // ─── Tab 1: Stock Actual ────────────────────────────────────────────────

  async function loadStock() {
    setLoading(true)
    const { data, error } = await supabase
      .from('vw_stock_actual')
      .select('*')
      .order('local_nombre')
      .order('producto_nombre')
    if (!error && data) setStockData(data)
    setLoading(false)
  }

  const localNames = [...new Set(stockData.map((s) => s.local_nombre))].sort()
  const filteredStock = stockFilter === 'todos' ? stockData : stockData.filter((s) => s.local_nombre === stockFilter)

  const totalCoste = filteredStock.reduce((sum, s) => sum + Number(s.stock_actual ?? 0) * Number(s.precio ?? 0), 0)

  function descargarExcel() {
    if (filteredStock.length === 0) {
      alert('No hay stock para descargar')
      return
    }
    const rows = filteredStock.map(s => ({
      producto_compra_id: s.producto_compra_id,
      local_id: (s as any).local_id ?? '',
      producto: s.producto_nombre,
      cod_interno: (s as any).cod_interno ?? '',
      proveedor: s.proveedor_nombre ?? '',
      local: s.local_nombre,
      unidad: s.unidad_medida ?? '',
      'stock_actual_BD': Number(s.stock_actual ?? 0),
      'stock_real_contado': '',
      'precio_coste': s.precio != null ? Number(s.precio) : '',
      'valor_actual': s.precio != null ? Number(s.stock_actual ?? 0) * Number(s.precio) : '',
      'ultimo_movimiento': (s as any).ultimo_movimiento ?? '',
      'notas': '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    // Ancho de columnas
    ws['!cols'] = [
      { wch: 8 }, { wch: 8 }, { wch: 35 }, { wch: 12 }, { wch: 18 },
      { wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 25 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stock')

    // Hoja 2: instrucciones
    const help = [
      ['Instrucciones para regularizar stock'],
      [''],
      ['1. Hace el conteo físico de cada producto en cada local'],
      ['2. Anota la cantidad real en la columna "stock_real_contado"'],
      ['3. Las filas con diferencia respecto a stock_actual_BD se ajustan al subir'],
      ['4. Las filas con la columna vacía o igual a stock_actual_BD NO se ajustan'],
      ['5. NO modifiques las columnas "producto_compra_id", "local_id" - se usan para identificar'],
      ['6. Para agregar stock nuevo a productos sin stock, dejá stock_actual_BD = 0 y poné el real'],
      ['7. Para regularizar a 0, ponés 0 en stock_real_contado'],
      [''],
      ['Tipos de ajuste que se generan:'],
      ['  - Diferencia positiva: tipo "ajuste_positivo"'],
      ['  - Diferencia negativa: tipo "ajuste_negativo"'],
      ['  - Diferencia 0 o columna vacía: NO se crea movimiento'],
    ]
    const ws2 = XLSX.utils.aoa_to_sheet(help)
    ws2['!cols'] = [{ wch: 80 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Instrucciones')

    XLSX.writeFile(wb, `stock_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  async function handleSubirExcel(file: File) {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' })

      // Cargar stock actual fresh para comparar
      const { data: stockFresh } = await supabase.from('vw_stock_actual').select('*')
      const stockMap = new Map<string, number>()
      ;(stockFresh ?? []).forEach((r: any) => {
        stockMap.set(`${r.producto_compra_id}|${r.local_id}`, Number(r.stock_actual ?? 0))
      })

      const rows: any[] = []
      const sin_match: { row: number; valor: string }[] = []

      json.forEach((r, idx) => {
        const pid = Number(r.producto_compra_id)
        const lid = Number(r.local_id)
        const conteoStr = String(r.stock_real_contado ?? '').trim()

        if (!pid || !lid) {
          sin_match.push({ row: idx + 2, valor: 'falta producto_compra_id o local_id' })
          return
        }
        if (conteoStr === '') return  // skip filas sin conteo

        const conteo = Number(conteoStr.replace(',', '.'))
        if (isNaN(conteo) || conteo < 0) {
          sin_match.push({ row: idx + 2, valor: `stock_real_contado invalido: ${conteoStr}` })
          return
        }

        const stockActual = stockMap.get(`${pid}|${lid}`)
        if (stockActual == null) {
          sin_match.push({ row: idx + 2, valor: `producto+local no existe en BD: ${pid}/${lid}` })
          return
        }

        const diff = conteo - stockActual
        if (Math.abs(diff) < 0.0001) return  // sin cambios

        rows.push({
          producto_compra_id: pid,
          local_id: lid,
          producto_nombre: r.producto ?? '?',
          local_nombre: r.local ?? '?',
          stock_actual: stockActual,
          conteo_real: conteo,
          diff,
        })
      })

      setImportPreview({
        rows,
        sin_match,
        motivo: `Regularización Excel ${new Date().toISOString().slice(0, 10)}`,
      })
    } catch (e: any) {
      alert(`Error al leer el Excel: ${e.message}`)
    }
  }

  async function confirmarImport() {
    if (!importPreview) return
    setImporting(true)
    const ajustes = importPreview.rows.map(r => ({
      producto_compra_id: r.producto_compra_id,
      local_id: r.local_id,
      conteo_real: r.conteo_real,
      motivo: importPreview.motivo,
    }))
    const { data, error } = await supabase.rpc('rpc_regularizar_stock', { p_ajustes: ajustes })
    if (error) {
      alert(`Error: ${error.message}`)
      setImporting(false)
      return
    }
    alert(`✓ Aplicados ${data?.ajustes_aplicados ?? 0} ajustes`)
    setImportPreview(null)
    setImporting(false)
    await loadStock()
  }

  function renderStockActual() {
    return (
      <div className="space-y-4">
        {/* Filter by local + acciones Excel */}
        <div className="flex items-center gap-3 flex-wrap">
          <select
            className={`${selectClass} max-w-xs`}
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
          >
            <option value="todos">Todos los locales</option>
            {localNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={loadStock} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={descargarExcel} disabled={filteredStock.length === 0}>
              <Download size={14} className="mr-1" /> Descargar Excel
            </Button>
            <label className="cursor-pointer">
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => e.target.files?.[0] && handleSubirExcel(e.target.files[0])} />
              <Button variant="outline" size="sm" asChild>
                <span><UploadIcon size={14} className="mr-1" /> Subir Excel</span>
              </Button>
            </label>
          </div>
        </div>

        {/* Modal de preview import */}
        {importPreview && (
          <Card className="border-primary/40">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Preview regularización Excel</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setImportPreview(null)} disabled={importing}>
                Cancelar
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded bg-blue-500/5 border border-blue-500/30">
                  <div className="text-2xl font-bold">{importPreview.rows.length}</div>
                  <p className="text-xs text-muted-foreground">Ajustes a aplicar</p>
                </div>
                <div className="p-3 rounded bg-green-500/5 border border-green-500/30">
                  <div className="text-2xl font-bold text-green-600">
                    {importPreview.rows.filter(r => r.diff > 0).length}
                  </div>
                  <p className="text-xs text-muted-foreground">Subidas (entrada)</p>
                </div>
                <div className="p-3 rounded bg-red-500/5 border border-red-500/30">
                  <div className="text-2xl font-bold text-red-600">
                    {importPreview.rows.filter(r => r.diff < 0).length}
                  </div>
                  <p className="text-xs text-muted-foreground">Bajadas (salida)</p>
                </div>
              </div>

              {importPreview.sin_match.length > 0 && (
                <div className="p-3 rounded bg-orange-500/5 border border-orange-500/30 text-xs space-y-1">
                  <strong className="text-orange-600 flex items-center gap-1">
                    <AlertTriangle size={12} /> {importPreview.sin_match.length} filas con problemas
                  </strong>
                  {importPreview.sin_match.slice(0, 5).map(s => (
                    <div key={s.row}>Fila {s.row}: {s.valor}</div>
                  ))}
                  {importPreview.sin_match.length > 5 && <div>...y {importPreview.sin_match.length - 5} más</div>}
                </div>
              )}

              {importPreview.rows.length > 0 && (
                <div className="max-h-64 overflow-y-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/40">
                      <tr>
                        <th className="text-left p-2">Producto</th>
                        <th className="text-left p-2">Local</th>
                        <th className="text-right p-2">Stock BD</th>
                        <th className="text-right p-2">Conteo real</th>
                        <th className="text-right p-2">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{r.producto_nombre}</td>
                          <td className="p-2">{r.local_nombre}</td>
                          <td className="p-2 text-right font-mono">{r.stock_actual}</td>
                          <td className="p-2 text-right font-mono">{r.conteo_real}</td>
                          <td className={`p-2 text-right font-mono font-semibold ${r.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {r.diff > 0 ? '+' : ''}{r.diff}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t">
                <div className="text-xs text-muted-foreground">
                  Motivo: <span className="font-mono">{importPreview.motivo}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setImportPreview(null)} disabled={importing}>
                    Cancelar
                  </Button>
                  <Button onClick={confirmarImport} disabled={importing || importPreview.rows.length === 0}>
                    <CheckCircle2 size={14} className="mr-1" />
                    {importing ? 'Aplicando...' : `Aplicar ${importPreview.rows.length} ajustes`}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Producto</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Proveedor</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Local</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Cantidad</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Unidad</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Precio coste</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStock.map((s, i) => (
                      <tr key={`${s.producto_compra_id}-${s.local_nombre}-${i}`} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-medium">{s.producto_nombre}</td>
                        <td className="py-3 px-4 text-muted-foreground hidden md:table-cell">{s.proveedor_nombre}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700">
                            {s.local_nombre}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">{Number(s.stock_actual ?? 0).toLocaleString('es-ES')}</td>
                        <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell">{s.unidad_medida ?? '—'}</td>
                        <td className="py-3 px-4 text-right text-muted-foreground hidden md:table-cell">{s.precio != null ? formatCurrency(Number(s.precio)) : '—'}</td>
                        <td className="py-3 px-4 text-right font-mono hidden lg:table-cell">{s.precio != null ? formatCurrency(Number(s.stock_actual ?? 0) * Number(s.precio)) : '—'}</td>
                      </tr>
                    ))}
                    {filteredStock.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">
                          No hay stock registrado
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filteredStock.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted/50 font-medium">
                        <td colSpan={6} className="py-3 px-4 text-right">Total valor stock:</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(totalCoste)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ─── Tab 2: Movimiento Rápido ───────────────────────────────────────────

  async function submitMovimiento() {
    if (!movForm.producto_id || !movForm.local_id || !movForm.cantidad) return
    setSaving(true)
    const result = await rpcCall('rpc_registrar_movimiento_stock', {
      p_producto_id: Number(movForm.producto_id),
      p_local_id: Number(movForm.local_id),
      p_tipo: movForm.tipo,
      p_cantidad: Number(movForm.cantidad),
      p_notas: movForm.notas || null,
    })
    if (!result.ok) {
      alert(result.error || 'Error al registrar movimiento')
    } else {
      setMovForm({ producto_id: '', local_id: '', tipo: 'entrada', cantidad: '', notas: '' })
      alert('Movimiento registrado correctamente')
    }
    setSaving(false)
  }

  function renderMovimientoRapido() {
    return (
      <Card className="max-w-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Registrar movimiento de stock</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Producto *</label>
            <select className={selectClass} value={movForm.producto_id} onChange={(e) => setMovForm({ ...movForm, producto_id: e.target.value })}>
              <option value="">— Seleccionar producto —</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Local *</label>
            <select className={selectClass} value={movForm.local_id} onChange={(e) => setMovForm({ ...movForm, local_id: e.target.value })}>
              <option value="">— Seleccionar local —</option>
              {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo *</label>
            <select className={selectClass} value={movForm.tipo} onChange={(e) => setMovForm({ ...movForm, tipo: e.target.value })}>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cantidad *</label>
            <Input
              type="number"
              min="0"
              step="any"
              value={movForm.cantidad}
              onChange={(e) => setMovForm({ ...movForm, cantidad: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
              value={movForm.notas}
              onChange={(e) => setMovForm({ ...movForm, notas: e.target.value })}
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={submitMovimiento} disabled={saving || !movForm.producto_id || !movForm.local_id || !movForm.cantidad}>
              {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <RefreshCw size={14} />}
              Registrar movimiento
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Tab 3: Traspasos ───────────────────────────────────────────────────

  async function submitTraspaso() {
    if (!trasForm.producto_id || !trasForm.local_origen_id || !trasForm.local_destino_id || !trasForm.cantidad) return
    if (trasForm.local_origen_id === trasForm.local_destino_id) {
      alert('El local de origen y destino no pueden ser el mismo')
      return
    }
    setSaving(true)
    const result = await rpcCall('rpc_traspaso_stock', {
      p_producto_id: Number(trasForm.producto_id),
      p_local_origen_id: Number(trasForm.local_origen_id),
      p_local_destino_id: Number(trasForm.local_destino_id),
      p_cantidad: Number(trasForm.cantidad),
      p_notas: trasForm.notas || null,
    })
    if (!result.ok) {
      alert(result.error || 'Error al realizar traspaso')
    } else {
      setTrasForm({ producto_id: '', local_origen_id: '', local_destino_id: '', cantidad: '', notas: '' })
      alert('Traspaso realizado correctamente')
    }
    setSaving(false)
  }

  function renderTraspasos() {
    return (
      <Card className="max-w-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Traspaso entre locales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Producto *</label>
            <select className={selectClass} value={trasForm.producto_id} onChange={(e) => setTrasForm({ ...trasForm, producto_id: e.target.value })}>
              <option value="">— Seleccionar producto —</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Local origen *</label>
            <select className={selectClass} value={trasForm.local_origen_id} onChange={(e) => setTrasForm({ ...trasForm, local_origen_id: e.target.value })}>
              <option value="">— Seleccionar local origen —</option>
              {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Local destino *</label>
            <select className={selectClass} value={trasForm.local_destino_id} onChange={(e) => setTrasForm({ ...trasForm, local_destino_id: e.target.value })}>
              <option value="">— Seleccionar local destino —</option>
              {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cantidad *</label>
            <Input
              type="number"
              min="0"
              step="any"
              value={trasForm.cantidad}
              onChange={(e) => setTrasForm({ ...trasForm, cantidad: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
              value={trasForm.notas}
              onChange={(e) => setTrasForm({ ...trasForm, notas: e.target.value })}
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button
              onClick={submitTraspaso}
              disabled={saving || !trasForm.producto_id || !trasForm.local_origen_id || !trasForm.local_destino_id || !trasForm.cantidad}
            >
              {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <ArrowLeftRight size={14} />}
              Realizar traspaso
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Tab 4: Regularización ──────────────────────────────────────────────

  async function submitRegularizacion() {
    if (!regForm.producto_id || !regForm.local_id || regForm.cantidad_real === '') return
    setSaving(true)
    const result = await rpcCall('rpc_regularizar_stock', {
      p_producto_id: Number(regForm.producto_id),
      p_local_id: Number(regForm.local_id),
      p_cantidad_real: Number(regForm.cantidad_real),
      p_notas: regForm.notas || null,
    })
    if (!result.ok) {
      alert(result.error || 'Error al regularizar stock')
    } else {
      setRegForm({ producto_id: '', local_id: '', cantidad_real: '', notas: '' })
      alert('Regularización realizada correctamente')
    }
    setSaving(false)
  }

  function renderRegularizacion() {
    return (
      <Card className="max-w-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Regularización de stock</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Producto *</label>
            <select className={selectClass} value={regForm.producto_id} onChange={(e) => setRegForm({ ...regForm, producto_id: e.target.value })}>
              <option value="">— Seleccionar producto —</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Local *</label>
            <select className={selectClass} value={regForm.local_id} onChange={(e) => setRegForm({ ...regForm, local_id: e.target.value })}>
              <option value="">— Seleccionar local —</option>
              {locales.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cantidad real (conteo físico) *</label>
            <Input
              type="number"
              min="0"
              step="any"
              value={regForm.cantidad_real}
              onChange={(e) => setRegForm({ ...regForm, cantidad_real: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notas</label>
            <textarea
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
              value={regForm.notas}
              onChange={(e) => setRegForm({ ...regForm, notas: e.target.value })}
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button
              onClick={submitRegularizacion}
              disabled={saving || !regForm.producto_id || !regForm.local_id || regForm.cantidad_real === ''}
            >
              {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <ClipboardCheck size={14} />}
              Regularizar stock
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Tab 5: Movimientos ─────────────────────────────────────────────────

  async function loadMovimientos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('stock_movimientos_v2')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(100)
    if (!error && data) setMovimientos(data)
    setLoading(false)
  }

  function renderMovimientos() {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadMovimientos} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </Button>
          <span className="text-sm text-muted-foreground">Últimos 100 movimientos</span>
        </div>

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
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Producto</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden md:table-cell">Local</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Cantidad</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground hidden lg:table-cell">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{formatDate(m.fecha)}</td>
                      <td className="py-3 px-4 font-medium">{m.producto_nombre || m.producto_id}</td>
                      <td className="py-3 px-4 hidden md:table-cell">{m.local_nombre || m.local_id}</td>
                      <td className="py-3 px-4">{tipoBadge(m.tipo)}</td>
                      <td className="py-3 px-4 text-right font-mono">{m.cantidad}</td>
                      <td className="py-3 px-4 text-muted-foreground hidden lg:table-cell max-w-xs truncate">{m.notas || '—'}</td>
                    </tr>
                  ))}
                  {movimientos.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-muted-foreground">
                        No hay movimientos registrados
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

  // ─── Main render ────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center">
          <BoxesIcon size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Stock</h1>
          <p className="text-sm text-muted-foreground">Control de inventario y movimientos</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 flex-wrap border-b pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-orange-50 text-orange-700 border border-b-0 border-orange-200'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'stock' && renderStockActual()}
      {activeTab === 'movimiento' && renderMovimientoRapido()}
      {activeTab === 'traspaso' && renderTraspasos()}
      {activeTab === 'regularizacion' && renderRegularizacion()}
      {activeTab === 'movimientos' && renderMovimientos()}
    </div>
  )
}
