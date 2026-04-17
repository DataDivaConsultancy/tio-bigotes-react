import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, FileUp, CheckCircle, AlertTriangle, X } from 'lucide-react'
import Papa from 'papaparse'
import { formatDate, formatNumber } from '@/lib/utils'

const EXPECTED_FIELDS = [
  'fecha',
  'local',
  'producto',
  'cantidad',
  'precio_unitario',
  'importe_total',
] as const

type ExpectedField = (typeof EXPECTED_FIELDS)[number]

interface ColumnMapping {
  [csvColumn: string]: ExpectedField | ''
}

interface ImportHistoryEntry {
  fecha: string
  row_count: number
}

interface SavedMappingConfig {
  id: number
  mapping: ColumnMapping
}

type ImportStep = 'select' | 'preview' | 'mapping' | 'importing' | 'done'

export default function CargaVentas() {
  const [step, setStep] = useState<ImportStep>('select')
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<Record<string, string>[]>([])
  const [csvColumns, setCsvColumns] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({})
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null)
  const [errorRows, setErrorRows] = useState<number[]>([])
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([])
  const [savedMapping, setSavedMapping] = useState<SavedMappingConfig | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  // Load saved mapping config and import history on mount
  useEffect(() => {
    loadSavedMapping()
    loadImportHistory()
  }, [])

  async function loadSavedMapping() {
    const { data } = await supabase
      .from('config_importaciones_v2')
      .select('*')
      .eq('tipo', 'ventas')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (data?.mapping) {
      setSavedMapping({ id: data.id, mapping: data.mapping })
    }
  }

  async function loadImportHistory() {
    const { data } = await supabase
      .from('ventas_raw_v2')
      .select('fecha')
      .order('created_at', { ascending: false })
      .limit(500)

    if (data && data.length > 0) {
      const grouped = data.reduce<Record<string, number>>((acc, row) => {
        const key = row.fecha ?? 'sin_fecha'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

      const history: ImportHistoryEntry[] = Object.entries(grouped)
        .map(([fecha, row_count]) => ({ fecha, row_count }))
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, 5)

      setImportHistory(history)
    }
  }

  // --- File handling ---

  const handleFile = useCallback((selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setParseError('Solo se aceptan archivos .csv')
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

        // Auto-map columns
        const mapping: ColumnMapping = {}
        columns.forEach((col) => {
          const normalized = col.toLowerCase().trim()
          const match = EXPECTED_FIELDS.find((f) => f === normalized)
          mapping[col] = match || ''
        })

        // Apply saved mapping if available
        if (savedMapping?.mapping) {
          const saved = savedMapping.mapping
          columns.forEach((col) => {
            if (saved[col]) {
              mapping[col] = saved[col]
            }
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

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) handleFile(droppedFile)
    },
    [handleFile]
  )

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0]
      if (selectedFile) handleFile(selectedFile)
    },
    [handleFile]
  )

  // --- Column mapping ---

  function updateMapping(csvCol: string, targetField: ExpectedField | '') {
    setColumnMapping((prev) => ({ ...prev, [csvCol]: targetField }))
  }

  function getMappedFields(): ExpectedField[] {
    return Object.values(columnMapping).filter((v): v is ExpectedField => v !== '')
  }

  function getUnmappedRequired(): ExpectedField[] {
    const mapped = getMappedFields()
    return EXPECTED_FIELDS.filter((f) => !mapped.includes(f))
  }

  // --- Validation ---

  function validateRows(): { valid: Record<string, string>[]; errorIndices: number[] } {
    const requiredFields: ExpectedField[] = ['fecha', 'producto', 'cantidad']
    const reverseMap: Record<string, string> = {}
    Object.entries(columnMapping).forEach(([csvCol, field]) => {
      if (field) reverseMap[field] = csvCol
    })

    const valid: Record<string, string>[] = []
    const errorIndices: number[] = []

    parsedData.forEach((row, idx) => {
      const hasRequired = requiredFields.every((f) => {
        const csvCol = reverseMap[f]
        return csvCol && row[csvCol]?.toString().trim()
      })
      if (hasRequired) {
        valid.push(row)
      } else {
        errorIndices.push(idx + 1) // 1-based for display
      }
    })

    return { valid, errorIndices }
  }

  // --- Import ---

  async function handleImport() {
    setStep('importing')
    setImporting(true)
    setImportResult(null)

    const reverseMap: Record<string, string> = {}
    Object.entries(columnMapping).forEach(([csvCol, field]) => {
      if (field) reverseMap[field] = csvCol
    })

    const { valid, errorIndices } = validateRows()
    setErrorRows(errorIndices)

    const mappedRows = valid.map((row) => {
      const mapped: Record<string, string | number | null> = {}
      EXPECTED_FIELDS.forEach((field) => {
        const csvCol = reverseMap[field]
        if (csvCol) {
          const val = row[csvCol]?.toString().trim() ?? ''
          if (field === 'cantidad' || field === 'precio_unitario' || field === 'importe_total') {
            const num = parseFloat(val.replace(',', '.'))
            mapped[field] = isNaN(num) ? null : num
          } else {
            mapped[field] = val || null
          }
        } else {
          mapped[field] = null
        }
      })
      return mapped
    })

    const total = mappedRows.length
    setImportProgress({ done: 0, total })

    const BATCH_SIZE = 200
    let successCount = 0
    let errorCount = errorIndices.length

    for (let i = 0; i < mappedRows.length; i += BATCH_SIZE) {
      const batch = mappedRows.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('ventas_raw_v2').insert(batch)

      if (error) {
        errorCount += batch.length
      } else {
        successCount += batch.length
      }
      setImportProgress({ done: Math.min(i + BATCH_SIZE, total), total })
    }

    // Save mapping config for future use
    const mappingToSave = { ...columnMapping }
    if (savedMapping?.id) {
      await supabase
        .from('config_importaciones_v2')
        .update({ mapping: mappingToSave, updated_at: new Date().toISOString() })
        .eq('id', savedMapping.id)
    } else {
      await supabase
        .from('config_importaciones_v2')
        .insert({ tipo: 'ventas', mapping: mappingToSave })
    }

    setImportResult({ success: successCount, errors: errorCount })
    setImporting(false)
    setStep('done')
    loadImportHistory()
  }

  // --- Reset ---

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

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Upload className="h-7 w-7 text-blue-500" />
        <h1 className="text-2xl font-bold">Carga de Ventas</h1>
      </div>

      {/* Step 1: File selector */}
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
              className={`
                flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12
                transition-colors duration-200 cursor-pointer
                ${dragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                  : 'border-gray-300 bg-gray-50/50 hover:border-blue-400 hover:bg-blue-50/50 dark:border-gray-600 dark:bg-gray-800/30 dark:hover:border-blue-500 dark:hover:bg-blue-950/10'
                }
              `}
              onClick={() => document.getElementById('csv-file-input')?.click()}
            >
              <FileUp className={`h-12 w-12 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
              <div className="text-center">
                <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                  Arrastrá tu archivo CSV aquí
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  o hacé click para seleccionar
                </p>
              </div>
              <Input
                id="csv-file-input"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={onFileInput}
              />
            </div>
            {parseError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {parseError}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Vista previa — {file?.name}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={resetAll}>
                <X className="mr-1 h-4 w-4" /> Cancelar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Total de filas: <span className="font-semibold">{formatNumber(parsedData.length, 0)}</span>
            </p>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-gray-800">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    {csvColumns.map((col) => (
                      <th key={col} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedData.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      {csvColumns.map((col) => (
                        <td key={col} className="px-3 py-2 whitespace-nowrap">
                          {row[col] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedData.length > 10 && (
              <p className="text-xs text-gray-400">
                Mostrando 10 de {formatNumber(parsedData.length, 0)} filas
              </p>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setStep('mapping')}>
                Continuar a mapeo de columnas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Column mapping */}
      {step === 'mapping' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Mapeo de columnas</CardTitle>
              <Button variant="ghost" size="sm" onClick={resetAll}>
                <X className="mr-1 h-4 w-4" /> Cancelar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Asigná cada columna del CSV al campo correspondiente de ventas.
            </p>

            <div className="space-y-3">
              {csvColumns.map((col) => (
                <div key={col} className="flex items-center gap-4">
                  <span className="w-48 truncate text-sm font-medium" title={col}>
                    {col}
                  </span>
                  <span className="text-gray-400">→</span>
                  <select
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
                    value={columnMapping[col] || ''}
                    onChange={(e) => updateMapping(col, e.target.value as ExpectedField | '')}
                  >
                    <option value="">— No importar —</option>
                    {EXPECTED_FIELDS.map((field) => {
                      const alreadyMapped = Object.entries(columnMapping).some(
                        ([k, v]) => v === field && k !== col
                      )
                      return (
                        <option key={field} value={field} disabled={alreadyMapped}>
                          {field} {alreadyMapped ? '(ya asignado)' : ''}
                        </option>
                      )
                    })}
                  </select>
                  {columnMapping[col] && (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                </div>
              ))}
            </div>

            {getUnmappedRequired().length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-medium">Campos sin asignar:</p>
                  <p>{getUnmappedRequired().join(', ')}</p>
                </div>
              </div>
            )}

            {/* Validation preview */}
            {(() => {
              const { errorIndices } = validateRows()
              return errorIndices.length > 0 ? (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    <span className="font-medium">{errorIndices.length} filas con errores</span>{' '}
                    (campos requeridos vacíos: fecha, producto, cantidad). Estas filas no se importarán.
                  </p>
                </div>
              ) : null
            })()}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('preview')}>
                Volver
              </Button>
              <Button onClick={handleImport} disabled={getMappedFields().length === 0}>
                Importar {formatNumber(parsedData.length, 0)} filas
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Importing / Progress */}
      {step === 'importing' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Importando datos...</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Progreso</span>
                <span>{formatNumber(importProgress.done, 0)} / {formatNumber(importProgress.total, 0)}</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{
                    width: importProgress.total > 0
                      ? `${(importProgress.done / importProgress.total) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
            <p className="text-center text-sm text-gray-500">
              No cierres esta ventana mientras se importan los datos...
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Done */}
      {step === 'done' && importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Importación completada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-green-50 p-4 text-center dark:bg-green-950/30">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {formatNumber(importResult.success, 0)}
                </p>
                <p className="text-sm text-green-600 dark:text-green-500">Filas importadas</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4 text-center dark:bg-red-950/30">
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {formatNumber(importResult.errors, 0)}
                </p>
                <p className="text-sm text-red-600 dark:text-red-500">Filas con errores</p>
              </div>
            </div>

            {errorRows.length > 0 && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
                <p className="font-medium">Filas omitidas (campos requeridos vacíos):</p>
                <p className="mt-1">
                  Filas: {errorRows.slice(0, 20).join(', ')}
                  {errorRows.length > 20 && ` y ${errorRows.length - 20} más`}
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={resetAll}>
                <Upload className="mr-2 h-4 w-4" />
                Nueva importación
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import history */}
      {importHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Importaciones recientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 dark:bg-gray-800">
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Filas</th>
                  </tr>
                </thead>
                <tbody>
                  {importHistory.map((entry) => (
                    <tr key={entry.fecha} className="border-b last:border-b-0">
                      <td className="px-4 py-2">{formatDate(entry.fecha)}</td>
                      <td className="px-4 py-2 text-right">{formatNumber(entry.row_count, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
