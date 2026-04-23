import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatNumber } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, Minus, Package, Flame,
  ChevronDown, ChevronUp, Check, AlertTriangle, Calendar,
  Shield, Scale, Zap, Info, BarChart3, Target,
} from 'lucide-react'

/* ================================================================== */
/*  TYPES                                                              */
/* ================================================================== */
interface Producto {
  id: number
  nombre: string
  categoria_id: number
}

interface Categoria {
  id: number
  label: string
}

interface VentaDia {
  nombre: string
  fecha: string
  cantidad: number
}

interface ForecastRow {
  nombre: string
  prevision_venta: number
  con_buffer: number
  stock_inicial: number
  prevision_hornear: number
  tanda1: number
  tanda2: number
  tendencia: 'up' | 'down' | 'flat'
  tendencia_pct: number
  confianza: 'alta' | 'media' | 'baja'
  dias_historico: number
  intervalo_min: number
  intervalo_max: number
}

type Estrategia = 'Defensiva' | 'Equilibrada' | 'Agresiva'

/* ================================================================== */
/*  CONSTANTS                                                          */
/* ================================================================== */
const CATEGORY_LABELS: Record<number, string> = {
  1: 'Empanada (legacy)',
  40: 'Empanada Clásica',
  41: 'Empanada Premium',
}
const DEFAULT_CATEGORIES = [40, 41]
const WEEKS_HISTORY = 8          // más semanas = más datos = mejor modelo
const UDS_POR_HORNADA = 60
const BUFFER_PCT = 0.30          // 30% safety buffer
const SPLIT_T1 = 0.70            // tanda 1
const SPLIT_T2 = 0.30            // tanda 2

const ESTRATEGIA_CONFIG: Record<Estrategia, {
  percentil: number
  color: string
  bg: string
  icon: typeof Shield
  desc: string
}> = {
  Defensiva:   { percentil: 50, color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     icon: Shield, desc: 'P50 — Minimiza merma' },
  Equilibrada: { percentil: 65, color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   icon: Scale,  desc: 'P65 — Balance óptimo' },
  Agresiva:    { percentil: 80, color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       icon: Zap,    desc: 'P80 — Maximiza ventas' },
}

/* ================================================================== */
/*  FESTIVOS — España Nacional + Catalunya                             */
/* ================================================================== */
function getFestivos(year: number): Set<string> {
  const f = new Set<string>()
  const add = (m: number, d: number) => f.add(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)

  // --- España nacional ---
  add(1, 1)    // Año Nuevo
  add(1, 6)    // Reyes
  add(5, 1)    // Día del Trabajo
  add(8, 15)   // Asunción
  add(10, 12)  // Fiesta Nacional
  add(11, 1)   // Todos los Santos
  add(12, 6)   // Constitución
  add(12, 8)   // Inmaculada
  add(12, 25)  // Navidad

  // --- Catalunya ---
  add(6, 24)   // Sant Joan
  add(9, 11)   // Diada
  add(9, 24)   // Mercè (Barcelona)
  add(12, 26)  // Sant Esteve

  // --- Semana Santa (aprox, hay que calcular cada año) ---
  const easter = computeEaster(year)
  const addOffset = (offset: number) => {
    const d = new Date(easter)
    d.setDate(d.getDate() + offset)
    f.add(d.toISOString().slice(0, 10))
  }
  addOffset(-3)  // Jueves Santo
  addOffset(-2)  // Viernes Santo
  addOffset(1)   // Lunes de Pascua (Catalunya)

  return f
}

/** Algoritmo de Butcher para calcular Domingo de Pascua */
function computeEaster(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function esFestivo(dateStr: string): boolean {
  const year = parseInt(dateStr.slice(0, 4))
  return getFestivos(year).has(dateStr)
}

function esVispera(dateStr: string): boolean {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return esFestivo(d.toISOString().slice(0, 10))
}

/* ================================================================== */
/*  DATE HELPERS                                                       */
/* ================================================================== */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function yesterdayStr(): string { return daysAgo(1) }
function getDayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay()
}
function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
}
function dayName(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { weekday: 'long' })
}

