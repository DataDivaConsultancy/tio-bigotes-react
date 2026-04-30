import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Save, ArrowLeft, Plus, Trash2, GripVertical, AlertTriangle,
  BookOpen, ChevronDown, ChevronUp
} from 'lucide-react'

/* âââ Types âââ */

interface Linea {
  key: string // client-side key for React
  componente_producto_id: number | null
  componente_escandallo_id: number | null
  cantidad_bruta: number
  unidad: string
  merma_pct: number
  coste_override: number | null
  notas: string
  orden: number
  // display helpers (resolved from lookups)
  componente_nombre?: string
  coste_unitario?: number // resolved cost
}

interface Cabecera {
  producto_id: number | null
  nombre: string
  descripcion: string
  unidad_resultado: string
  cantidad_resultado: number
  es_subreceta: boolean
  notas: string
}

interface ProductoOption {
  id: number
  nombre: string
  tipo: string
  precio_compra: number | null
}

interface SubrecetaOption {
  id: number
  nombre: string
  coste_por_unidad: number
  unidad_resultado: string
  cantidad_resultado: number
}

interface UnidadOption {
  codigo: string
  nombre: string
  tipo: string
}

const emptyLinea = (): Linea => ({
  key: crypto.randomUUID(),
  componente_producto_id: null,
  componente_escandallo_id: null,
  cantidad_bruta: 0,
  unidad: 'ud',
  merma_pct: 0,
  coste_override: null,
  notas: '',
  orden: 0,
})

const emptyCabecera: Cabecera = {
  producto_id: null,
  nombre: '',
  descripcion: '',
  unidad_resultado: 'ud',
  cantidad_resultado: 1,
  es_subreceta: false,
  notas: '',
}

