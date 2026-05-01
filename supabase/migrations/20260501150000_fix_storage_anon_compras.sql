-- Permitir INSERT/UPDATE/DELETE también desde anon en buckets de compras.
--
-- Contexto: la app (tio-bigotes-react) usa auth propia basada en la tabla
-- empleados_v2, NO Supabase Auth. Por tanto las peticiones de cliente
-- llegan a Supabase Storage con el rol `anon`. Los buckets ya son
-- public=true, así que abrir INSERT/UPDATE/DELETE a anon es coherente con
-- el modelo actual.
--
-- Síntoma corregido: al subir foto/PDF en /compras/facturas/nueva
-- (también /compras/incidencias, /compras/recepciones, /compras/albaranes)
-- aparecía: "Error al subir foto: new row violates row-level security policy".
--
-- Idempotente.

DROP POLICY IF EXISTS "compras_insert" ON storage.objects;
CREATE POLICY "compras_insert" ON storage.objects
  FOR INSERT TO authenticated, anon
  WITH CHECK (bucket_id IN ('incidencias','recepciones','albaranes','facturas'));

DROP POLICY IF EXISTS "compras_update" ON storage.objects;
CREATE POLICY "compras_update" ON storage.objects
  FOR UPDATE TO authenticated, anon
  USING (bucket_id IN ('incidencias','recepciones','albaranes','facturas'));

DROP POLICY IF EXISTS "compras_delete" ON storage.objects;
CREATE POLICY "compras_delete" ON storage.objects
  FOR DELETE TO authenticated, anon
  USING (bucket_id IN ('incidencias','recepciones','albaranes','facturas'));
