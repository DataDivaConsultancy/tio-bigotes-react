import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, FileUp, CheckCircle, AlertTriangle, X } from 'lucide-react'
import Papa from 'papaparse'

const EXPECTED_FIELDS = [
  'nombre',
  'cod_proveedor',
  'cod_interno',
  'proveedor',
  'precio',
  'tipo_iva',
  'unidad_medida',
  'unidad_minima_compra',
  'stock_minimo',
  'dia_pedido',
  'dia_entrega',
] as const

const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre del producto *',
  cod_proveedor: 'Código del proveedor',
  cod_interno: 'Código interno',
  proveedor: 'Proveedor (nombre comercial)',
  precio: 'Precio (€)',
  tipo_iva: 'Tipo IVA',
  unidad_medida: 'Unidad de medida',
  unidad_minima_compra: 'Cantidad mínima compra',
  stock_minimo: 'Stock mínimo',
  dia_pedido: 'Día de pedido',
  dia_entrega: 'Día de entrega',
}

const NUMERIC_FIELDS = ['precio', 'unidad_minima_compra', 'stock_minimo']
const REQUIRED_FIELDS = ['nombre']

const IVA_OPTIONS_DB = ['General 21%', 'Reducido 10%', 'Superreducido 4%', 'Exento 0%']

type ExpectedField = (typeof EXPECTED_FIELDS)[number]

interface ColumnMapping {
  [csvColumn: string]: ExpectedField | ''
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
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [actualizar, setActualizar] = useState(true)  // ¿actualizar productos existentes (por nombre) o solo crear?

  useEffect(() => {
    loadSavedMapping()
    loadProveedores()
  }, [])

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

  function updateMapping(csvCol: string, targetField: ExpectedField | '') {
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

      filasValidas.push({
        idx_csv: idx + 2,
        nombre,
        cod_proveedor: get('cod_proveedor') || null,
        cod_interno: get('cod_interno') || null,
        proveedor_id,
        precio: parseNum(get('precio')),
        tipo_iva: normalizarTipoIva(get('tipo_iva')),
        unidad_medida: normalizarUnidadMedida(get('unidad_medida')),
        unidad_minima_compra: parseNum(get('unidad_minima_compra')),
        stock_minimo: parseNum(get('stock_minimo')) ?? 0,
        dia_pedido: get('dia_pedido') || null,
        dia_entrega: get('dia_entrega') || null,
        activo: true,
      })
    })

    setImportProgress({ done: 0, total: filasValidas.length })
    let creados = 0
    let actualizados = 0

    // Procesar fila a fila para hacer upsert por nombre+proveedor
    for (let i = 0; i < filasValidas.length; i++) {
      const f = filasValidas[i]
      const { idx_csv, ...payload } = f

      try {
        // Buscar si existe (por nombre + proveedor)
        let existsId: number | null = null
        if (actualizar) {
          let q = supabase.from('productos_compra_v2').select('id').eq('nombre', payload.nombre).limit(1)
          if (payload.proveedor_id !== null) q = q.eq('proveedor_id', payload.proveedor_id)
          const { data: foundData } = await q
          if (foundData && foundData.length > 0) existsId = foundData[0].id
        }

        if (existsId) {
          // UPDATE
          const { error: updErr } = await supabase
            .from('productos_compra_v2')
            .update(payload)
            .eq('id', existsId)
          if (updErr) errores.push({ row: idx_csv, motivo: updErr.message })
          else actualizados++
        } else {
          // INSERT
          const { error: insErr } = await supabase.from('productos_compra_v2').insert(payload)
          if (insErr) errores.push({ row: idx_csv, motivo: insErr.message })
          else creados++
        }
      } catch (e: any) {
        errores.push({ row: idx_csv, motivo: e?.message ?? 'error desconocido' })
      }

      setImportProgress({ done: i + 1, total: filasValidas.length })
    }

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

    setImportResult({ creados, actualizados, errores: errores.length })
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
      <div className="flex items-center gap-3">
        <Upload className="h-7 w-7 text-emerald-500" />
        <h1 className="text-2xl font-bold">Carga de Productos</h1>
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

            <div className="mt-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-medium mb-2">Columnas que se reconocen automáticamente:</p>
              <p className="text-blue-800">
                nombre, código proveedor, código interno, proveedor, precio, IVA, unidad de medida,
                cantidad mínima, stock mínimo, día pedido, día entrega.
              </p>
              <p className="mt-2 text-blue-800">
                <strong>Nombre</strong> es obligatorio. Si tu archivo tiene la columna <em>proveedor</em> con el
                nombre comercial, lo enlazo automáticamente. Los otros campos se pueden mapear manualmente
                en el siguiente paso.
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
                      onChange={(e) => updateMapping(col, e.target.value as ExpectedField | '')}
                      className="px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">— Ignorar esta columna —</option>
                      {EXPECTED_FIELDS.map((f) => (
                        <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={actualizar}
                    onChange={(e) => setActualizar(e.target.checked)}
                    className="rounded"
                  />
                  Si el producto ya existe (mismo nombre + proveedor), <strong>actualizarlo</strong>
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
