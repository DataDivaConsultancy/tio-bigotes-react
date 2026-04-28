import { z } from 'zod'

export const TipoIncidenciaEnum = z.enum([
  'faltante','exceso','danado','caducado','temp_incorrecta',
  'precio_incorrecto','no_solicitado','entrega_tarde',
  'docs_incorrectos','factura_duplicada','otro',
])
export type TipoIncidencia = z.infer<typeof TipoIncidenciaEnum>

export const UrgenciaEnum = z.enum(['baja','media','alta','critica'])
export type Urgencia = z.infer<typeof UrgenciaEnum>

export const EstadoIncidenciaEnum = z.enum([
  'abierta','asignada','esperando_proveedor','en_resolucion',
  'resuelta','cerrada','reabierta','escalada',
])
export type EstadoIncidencia = z.infer<typeof EstadoIncidenciaEnum>

export const TipoResolucionEnum = z.enum([
  'abono','reposicion','descuento','sin_accion','factura_rectificativa',
])
export type TipoResolucion = z.infer<typeof TipoResolucionEnum>

export const TIPO_INCIDENCIA_LABELS: Record<TipoIncidencia, string> = {
  faltante: 'Faltante',
  exceso: 'Exceso',
  danado: 'Producto dañado',
  caducado: 'Caducado',
  temp_incorrecta: 'Temperatura incorrecta',
  precio_incorrecto: 'Precio incorrecto',
  no_solicitado: 'No solicitado',
  entrega_tarde: 'Entrega tarde',
  docs_incorrectos: 'Documentación incorrecta',
  factura_duplicada: 'Factura duplicada',
  otro: 'Otro',
}

export const URGENCIA_COLORS: Record<Urgencia, string> = {
  baja: 'bg-gray-100 text-gray-700',
  media: 'bg-amber-100 text-amber-700',
  alta: 'bg-orange-100 text-orange-700',
  critica: 'bg-red-100 text-red-700',
}

export const URGENCIA_LABELS: Record<Urgencia, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
}

export const ESTADO_INCIDENCIA_COLORS: Record<EstadoIncidencia, string> = {
  abierta: 'bg-amber-100 text-amber-700',
  asignada: 'bg-blue-100 text-blue-700',
  esperando_proveedor: 'bg-violet-100 text-violet-700',
  en_resolucion: 'bg-sky-100 text-sky-700',
  resuelta: 'bg-emerald-100 text-emerald-700',
  cerrada: 'bg-slate-200 text-slate-700',
  reabierta: 'bg-orange-100 text-orange-700',
  escalada: 'bg-red-100 text-red-700',
}

export const ESTADO_INCIDENCIA_LABELS: Record<EstadoIncidencia, string> = {
  abierta: 'Abierta', asignada: 'Asignada',
  esperando_proveedor: 'Esperando proveedor',
  en_resolucion: 'En resolución',
  resuelta: 'Resuelta', cerrada: 'Cerrada',
  reabierta: 'Reabierta', escalada: 'Escalada',
}