/* ================================================================== */
/*  ESTADÍSTICA — funciones base                                       */
/* ================================================================== */

/** Mediana de un array ordenado */
function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Percentil de un array (interpolación lineal) */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const frac = idx - lo
  return sorted[lo] * (1 - frac) + sorted[hi] * frac
}

/** Desviación estándar */
function stdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0
  const sumSq = values.reduce((s, v) => s + (v - mean) ** 2, 0)
  return Math.sqrt(sumSq / (values.length - 1))
}

/** Regresión lineal simple — devuelve pendiente normalizada (% cambio por semana) */
function trendSlope(values: number[]): number {
  if (values.length < 3) return 0
  const n = values.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return 0
  const slope = (n * sumXY - sumX * sumY) / denom
  const avgY = sumY / n
  if (avgY === 0) return 0
  return slope / avgY  // normalizado como % por paso
}

/* ================================================================== */
/*  MOTOR DE PREVISIÓN v2.0                                            */
/*                                                                     */
/*  Método: Weighted Day-of-Week con Trend Adjustment                  */
/*  1. Filtra ventas del mismo día de la semana (últimas N semanas)     */
/*  2. Dampen outliers via IQR (mediana ± 1.5×IQR)                     */
/*  3. Media ponderada exponencial (recencia = más peso)               */
/*  4. Detecta tendencia via regresión lineal                          */
/*  5. Ajusta por festivo/víspera                                      */
/*  6. Aplica estrategia (percentil) sobre distribución histórica      */
/*  7. Calcula intervalo de confianza                                  */
/* ================================================================== */
interface ForecastResult {
  base: number
  adjusted: number            // tras festivo + tendencia
  withBuffer: number          // con buffer
  intervalo_min: number
  intervalo_max: number
  tendencia: 'up' | 'down' | 'flat'
  tendencia_pct: number       // % cambio semanal
  confianza: 'alta' | 'media' | 'baja'
  dias_historico: number
}

