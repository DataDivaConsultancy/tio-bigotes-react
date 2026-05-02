import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, FileUp, CheckCircle, AlertTriangle, X, Download } from 'lucide-react'
import Papa from 'papaparse'

/** Marcador especial: guarda esa columna del CSV como atributo extra
 * (campos_extra_producto_v2). El nombre del atributo será la cabecera del
 * CSV normalizada. */
const ATTR_EXTRA = '__attr_extra__'

const EXPECTED_FIELDS = [
  // ── Producto (tb_v2.productos + productos_compra_v2) ──
  'tipo',                  // venta | compra | ambos
  'nombre',
  'codigo',                // productos_v2.codigo
  'cod_interno',           // productos_compra_v2.cod_interno
  'categoria',             // nombre de categoría (resuelve a categoria_id)
  'en_precios_venta',      // true/false
  'observaciones',
  'notas',                 // notas de compra
  'medidas',
  'color',
  'unidad_medida',
  'stock_minimo',
  'activo',
  // ── Formato predeterminado (producto_formatos) ──
  'formato_compra',
  'unidad_minima_compra',   // = unidades_por_paquete del paquete
  'peso_neto_kg',
  'peso_bruto_kg',
  'ean',
  'merma_pct',
  // ── Proveedor / relación (producto_proveedor) ──
  'proveedor',
  'cod_proveedor',
  'dia_pedido',
  'dia_entrega',
  'forma_pago',
  'plazo_pago',
  // ── Precio (proveedor_producto_precios) ──
  'precio',
  'tipo_iva',
  'descuento_pct',
] as const

/** Cada campo tiene un label visible y un grupo (para mostrar el dropdown
 * de mapeo agrupado por sección). */
const FIELD_LABELS: Record<string, string> = {
  // Producto
  tipo: 'Tipo (venta / compra / ambos)',
  nombre: 'Nombre del producto *',
  codigo: 'Código (interno de venta)',
  cod_interno: 'Código interno (compras)',
  categoria: 'Categoría (nombre)',
  en_precios_venta: 'En lista de precios de venta (true/false)',
  observaciones: 'Observaciones (notas internas)',
  notas: 'Notas de compra',
  medidas: 'Medidas (texto libre)',
  color: 'Color',
  unidad_medida: 'Unidad de medida (kg, l, unidad…)',
  stock_minimo: 'Stock mínimo',
  activo: 'Activo (true/false)',
  // Formato
  formato_compra: 'Formato compra (caja, palet, saco…)',
  unidad_minima_compra: 'Uds por paquete',
  peso_neto_kg: 'Peso neto (kg)',
  peso_bruto_kg: 'Peso bruto (kg)',
  ean: 'EAN / código de barras',
  merma_pct: 'Merma (%)',
  // Proveedor
  proveedor: 'Proveedor (nombre comercial)',
  cod_proveedor: 'Código del proveedor',
  dia_pedido: 'Día de pedido',
  dia_entrega: 'Día de entrega',
  forma_pago: 'Forma de pago',
  plazo_pago: 'Plazo de pago',
  // Precio
  precio: 'Precio coste paquete (€)',
  tipo_iva: 'Tipo IVA',
  descuento_pct: 'Descuento (%)',
}

const FIELD_GROUPS: Record<string, string> = {
  tipo: 'Producto', nombre: 'Producto', codigo: 'Producto',
  cod_interno: 'Producto', categoria: 'Producto', en_precios_venta: 'Producto',
  observaciones: 'Producto', notas: 'Producto', medidas: 'Producto',
  color: 'Producto', unidad_medida: 'Producto', stock_minimo: 'Producto', activo: 'Producto',
  formato_compra: 'Formato', unidad_minima_compra: 'Formato',
  peso_neto_kg: 'Formato', peso_bruto_kg: 'Formato', ean: 'Formato', merma_pct: 'Formato',
  proveedor: 'Proveedor', cod_proveedor: 'Proveedor',
  dia_pedido: 'Proveedor', dia_entrega: 'Proveedor',
  forma_pago: 'Proveedor', plazo_pago: 'Proveedor',
  precio: 'Precio', tipo_iva: 'Precio', descuento_pct: 'Precio',
}

const NUMERIC_FIELDS = ['precio', 'unidad_minima_compra', 'stock_minimo', 'peso_neto_kg', 'peso_bruto_kg', 'merma_pct', 'descuento_pct']
const REQUIRED_FIELDS = ['nombre']

const IVA_OPTIONS_DB = ['General 21%', 'Reducido 10%', 'Superreducido 4%', 'Exento 0%']

type ExpectedField = (typeof EXPECTED_FIELDS)[number]

