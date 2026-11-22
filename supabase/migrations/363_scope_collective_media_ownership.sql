-- Cada upload da Coletiva pertence ao usuário autenticado no segundo
-- segmento do caminho: <callup_id>/<user_id>/<arquivo>.
BEGIN;

DROP POLICY IF EXISTS collective_media_insert ON storage.objects;
CREATE POLICY collective_media_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'collective-media'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND public.can_access_collective_chat(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS collective_media_delete ON storage.objects;
CREATE POLICY collective_media_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'collective-media' AND (
    EXISTS (
      SELECT 1 FROM public.callups callup
      WHERE callup.id = ((storage.foldername(name))[1])::uuid
        AND public.is_league_admin(callup.league_id)
    )
    OR (
      (storage.foldername(name))[2] = auth.uid()::text
      AND public.can_access_collective_chat(((storage.foldername(name))[1])::uuid)
    )
  )
);

COMMIT;
