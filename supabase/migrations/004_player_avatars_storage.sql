-- Bucket publico para as fotos dos jogadores.
-- A leitura e publica; somente usuarios autenticados podem alterar arquivos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'player-avatars',
  'player-avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view player avatars" ON storage.objects;
CREATE POLICY "Public can view player avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'player-avatars');

DROP POLICY IF EXISTS "Authenticated users can upload player avatars" ON storage.objects;
CREATE POLICY "Authenticated users can upload player avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'player-avatars');

DROP POLICY IF EXISTS "Authenticated users can update player avatars" ON storage.objects;
CREATE POLICY "Authenticated users can update player avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'player-avatars')
WITH CHECK (bucket_id = 'player-avatars');

DROP POLICY IF EXISTS "Authenticated users can delete player avatars" ON storage.objects;
CREATE POLICY "Authenticated users can delete player avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'player-avatars');