function computeForecastV2(
  ventas: VentaDia[],
  targetDate: string,
  estrategia: Estrategia,
): ForecastResult {
  const targetDow = getDayOfWeek(targetDate)
  const pct = ESTRATEGIA_CONFIG[estrategia].percentil

  // 1. Agregar por fecha
  const dailyMap = new Map<string, number>()
  for (const v of ventas) {
    dailyMap.set(v.fecha, (dailyMap.get(v.fecha) || 0) + v.cantidad)
  }

  // 2. Filtrar mismo día de la semana
  const sameDow: { fecha: string; cantidad: number }[] = []
  for (const [fecha, cantidad] of dailyMap) {
    if (getDayOfWeek(fecha) === targetDow) {
      sameDow.push({ fecha, cantidad })
    }
  }

  // Fallback: si no hay suficientes datos del mismo día, usar todos
  let dataPoints = sameDow
  let usingFallback = false
  if (sameDow.length < 2) {
    dataPoints = Array.from(dailyMap.entries()).map(([fecha, cantidad]) => ({ fecha, cantidad }))
    usingFallback = true
  }

  if (dataPoints.length === 0) {
    return {
      base: 0, adjusted: 0, withBuffer: 0,
      intervalo_min: 0, intervalo_max: 0,
      tendencia: 'flat', tendencia_pct: 0,
      confianza: 'baja', dias_historico: 0,
    }
  }

  // 3. Ordenar por fecha (más reciente primero) y limitar
  dataPoints.sort((a, b) => b.fecha.localeCompare(a.fecha))
  const limited = dataPoints.slice(0, WEEKS_HISTORY)
  const values = limited.map(v => v.cantidad)

  // 4. Outlier dampening (IQR)
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = percentile(sorted, 25)
  const q3 = percentile(sorted, 75)
  const iqr = q3 - q1
  const lowerFence = Math.max(0, q1 - 1.5 * iqr)
  const upperFence = q3 + 1.5 * iqr
  const clamped = values.map(v => Math.max(lowerFence, Math.min(upperFence, v)))

  // 5. Media ponderada exponencial (decay = 0.85 por semana)
  const DECAY = 0.85
  let weightedSum = 0
  let weightTotal = 0
  for (let i = 0; i < clamped.length; i++) {
    const w = Math.pow(DECAY, i)  // i=0 → peso más alto
    weightedSum += clamped[i] * w
    weightTotal += w
  }
  const weightedAvg = weightTotal > 0 ? weightedSum / weightTotal : 0

  // 6. Aplicar percentil de estrategia sobre distribución
  const sortedClamped = [...clamped].sort((a, b) => a - b)
  const pctValue = percentile(sortedClamped, pct)

  // Combinar: 60% percentil estrategia + 40% media ponderada
  // Esto equilibra la estrategia elegida con la tendencia reciente
  const base = pctValue * 0.6 + weightedAvg * 0.4

  // 7. Tendencia (regresión sobre valores cronológicos)
  const chronological = [...clamped].reverse()
  const slope = trendSlope(chronological)
  const tendencia_pct = slope * 100
  const tendencia: 'up' | 'down' | 'flat' =
    tendencia_pct > 5 ? 'up' : tendencia_pct < -5 ? 'down' : 'flat'

  // Aplicar ajuste de tendencia: proyectar 1 semana adelante (conservador)
  const trendMultiplier = 1 + Math.max(-0.15, Math.min(0.15, slope))

  // 8. Ajuste festivo/víspera
  let holidayMultiplier = 1.0
  if (esVispera(targetDate)) holidayMultiplier = 1.25
  else if (esFestivo(targetDate)) holidayMultiplier = 1.15

  const adjusted = Math.max(0, base * trendMultiplier * holidayMultiplier)

  // 9. Buffer
  const withBuffer = adjusted * (1 + BUFFER_PCT)

  // 10. Intervalos de confianza
  const mean = clamped.reduce((s, v) => s + v, 0) / clamped.length
  const sd = stdDev(clamped, mean)
  const se = sd / Math.sqrt(clamped.length)
  const z = estrategia === 'Defensiva' ? 1.28 : estrategia === 'Equilibrada' ? 1.65 : 1.96
  const intervalo_min = Math.max(0, Math.round(adjusted - z * se * holidayMultiplier))
  const intervalo_max = Math.round(adjusted + z * se * holidayMultiplier)

  // 11. Nivel de confianza
  const confianza: 'alta' | 'media' | 'baja' =
    clamped.length >= 6 && !usingFallback ? 'alta' :
    clamped.length >= 3 ? 'media' : 'baja'

  return {
    base: Math.max(0, Math.round(base)),
    adjusted: Math.max(0, Math.round(adjusted)),
    withBuffer: Math.max(0, Math.round(withBuffer)),
    intervalo_min,
    intervalo_max,
    tendencia,
    tendencia_pct: Math.round(tendencia_pct * 10) / 10,
    confianza,
    dias_historico: clamped.length,
  }
}

