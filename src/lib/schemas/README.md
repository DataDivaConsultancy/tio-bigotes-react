# Esquemas Zod

Esquemas de validación de formularios y tipos compartidos.

## Convenciones

- Un archivo por entidad (`pedidos.ts`, `recepciones.ts`, etc.).
- El esquema es la fuente de verdad: tipos TypeScript se infieren con `z.infer<>`.
- Mismo esquema se reusa en Edge Functions cuando hay validación en backend.
- Mensajes de error en español.

## Ejemplo

```ts
import { z } from 'zod'

export const PedidoLineaSchema = z.object({
  formato_id: z.string().uuid(),
  cantidad: z.number().positive('La cantidad debe ser mayor a 0'),
  precio_unitario: z.number().positive(),
  descuento_pct: z.number().min(0).max(100).default(0),
})

export type PedidoLinea = z.infer<typeof PedidoLineaSchema>
```

Se irá poblando a medida que avancemos en MVP1.
