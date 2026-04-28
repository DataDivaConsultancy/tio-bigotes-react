# Data Access — Módulo de Compras

Funciones de acceso a datos para el módulo de compras. Encapsulan llamadas a Supabase para que las pantallas y hooks consuman una API estable.

## Convenciones

- **Un archivo por entidad** (`pedidos.ts`, `recepciones.ts`, `incidencias.ts`, etc.).
- Funciones `async` que devuelven datos tipados (tipos vienen de `@/lib/schemas/`).
- Manejo de errores: lanzar `Error` con mensaje en español; el caller decide si mostrar toast.
- Sin React aquí — esto es lógica pura. Hooks van en `@/hooks/compras/`.

## Ejemplo de estructura (cuando se popule)

```ts
// src/lib/compras/pedidos.ts
import { supabase } from '@/lib/supabase'
import type { Pedido, CrearPedidoInput } from '@/lib/schemas/pedidos'

export async function listarPedidos(filtros: {
  local_id?: number
  estado?: string
  proveedor_id?: number
  desde?: string
  hasta?: string
}): Promise<Pedido[]> {
  let q = supabase.from('pedidos_compra').select('*')
  if (filtros.local_id) q = q.eq('local_id', filtros.local_id)
  // ...
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function crearPedido(input: CrearPedidoInput): Promise<Pedido> {
  const { data, error } = await supabase.rpc('crear_pedido', input)
  if (error) throw new Error(error.message)
  return data
}
```

Se irá poblando a medida que avancemos en MVP1.
