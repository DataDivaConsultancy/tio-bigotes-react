# Convenciones del Módulo de Compras

**Repo:** `tio-bigotes-react`
**App:** app.sebbrofoods.com
**Versión:** 1.0 — 2026-04-27

Este documento define las convenciones que se siguen al desarrollar el módulo de compras (PRD v1.0).

---

## 1. Naming en Postgres / Supabase

### Tablas
- **Idioma: español.** Coherente con tablas existentes (`proveedores_v2`, `productos_compra_v2`).
- **Sufijo `_v2`** en tablas que reemplazan o evolucionan una existente. Tablas totalmente nuevas no llevan sufijo.
- **Plural** para colecciones de entidades (`pedidos_compra`, `recepciones`, `incidencias`).
- **Singular** para tablas de relación 1-N o pivote (`pedido_compra_linea`, `recepcion_linea`).

Ejemplos:
- `pedidos_compra` (cabeceras de pedido)
- `pedido_compra_lineas` (líneas)
- `pedido_compra_aprobaciones`
- `recepciones`, `recepcion_lineas`
- `incidencias`
- `albaranes`
- `facturas_compra`, `factura_compra_lineas`
- `proveedor_contactos`, `proveedor_condiciones_pago`, `producto_formatos`, `proveedor_producto_precios`

### Columnas
- `snake_case`.
- Clave primaria: `id` (UUID por defecto en tablas nuevas; mantener `serial` en las `_v2` existentes hasta refactor mayor).
- FKs: `<entidad>_id` (`local_id`, `proveedor_id`, `pedido_id`).
- Booleanos: prefijo `es_` o `tiene_` o `_activo` (`activo`, `temperatura_ok`, `es_primario`).
- Timestamps: `created_at`, `updated_at`, `*_at` para eventos puntuales (`enviado_at`, `aprobado_at`).
- Enums representados como `text CHECK (col IN (...))` — más flexibles que `CREATE TYPE` y migrables.

### RPC functions
- **`verbo_entidad`** o **`verbo_entidad_subentidad`**: `crear_pedido`, `enviar_pedido`, `completar_recepcion`, `registrar_linea_recepcion`.
- Devuelven `JSONB` con estructura estándar:
  ```json
  { "ok": true, "data": { ... } }
  { "ok": false, "error": "código_error", "mensaje": "humano-legible" }
  ```
- Idempotentes cuando posible.
- `SECURITY INVOKER` por defecto (respetan RLS); `SECURITY DEFINER` solo cuando la función necesita saltarse RLS deliberadamente, y en ese caso hace sus propios checks.

### Triggers
- Nombre: `tg_<accion>_<tabla>` (`tg_audit_pedidos`, `tg_calcular_total_linea`).
- Funciones de trigger: `fn_<accion>_<tabla>()`.

---

## 2. Multi-local y RLS

Todas las tablas del módulo de compras tienen `local_id NOT NULL` (FK a `locales_compra_v2`).

### Política base (template)
```sql
ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;

-- Lectura: usuario ve registros de sus locales asignados
CREATE POLICY "<tabla>_select" ON <tabla>
  FOR SELECT TO authenticated
  USING (
    local_id IN (SELECT local_id FROM mi_acceso_locales())
  );

-- Escritura: igual, salvo restricciones por rol
CREATE POLICY "<tabla>_insert" ON <tabla>
  FOR INSERT TO authenticated
  WITH CHECK (
    local_id IN (SELECT local_id FROM mi_acceso_locales())
  );
```

Helper `mi_acceso_locales()` devuelve los locales accesibles según el rol del usuario:
- `encargado_tienda` → solo su `local_id`.
- `responsable_operaciones`, `direccion_financiera`, `administrador` → todos los locales activos.

### Roles del sistema
Definidos en `Roles.tsx` (frontend) y replicados en backend (función `mi_rol()`):
- `encargado_tienda`
- `responsable_operaciones`
- `direccion_financiera`
- `administrador` (contabilidad)
- `proveedor_externo` (acceso muy restringido — Fase 4)

