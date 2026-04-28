import { z } from 'zod'

// ============================================================
// Esquemas Zod para el módulo de Pedidos de Compra
// ============================================================

export const EstadoPedidoEnum = z.enum([
  'borrador',
  'sugerido',
  'pendiente_aprobacion',
  'aprobado',
  'enviado',
  'confirmado',
  'parcialmente_recibido',
  'recibido',
  'cerrado',
  'cancelado',
])
export type EstadoPedido = z.infer<typeof EstadoPedidoEnum>

export const OrigenPedidoEnum = z.enum(['manual', 'sugerido', 'duplicado', 'plantilla'])
export type OrigenPedido = z.infer<typeof OrigenPedidoEnum>

export const EnviadoViaEnum = z.enum(['email', 'portal', 'whatsapp', 'telefono', 'edi'])
export type EnviadoVia = z.infer<typeof EnviadoViaEnum>

export const DecisionAprobacionEnum = z.enum(['aprobado', 'rechazado', 'devuelto'])
export type DecisionAprobacion = z.infer<typeof DecisionAprobacionEnum>

// ── Línea ────────────────────────────────────────────────────
export const PedidoLineaSchema = z.object({
  id: z.string().uuid().optional(),
  formato_id: z.string().uuid({ message: 'Falta el formato del producto' }),
  cantidad: z.number().positive('La cantidad debe ser mayor a 0'),
  precio_unitario: z.number().nonnegative('El precio no puede ser negativo'),
  descuento_pct: z.number().min(0).max(100).default(0),
  iva_pct: z.number().refine(v => [0, 4, 10, 21].includes(v), {
    message: 'IVA debe ser 0%, 4%, 10% o 21%',
  }).default(21),
  cantidad_sugerida: z.number().nonnegative().nullable().optional(),
  motivo_modificacion: z.string().max(200).nullable().optional(),
  notas: z.string().nullable().optional(),
})
export type PedidoLinea = z.infer<typeof PedidoLineaSchema>

// ── Crear pedido (input RPC) ─────────────────────────────────
export const CrearPedidoInputSchema = z.object({
  p_local_id: z.number().int().positive('Falta el local'),
  p_proveedor_id: z.number().int().positive('Falta el proveedor'),
  p_lineas: z.array(PedidoLineaSchema.omit({ id: true })).min(1, 'Añade al menos un producto'),
  p_fecha_entrega_solicitada: z.string().nullable().optional(),
  p_portes: z.number().nonnegative().default(0),
  p_notas: z.string().nullable().optional(),
  p_origen: OrigenPedidoEnum.default('manual'),
})
export type CrearPedidoInput = z.infer<typeof CrearPedidoInputSchema>

// ── Pedido (lectura) ─────────────────────────────────────────
export const PedidoSchema = z.object({
  id: z.string().uuid(),
  numero: z.string(),
  estado: EstadoPedidoEnum,
  fecha_pedido: z.string(),
  fecha_entrega_solicitada: z.string().nullable(),
  fecha_entrega_confirmada: z.string().nullable(),
  local_id: z.number(),
  local_nombre: z.string().nullable(),
  proveedor_id: z.number(),
  proveedor_nombre: z.string().nullable(),
  proveedor_cif: z.string().nullable(),
  subtotal: z.number(),
  iva_total: z.number(),
  portes: z.number(),
  total: z.number(),
  origen: OrigenPedidoEnum,
  enviado_via: EnviadoViaEnum.nullable(),
  enviado_at: z.string().nullable(),
  confirmado_at: z.string().nullable(),
  num_lineas: z.number(),
  creado_por: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Pedido = z.infer<typeof PedidoSchema>

// ── Filtros de listado ───────────────────────────────────────
export const FiltrosPedidosSchema = z.object({
  estado: EstadoPedidoEnum.optional(),
  proveedor_id: z.number().optional(),
  local_id: z.number().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  buscar: z.string().optional(),
})
export type FiltrosPedidos = z.infer<typeof FiltrosPedidosSchema>

// ── Configuración de display de estados ──────────────────────
export const ESTADO_LABELS: Record<EstadoPedido, string> = {
  borrador: 'Borrador',
  sugerido: 'Sugerido',
  pendiente_aprobacion: 'Pendiente de aprobación',
  aprobado: 'Aprobado',
  enviado: 'Enviado',
  confirmado: 'Confirmado',
  parcialmente_recibido: 'Recibido parcialmente',
  recibido: 'Recibido',
  cerrado: 'Cerrado',
  cancelado: 'Cancelado',
}

export const ESTADO_COLORS: Record<EstadoPedido, string> = {
  borrador:              'bg-gray-100 text-gray-700',
  sugerido:              'bg-sky-100 text-sky-700',
  pendiente_aprobacion:  'bg-amber-100 text-amber-700',
  aprobado:              'bg-emerald-50 text-emerald-700',
  enviado:               'bg-blue-100 text-blue-700',
  confirmado:            'bg-emerald-100 text-emerald-800',
  parcialmente_recibido: 'bg-violet-100 text-violet-700',
  recibido:              'bg-green-100 text-green-800',
  cerrado:               'bg-slate-200 text-slate-700',
  cancelado:             'bg-red-100 text-red-700',
}
