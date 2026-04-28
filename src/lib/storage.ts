import { supabase } from '@/lib/supabase'

/**
 * Sube un File a Supabase Storage en el bucket dado.
 * Comprime si supera 1MB. Devuelve la URL pública.
 */
export async function uploadFoto(
  file: File,
  bucket: 'incidencias' | 'recepciones' | 'albaranes' | 'facturas',
  pathPrefix: string,
): Promise<{ url: string; path: string }> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const fileName = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  // Comprimir si > 1MB y es imagen
  let toUpload: Blob = file
  if (file.size > 1024 * 1024 && file.type.startsWith('image/')) {
    try { toUpload = await compressImage(file) } catch { /* ignore */ }
  }

  const { error } = await supabase.storage.from(bucket).upload(fileName, toUpload, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName)
  return { url: data.publicUrl, path: fileName }
}

async function compressImage(file: File, maxWidth = 1600, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, 1)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * ratio
      canvas.height = img.height * ratio
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); resolve(file); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (blob) resolve(blob); else reject(new Error('compress failed'))
      }, 'image/webp', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img load')) }
    img.src = url
  })
}
