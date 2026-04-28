-- Crear buckets via storage.buckets (idempotente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('incidencias', 'incidencias', true,  5242880, ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]),
  ('recepciones', 'recepciones', true,  5242880, ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']::text[]),
  ('albaranes',   'albaranes',   true, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]),
  ('facturas',    'facturas',    true, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Políticas RLS sobre storage.objects para los buckets (permisivas, refinaremos en F1A-2/F1B-2)
DROP POLICY IF EXISTS "compras_select" ON storage.objects;
CREATE POLICY "compras_select" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id IN ('incidencias','recepciones','albaranes','facturas'));

DROP POLICY IF EXISTS "compras_insert" ON storage.objects;
CREATE POLICY "compras_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('incidencias','recepciones','albaranes','facturas'));

DROP POLICY IF EXISTS "compras_update" ON storage.objects;
CREATE POLICY "compras_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('incidencias','recepciones','albaranes','facturas'));

DROP POLICY IF EXISTS "compras_delete" ON storage.objects;
CREATE POLICY "compras_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('incidencias','recepciones','albaranes','facturas'));

SELECT id, public, file_size_limit FROM storage.buckets WHERE id IN ('incidencias','recepciones','albaranes','facturas') ORDER BY id;