---

## 3. Auditoría

Tabla única `audit_logs` (particionada por mes).

Trigger genérico `tg_audit_log_changes()` aplicado a tablas críticas. Registra:
- `entity_type` (nombre tabla)
- `entity_id`
- `action` (INSERT / UPDATE / DELETE)
- `old_values` JSONB
- `new_values` JSONB
- `user_id` (de `auth.uid()`)
- `created_at`

Tablas auditadas: `proveedores_v2`, `productos_compra_v2`, `pedidos_compra`, `recepciones`, `incidencias`, `facturas_compra`, `proveedor_producto_precios`, y otras críticas a definir.

---

## 4. Convenciones de migraciones

Ver `supabase/README.md` para flujo de aplicación.

- **Nombre archivo:** `YYYYMMDDHHMMSS_descripcion.sql`.
- **Idempotentes:** `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` antes de `CREATE TRIGGER`.
- **Cabecera obligatoria:**
  ```sql
  -- Migración: <descripción>
  -- Fecha: YYYY-MM-DD
  -- Tarea: F0-X / F1A-Y / etc.
  -- Descripción: ...
  -- Rollback: ver YYYYMMDDHHMMSS_<nombre>_rollback.sql (si aplica)
  ```
- **No mezclar DDL y DML** en la misma migración cuando se pueda evitar (separar `_schema.sql` y `_data.sql`).
- **Reversibles:** para cada migración crítica, pareja `_rollback.sql`.

---

## 5. Frontend — estructura de carpetas

```
src/
├── App.tsx                      # Rutas
├── components/
│   ├── Layout.tsx               # Layout general
│   ├── ProtectedRoute.tsx       # Guard por rol
│   ├── ui/                      # shadcn primitives (button, input, card, etc.)
│   └── compras/                 # Componentes específicos del módulo
│       ├── EstadoBadge.tsx
│       ├── SelectorProveedor.tsx
│       ├── LineaPedidoEditor.tsx
│       └── ...
├── contexts/
│   └── AuthContext.tsx
├── hooks/
│   └── compras/                 # Hooks de datos (React Query no, supabase directo)
│       ├── usePedidos.ts
│       ├── useRecepciones.ts
│       └── ...
├── lib/
│   ├── supabase.ts              # Cliente
│   ├── utils.ts
│   ├── schemas/                 # Zod schemas (validación + tipos)
│   │   ├── pedidos.ts
│   │   ├── recepciones.ts
│   │   ├── incidencias.ts
│   │   └── ...
│   └── compras/                 # Data access (un archivo por entidad)
│       ├── pedidos.ts           # crearPedido, listarPedidos, etc.
│       ├── recepciones.ts
│       ├── incidencias.ts
│       └── ...
└── pages/
    ├── compras/
    │   ├── Proveedores.tsx
    │   ├── ProductosCompra.tsx
    │   ├── Locales.tsx
    │   ├── Stock.tsx
    │   ├── pedidos/
    │   │   ├── Lista.tsx
    │   │   ├── Crear.tsx
    │   │   ├── Detalle.tsx
    │   │   └── Aprobaciones.tsx
    │   ├── recepciones/
    │   │   ├── Lista.tsx
    │   │   └── Detalle.tsx
    │   ├── incidencias/
    │   │   ├── Lista.tsx
    │   │   └── Detalle.tsx
    │   ├── albaranes/           # Fase 2
    │   ├── facturas/            # Fase 2
    │   └── Dashboard.tsx
    └── ...
```

### Naming componentes
- **PascalCase** (`ListaPedidos.tsx`, `DetalleRecepcion.tsx`).
- Páginas en español. Componentes técnicos genéricos (`DataTable`, `DateRangePicker`) en inglés si vienen de shadcn o ecosistema React.

### Imports
- Alias `@/` apunta a `src/`. Usar siempre.
- Orden: librerías → `@/lib` → `@/components` → `@/hooks` → relativos.

