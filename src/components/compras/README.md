# Componentes — Módulo de Compras

Componentes React específicos del módulo de compras (no genéricos shadcn).

## Convenciones

- **PascalCase** en español (`EstadoBadge.tsx`, `SelectorProveedor.tsx`, `LineaPedidoEditor.tsx`).
- Componentes pequeños, una responsabilidad.
- Estilizados con Tailwind + tokens del design system.
- Reutilizables entre pantallas del módulo.

## Componentes previstos para MVP1

- `EstadoBadge` — chip con color semántico para estados (pedidos, recepciones, incidencias).
- `SelectorProveedor` — combobox con búsqueda + favoritos + recientes.
- `SelectorLocal` — selector de local respetando RLS del usuario.
- `LineaPedidoEditor` — fila con stepper +/-, precio, total, motivo modificación.
- `TimelineEventos` — timeline vertical de eventos por entidad (pedido, recepción).
- `FotoUploader` — botón cámara/upload con compresión y vista previa.
- `TemperaturaInput` — input numérico con validación de rango según tipo de producto.
- `UrgenciaChip` — chip para urgencia de incidencia.
- `SlaCountdown` — cuenta atrás del SLA, color según proximidad.
- `FiltrosCompras` — filtros transversales (local + periodo).

Se irán creando a medida que avancemos.