/* ================================================================== */
/*  Multi-select dropdown                                              */
/* ================================================================== */
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { key: number; label: string }[]
  selected: Set<number>
  onChange: (selected: Set<number>) => void
}) {
  const [open, setOpen] = useState(false)

  const toggleItem = (key: number) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }

  const selectAll = () => onChange(new Set(options.map(o => o.key)))
  const selectNone = () => onChange(new Set())

  const selectedCount = selected.size
  const summary =
    selectedCount === 0
      ? 'Ninguno'
      : selectedCount === options.length
        ? 'Todos seleccionados'
        : `${selectedCount} seleccionado${selectedCount > 1 ? 's' : ''}`

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 border rounded-lg bg-white text-sm hover:border-orange-400 transition-colors"
      >
        <span className="truncate">{summary}</span>
        {open ? <ChevronUp className="w-4 h-4 ml-2 shrink-0" /> : <ChevronDown className="w-4 h-4 ml-2 shrink-0" />}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="flex gap-2 px-3 py-2 border-b bg-gray-50 sticky top-0">
            <button type="button" onClick={selectAll} className="text-xs text-orange-600 hover:text-orange-800 font-medium">
              Todos
            </button>
            <span className="text-gray-300">|</span>
            <button type="button" onClick={selectNone} className="text-xs text-gray-500 hover:text-gray-700 font-medium">
              Ninguno
            </button>
          </div>
          {options.map(opt => (
            <label
              key={opt.key}
              className="flex items-center px-3 py-1.5 hover:bg-orange-50 cursor-pointer text-sm"
            >
              <div className={`w-4 h-4 rounded border mr-2 flex items-center justify-center shrink-0 ${
                selected.has(opt.key) ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
              }`}>
                {selected.has(opt.key) && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  Trend icon                                                         */
/* ================================================================== */
function TrendIcon({ trend, pct }: { trend: 'up' | 'down' | 'flat'; pct: number }) {
  if (trend === 'up') return (
    <span className="inline-flex items-center gap-0.5 text-emerald-600" title={`+${pct}%/sem`}>
      <TrendingUp className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">+{pct}%</span>
    </span>
  )
  if (trend === 'down') return (
    <span className="inline-flex items-center gap-0.5 text-red-500" title={`${pct}%/sem`}>
      <TrendingDown className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">{pct}%</span>
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 text-gray-400" title="Estable">
      <Minus className="w-3.5 h-3.5" />
    </span>
  )
}

/* ================================================================== */
/*  Confidence badge                                                   */
/* ================================================================== */
function ConfianzaBadge({ level }: { level: 'alta' | 'media' | 'baja' }) {
  const styles = {
    alta:  'bg-emerald-100 text-emerald-700',
    media: 'bg-amber-100 text-amber-700',
    baja:  'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${styles[level]}`}>
      {level}
    </span>
  )
}

/* ================================================================== */
/*  COMPONENT                                                          */
/* ================================================================== */
export default function Forecast() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [selectedCats, setSelectedCats] = useState<Set<number>>(new Set(DEFAULT_CATEGORIES))
  const [selectedProds, setSelectedProds] = useState<Set<number>>(new Set())
  const [forecastDate, setForecastDate] = useState(todayStr())
  const [estrategia, setEstrategia] = useState<Estrategia>('Equilibrada')
  const [ventasMap, setVentasMap] = useState<Map<string, VentaDia[]>>(new Map())
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [prodsInitialized, setProdsInitialized] = useState(false)
  const [showMethodology, setShowMethodology] = useState(false)

  /* ---------- Load productos + build category list ---------- */
  useEffect(() => {
    async function load() {
      let { data, error } = await supabase
        .from('productos_v2')
        .select('id, nombre, categoria_id')
        .eq('visible_en_forecast', true)
        .order('categoria_id')
        .order('nombre')

      if (error || !data || data.length === 0) {
        const res = await supabase
          .from('productos_v2')
          .select('id, nombre, categoria_id')
          .order('categoria_id')
          .order('nombre')
        data = res.data
      }

      if (data && data.length > 0) {
        setProductos(data)
        const catSet = new Map<number, string>()
        for (const p of data) {
          if (!catSet.has(p.categoria_id)) {
            catSet.set(p.categoria_id, CATEGORY_LABELS[p.categoria_id] || `Categoría ${p.categoria_id}`)
          }
        }
        setCategorias(Array.from(catSet.entries()).map(([id, label]) => ({ id, label })))
      }
    }
    load()
  }, [])

  /* ---------- Auto-select products in selected categories ---------- */
  useEffect(() => {
    if (productos.length === 0) return
    const prodsInCats = productos
      .filter(p => selectedCats.has(p.categoria_id))
      .map(p => p.id)
    setSelectedProds(new Set(prodsInCats))
    if (!prodsInitialized) setProdsInitialized(true)
  }, [selectedCats, productos])

  const availableProducts = useMemo(() => {
    return productos.filter(p => selectedCats.has(p.categoria_id))
  }, [productos, selectedCats])

  /* ---------- Fetch ventas ---------- */
  const loadData = useCallback(async () => {
    if (selectedProds.size === 0) {
      setVentasMap(new Map())
      setStockMap(new Map())
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const prodIds = Array.from(selectedProds)
      const prodNames = prodIds
        .map(id => productos.find(p => p.id === id)?.nombre)
        .filter(Boolean) as string[]

      const fromDate = daysAgo(WEEKS_HISTORY * 7 + 14) // extra margen
      const yesterday = yesterdayStr()

      const allVentas: VentaDia[] = []
      const pageSize = 1000
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('ventas_raw_v2')
          .select('producto, fecha, cantidad')
          .gte('fecha', fromDate)
          .lte('fecha', yesterday)
          .range(offset, offset + pageSize - 1)

        if (error || !data || data.length === 0) {
          hasMore = false
        } else {
          const nameSet = new Set(prodNames.map(n => n.toLowerCase()))
          for (const row of data) {
            if (row.producto && nameSet.has(row.producto.toLowerCase())) {
              allVentas.push({
                nombre: row.producto,
                fecha: row.fecha,
                cantidad: row.cantidad,
              })
            }
          }
          hasMore = data.length === pageSize
          offset += pageSize
        }
      }

      // Group by product name
      const byProduct = new Map<string, VentaDia[]>()
      for (const v of allVentas) {
        const canonical = prodNames.find(n => n.toLowerCase() === v.nombre.toLowerCase()) || v.nombre
        if (!byProduct.has(canonical)) byProduct.set(canonical, [])
        byProduct.get(canonical)!.push({ ...v, nombre: canonical })
      }
      setVentasMap(byProduct)

      // Fetch stock from control_diario
      const { data: stockData } = await supabase
        .from('control_diario')
        .select('producto_id, resto, stock_final')
        .eq('fecha', yesterday)
        .in('producto_id', prodIds)

      const sMap = new Map<string, number>()
      if (stockData) {
        for (const s of stockData) {
          const prod = productos.find(p => p.id === s.producto_id)
          if (prod) {
            const stock = s.resto ?? s.stock_final ?? 0
            sMap.set(prod.nombre, stock)
          }
        }
      }
      setStockMap(sMap)
    } finally {
      setLoading(false)
    }
  }, [selectedProds, forecastDate, productos])

  useEffect(() => {
    if (prodsInitialized) loadData()
  }, [loadData, prodsInitialized])

  /* ---------- Compute forecast ---------- */
  const forecastRows: ForecastRow[] = useMemo(() => {
    if (ventasMap.size === 0 && !loading) return []

    const rows: ForecastRow[] = []
    for (const prodId of selectedProds) {
      const producto = productos.find(p => p.id === prodId)
      if (!producto) continue

      const ventas = ventasMap.get(producto.nombre) || []
      const result = computeForecastV2(ventas, forecastDate, estrategia)

      if (result.adjusted === 0 && result.dias_historico === 0) continue

      const stock = stockMap.get(producto.nombre) || 0
      const hornearBruto = Math.max(0, result.withBuffer - stock)
      const hornear = Math.ceil(hornearBruto)

      rows.push({
        nombre: producto.nombre,
        prevision_venta: result.adjusted,
        con_buffer: result.withBuffer,
        stock_inicial: stock,
        prevision_hornear: hornear,
        tanda1: Math.ceil(hornear * SPLIT_T1),
        tanda2: Math.floor(hornear * SPLIT_T2),
        tendencia: result.tendencia,
        tendencia_pct: result.tendencia_pct,
        confianza: result.confianza,
        dias_historico: result.dias_historico,
        intervalo_min: result.intervalo_min,
        intervalo_max: result.intervalo_max,
      })
    }

    rows.sort((a, b) => b.prevision_hornear - a.prevision_hornear)
    return rows
  }, [ventasMap, stockMap, forecastDate, selectedProds, productos, loading, estrategia])

  /* ---------- Totals ---------- */
  const totals = useMemo(() => {
    const t = forecastRows.reduce(
      (acc, r) => ({
        prevision_venta: acc.prevision_venta + r.prevision_venta,
        con_buffer: acc.con_buffer + r.con_buffer,
        stock_inicial: acc.stock_inicial + r.stock_inicial,
        prevision_hornear: acc.prevision_hornear + r.prevision_hornear,
        tanda1: acc.tanda1 + r.tanda1,
        tanda2: acc.tanda2 + r.tanda2,
      }),
      { prevision_venta: 0, con_buffer: 0, stock_inicial: 0, prevision_hornear: 0, tanda1: 0, tanda2: 0 }
    )
    const hornadas = t.prevision_hornear > 0 ? Math.ceil(t.prevision_hornear / UDS_POR_HORNADA) : 0
    const capacidad = hornadas * UDS_POR_HORNADA
    const huecos = Math.max(0, capacidad - t.prevision_hornear)
    return { ...t, hornadas, capacidad, huecos }
  }, [forecastRows])

  /* ---------- Context warnings ---------- */
  const contextFlags = useMemo(() => {
    const flags: { icon: typeof Calendar; text: string; color: string }[] = []
    if (esFestivo(forecastDate)) {
      flags.push({ icon: Calendar, text: 'FESTIVO — Boost ×1.15 aplicado', color: 'text-purple-700 bg-purple-50 border-purple-200' })
    }
    if (esVispera(forecastDate)) {
      flags.push({ icon: AlertTriangle, text: 'VÍSPERA DE FESTIVO — Boost ×1.25 aplicado', color: 'text-amber-700 bg-amber-50 border-amber-200' })
    }
    const lowConf = forecastRows.filter(r => r.confianza === 'baja').length
    if (lowConf > 0) {
      flags.push({ icon: Info, text: `${lowConf} producto${lowConf > 1 ? 's' : ''} con confianza baja (pocos datos)`, color: 'text-red-700 bg-red-50 border-red-200' })
    }
    return flags
  }, [forecastDate, forecastRows])

  const catOptions = useMemo(
    () => categorias.map(c => ({ key: c.id, label: c.label })),
    [categorias]
  )

  const prodOptions = useMemo(
    () => availableProducts.map(p => ({ key: p.id, label: p.nombre })),
    [availableProducts]
  )

  /* ================================================================== */
  /*  RENDER                                                             */
  /* ================================================================== */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Forecast v2</h1>
          <p className="text-sm text-gray-500">Motor de previsión avanzado — {formatDateShort(forecastDate)}</p>
        </div>
      </div>

      {/* Filters + Strategy */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MultiSelect
              label="Categorías"
              options={catOptions}
              selected={selectedCats}
              onChange={setSelectedCats}
            />
            <MultiSelect
              label="Productos"
              options={prodOptions}
              selected={selectedProds}
              onChange={setSelectedProds}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha previsión</label>
              <input
                type="date"
                value={forecastDate}
                onChange={e => setForecastDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
              />
              <p className="text-xs text-gray-400 mt-1 capitalize">{dayName(forecastDate)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estrategia</label>
              <div className="flex gap-1">
                {(Object.keys(ESTRATEGIA_CONFIG) as Estrategia[]).map(e => {
                  const cfg = ESTRATEGIA_CONFIG[e]
                  const Icon = cfg.icon
                  const active = estrategia === e
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEstrategia(e)}
                      className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg border text-xs font-medium transition-all ${
                        active
                          ? `${cfg.bg} ${cfg.color} border-current shadow-sm`
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}
                      title={cfg.desc}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{e}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1 text-center">{ESTRATEGIA_CONFIG[estrategia].desc}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Context flags */}
      {contextFlags.length > 0 && (
        <div className="space-y-2">
          {contextFlags.map((flag, i) => {
            const Icon = flag.icon
            return (
              <div key={i} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium ${flag.color}`}>
                <Icon className="w-4 h-4 shrink-0" />
                {flag.text}
              </div>
            )
          })}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-xs text-gray-500">Prev. venta</p>
                <p className="text-xl font-bold text-gray-900">
                  {loading ? '…' : formatNumber(totals.prevision_venta, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-xs text-gray-500">Stock</p>
                <p className="text-xl font-bold text-gray-900">
                  {loading ? '…' : formatNumber(totals.stock_inicial, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-xs text-gray-500">A hornear</p>
                <p className="text-xl font-bold text-orange-600">
                  {loading ? '…' : formatNumber(totals.prevision_hornear, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-xs text-gray-500">Hornadas</p>
                <p className="text-xl font-bold text-gray-900">
                  {loading ? '…' : totals.hornadas}
                  <span className="text-xs font-normal text-gray-400"> ×{UDS_POR_HORNADA}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Huecos</p>
                <p className="text-xl font-bold text-gray-500">
                  {loading ? '…' : totals.huecos}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-500" />
              <div>
                <p className="text-xs text-gray-500">Productos</p>
                <p className="text-xl font-bold text-gray-900">
                  {loading ? '…' : forecastRows.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Batch split summary */}
      {!loading && totals.prevision_hornear > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between px-4 py-3 bg-orange-50 rounded-lg border border-orange-200">
            <span className="text-sm font-medium text-orange-800">Tanda 1 ({Math.round(SPLIT_T1 * 100)}%)</span>
            <span className="text-lg font-bold text-orange-700">{formatNumber(totals.tanda1, 0)} uds</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 bg-amber-50 rounded-lg border border-amber-200">
            <span className="text-sm font-medium text-amber-800">Tanda 2 ({Math.round(SPLIT_T2 * 100)}%)</span>
            <span className="text-lg font-bold text-amber-700">{formatNumber(totals.tanda2, 0)} uds</span>
          </div>
        </div>
      )}

      {/* Forecast table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Detalle por producto</CardTitle>
            {!loading && forecastRows.length > 0 && (
              <span className="text-xs text-gray-400">
                Buffer {Math.round(BUFFER_PCT * 100)}% incluido · {WEEKS_HISTORY} semanas históricas
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mb-2"></div>
              <p>Calculando previsión…</p>
            </div>
          ) : forecastRows.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Selecciona categorías y productos para ver la previsión
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-2.5 px-3 font-semibold text-gray-700">Producto</th>
                    <th className="text-center py-2.5 px-2 font-semibold text-gray-500 w-16">Trend</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-blue-700">Prev. venta</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-gray-500 text-xs">Intervalo</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-green-700">Stock</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-orange-700">A hornear</th>
                    <th className="text-right py-2.5 px-2 font-semibold text-orange-600 text-xs">T1</th>
                    <th className="text-right py-2.5 px-2 font-semibold text-amber-600 text-xs">T2</th>
                    <th className="text-center py-2.5 px-2 font-semibold text-gray-500 w-16">Conf.</th>
                    <th className="text-center py-2.5 px-2 font-semibold text-gray-400 text-xs w-12">Días</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastRows.map(row => (
                    <tr key={row.nombre} className="border-b hover:bg-orange-50/50 transition-colors">
                      <td className="py-2 px-3 font-medium text-gray-900">{row.nombre}</td>
                      <td className="py-2 px-2 text-center">
                        <TrendIcon trend={row.tendencia} pct={row.tendencia_pct} />
                      </td>
                      <td className="py-2 px-3 text-right text-blue-600 font-medium">{row.prevision_venta}</td>
                      <td className="py-2 px-3 text-right text-gray-400 text-xs">{row.intervalo_min}–{row.intervalo_max}</td>
                      <td className="py-2 px-3 text-right text-green-600 font-medium">{row.stock_inicial}</td>
                      <td className="py-2 px-3 text-right font-bold text-orange-600">{row.prevision_hornear}</td>
                      <td className="py-2 px-2 text-right text-orange-500 text-xs">{row.tanda1}</td>
                      <td className="py-2 px-2 text-right text-amber-500 text-xs">{row.tanda2}</td>
                      <td className="py-2 px-2 text-center">
                        <ConfianzaBadge level={row.confianza} />
                      </td>
                      <td className="py-2 px-2 text-center text-gray-400 text-xs">{row.dias_historico}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-gray-50 font-bold">
                    <td className="py-2.5 px-3 text-gray-900">TOTAL</td>
                    <td></td>
                    <td className="py-2.5 px-3 text-right text-blue-700">{totals.prevision_venta}</td>
                    <td></td>
                    <td className="py-2.5 px-3 text-right text-green-700">{totals.stock_inicial}</td>
                    <td className="py-2.5 px-3 text-right text-orange-700">{totals.prevision_hornear}</td>
                    <td className="py-2.5 px-2 text-right text-orange-600 text-xs">{totals.tanda1}</td>
                    <td className="py-2.5 px-2 text-right text-amber-600 text-xs">{totals.tanda2}</td>
                    <td></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Methodology toggle */}
          {!loading && forecastRows.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowMethodology(!showMethodology)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Info className="w-3.5 h-3.5" />
                <span>Metodología del motor v2</span>
                {showMethodology ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showMethodology && (
                <div className="mt-2 p-4 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-2 border">
                  <p><strong>Motor de previsión v2.0</strong> — Weighted Day-of-Week con Trend Adjustment</p>
                  <p><strong>1. Datos:</strong> Últimas {WEEKS_HISTORY} semanas del mismo día de la semana. Si no hay suficientes datos, usa media general como fallback.</p>
                  <p><strong>2. Outliers:</strong> Dampening por IQR (Q1−1.5×IQR, Q3+1.5×IQR). Los valores extremos se acotan sin eliminarse.</p>
                  <p><strong>3. Ponderación:</strong> Decaimiento exponencial (factor 0.85). Las semanas más recientes pesan más.</p>
                  <p><strong>4. Estrategia:</strong> Combina percentil ({ESTRATEGIA_CONFIG[estrategia].desc}) con media ponderada (60/40).</p>
                  <p><strong>5. Tendencia:</strong> Regresión lineal sobre datos cronológicos. Se aplica como multiplicador (máx ±15%).</p>
                  <p><strong>6. Festivos:</strong> Calendario España + Catalunya con Semana Santa dinámica. Víspera ×1.25, festivo ×1.15.</p>
                  <p><strong>7. Buffer:</strong> +{Math.round(BUFFER_PCT * 100)}% sobre la previsión ajustada.</p>
                  <p><strong>8. Fórmula final:</strong> A hornear = (Prev. venta × tendencia × festivo × (1 + buffer)) − Stock inicial</p>
                  <p><strong>9. Tandas:</strong> T1 = {Math.round(SPLIT_T1 * 100)}%, T2 = {Math.round(SPLIT_T2 * 100)}%</p>
                  <p><strong>10. Confianza:</strong> Alta (≥6 datos mismo día), Media (≥3), Baja ({'<'}3 o usando fallback).</p>
                  <p><strong>11. Intervalo:</strong> Media ± z×SE×festivo, donde z varía por estrategia (1.28 / 1.65 / 1.96).</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
