-- O perfil e removido no PostgreSQL antes da limpeza dos bytes no Storage.
-- Depois do cascade em league_members, a politica anterior ja nao conseguia
-- provar que o usuario que enviou a imagem podia apaga-la. O owner_id e
-- preenchido pelo Storage com auth.uid() no upload e permanece no objeto.

DROP POLICY IF EXISTS "Public can view player avatars" ON storage.objects;

CREATE POLICY "Public can view player avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'player-avatars');

DROP POLICY IF EXISTS "Account owners can delete player avatars" ON storage.objects;

CREATE POLICY "Account owners can delete player avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'player-avatars'
  AND (
    owner_id = auth.uid()::text
    OR public.is_app_admin()
    OR EXISTS (
      SELECT 1
      FROM public.account_profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.player_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1
      FROM public.players player
      WHERE player.id::text = (storage.foldername(name))[1]
        AND player.created_by_user_id = auth.uid()
    )
  )
);

NOTIFY pgrst, 'reload schema';
