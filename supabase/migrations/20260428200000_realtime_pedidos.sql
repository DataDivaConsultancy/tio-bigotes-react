-- Habilitar Realtime broadcasting en tablas de pedidos
DO $$
BEGIN
  -- pedidos_compra
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='pedidos_compra'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE pedidos_compra';
  END IF;

  -- pedido_compra_lineas
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='pedido_compra_lineas'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE pedido_compra_lineas';
  END IF;

  -- pedido_compra_aprobaciones
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='pedido_compra_aprobaciones'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE pedido_compra_aprobaciones';
  END IF;
END $$;

-- Verificar
SELECT tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime'
  AND tablename IN ('pedidos_compra','pedido_compra_lineas','pedido_compra_aprobaciones')
ORDER BY tablename;
