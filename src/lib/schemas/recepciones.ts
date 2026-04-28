import { z } from 'zod'

export const EstadoRecepcionEnum = z.enum([
  'pendiente', 'en_revision', 'con_incidencias', 'aprobada', 'cerrada',
])
export type EstadoRecepcion = z.infer<typeof EstadoRecepcionEnum>

export const EstadoLineaEnum = z.enum([
  'pendiente', 'ok', 'parcial', 'exceso', 'danado', 'rechazado',
])
export type EstadoLinea = z.infer<typeof EstadoLineaEnum>

export const ESTADO_LINEA_LABELS: Record<EstadoLinea, string> = {
  pendiente: 'Pendiente', ok: 'OK', parcial: 'Parcial',
  exceso: 'Exceso', danado: 'Dañado', rechazado: 'Rechazado',
}

export const ESTADO_LINEA_COLORS: Record<EstadoLinea, string> = {
  pendiente: 'bg-gray-100 text-gray-700',
  ok:        'bg-emerald-100 text-emerald-700',
  parcial:   'bg-amber-100 text-amber-700',
  exceso:    'bg-violet-100 text-violet-700',
  danado:    'bg-red-100 text-red-700',
  rechazado: 'bg-red-200 text-red-800',
}

export const ESTADO_RECEPCION_LABELS: Record<EstadoRecepcion, string> = {
  pendiente: 'Pendiente', en_revision: 'En revisión',
  con_incidencias: 'Con incidencias', aprobada: 'Aprobada', cerrada: 'Cerrada',
}

export const ESTADO_RECEPCION_COLORS: Record<EstadoRecepcion, string> = {
  pendiente: 'bg-gray-100 text-gray-700',
  en_revision: 'bg-blue-100 text-blue-700',
  con_incidencias: 'bg-amber-100 text-amber-800',
  aprobada: 'bg-emerald-100 text-emerald-700',
  cerrada: 'bg-slate-200 text-slate-700',
}
