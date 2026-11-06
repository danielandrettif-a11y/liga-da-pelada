-- Restaura as políticas do bucket da Coletiva após restores de plataforma.
-- Dumps do PostgreSQL podem trazer storage.objects sem as políticas criadas
-- pela aplicação, especialmente quando o schema da stack é reinicializado.
BEGIN;

DROP POLICY IF EXISTS collective_media_read ON storage.objects;
CREATE POLICY collective_media_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'collective-media'
  AND public.can_access_collective_chat(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS collective_media_insert ON storage.objects;
CREATE POLICY collective_media_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'collective-media'
  AND public.can_access_collective_chat(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS collective_media_delete ON storage.objects;
CREATE POLICY collective_media_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'collective-media' AND (
    EXISTS (
      SELECT 1
      FROM public.callups callup
      WHERE callup.id = ((storage.foldername(name))[1])::uuid
        AND public.is_league_admin(callup.league_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.collective_messages message
      WHERE message.media_path = name
        AND message.sender_user_id = auth.uid()
        AND public.can_access_collective_chat(message.callup_id)
    )
  )
);

NOTIFY pgrst, 'reload schema';
COMMIT;
