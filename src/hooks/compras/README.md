# Hooks — Módulo de Compras

Hooks React que consumen `@/lib/compras/` y exponen estado para los componentes.

## Convenciones

- Un hook por consulta o acción (`usePedidos`, `useCrearPedido`, `useRecepcion`).
- Manejan loading, error, datos. Sin React Query por ahora (mantenemos simple).
- Naming: `use<Verbo><Entidad>` para acciones, `use<Entidad(es)>` para queries.

## Ejemplo

```ts
// src/hooks/compras/usePedidos.ts
import { useEffect, useState } from 'react'
import { listarPedidos } from '@/lib/compras/pedidos'
import type { Pedido } from '@/lib/schemas/pedidos'

export function usePedidos(filtros: Parameters<typeof listarPedidos>[0]) {
  const [data, setData] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    listarPedidos(filtros)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [JSON.stringify(filtros)])

  return { data, loading, error }
}
```
