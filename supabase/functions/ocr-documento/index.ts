// Edge Function: ocr-documento
// POST { documento_url, tipo: 'factura' | 'albaran' }
// Llama a Google Vision API y devuelve cabecera+lineas parseadas.
// El match contra BD (proveedor por CIF, productos por descripción) lo hace
// el frontend con los datos devueltos.

const VISION_API_KEY = Deno.env.get("VISION_API_KEY")

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

interface Linea {
  descripcion: string
  cantidad: number | null
  precio_unitario: number | null
  total_linea: number | null
}

interface Cabecera {
  numero: string | null
  fecha: string | null
  importe_total: number | null
  importe_neto: number | null
  iva_total: number | null
  cif_proveedor: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResp({ ok: false, error: "method not allowed" }, 405)
  if (!VISION_API_KEY) return jsonResp({ ok: false, error: "VISION_API_KEY no configurada" }, 500)

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResp({ ok: false, error: "body JSON invalido" }, 400)
  }

  const documento_url: string = body?.documento_url
  const tipo: string = body?.tipo
  if (!documento_url) return jsonResp({ ok: false, error: "documento_url requerido" }, 400)
  if (tipo !== "factura" && tipo !== "albaran") {
    return jsonResp({ ok: false, error: "tipo debe ser 'factura' o 'albaran'" }, 400)
  }

  // 1. Descargar el documento
  let docBytes: Uint8Array
  let contentType: string
  try {
    const docResp = await fetch(documento_url)
    if (!docResp.ok) return jsonResp({ ok: false, error: "descarga fallo HTTP " + docResp.status }, 400)
    contentType = docResp.headers.get("content-type") || ""
    docBytes = new Uint8Array(await docResp.arrayBuffer())
  } catch (e) {
    return jsonResp({ ok: false, error: "error al descargar: " + String(e) }, 400)
  }

  if (contentType.includes("pdf")) {
    return jsonResp({ ok: false, error: "PDF no soportado todavia. Subi una foto JPG/PNG del documento." }, 400)
  }

  // 2. Convertir a base64 en chunks (evita stack overflow)
  let bin = ""
  const CHUNK = 0x8000
  for (let i = 0; i < docBytes.length; i += CHUNK) {
    const slice = docBytes.subarray(i, Math.min(i + CHUNK, docBytes.length))
    bin += String.fromCharCode(...slice)
  }
  const docBase64 = btoa(bin)

  // 3. Vision API
  let visionData: any
  try {
    const visionResp = await fetch(
      "https://vision.googleapis.com/v1/images:annotate?key=" + VISION_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            image: { content: docBase64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          }],
        }),
      }
    )
    if (!visionResp.ok) {
      const errTxt = await visionResp.text()
      return jsonResp({ ok: false, error: "Vision API: " + errTxt.slice(0, 300) }, 500)
    }
    visionData = await visionResp.json()
  } catch (e) {
    return jsonResp({ ok: false, error: "error Vision: " + String(e) }, 500)
  }

  const apiResp = visionData.responses?.[0] || {}
  if (apiResp.error) return jsonResp({ ok: false, error: "Vision: " + apiResp.error.message }, 500)
  const fullText: string = apiResp.fullTextAnnotation?.text || ""

  // 4. Parser
  const cabecera = parseCabecera(fullText)
  const lineas = parseLineas(fullText)

  // 5. Confianza heuristica
  let confianza = 0
  if (cabecera.numero)        confianza += 20
  if (cabecera.fecha)         confianza += 20
  if (cabecera.importe_total) confianza += 25
  if (cabecera.cif_proveedor) confianza += 15
  if (lineas.length >= 1)     confianza += 20

  return jsonResp({
    ok: true,
    tipo,
    raw_text: fullText,
    cabecera,
    lineas,
    confianza,
  })
})

function parseCabecera(text: string): Cabecera {
  const cab: Cabecera = {
    numero: null, fecha: null,
    importe_total: null, importe_neto: null, iva_total: null,
    cif_proveedor: null,
  }

  const m1 = text.match(/(?:factura|n[º°o]|num\.?|invoice|albar[áa]n)[\s:.]*([A-Z0-9][\w\-\/]{1,20})/i)
  if (m1) cab.numero = m1[1].trim()

  const fm = text.match(/(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})/)
  if (fm) {
    let d = fm[1], mo = fm[2], y = fm[3]
    if (y.length === 2) y = "20" + y
    if (parseInt(d) >= 1 && parseInt(d) <= 31 && parseInt(mo) >= 1 && parseInt(mo) <= 12) {
      cab.fecha = y + "-" + mo.padStart(2, "0") + "-" + d.padStart(2, "0")
    }
  }

  const cm = text.match(/\b([A-HJNPQRSUVW]\d{7}[A-Z\d]|[\dXYZ]\d{7}[A-Z])\b/)
  if (cm) cab.cif_proveedor = cm[1]

  const matchAmount = (re: RegExp): number | null => {
    const m = text.match(re)
    if (!m) return null
    const n = m[1].replace(/\./g, "").replace(",", ".")
    const v = parseFloat(n)
    return isNaN(v) ? null : v
  }
  cab.importe_total = matchAmount(/(?:total\s+factura|total\s+a\s+pagar|total\s*€|importe\s+total|\btotal\b)[\s:€]*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/i)
  cab.importe_neto  = matchAmount(/(?:base\s+imponible|subtotal|importe\s+neto|\bneto\b)[\s:€]*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/i)
  cab.iva_total     = matchAmount(/(?:iva\s+total|total\s+iva|\biva\b)[\s:€]*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/i)

  return cab
}

function parseLineas(text: string): Linea[] {
  const lineas: Linea[] = []
  const rows = text.split("\n").map(r => r.trim()).filter(r => r.length > 0)
  for (const row of rows) {
    if (row.length < 8 || row.length > 250) continue
    if (/^(total|subtotal|iva|base|importe|fecha|factura|n[º°o])/i.test(row)) continue

    const nums = row.match(/\d+(?:[.,]\d+)?/g) || []
    if (nums.length < 2) continue

    const cant = parseFloat(nums[0].replace(",", "."))
    const total = parseFloat(nums[nums.length - 1].replace(",", "."))
    const precio = nums.length >= 3 ? parseFloat(nums[nums.length - 2].replace(",", ".")) : null
    if (isNaN(cant) || cant <= 0 || cant > 10000) continue
    if (isNaN(total) || total <= 0 || total > 100000) continue

    const desc = row.replace(/[\d.,€]+/g, " ").replace(/\s+/g, " ").trim()
    if (desc.length < 3) continue

    lineas.push({
      descripcion: desc,
      cantidad: cant,
      precio_unitario: precio,
      total_linea: total,
    })
  }
  return lineas.slice(0, 50)
}