interface ColumnMapping {
  [csvColumn: string]: ExpectedField | typeof ATTR_EXTRA | ''
}

interface SavedMappingConfig {
  id: number
  mapping: ColumnMapping
}

type ImportStep = 'select' | 'preview' | 'importing' | 'done'

// Mapeo flexible de tipo_iva: acepta varios formatos
function normalizarTipoIva(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.toString().trim().toLowerCase()
  if (!v) return null
  if (v.includes('21') || v.includes('general')) return 'General 21%'
  if (v.includes('10') || v.includes('reducido')) return 'Reducido 10%'
  if (v.includes('4')  || v.includes('super'))    return 'Superreducido 4%'
  if (v.includes('0')  || v.includes('exento'))   return 'Exento 0%'
  return null
}

// Mapeo unidad_medida → vocabulario controlado
function normalizarUnidadMedida(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.toString().trim().toLowerCase()
  if (!v) return null
  const map: Record<string, string> = {
    kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg',
    g: 'g', gr: 'g', gramo: 'g', gramos: 'g',
    l: 'l', litro: 'l', litros: 'l',
    ml: 'ml', mililitro: 'ml',
    ud: 'unidad', unidad: 'unidad', uds: 'unidad', unidades: 'unidad',
    caja: 'caja', cajas: 'caja',
    pack: 'pack', packs: 'pack',
    saco: 'saco', sacos: 'saco',
    garrafa: 'garrafa', garrafas: 'garrafa',
    palet: 'palet', palets: 'palet',
    bidon: 'bidon', bidón: 'bidon',
    bandeja: 'bandeja', bandejas: 'bandeja',
    docena: 'docena', docenas: 'docena',
  }
  return map[v] || raw
}

