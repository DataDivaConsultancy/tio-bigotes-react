-- Sistema de permisos matricial (rol × pantalla × local × modo).
--
-- Antes: tb_v2.roles_v2.permisos era un array JSONB de pantallas — un rol
-- "tiene acceso a estas N pantallas" en TODOS los locales.
-- Ahora: tabla rol_permiso con PK lógica (rol, pantalla, local_id) +
-- modo ('ver' | 'escribir'). local_id NULL = wildcard "todos los locales".
--
-- Esto permite:
--   - "Cajero de Diputación": rol con acceso a Operativa+CargaVentas SOLO
--     en local Diputación, y BI solo lectura en Diputación.
--   - "Supervisor zona": rol con BI 'ver' en local_id NULL (todos), y
--     escribir en ningún sitio.
--   - "Encargado": rol con escribir en todos los locales para Pedidos.
--
-- Aplicado el 2026-05-01 vía Management API.

-- Catálogo de pantallas
CREATE TABLE IF NOT EXISTS public.pantallas_app (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  modulo text,
  orden integer DEFAULT 0
);

INSERT INTO pantallas_app (codigo, nombre, modulo, orden) VALUES
  ('Productos','Productos','Gestión',10),('Escandallos','Escandallos','Gestión',11),
  ('Precios','Precios de Venta','Gestión',12),('Empleados','Empleados','Gestión',13),
  ('Roles','Roles','Gestión',14),('Operativa','Control Diario','Operaciones',20),
  ('BI','Business Intelligence','Operaciones',21),('Forecast','Forecast','Operaciones',22),
  ('Pendientes','Pendientes','Operaciones',23),('CargaVentas','Subir CSV Ventas','Datos',30),
  ('CargaProductos','Subir CSV Productos','Datos',31),('Auditoria','Auditoría','Datos',32),
  ('ComprasDashboard','Dashboard Compras','Compras',40),('Proveedores','Proveedores','Compras',41),
  ('ProductosCompra','Productos Compra','Compras',42),('Locales','Locales','Compras',43),
  ('Stock','Stock','Compras',44),('Pedidos','Pedidos','Compras',45),
  ('Recepciones','Recepciones','Compras',46),('Incidencias','Incidencias','Compras',47),
  ('Albaranes','Albaranes','Compras',48),('FacturasCompra','Facturas Compra','Compras',49),
  ('Configuracion','Configuración','Sistema',90)
ON CONFLICT (codigo) DO UPDATE SET nombre=EXCLUDED.nombre, modulo=EXCLUDED.modulo, orden=EXCLUDED.orden;

-- Tabla rol_permiso
CREATE TABLE IF NOT EXISTS public.rol_permiso (
  id bigserial PRIMARY KEY,
  rol      text NOT NULL REFERENCES tb_v2.roles_v2(rol) ON DELETE CASCADE ON UPDATE CASCADE,
  pantalla text NOT NULL REFERENCES pantallas_app(codigo) ON UPDATE CASCADE,
  local_id integer NULL REFERENCES locales_compra_v2(id) ON DELETE CASCADE,
  modo     text NOT NULL CHECK (modo IN ('ver','escribir')),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Unicidad: NULL no es comparable en PRIMARY KEY → dos índices parciales
CREATE UNIQUE INDEX IF NOT EXISTS uq_rol_permiso_global
  ON rol_permiso(rol, pantalla) WHERE local_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rol_permiso_local
  ON rol_permiso(rol, pantalla, local_id) WHERE local_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rol_permiso_rol ON rol_permiso(rol);
CREATE INDEX IF NOT EXISTS idx_rol_permiso_pantalla ON rol_permiso(pantalla);

-- Backfill: cada pantalla del array JSONB.permisos[] de cada rol →
-- fila con local_id=NULL (wildcard) y modo='escribir' (mantiene compat).
INSERT INTO rol_permiso (rol, pantalla, local_id, modo)
SELECT DISTINCT r.rol, p.codigo, NULL::integer, 'escribir'
FROM tb_v2.roles_v2 r
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(r.permisos, '[]'::jsonb)) AS perm(codigo)
JOIN pantallas_app p ON p.codigo = perm.codigo
ON CONFLICT DO NOTHING;

-- Vistas helpers
CREATE OR REPLACE VIEW public.v_rol_permisos_expandido AS
SELECT rp.rol, rp.pantalla, l.id AS local_id, l.nombre AS local_nombre, rp.modo
FROM rol_permiso rp
LEFT JOIN locales_compra_v2 l
  ON (rp.local_id IS NULL AND l.activo = true) OR l.id = rp.local_id;

CREATE OR REPLACE VIEW public.v_empleado_permisos_locales AS
SELECT e.id AS empleado_id, rp.pantalla, rp.local_id,
  MAX(CASE WHEN rp.modo='escribir' THEN 'escribir' ELSE 'ver' END) AS modo
FROM tb_v2.empleados e
JOIN v_rol_permisos_expandido rp ON rp.rol = e.rol
GROUP BY e.id, rp.pantalla, rp.local_id;
