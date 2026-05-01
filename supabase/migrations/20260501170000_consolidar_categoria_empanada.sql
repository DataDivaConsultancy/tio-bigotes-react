-- Consolidación de la categoría "Empanada" duplicada (opción B aplicada)
--
-- Problema: la BD tenía 3 categorías para empanadas:
--   id=1  "Empanada"          (16 productos viejos, todos inactivos)
--   id=40 "Empanada Clasica"  (catálogo nuevo, 20 activos)
--   id=41 "Empanada Premium"  (catálogo nuevo, 7 activos)
--
-- Además, el catálogo nuevo tenía 4 productos duplicados (un par "Empanada X"
-- limpio + un par "N.X" con prefijo numérico apuntando a lo mismo). Se eligió
-- mantener la versión limpia ("Empanada Pollo", "Empanada Caprese", etc.).
--
-- Esta migración deja UNA sola fuente de verdad para empanadas.
--
-- IMPORTANTE: ya aplicado en producción vía Supabase Management API el
-- 2026-05-01. Esta migración es source-of-truth en el repo, idempotente
-- gracias a los IF EXISTS / WHERE filters.

-- 0. Backups (las tablas _backup_empanada_* se mantienen por seguridad)
-- (creadas en sesión interactiva — no las recreamos aquí)

-- 1. Re-apuntar mapeos / referencias antes de borrar productos
UPDATE tb_v2.articulos_pendientes SET producto_id_sugerido = 151 WHERE producto_id_sugerido = 84;
UPDATE tb_v2.articulos_pendientes SET producto_id_sugerido = 154 WHERE producto_id_sugerido = 85;

-- ventas_staging: solo había refs a 153 (3.CARNE CUCHILLO duplicado) -> 256 (Empanada Carne Cuchillo)
-- (28k filas remapeadas en producción)
UPDATE tb_v2.ventas_staging SET producto_id = 256 WHERE producto_id = 153;

-- control_diario y producto_aliases: refs a 147, 153, 155, 156 (duplicados)
-- Mapping: 147->206, 153->256, 155->189, 156->213
UPDATE tb_v2.control_diario SET producto_id = 206 WHERE producto_id = 147;
UPDATE tb_v2.control_diario SET producto_id = 256 WHERE producto_id = 153;
UPDATE tb_v2.control_diario SET producto_id = 189 WHERE producto_id = 155;
UPDATE tb_v2.control_diario SET producto_id = 213 WHERE producto_id = 156;

UPDATE tb_v2.producto_aliases SET producto_id = 206 WHERE producto_id = 147;
UPDATE tb_v2.producto_aliases SET producto_id = 256 WHERE producto_id = 153;
UPDATE tb_v2.producto_aliases SET producto_id = 189 WHERE producto_id = 155;
UPDATE tb_v2.producto_aliases SET producto_id = 213 WHERE producto_id = 156;

-- 2. Borrar productos viejos (cat=1) + 'test' + duplicados nuevos
DELETE FROM tb_v2.productos
WHERE id IN (5,6,7,8,9,10,11,12,13,14,15,16,17,84,85,144,147,153,155,156);

-- 3. Re-apuntar el mapping de raw "Empanada" del CSV a empanada_clasica
UPDATE tb_v2.categoria_raw_map
SET categoria_codigo = 'empanada_clasica'
WHERE categoria_codigo = 'EMPANADA';

-- 4. Borrar la categoría legacy id=1
DELETE FROM tb_v2.categorias_producto WHERE id = 1;

-- Verificación: deberían quedar solo Empanada Clasica (id=40) y Empanada Premium (id=41)