---

## 6. Validación

Todos los formularios validan con **Zod** (esquemas en `src/lib/schemas/`).
- El esquema Zod es la fuente de verdad. Tipos TypeScript se infieren con `z.infer<>`.
- Mismo esquema se reusa en Edge Functions cuando hay validación en backend.
- Mensajes de error en español.

```ts
// src/lib/schemas/pedidos.ts
import { z } from 'zod'

export const PedidoLineaSchema = z.object({
  formato_id: z.string().uuid(),
  cantidad: z.number().positive('La cantidad debe ser mayor a 0'),
  precio_unitario: z.number().positive(),
  descuento_pct: z.number().min(0).max(100).default(0),
})

export type PedidoLinea = z.infer<typeof PedidoLineaSchema>
```

---

## 7. Manejo de errores

### Frontend
- Errores de red / supabase → toast con `sonner` (`toast.error("...")`).
- Errores de validación Zod → mostrar inline en el formulario con react-hook-form.
- Errores inesperados → toast genérico + log a consola con stack.

### Backend (RPCs)
Devolver siempre JSON estructurado:
```json
{ "ok": false, "error": "stock_insuficiente", "mensaje": "Stock insuficiente para 'Pollo entero'", "context": { "producto_id": "...", "disponible": 2, "solicitado": 5 } }
```

Códigos de error documentados (cuando se creen RPCs nuevas, añadir aquí su catálogo).

---

## 8. Storage (fotos)

Buckets:
- `incidencias/` — fotos de incidencias.
- `albaranes/` — fotos/PDF de albaranes (Fase 2).
- `facturas/` — PDF de facturas (Fase 2).
- `productos/` — imágenes de catálogo (existente).

Path dentro del bucket: `<local_id>/<entidad_id>/<uuid>.<ext>`.

Compresión client-side antes de subir (`browser-image-compression`):
- Max width: 1600px.
- Calidad: 0.8.
- Formato: WebP cuando soportado.

---

## 9. Edge Functions (Deno/TS)

Carpeta `supabase/functions/<nombre>/index.ts`. Cuando llegue su momento.

- CORS habilitado para origen `app.sebbrofoods.com` y `localhost:5173`.
- Validación de input con Zod (mismo esquema que frontend cuando aplica).
- Respuestas con shape `{ ok, data }` / `{ ok: false, error, mensaje }`.
- Logs estructurados con `console.log(JSON.stringify({...}))` para Supabase logs.

---

## 10. Testing

- **Unit tests** (cuando aplique): vitest. Ubicar `*.test.ts` junto al archivo testeado.
- **E2E:** Playwright en `e2e/`. Tests críticos del módulo de compras:
  - Login + ver dashboard.
  - Crear pedido y enviarlo.
  - Recibir pedido con incidencia.
  - Resolver incidencia.

---

## 11. Convenciones de UX/UI

- **Mobile-first** para flujos de encargado (recepción, incidencia).
- **Touch targets ≥ 44×44 px** (Apple HIG, Material).
- **Color semántico** (no solo color — siempre con icono o texto):
  - 🟢 Verde — OK / dentro tolerancia.
  - 🟡 Amarillo — advertencia / diferencia menor / OCR baja confianza.
  - 🟠 Naranja — diferencia significativa (5-10%).
  - 🔴 Rojo — bloqueo / SLA vencido / temp fuera rango.
  - ⚪ Gris — pendiente / inactivo.
- Botón principal único por pantalla (CTA).
- FAB para acción primaria en pantallas tipo lista.

---

## 12. Git

- **Trunk-based** sobre `main`. Sin ramas largas (proyecto solo-dev).
- Commits descriptivos en español: `compras: añade tabla pedidos_compra (F1A-1)`.
- Cada commit referencia tarea (F0-X, F1A-Y, etc.).
- Push a `main` despliega automáticamente a Vercel.

---

**Cualquier cambio a estas convenciones se discute y se documenta aquí antes de aplicar.**