export default function CargaProductos() {
  const [step, setStep] = useState<ImportStep>('select')
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([])
  const [csvColumns, setCsvColumns] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })
  const [importResult, setImportResult] = useState<{ creados: number; actualizados: number; errores: number; mensaje?: string } | null>(null)
  const [errorRows, setErrorRows] = useState<{ row: number; motivo: string }[]>([])
  const [savedMapping, setSavedMapping] = useState<SavedMappingConfig | null>(null)
  const [proveedores, setProveedores] = useState<Map<string, number>>(new Map())
  const [categoriasMap, setCategoriasMap] = useState<Map<string, number>>(new Map())
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  // Si el producto (match por cod_interno o nombre) ya existe → actualizar sus datos básicos
  const [actualizarProducto, setActualizarProducto] = useState(true)
  // Si el (producto, proveedor) ya tiene precio activo y el CSV trae uno → ¿sobrescribir?
  const [actualizarPrecioExistente, setActualizarPrecioExistente] = useState(false)

  useEffect(() => {
    loadSavedMapping()
    loadProveedores()
    loadCategoriasMap()
  }, [])

  async function loadCategoriasMap() {
    const { data } = await supabase
      .from('categorias_producto_v2').select('id, nombre').order('nombre')
    if (data) {
      const m = new Map<string, number>()
      data.forEach((c: any) => m.set(String(c.nombre).toLowerCase().trim(), c.id))
      setCategoriasMap(m)
    }
  }

  /** Descarga una plantilla CSV con las cabeceras y un ejemplo. */
  function descargarPlantilla() {
    // Usamos los labels (más legibles) como cabeceras del CSV
    const headers = EXPECTED_FIELDS.map((f) => FIELD_LABELS[f].replace(' *', ''))
    const ejemplo = [
      'Empanada Carne Picante',  // nombre
      'EMP-002',                  // cod_proveedor
      'INT-002',                  // cod_interno
      'Tio Bigotes',              // proveedor
      '18.00',                    // precio (paquete)
      'Reducido 10%',             // tipo_iva
      'unidad',                   // unidad_medida
      '12',                       // unidad_minima_compra (uds por paquete)
      '0',                        // stock_minimo
      'Lunes',                    // dia_pedido
      'Miercoles',                // dia_entrega
    ]
    // Escapar valores que contengan coma/comilla/salto
    const escape = (v: string) => {
      if (v == null) return ''
      const needs = /[",\n;]/.test(v)
      const clean = v.replace(/"/g, '""')
      return needs ? `"${clean}"` : clean
    }
    const lines = [
      headers.map(escape).join(','),
      ejemplo.map(escape).join(','),
    ]
    const csv = lines.join('\n')
    // Añadir BOM UTF-8 para que Excel reconozca las tildes
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `plantilla_productos_compra_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function loadSavedMapping() {
    const { data } = await supabase
      .from('config_importaciones_v2')
      .select('id, mapping')
      .eq('tipo', 'productos_compra')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.mapping) setSavedMapping({ id: data.id, mapping: data.mapping })
  }

  async function loadProveedores() {
    const { data } = await supabase
      .from('proveedores_v2')
      .select('id, nombre_comercial')
      .eq('activo', true)
    if (data) {
      const map = new Map<string, number>()
      for (const p of data) {
        map.set(p.nombre_comercial.toLowerCase().trim(), p.id)
      }
      setProveedores(map)
    }
  }

  const handleFile = useCallback((selectedFile: File) => {
    const name = selectedFile.name.toLowerCase()
    if (!name.endsWith('.csv')) {
      setParseError('Solo se aceptan archivos .csv (si tienes un Excel, exportalo a CSV desde Excel/Google Sheets).')
      return
    }
    setParseError(null)
    setFile(selectedFile)

    Papa.parse<Record<string, string>>(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setParseError(`Error al parsear el archivo: ${results.errors[0].message}`)
          return
        }
        const columns = results.meta.fields || []
        setCsvColumns(columns)
        setParsedData(results.data)

        // Auto-map por similitud de nombres
        const autoMap: Record<string, ExpectedField> = {
          'nombre': 'nombre',
          'producto': 'nombre',
          'descripcion': 'nombre',
          'descripción': 'nombre',
          'codigo proveedor': 'cod_proveedor',
          'código proveedor': 'cod_proveedor',
          'cod proveedor': 'cod_proveedor',
          'cod_proveedor': 'cod_proveedor',
          'codigo': 'cod_interno',
          'código': 'cod_interno',
          'cod_interno': 'cod_interno',
          'codigo interno': 'cod_interno',
          'código interno': 'cod_interno',
          'sku': 'cod_interno',
          'proveedor': 'proveedor',
          'fabricante': 'proveedor',
          'marca': 'proveedor',
          'precio': 'precio',
          'precio unitario': 'precio',
          'pvp': 'precio',
          'precio coste': 'precio',
          'coste': 'precio',
          'tipo iva': 'tipo_iva',
          'tipo_iva': 'tipo_iva',
          'iva': 'tipo_iva',
          'unidad': 'unidad_medida',
          'unidad medida': 'unidad_medida',
          'unidad de medida': 'unidad_medida',
          'unidad_medida': 'unidad_medida',
          'um': 'unidad_medida',
          'cantidad minima': 'unidad_minima_compra',
          'cantidad mínima': 'unidad_minima_compra',
          'cantidad_minima': 'unidad_minima_compra',
          'unidad minima compra': 'unidad_minima_compra',
          'unidad mínima compra': 'unidad_minima_compra',
          'minimo': 'unidad_minima_compra',
          'mínimo': 'unidad_minima_compra',
          'stock minimo': 'stock_minimo',
          'stock mínimo': 'stock_minimo',
          'stock_minimo': 'stock_minimo',
          'stock min': 'stock_minimo',
          'dia pedido': 'dia_pedido',
          'día pedido': 'dia_pedido',
          'dia_pedido': 'dia_pedido',
          'dia entrega': 'dia_entrega',
          'día entrega': 'dia_entrega',
          'dia_entrega': 'dia_entrega',
        }

        const mapping: ColumnMapping = {}
        columns.forEach((col) => {
          const normalized = col.toLowerCase().trim()
          mapping[col] = autoMap[normalized] || ''
        })
        if (savedMapping?.mapping) {
          const saved = savedMapping.mapping
          columns.forEach((col) => {
            if (saved[col]) mapping[col] = saved[col]
          })
        }
        setColumnMapping(mapping)
        setStep('preview')
      },
      error: (error) => {
        setParseError(`Error al leer el archivo: ${error.message}`)
      },
    })
  }, [savedMapping])

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])
  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(true) }, [])
  const onDragLeave = useCallback(() => setDragOver(false), [])
  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) handleFile(f)
  }, [handleFile])

  function updateMapping(csvCol: string, targetField: ExpectedField | typeof ATTR_EXTRA | '') {
    setColumnMapping((prev) => ({ ...prev, [csvCol]: targetField }))
  }

  function getMappedFields(): ExpectedField[] {
    return Object.values(columnMapping).filter((v): v is ExpectedField => v !== '')
  }
  function getUnmappedRequired(): ExpectedField[] {
    const mapped = getMappedFields()
    return REQUIRED_FIELDS.filter((f) => !mapped.includes(f as ExpectedField)) as ExpectedField[]
  }

  async function handleImport() {
    setStep('importing')
    setImporting(true)
    setImportResult(null)
    setErrorRows([])

    const reverseMap: Record<string, string> = {}
    Object.entries(columnMapping).forEach(([csvCol, field]) => {
      if (field) reverseMap[field] = csvCol
    })

    const errores: { row: number; motivo: string }[] = []
    const filasValidas: any[] = []

    parsedData.forEach((row, idx) => {
      const get = (f: ExpectedField) => {
        const col = reverseMap[f]
        return col ? (row[col] ?? '').toString().trim() : ''
      }
      const nombre = get('nombre')
      if (!nombre) {
        errores.push({ row: idx + 2, motivo: 'Falta nombre' })
        return
      }

      let proveedor_id: number | null = null
      const provName = get('proveedor')
      if (provName) {
        proveedor_id = proveedores.get(provName.toLowerCase()) ?? null
        if (!proveedor_id) {
          errores.push({ row: idx + 2, motivo: `Proveedor '${provName}' no existe` })
          return
        }
      }

      const parseNum = (s: string) => {
        if (!s) return null
        const n = parseFloat(s.replace(',', '.'))
        return isNaN(n) ? null : n
      }
      const parseBool = (s: string) => {
        if (!s) return undefined
        const v = s.toLowerCase().trim()
        if (['true','1','si','sí','yes','y','activo','x'].includes(v)) return true
        if (['false','0','no','n','inactivo'].includes(v)) return false
        return undefined
      }

      // Atributos personalizados: cualquier columna del CSV mapeada a ATTR_EXTRA
      const attrs: Array<{ campo: string; valor: string }> = []
      Object.entries(columnMapping).forEach(([csvCol, field]) => {
        if (field === ATTR_EXTRA) {
          const valor = (row[csvCol] ?? '').toString().trim()
          if (valor) attrs.push({ campo: csvCol.trim(), valor })
        }
      })

      // Resolver categoria por nombre (opcional)
      let categoria_id: number | null = null
      const catNombre = get('categoria')
      if (catNombre) {
        categoria_id = categoriasMap.get(catNombre.toLowerCase().trim()) ?? null
      }
      // Tipo
      const tipoRaw = get('tipo').toLowerCase()
      let tipo: 'venta' | 'compra' | 'ambos' | null = null
      if (tipoRaw.startsWith('vent')) tipo = 'venta'
      else if (tipoRaw.startsWith('comp')) tipo = 'compra'
      else if (tipoRaw.startsWith('amb')) tipo = 'ambos'

      filasValidas.push({
        idx_csv: idx + 2,
        // Producto
        tipo,
        nombre,
        codigo: get('codigo') || null,
        cod_interno: get('cod_interno') || null,
        categoria_id,
        en_precios_venta: parseBool(get('en_precios_venta')),
        observaciones: get('observaciones') || null,
        notas: get('notas') || null,
        medidas: get('medidas') || null,
        color: get('color') || null,
        unidad_medida: normalizarUnidadMedida(get('unidad_medida')),
        stock_minimo: parseNum(get('stock_minimo')) ?? 0,
        activo: parseBool(get('activo')) ?? true,
        // Formato
        formato_compra: get('formato_compra') || null,
        unidad_minima_compra: parseNum(get('unidad_minima_compra')),
        peso_neto_kg: parseNum(get('peso_neto_kg')),
        peso_bruto_kg: parseNum(get('peso_bruto_kg')),
        ean: get('ean') || null,
        merma_pct: parseNum(get('merma_pct')),
        // Proveedor
        proveedor_id,
        cod_proveedor: get('cod_proveedor') || null,
        dia_pedido: get('dia_pedido') || null,
        dia_entrega: get('dia_entrega') || null,
        forma_pago: get('forma_pago') || null,
        plazo_pago: get('plazo_pago') || null,
        // Precio
        precio: parseNum(get('precio')),
        tipo_iva: normalizarTipoIva(get('tipo_iva')),
        descuento_pct: parseNum(get('descuento_pct')),
        // Atributos extra
        attrs,
      })
    })

    setImportProgress({ done: 0, total: filasValidas.length })
    let creados = 0
    let actualizados = 0

    // Procesar fila a fila con lógica multi-proveedor:
    //   1) Match producto por cod_interno (case-insensitive). Si no, por nombre exacto.
    //      Si existe + actualizarProducto → UPDATE datos. Si no → INSERT.
    //   2) Si trae proveedor:
    //        a) Si NO hay relación (producto, proveedor) → crear + crear precio.
    //        b) Si SÍ hay relación + precio activo distinto:
    //             - actualizarPrecioExistente=true → cerrar precio anterior + crear nuevo (histórico).
    //             - actualizarPrecioExistente=false → ignorar (acumula en preciosNoActualizados).
    let precioCreado = 0
    let precioActualizado = 0
    let precioNoTocado = 0
    const COLS_PRODUCTO = new Set(['nombre','cod_interno','medidas','color','unidad_medida','unidad_minima_compra','unidades_por_paquete','stock_minimo','producto_venta_id','activo'])

    for (let i = 0; i < filasValidas.length; i++) {
      const f = filasValidas[i]
      const { idx_csv, ...payload } = f
      const p = payload as Record<string, any>

      try {
        // ── 1. Match producto ──
        let productoId: number | null = null
        const codInternoNorm = p.cod_interno ? String(p.cod_interno).trim().toLowerCase() : null
        if (codInternoNorm) {
          // Buscar por cod_interno con LOWER+TRIM para soportar variaciones de case
          const { data } = await supabase
            .from('productos_compra_v2')
            .select('id, cod_interno')
            .ilike('cod_interno', codInternoNorm)
            .limit(50)
          const found = (data ?? []).find((r: any) =>
            String(r.cod_interno || '').trim().toLowerCase() === codInternoNorm,
          )
          if (found) productoId = found.id
        }
        if (!productoId && p.nombre) {
          // Fallback: match por nombre normalizado
          const { data } = await supabase
            .from('productos_compra_v2')
            .select('id, nombre')
            .ilike('nombre', String(p.nombre).trim())
            .limit(10)
          const found = (data ?? []).find((r: any) =>
            String(r.nombre || '').trim().toLowerCase() === String(p.nombre).trim().toLowerCase(),
          )
          if (found) productoId = found.id
        }

        if (productoId && actualizarProducto) {
          // UPDATE producto
          const productoUpd: Record<string, unknown> = {}
          for (const k of Object.keys(p)) {
            if (COLS_PRODUCTO.has(k)) productoUpd[k] = p[k]
          }
          const { error: updErr } = await supabase
            .from('productos_compra_v2').update(productoUpd).eq('id', productoId)
          if (updErr) { errores.push({ row: idx_csv, motivo: updErr.message }); continue }
          actualizados++
        } else if (!productoId) {
          // INSERT producto
          const productoPayload: Record<string, unknown> = {}
          for (const k of Object.keys(p)) {
            if (COLS_PRODUCTO.has(k)) productoPayload[k] = p[k]
          }
          const { data: insData, error: insErr } = await supabase
            .from('productos_compra_v2').insert(productoPayload).select('id').single()
          if (insErr) { errores.push({ row: idx_csv, motivo: insErr.message }); continue }
          productoId = insData!.id
          creados++
        }

        // ── 1.5 Propagar a tb_v2.productos (si el CSV trae campos del producto de venta) ──
        if (productoId) {
          // Buscar producto_venta_id (puede ser null si tipo='compra')
          const { data: pcRow } = await supabase
            .from('productos_compra_v2').select('producto_venta_id').eq('id', productoId).maybeSingle()
          const ventaId = pcRow?.producto_venta_id ?? null
          // Build payload solo con campos que vinieron en el CSV
          const ventaUpd: Record<string, unknown> = {}
          if (p.tipo) ventaUpd['tipo'] = p.tipo
          if (p.codigo) ventaUpd['codigo'] = p.codigo
          if (p.categoria_id != null) ventaUpd['categoria_id'] = p.categoria_id
          if (p.en_precios_venta != null) ventaUpd['en_precios_venta'] = p.en_precios_venta
          if (p.observaciones) ventaUpd['observaciones'] = p.observaciones
          if (p.notas) ventaUpd['notas'] = p.notas
          if (Object.keys(ventaUpd).length > 0) {
            if (ventaId) {
              await supabase.from('productos_v2').update(ventaUpd).eq('id', ventaId)
            } else if (p.tipo === 'venta' || p.tipo === 'ambos') {
              // No hay registro venta y el CSV indica tipo=venta/ambos → crear uno
              ventaUpd['nombre'] = p.nombre
              ventaUpd['activo'] = p.activo !== false
              const { data: created } = await supabase
                .from('productos_v2').insert(ventaUpd).select('id').single()
              if (created?.id) {
                await supabase.from('productos_compra_v2')
                  .update({ producto_venta_id: created.id }).eq('id', productoId)
              }
            }
          }
        }

        // ── 2. Formato predeterminado: completar peso_neto/bruto/ean/merma/uds_paquete ──
        // (existe siempre porque el trigger del producto lo crea)
        if (productoId) {
          const fmtUpd: Record<string, unknown> = {}
          if (p.formato_compra != null) fmtUpd['formato_compra'] = p.formato_compra
          if (p.unidad_minima_compra != null) {
            fmtUpd['unidades_por_paquete'] = p.unidad_minima_compra
            fmtUpd['factor_conversion'] = Math.max(Number(p.unidad_minima_compra) || 1, 1)
          }
          if (p.peso_neto_kg != null)  fmtUpd['peso_neto_kg']  = p.peso_neto_kg
          if (p.peso_bruto_kg != null) fmtUpd['peso_bruto_kg'] = p.peso_bruto_kg
          if (p.ean) fmtUpd['ean'] = p.ean
          if (p.merma_pct != null) fmtUpd['merma_pct'] = p.merma_pct
          if (Object.keys(fmtUpd).length > 0) {
            await supabase.from('producto_formatos').update(fmtUpd)
              .eq('producto_id', productoId).eq('es_predeterminado', true)
          }
        }

        // ── 3. Relación producto↔proveedor + precio ──
        if (productoId && p.proveedor_id) {
          const { data: rels } = await supabase
            .from('producto_proveedor').select('producto_id, proveedor_id')
            .eq('producto_id', productoId).eq('proveedor_id', p.proveedor_id).limit(1)
          if (!rels || rels.length === 0) {
            await supabase.from('producto_proveedor').insert({
              producto_id: productoId, proveedor_id: p.proveedor_id,
              cod_proveedor: p.cod_proveedor ?? null,
              dia_pedido: p.dia_pedido ?? null, dia_entrega: p.dia_entrega ?? null,
              forma_pago: p.forma_pago ?? null, plazo_pago: p.plazo_pago ?? null,
              es_principal: false, activo: true,
            })
          } else {
            // Actualizar la relación existente con cualquier dato nuevo del CSV
            const relUpd: Record<string, unknown> = {}
            if (p.cod_proveedor) relUpd['cod_proveedor'] = p.cod_proveedor
            if (p.dia_pedido) relUpd['dia_pedido'] = p.dia_pedido
            if (p.dia_entrega) relUpd['dia_entrega'] = p.dia_entrega
            if (p.forma_pago) relUpd['forma_pago'] = p.forma_pago
            if (p.plazo_pago) relUpd['plazo_pago'] = p.plazo_pago
            if (Object.keys(relUpd).length > 0) {
              await supabase.from('producto_proveedor').update(relUpd)
                .eq('producto_id', productoId).eq('proveedor_id', p.proveedor_id)
            }
          }

          if (p.precio != null && p.precio > 0) {
            const { data: fmt } = await supabase
              .from('producto_formatos').select('id, factor_conversion')
              .eq('producto_id', productoId).eq('es_predeterminado', true)
              .limit(1).maybeSingle()
            if (fmt) {
              const factor = Math.max(Number(fmt.factor_conversion) || 1, 1)
              const precioPaquete = Number(p.precio)
              const precioUnitario = precioPaquete / factor
              const ivaRaw = String(p.tipo_iva || '')
              const iva = ivaRaw.includes('21') ? 21
                : ivaRaw.includes('10') ? 10
                : ivaRaw.includes('4') ? 4
                : ivaRaw.includes('0') || ivaRaw.toLowerCase().includes('exento') ? 0
                : 21

              const { data: precioActivo } = await supabase
                .from('proveedor_producto_precios')
                .select('id, precio, precio_paquete')
                .eq('proveedor_id', p.proveedor_id).eq('formato_id', fmt.id)
                .eq('activa', true).limit(1).maybeSingle()

              if (!precioActivo) {
                await supabase.from('proveedor_producto_precios').insert({
                  proveedor_id: p.proveedor_id, formato_id: fmt.id,
                  precio: precioUnitario, precio_paquete: precioPaquete,
                  iva_pct: iva,
                  descuento_pct: p.descuento_pct ?? null,
                  moneda: 'EUR',
                  vigente_desde: new Date().toISOString().slice(0, 10), activa: true,
                })
                precioCreado++
              } else {
                const mismoUnit = Math.round(Number(precioActivo.precio) * 1e6) === Math.round(precioUnitario * 1e6)
                const mismoPaq = Math.round(Number(precioActivo.precio_paquete || 0) * 1e6) === Math.round(precioPaquete * 1e6)
                if (mismoUnit && mismoPaq) {
                  precioNoTocado++
                } else if (actualizarPrecioExistente) {
                  await supabase.from('proveedor_producto_precios')
                    .update({ activa: false, vigente_hasta: new Date().toISOString().slice(0, 10) })
                    .eq('id', precioActivo.id)
                  await supabase.from('proveedor_producto_precios').insert({
                    proveedor_id: p.proveedor_id, formato_id: fmt.id,
                    precio: precioUnitario, precio_paquete: precioPaquete,
                    iva_pct: iva,
                    descuento_pct: p.descuento_pct ?? null,
                    moneda: 'EUR',
                    vigente_desde: new Date().toISOString().slice(0, 10), activa: true,
                  })
                  precioActualizado++
                } else {
                  precioNoTocado++
                }
              }
            }
          }
        }

        // ── 4. Atributos personalizados (campos_extra_producto_v2) ──
        if (productoId && Array.isArray(p.attrs) && p.attrs.length > 0) {
          // Upsert por (producto_compra_id, campo): borramos los que vamos a re-insertar
          const campos = p.attrs.map((a: { campo: string }) => a.campo)
          await supabase.from('campos_extra_producto_v2')
            .delete()
            .eq('producto_compra_id', productoId)
            .in('campo', campos)
          await supabase.from('campos_extra_producto_v2').insert(
            p.attrs.map((a: { campo: string; valor: string }) => ({
              producto_compra_id: productoId,
              campo: a.campo,
              valor: a.valor,
            })),
          )
        }
      } catch (e: any) {
        errores.push({ row: idx_csv, motivo: e?.message ?? 'error desconocido' })
      }
      setImportProgress({ done: i + 1, total: filasValidas.length })
    }

    // Mensaje resumen extendido
    const msgs: string[] = []
    if (precioCreado > 0) msgs.push(`${precioCreado} precio${precioCreado === 1 ? '' : 's'} de proveedor creado${precioCreado === 1 ? '' : 's'}`)
    if (precioActualizado > 0) msgs.push(`${precioActualizado} actualizado${precioActualizado === 1 ? '' : 's'}`)
    if (precioNoTocado > 0) msgs.push(`${precioNoTocado} sin tocar`)

    // Guardar mapping para futuras importaciones
    const mappingToSave = { ...columnMapping }
    if (savedMapping?.id) {
      await supabase
        .from('config_importaciones_v2')
        .update({ mapping: mappingToSave, updated_at: new Date().toISOString() })
        .eq('id', savedMapping.id)
    } else {
      await supabase
        .from('config_importaciones_v2')
        .insert({ tipo: 'productos_compra', mapping: mappingToSave })
    }

    setImportResult({ creados, actualizados, errores: errores.length, mensaje: msgs.join(' · ') })
    setErrorRows(errores)
    setImporting(false)
    setStep('done')
  }

  function resetAll() {
    setStep('select')
    setFile(null)
    setParsedData([])
    setCsvColumns([])
    setColumnMapping({})
    setImportResult(null)
    setErrorRows([])
    setParseError(null)
    setImportProgress({ done: 0, total: 0 })
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3">
          <Upload className="h-7 w-7 text-emerald-500" />
          <h1 className="text-2xl font-bold">Carga de Productos</h1>
        </div>
        {step === 'select' && (
          <Button variant="outline" onClick={descargarPlantilla}>
            <Download size={14} className="mr-1.5" />
            Descargar plantilla CSV
          </Button>
        )}
      </div>

      {/* Step 1: select */}
      {step === 'select' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Seleccionar archivo CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              className={`flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 transition-colors duration-200 cursor-pointer
                ${dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-gray-50/50 hover:border-emerald-400 hover:bg-emerald-50/50'}`}
              onClick={() => document.getElementById('csv-prods-input')?.click()}
            >
              <FileUp className={`h-12 w-12 ${dragOver ? 'text-emerald-500' : 'text-gray-400'}`} />
              <div className="text-center">
                <p className="text-base font-medium text-gray-700">Arrastra tu archivo CSV aquí</p>
                <p className="mt-1 text-sm text-gray-500">o haz click para seleccionar uno</p>
              </div>
              <input id="csv-prods-input" type="file" accept=".csv" onChange={onFileInput} className="hidden" />
            </div>

            {parseError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4" />
                {parseError}
              </div>
            )}

            <div className="mt-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
              <p className="font-medium mb-2">¿Primera vez? Empieza por la plantilla:</p>
              <p className="mb-2">
                Pulsa <strong>"Descargar plantilla CSV"</strong> arriba a la derecha. Te bajas un archivo
                con las cabeceras correctas y una fila de ejemplo. Lo rellenas en Excel/LibreOffice
                y lo subes aquí.
              </p>
              <p className="font-medium mt-3 mb-1">Columnas que se reconocen automáticamente:</p>
              <p>
                nombre, código proveedor, código interno, proveedor, precio (del paquete),
                IVA, unidad de medida, cantidad mínima, stock mínimo, día pedido, día entrega.
              </p>
              <p className="mt-2">
                <strong>Nombre</strong> es obligatorio. Si tu CSV tiene cabeceras distintas, en el siguiente
                paso podrás mapearlas manualmente. La app guarda tu configuración para futuras importaciones.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: preview + mapping */}
      {step === 'preview' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Mapeo de columnas</span>
                <Button variant="outline" size="sm" onClick={resetAll}><X size={14} /> Cambiar archivo</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Archivo: <strong>{file?.name}</strong> — {parsedData.length} filas detectadas.
                Asocia cada columna del CSV al campo correspondiente.
              </p>

              <div className="grid grid-cols-1 gap-3">
                {csvColumns.map((col) => (
                  <div key={col} className="grid grid-cols-2 gap-3 items-center">
                    <div className="text-sm">
                      <span className="font-medium">{col}</span>
                      <div className="text-xs text-muted-foreground truncate max-w-xs">
                        Ej: {parsedData.slice(0, 1).map((r) => r[col]).join('') || '(vacío)'}
                      </div>
                    </div>
                    <select
                      value={columnMapping[col] || ''}
                      onChange={(e) => updateMapping(col, e.target.value as ExpectedField | typeof ATTR_EXTRA | '')}
                      className="px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[260px]"
                    >
                      <option value="">— Ignorar esta columna —</option>
                      {(['Producto','Formato','Proveedor','Precio'] as const).map((grp) => (
                        <optgroup key={grp} label={grp}>
                          {EXPECTED_FIELDS.filter((f) => FIELD_GROUPS[f] === grp).map((f) => (
                            <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                          ))}
                        </optgroup>
                      ))}
                      <option value={ATTR_EXTRA}>★ Guardar como atributo personalizado</option>
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={actualizarProducto}
                    onChange={(e) => setActualizarProducto(e.target.checked)}
                    className="rounded"
                  />
                  Si el producto ya existe (match por <strong>código interno</strong> o nombre),{' '}
                  <strong>actualizar sus datos básicos</strong>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={actualizarPrecioExistente}
                    onChange={(e) => setActualizarPrecioExistente(e.target.checked)}
                    className="rounded"
                  />
                  Si el (producto, proveedor) <strong>ya tiene precio activo</strong>, <strong>sobrescribirlo</strong>
                  <span className="text-xs text-muted-foreground">(se preserva el histórico)</span>
                </label>
              </div>

              {getUnmappedRequired().length > 0 && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  Faltan campos obligatorios: <strong>{getUnmappedRequired().map((f) => FIELD_LABELS[f]).join(', ')}</strong>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={resetAll}>Cancelar</Button>
                <Button onClick={handleImport} disabled={getUnmappedRequired().length > 0}>
                  <Upload size={16} /> Importar {parsedData.length} productos
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vista previa (primeras 5 filas)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      {csvColumns.map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                          {col}
                          {columnMapping[col] && <span className="block text-[10px] font-normal text-emerald-700 mt-0.5">→ {FIELD_LABELS[columnMapping[col] as string] ?? columnMapping[col]}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b">
                        {csvColumns.map((col) => (
                          <td key={col} className="px-3 py-2 whitespace-nowrap">{row[col]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Step 3: importing */}
      {step === 'importing' && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Upload className="h-10 w-10 text-emerald-500 animate-pulse" />
            <p className="text-lg font-medium">Importando productos…</p>
            <p className="text-sm text-muted-foreground">{importProgress.done} de {importProgress.total}</p>
            <div className="w-full max-w-md bg-gray-200 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{ width: importProgress.total > 0 ? `${(importProgress.done / importProgress.total) * 100}%` : '0%' }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: done */}
      {step === 'done' && importResult && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
            <div>
              <h2 className="text-xl font-bold">Importación completada</h2>
              <p className="text-sm text-muted-foreground mt-2">
                <strong className="text-emerald-700">{importResult.creados}</strong> productos creados,{' '}
                <strong className="text-blue-700">{importResult.actualizados}</strong> actualizados,{' '}
                <strong className={importResult.errores > 0 ? 'text-red-700' : 'text-muted-foreground'}>{importResult.errores}</strong> errores
              </p>
            </div>

            {errorRows.length > 0 && (
              <div className="w-full max-w-2xl mt-4 text-left rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="font-medium text-amber-900 mb-2 text-sm">
                  Filas con errores ({errorRows.length}):
                </p>
                <ul className="text-xs text-amber-900 space-y-1 max-h-48 overflow-y-auto">
                  {errorRows.slice(0, 30).map((er, i) => (
                    <li key={i}>Fila {er.row}: {er.motivo}</li>
                  ))}
                  {errorRows.length > 30 && (
                    <li className="italic">… y {errorRows.length - 30} más.</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={resetAll}>Importar otro archivo</Button>
              <Button onClick={() => window.location.href = '/productos-compra'}>Ver productos</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
