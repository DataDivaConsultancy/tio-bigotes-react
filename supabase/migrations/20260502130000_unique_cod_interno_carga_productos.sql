-- UNIQUE INDEX sobre productos_compra_v2.cod_interno (case-insensitive,
-- ignora NULL/'') para soportar el flujo de carga de CSV con match
-- robusto. Solo aplica a productos con código.
DROP INDEX IF EXISTS uq_productos_compra_v2_cod_interno_norm;
CREATE UNIQUE INDEX uq_productos_compra_v2_cod_interno_norm
ON productos_compra_v2 (LOWER(TRIM(cod_interno)))
WHERE cod_interno IS NOT NULL AND cod_interno <> '';