export default function EditorEscandallo() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'nuevo'

  const [cabecera, setCabecera] = useState<Cabecera>({ ...emptyCabecera })
  const [lineas, setLineas] = useState<Linea[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Lookup data
  const [productosVenta, setProductosVenta] = useState<ProductoOption[]>([])
  const [productosCompra, setProductosCompra] = useState<ProductoOption[]>([])
  const [subrecetas, setSubrecetas] = useState<SubrecetaOption[]>([])
  const [unidades, setUnidades] = useState<UnidadOption[]>([])

  // Component selector state
  const [selectorOpen, setSelectorOpen] = useState<number | null>(null)
  const [selectorSearch, setSelectorSearch] = useState('')

  /* âââ Load lookup data âââ */

  useEffect(() => {
    Promise.all([
      supabase.from('productos_v2').select('id, nombre, tipo, precio_compra')
        .in('tipo', ['venta', 'ambos']).eq('activo', true).order('nombre'),
      supabase.from('productos_v2').select('id, nombre, tipo, precio_compra')
        .in('tipo', ['compra', 'ambos']).eq('activo', true).order('nombre'),
      supabase.from('vw_escandallo_resumen').select('escandallo_id, nombre, coste_por_unidad, unidad_resultado, cantidad_resultado')
        .eq('es_subreceta', true),
      supabase.from('unidades_medida').select('codigo, nombre, tipo').order('codigo'),
    ]).then(([pvRes, pcRes, srRes, uRes]) => {
      if (pvRes.data) setProductosVenta(pvRes.data)
      if (pcRes.data) setProductosCompra(pcRes.data)
      if (srRes.data) setSubrecetas(srRes.data.map((s: any) => ({
        id: s.escandallo_id,
        nombre: s.nombre,
        coste_por_unidad: s.coste_por_unidad || 0,
        unidad_resultado: s.unidad_resultado,
        cantidad_resultado: s.cantidad_resultado,
      })))
      if (uRes.data) setUnidades(uRes.data)
    })
  }, [])

  /* âââ Load existing escandallo âââ */

  useEffect(() => {
    if (isNew) return
    loadEscandallo()
  }, [id])

  async function loadEscandallo() {
    setLoading(true)
    // Load header
    const { data: esc, error: errEsc } = await supabase
      .from('escandallos')
      .select('*')
      .eq('id', Number(id))
      .single()

    if (errEsc || !esc) {
      setError('No se encontrÃ³ el escandallo')
      setLoading(false)
      return
    }

    setCabecera({
      producto_id: esc.producto_id,
      nombre: esc.nombre,
      descripcion: esc.descripcion || '',
      unidad_resultado: esc.unidad_resultado,
      cantidad_resultado: esc.cantidad_resultado,
      es_subreceta: esc.es_subreceta,
      notas: esc.notas || '',
    })

    // Load lines with component names
    const { data: lineasData } = await supabase
      .from('escandallo_lineas')
      .select(`
        id, escandallo_id, orden,
        componente_producto_id, componente_escandallo_id,
        cantidad_bruta, unidad, merma_pct, coste_override, notas
      `)
      .eq('escandallo_id', Number(id))
      .order('orden')

    if (lineasData) {
      setLineas(lineasData.map(l => ({
        key: crypto.randomUUID(),
        componente_producto_id: l.componente_producto_id,
        componente_escandallo_id: l.componente_escandallo_id,
        cantidad_bruta: Number(l.cantidad_bruta),
        unidad: l.unidad,
        merma_pct: Number(l.merma_pct),
        coste_override: l.coste_override ? Number(l.coste_override) : null,
        notas: l.notas || '',
        orden: l.orden,
      })))
    }
    setLoading(false)
  }

  /* âââ Resolve component names & costs âââ */

  const resolveComponente = useCallback((linea: Linea) => {
    if (linea.componente_producto_id) {
      const p = productosCompra.find(x => x.id === linea.componente_producto_id)
      return {
        nombre: p?.nombre || `Producto #${linea.componente_producto_id}`,
        coste: linea.coste_override ?? (p?.precio_compra || 0),
      }
    }
    if (linea.componente_escandallo_id) {
      const s = subrecetas.find(x => x.id === linea.componente_escandallo_id)
      return {
        nombre: s ? `SUB: ${s.nombre}` : `Sub-receta #${linea.componente_escandallo_id}`,
        coste: linea.coste_override ?? (s?.coste_por_unidad || 0),
      }
    }
    return { nombre: '\u2014 Seleccionar \u2014', coste: 0 }
  }, [productosCompra, subrecetas])

  /* âââ Cost calculations âââ */

  const calcCosteLinea = (linea: Linea) => {
    const { coste } = resolveComponente(linea)
    return linea.cantidad_bruta * coste
  }

  const costeTotal = lineas.reduce((sum, l) => sum + calcCosteLinea(l), 0)
  const costePorUnidad = cabecera.cantidad_resultado > 0
    ? costeTotal / cabecera.cantidad_resultado : 0

  /* âââ Line operations âââ */

  function addLinea() {
    const newLinea = emptyLinea()
    newLinea.orden = lineas.length
    setLineas([...lineas, newLinea])
  }

  function removeLinea(key: string) {
    setLineas(lineas.filter(l => l.key !== key).map((l, i) => ({ ...l, orden: i })))
  }

  function updateLinea(key: string, updates: Partial<Linea>) {
    setLineas(lineas.map(l => l.key === key ? { ...l, ...updates } : l))
  }

  function moveLinea(key: string, direction: 'up' | 'down') {
    const idx = lineas.findIndex(l => l.key === key)
    if (idx < 0) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= lineas.length) return
    const newLineas = [...lineas]
    ;[newLineas[idx], newLineas[newIdx]] = [newLineas[newIdx], newLineas[idx]]
    setLineas(newLineas.map((l, i) => ({ ...l, orden: i })))
  }

  function selectComponente(key: string, tipo: 'producto' | 'subreceta', componenteId: number) {
    if (tipo === 'producto') {
      const p = productosCompra.find(x => x.id === componenteId)
      updateLinea(key, {
        componente_producto_id: componenteId,
        componente_escandallo_id: null,
        unidad: 'kg', // default
      })
    } else {
      const s = subrecetas.find(x => x.id === componenteId)
      updateLinea(key, {
        componente_producto_id: null,
        componente_escandallo_id: componenteId,
        unidad: s?.unidad_resultado || 'ud',
      })
    }
    setSelectorOpen(null)
    setSelectorSearch('')
  }
]\BY
[X\Ë[ÝOOH
HÂÙ]\Ü	ÐpìXYH[Y[ÜÈ[H0ë[XIÊB]\BËÈ[Y]H[[\È]HHÛÛ\Û[ÛÛÝ[ÛÛ\]\ÈH[X\Ë[\O[ÛÛ\Û[WÜÙXÝ×ÚY	[ÛÛ\Û[WÙ\ØØ[[×ÚY
BY
[ÛÛ\]\Ë[Ý
HÂÙ]\Ü	Ò^H0ë[X\ÈÚ[ÛÛ\Û[HÙ[XØÚ[ÛYÉÊB]\BÙ]Ø][ÊYJBÙ]\Ü	ÉÊBËÈÚXÚÈÜÞXÛ\ÈY[H[HY\[Ù\ÈHÝX\XÚ\BÛÛÝÝXXÙ]RYÈH[X\Â[\OÛÛ\Û[WÙ\ØØ[[×ÚY
BX\
OÛÛ\Û[WÙ\ØØ[[×ÚYJBY
ÝXXÙ]RYË[Ý	Z\Ó]ÊHÂÛÛÝÈ]NÚXÛÜÈHH]ØZ]Ý\X\ÙKÊ	Ü×Ù]XÝ\ØÚXÛÜ×Ù\ØØ[[ÉËÂÙ\ØØ[[×ÚY[X\Y
KJBY
ÚXÛÜÈ	\^K\Ð\^JÚXÛÜÊH	ÚXÛÜË[Ý
HÂÙ]\ÜÚXÛÈ]XÝYÎ	ØÚXÛÜËX\

Î[JHOË]ËÚ[	È8¡¤	ÊJKÚ[	Ë	Ê_X
BÙ]Ø][Ê[ÙJB]\BBÛÛÝÛÛ[X\ÈH[X\ËX\
O
ÂÛÛ\Û[WÜÙXÝ×ÚYÛÛ\Û[WÜÙXÝ×ÚYÛÛ\Û[WÙ\ØØ[[×ÚYÛÛ\Û[WÙ\ØØ[[×ÚYØ[YYØ]NØ[YYØ]K[YY[YYY\XWÜÝY\XWÜÝÛÜÝWÛÝ\YNÛÜÝWÛÝ\YKÝ\ÎÝ\È[Ü[Ü[JJBY
\Ó]ÊHÂËÈÜX]H]ÂÛÛÝÈ]K\Ü\HH]ØZ]Ý\X\ÙKÊ	Ü×ØÜX\Ù\ØØ[[ÉËÂÜÙXÝ×ÚYØXXÙ\KÙXÝ×ÚYÛÛXNØXXÙ\KÛXK[J
KÙ\ØÜ\Ú[ÛØXXÙ\K\ØÜ\Ú[Û[Ý[YYÜ\Ý[YÎØXXÙ\K[YYÜ\Ý[YËØØ[YYÜ\Ý[YÎØXXÙ\KØ[YYÜ\Ý[YËÙ\×ÜÝXXÙ]NØXXÙ\K\×ÜÝXXÙ]KÛ[X\ÎÛÛ[X\ËJBY
\HÈÙ]\Ü\Y\ÜØYÙJNÈÙ]Ø][Ê[ÙJNÈ]\BY
]OËY
H]YØ]JÙ\ØØ[[ÜËÉÙ]KYXÈ\XÙNYHJB[ÙH]YØ]J	ËÙ\ØØ[[ÜÉÊBH[ÙHÂËÈ\]N[]HÛ[\Ë\]HXY\KZ[Ù\[\ÂÛÛÝ\ØÒYH[X\Y
BËÈ\]HXY\ÛÛÝÈ\Ü\XYHH]ØZ]Ý\X\ÙBÛJ	Ù\ØØ[[ÜÉÊB\]JÂÙXÝ×ÚYØXXÙ\KÙXÝ×ÚYÛXNØXXÙ\KÛXK[J
K\ØÜ\Ú[ÛØXXÙ\K\ØÜ\Ú[Û[[YYÜ\Ý[YÎØXXÙ\K[YYÜ\Ý[YËØ[YYÜ\Ý[YÎØXXÙ\KØ[YYÜ\Ý[YË\×ÜÝXXÙ]NØXXÙ\K\×ÜÝXXÙ]KÝ\ÎØXXÙ\KÝ\È[JB\J	ÚY	Ë\ØÒY
BY
\XY
HÈÙ]\Ü\XYY\ÜØYÙJNÈÙ]Ø][Ê[ÙJNÈ]\BËÈ[]HÛ[\È[[Ù\]ÈÛ\ÂÛÛÝÈ\Ü\[HH]ØZ]Ý\X\ÙBÛJ	Ù\ØØ[[×Û[X\ÉÊB[]J
B\J	Ù\ØØ[[×ÚY	Ë\ØÒY
BY
\[
HÈÙ]\Ü\[Y\ÜØYÙJNÈÙ]Ø][Ê[ÙJNÈ]\BY
ÛÛ[X\Ë[Ý
HÂÛÛÝÈ\Ü\[ÈHH]ØZ]Ý\X\ÙBÛJ	Ù\ØØ[[×Û[X\ÉÊB[Ù\
ÛÛ[X\ËX\
O
È\ØØ[[×ÚY\ØÒYJJJBY
\[ÊHÈÙ]\Ü\[ËY\ÜØYÙJNÈÙ]Ø][Ê[ÙJNÈ]\BBËÈ[ØYÈÙ]\Ú]B]ØZ]ØY\ØØ[[Ê
BBÙ]Ø][Ê[ÙJBBÊ8¥ 8¥ 8¥ [\8¥ 8¥ 8¥ 
ÂY
ØY[ÊHÂ]\]Û\ÜÓ[YOHN^XÙ[\^[]]YYÜYÜÝ[Ø\Ø[ËÙ]BÛÛÝ[\YÛÛ\HHÙXÝÜÐÛÛ\K[\OÛXKÓÝÙ\Ø\ÙJ
K[ÛY\ÊÙ[XÝÜÙX\ÚÓÝÙ\Ø\ÙJ
JB
BÛÛÝ[\YÝXXÙ]\ÈHÝXXÙ]\Ë[\ÈOËÛXKÓÝÙ\Ø\ÙJ
K[ÛY\ÊÙ[XÝÜÙX\ÚÓÝÙ\Ø\ÙJ
JB
K[\ÈO\Ó]ÈËYOOH[X\Y
JHËÈ^ÛYHÙ[]\
]Û\ÜÓ[YOHÜXÙK^KMËÊXY\\
ßB]Û\ÜÓ[YOH^][\ËXÙ[\\ÝYKX]ÙY[]Û\ÜÓ[YOH^][\ËXÙ[\Ø\LÈ]Û\X[HÚÜÝÚ^OHÛHÛÛXÚÏ^Ê
HO]YØ]J	ËÙ\ØØ[[ÜÉÊ_O\ÝÓYÚ^O^ÌMHÏÐ]Û]HÛ\ÜÓ[YOH^LÛXÛÚ\Ó]ÈÈ	ÓY]È\ØØ[[ÉÈØXXÙ\KÛX_BÚOÛ\ÜÓ[YOH^\ÛH^[]]YYÜYÜÝ[Ú\Ó]ÈÈ	ÑY[HHÛÛ\ÜÚXÚpìÛHÛÜÝH[ÙXÝÉÈ\ØØ[[ÈÉÚYXBÜÙ]Ù]]ÛÛÛXÚÏ^Ú[TØ]_H\ØXY^ÜØ][ßOØ]HÚ^O^ÌMHÛ\ÜÓ[YOH\LÏÜØ][ÈÈ	ÑÝX\[ËÈ	ÑÝX\\ßBÐ]ÛÙ]Ù\Ü	
]Û\ÜÓ[YOHLÈÝ[Y[ÈË\YMLÌL^\YML^\ÛH^][\ËXÙ[\Ø\L[\X[ÛHÚ^O^ÌMHÏÙ\ÜBÙ]
_B]Û\ÜÓ[YOHÜYÜYXÛÛËLHÎÜYXÛÛËLÈØ\MËÊYØXXÙ\H
È0ë[X\È
ÛÛÊH
ßB]Û\ÜÓ[YOHÎÛÛ\Ü[LÜXÙK^KMËÊØXXÙ\H
ßBØ\Ø\XY\Û\ÜÓ[YOHLÈØ\]HÛ\ÜÓ[YOH^X\ÙH]ÜÈÙ[\[\ÏÐØ\]OÐØ\XY\Ø\ÛÛ[Û\ÜÓ[YOHÜXÙK^KM]Û\ÜÓ[YOHÜYÜYXÛÛËLHYÜYXÛÛËLØ\M]X[Û\ÜÓ[YOH^\ÛHÛ[YY][HXLHØÚÈÛXH
ÛX[[][YO^ØØXXÙ\KÛX_BÛÚ[ÙO^ÙHOÙ]ØXXÙ\JÈØXXÙ\KÛXNK\Ù][YHJ_BXÙZÛ\HZ[\[YHHØ\HÝX]HÏÙ]]X[Û\ÜÓ[YOH^\ÛHÛ[YY][HXLHØÚÈÙXÝÈ[Ý[YÏÛX[Ù[XÝ[YO^ØØXXÙ\KÙXÝ×ÚYÏÈ	ÉßBÛÚ[ÙO^ÙHOÙ]ØXXÙ\JÂØXXÙ\KÙXÝ×ÚYK\Ù][YHÈ[X\K\Ù][YJH[J_BÛ\ÜÓ[YOHËY[NHÝ[Y[YÜ\ËXXÚÙÜÝ[LÈ^\ÛHÜ[Û[YOH¸ %Ú[[Ý[\
ÝX\XÙ]H\JH8 %ÛÜ[ÛÜÙXÝÜÕ[KX\
O
Ü[ÛÙ^O^ÜYH[YO^ÜYOÜÛX_OÛÜ[Û
J_BÜÙ[XÝÙ]Ù]]Û\ÜÓ[YOHÜYÜYXÛÛËLHYÜYXÛÛËLÈØ\M]X[Û\ÜÓ[YOH^\ÛHÛ[YY][HXLHØÚÈØ[YY\Ý[YÏÛX[[]\OH[X\Z[^Ì_BÝ\^Ì_B[YO^ØØXXÙ\KØ[YYÜ\Ý[YßBÛÚ[ÙO^ÙHOÙ]ØXXÙ\JÂØXXÙ\KØ[YYÜ\Ý[YÎ[X\K\Ù][YJHKJ_BÏÙ]]X[Û\ÜÓ[YOH^\ÛHÛ[YY][HXLHØÚÈ[YY\Ý[YÏÛX[Ù[XÝ[YO^ØØXXÙ\K[YYÜ\Ý[YßBÛÚ[ÙO^ÙHOÙ]ØXXÙ\JÈØXXÙ\K[YYÜ\Ý[YÎK\Ù][YHJ_BÛ\ÜÓ[YOHËY[NHÝ[Y[YÜ\ËXXÚÙÜÝ[LÈ^\ÛHÝ[YY\ËX\
HO
Ü[ÛÙ^O^ÝKÛÙYÛßH[YO^ÝKÛÙYÛßOÝKÛX_H
ÝKÛÙYÛßJOÛÜ[Û
J_BÜÙ[XÝÙ]]Û\ÜÓ[YOH^][\ËY[Ø\LX[Û\ÜÓ[YOH^][\ËXÙ[\Ø\LÝ\ÛÜ\Ú[\NH[]\OHÚXÚØÞÚXÚÙY^ØØXXÙ\K\×ÜÝXXÙ]_BÛÚ[ÙO^ÙHOÙ]ØXXÙ\JÈØXXÙ\K\×ÜÝXXÙ]NK\Ù]ÚXÚÙYJ_BÛ\ÜÓ[YOHÝ[YÏÜ[Û\ÜÓ[YOH^\ÛHÛ[YY][H\ÈÝX\XÙ]OÜÜ[ÛX[Ù]Ù]]X[Û\ÜÓ[YOH^\ÛHÛ[YY][HXLHØÚÈÝ\ÏÛX[^\XB[YO^ØØXXÙ\KÝ\ßBÛÚ[ÙO^ÙHOÙ]ØXXÙ\JÈØXXÙ\KÝ\ÎK\Ù][YHJ_BXÙZÛ\HÝ\È[\\ÈÛØHHXÙ]KÛ\ÜÓ[YOHËY[Ý[Y[YÜ\ËXXÚÙÜÝ[LÈKL^\ÛHZ[ZVÍH\Ú^K^HÝÜÏ^ÌBÏÙ]ÐØ\ÛÛ[ÐØ\ËÊ0ë[X\È
ßBØ\Ø\XY\Û\ÜÓ[YOHLÈ]Û\ÜÓ[YOH^][\ËXÙ[\\ÝYKX]ÙY[Ø\]HÛ\ÜÓ[YOH^X\ÙH[ÜYY[\ÈÈÛÛ\Û[\È
Û[X\Ë[ÝJBÐØ\]O]ÛÚ^OHÛHÛÛXÚÏ^ØY[X_O\ÈÚ^O^ÌMHÛ\ÜÓ[YOH\LHÏpìXY\0ë[XBÐ]ÛÙ]ÐØ\XY\Ø\ÛÛ[Û\ÜÓ[YOHLÛ[X\Ë[ÝOOHÈ
]Û\ÜÓ[YOHN^XÙ[\^[]]YYÜYÜÝ[È^H[ÜYY[\Ë^ÛXÈ[pìXY\0ë[XH\H[\^\Ù]
H
]Û\ÜÓ[YOHÝ\ÝË^X]]ÈXHÛ\ÜÓ[YOHËY[^\ÛHXYÛ\ÜÓ[YOHÜ\XË[]]YÌÌÛ\ÜÓ[YOHËNLÝÛ\ÜÓ[YOH^[YLÛ[YY][HÛÛ\Û[OÝÛ\ÜÓ[YOH^\YÚLÛ[YY][HËLØ[YYÝÛ\ÜÓ[YOH^[YLÛ[YY][HËL[YYÝÛ\ÜÓ[YOH^\YÚLÛ[YY][HËLY\XH	OÝÛ\ÜÓ[YOH^\YÚLÛ[YY][HËLÛÜÝKÝYÝÛ\ÜÓ[YOH^\YÚLÛ[YY][HËLÛÜÝH0ë[XOÝÛ\ÜÓ[YOHËLLÝÝÝXYÙOÛ[X\ËX\

[XKY
HOÂÛÛÝÛÛ\H\ÛÛPÛÛ\Û[J[XJBÛÛÝÛÜÝS[HHØ[ÐÛÜÝS[XJ[XJB]\
Ù^O^Û[XKÙ^_HÛ\ÜÓ[YOHÜ\XÝ\Ë[]]YÌLËÊÜ\]ÛÈ
ßBÛ\ÜÓ[YOHLH^XÙ[\]Û\ÜÓ[YOH^^XÛÛ][\ËXÙ[\Ø\LH]ÛÛÛXÚÏ^Ê
HO[ÝS[XJ[XKÙ^K	Ý\	Ê_B\ØXY^ÚYOOHBÛ\ÜÓ[YOH^[]]YYÜYÜÝ[Ý\^YÜYÜÝ[\ØXYÜXÚ]KLÌÚ]Û\Ú^O^ÌLHÏØ]Û]ÛÛÛXÚÏ^Ê
HO[ÝS[XJ[XKÙ^K	ÙÝÛÊ_B\ØXY^ÚYOOH[X\Ë[ÝH_BÛ\ÜÓ[YOH^[]]YYÜYÜÝ[Ý\^YÜYÜÝ[\ØXYÜXÚ]KLÌÚ]ÛÝÛÚ^O^ÌLHÏØ]ÛÙ]ÝËÊÛÛ\Û[Ù[XÝÜ
ßBÛ\ÜÓ[YOHL[]]H]ÛÛÛXÚÏ^Ê
HOÂÙ]Ù[XÝÜÜ[Ù[XÝÜÜ[OOHYÈ[Y
BÙ]Ù[XÝÜÙX\Ú
	ÉÊB_BÛ\ÜÓ[YO^Ø^[YËY[LKLHÝ[YÜ\^\ÛH[Ø]H	ÂÛÛ\ÛXHOOH	ø %Ù[XØÚ[Û\8 %	ÂÈ	Ý^[]]YYÜYÜÝ[Ü\Y\ÚY	Â	ØÜ\][Ü\[Ý\Ü\XÜ\ÂXBØÛÛ\ÛX_BØ]ÛËÊÜÝÛÙ[XÝÜ
ßBÜÙ[XÝÜÜ[OOHY	
]Û\ÜÓ[YOHXÛÛ]HMLÜY[YL]LHËNËXXÚÙÜÝ[Ü\Ý[Y[ÈÚYÝË[ÈX^ZMÝ\ÝËZY[]Û\ÜÓ[YOHLÜ\X[]XÙZÛ\H\ØØ\ÙXÝÈÈÝX\XÙ]K[YO^ÜÙ[XÝÜÙX\ÚBÛÚ[ÙO^ÙHOÙ]Ù[XÝÜÙX\Ú
K\Ù][YJ_B]]ÑØÝ\ÂÛ\ÜÓ[YOHN^\ÛHÏÙ]]Û\ÜÓ[YOHÝ\ÝË^KX]]ÈX^ZMÙ[\YÛÛ\K[Ý	
]Û\ÜÓ[YOHLÈKLH^^ÈÛ[YY][H^[]]YYÜYÜÝ[Ë[]]YÌÌÙXÝÜÈHÛÛ\BÙ]Ù[\YÛÛ\KÛXÙJ
KX\
O
]ÛÙ^O^ØIÜYXBÛÛXÚÏ^Ê
HOÙ[XÝÛÛ\Û[J[XKÙ^K	ÜÙXÝÉËY
_BÛ\ÜÓ[YOHËY[^[YLÈKLKH^\ÛHÝ\Ë[]]YÍL^\ÝYKX]ÙY[Ü[Û\ÜÓ[YOH[Ø]HÜÛX_OÜÜ[Ü[Û\ÜÓ[YOH^[]]YYÜYÜÝ[[LÚ[ËLÜXÚ[×ØÛÛ\HOH[ÈÜX]Ý\[ÞJXÚ[×ØÛÛ\JH	ø %	ßBÜÜ[Ø]Û
J_BÏ
_BÙ[\YÝXXÙ]\Ë[Ý	
]Û\ÜÓ[YOHLÈKLH^^ÈÛ[YY][H^\\KMLË\\KMLÍHÝX\XÙ]\ÂÙ]Ù[\YÝXXÙ]\ËÛXÙJL
KX\
ÈO
]ÛÙ^O^ØËIÜËYXBÛÛXÚÏ^Ê
HOÙ[XÝÛÛ\Û[J[XKÙ^K	ÜÝXXÙ]IËËY
_BÛ\ÜÓ[YOHËY[^[YLÈKLKH^\ÛHÝ\Ë[]]YÍL^\ÝYKX]ÙY[Ü[Û\ÜÓ[YOH[Ø]H^\\KMÛÚÓÜ[Ú^O^ÌLHÛ\ÜÓ[YOH[[H\LHÏÜËÛX_BÜÜ[Ü[Û\ÜÓ[YOH^[]]YYÜYÜÝ[[LÚ[ËLÙÜX]Ý\[ÞJËÛÜÝWÜÜÝ[YY
_KÞÜË[YYÜ\Ý[YßBÜÜ[Ø]Û
J_BÏ
_BÙ[\YÛÛ\K[ÝOOH	[\YÝXXÙ]\Ë[ÝOOH	
]Û\ÜÓ[YOHLÈ^XÙ[\^[]]YYÜYÜÝ[^\ÛHÚ[\Ý[YÜÂÙ]
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Cantidad */}
                            <td className="p-2">
                              <Input
                                type="number"
                                min={0}
                                step={0.001}
                                value={linea.cantidad_bruta || ''}
                                onChange={e => updateLinea(linea.key, {
                                  cantidad_bruta: Number(e.target.value) || 0,
                                })}
                                className="h-8 text-right text-sm"
                              />
                            </td>

                            {/* Unidad */}
                            <td className="p-2">
                              <select
                                value={linea.unidad}
                                onChange={e => updateLinea(linea.key, { unidad: e.target.value })}
                                className="w-full h-8 rounded-md border bg-background px-2 text-sm"
                              >
                                {unidades.map(u => (
                                  <option key={u.codigo} value={u.codigo}>{u.codigo}</option>
                                ))}
                              </select>
                            </td>

                            {/* Merma */}
                            <td className="p-2">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step={0.5}
                                value={linea.merma_pct || ''}
                                onChange={e => updateLinea(linea.key, {
                                  merma_pct: Number(e.target.value) || 0,
                                })}
                                className="h-8 text-right text-sm"
                              />
                            </td>

                            {/* Coste unitario */}
                            <td className="p-2">
                              <div className="relative">
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  value={linea.coste_override ?? ''}
                                  onChange={e => updateLinea(linea.key, {
                                    coste_override: e.target.value ? Number(e.target.value) : null,
                                  })}
                                  placeholder={formatNumber(comp.coste)}
                                  className="h-8 text-right text-sm"
                                  title={linea.coste_override != null
                                    ? 'Override manual (borra para usar precio del maestro)'
                                    : `Precio del maestro: ${formatCurrency(comp.coste)}`}
                                />
                              </div>
                            </td>

                            {/* Coste lÃ­nea (calculated) */}
                            <td className="p-2 text-right font-mono font-medium">
                              {formatCurrency(costeLine)}
                            </td>

                            {/* Delete */}
                            <td className="p-2 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeLinea(linea.key)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30 font-medium">
                        <td colSpan={6} className="p-3 text-right">
                          Coste total del escandallo:
                        </td>
                        <td className="p-3 text-right font-mono">
                          {formatCurrency(costeTotal)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Cost summary panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumen de coste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Coste total</span>
                  <span className="font-mono font-bold text-lg">
                    {formatCurrency(costeTotal)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Coste por {cabecera.unidad_resultado}
                  </span>
                  <span className="font-mono font-bold text-lg">
                    {formatCurrency(costePorUnidad)}
                  </span>
                </div>
                <div className="border-t pt-3">
                  <span className="text-sm text-muted-foreground block mb-1">
                    Resultado: {formatNumber(cabecera.cantidad_resultado)} {cabecera.unidad_resultado}
                  </span>
                </div>
              </div>

              {/* Breakdown by line */}
              {lineas.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Desglose por componente
                  </p>
                  <div className="space-y-1.5">
                    {lineas
                      .filter(l => l.componente_producto_id || l.componente_escandallo_id)
                      .map(l => {
                        const comp = resolveComponente(l)
                        const cost = calcCosteLinea(l)
                        const pct = costeTotal > 0 ? (cost / costeTotal) * 100 : 0

                        return (
                          <div key={l.key} className="flex items-center gap-2">
                            <div
                              className="h-2 rounded-full bg-blue-500"
                              style={{ width: `${Math.max(pct, 2)}%`, minWidth: 4, maxWidth: '40%' }}
                            />
                            <span className="text-xs truncate flex-1">{comp.nombre}</span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}

              {/* Line count summary */}
              <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Ingredientes</span>
                  <span>{lineas.filter(l => l.componente_producto_id).length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sub-recetas</span>
                  <span>{lineas.filter(l => l.componente_escandallo_id).length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total lÃ­neas</span>
                  <span>{lineas.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
