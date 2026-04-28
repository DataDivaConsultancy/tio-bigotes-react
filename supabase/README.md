# Supabase — Schema y Migraciones

Esta carpeta contiene todas las migraciones SQL del proyecto `tio-bigotes-react` (app.sebbrofoods.com).

## Estructura

```
supabase/
├── migrations/                       # Migraciones SQL ordenadas
│   ├── 00000000000000_baseline.sql  # Estado actual de la BD en producción
│   └── YYYYMMDDHHMMSS_*.sql         # Migraciones nuevas (módulo de compras v2)
└── README.md                         # Este archivo
```

## Convención de nombres

Cada migración nueva sigue el formato:

```
YYYYMMDDHHMMSS_descripcion_corta.sql
```

Ejemplo: `20260428100000_refactor_maestros.sql`

El timestamp (`YYYYMMDDHHMMSS`) garantiza orden cronológico al listarlas alfabéticamente.

## Cómo aplicar una migración nueva (Horacio)

Cuando Claude te pase una migración nueva:

1. Abre **https://supabase.com/dashboard/project/_/sql/new** (entra a tu proyecto Tio Bigotes).
2. Ve a **SQL Editor** (icono de `</>` en la barra lateral).
3. Click en **+ New query**.
4. Copia TODO el contenido del archivo `.sql` que te haya pasado Claude.
5. Pega en el editor.
6. Click **Run** (o `Cmd/Ctrl + Enter`).
7. Verifica que abajo dice **Success. No rows returned** (o similar) sin errores en rojo.
8. Avísame de vuelta: "aplicada" o "salió este error: ..." (con captura si hace falta).

> **Importante:** Las migraciones son acumulativas y dependen entre sí. Aplica siempre en el orden que te diga Claude. No te saltes ninguna.

## Cómo reproducir el schema desde cero (entornos nuevos)

Si en algún momento creamos un proyecto Supabase nuevo (dev/staging), aplicar TODAS las migraciones en orden:

1. `00000000000000_baseline.sql` (estado actual)
2. Todas las siguientes en orden cronológico

Todas usan `IF NOT EXISTS` / `CREATE OR REPLACE` para ser idempotentes (se pueden volver a aplicar sin romper nada).

## Notas técnicas

- Stack: **Supabase** (Postgres + RLS + Edge Functions Deno).
- Estilo de schema: **español** (`pedidos_compra`, `proveedores_v2`, etc.) coherente con tablas existentes.
- **Multi-local desde día 1:** todas las tablas nuevas con `local_id NOT NULL` y políticas RLS.
- **Auditoría:** trigger genérico que escribe a `audit_logs`.
- **Sin Prisma/Drizzle:** SQL crudo + Supabase CLI/Studio. Más simple para este proyecto.

## Si necesitas hacer rollback

Cada migración crítica viene con su par `_rollback.sql` cuando aplique. Si una migración falla, copia y ejecuta su rollback antes de seguir.
