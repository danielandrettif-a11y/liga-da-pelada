-- Contas recém-criadas podem enviar a própria foto mesmo enquanto o vínculo
-- em account_profiles está sendo concluído pelo fluxo de cadastro.
-- O caminho continua limitado ao UUID do jogador pertencente ao usuário.

DROP POLICY IF EXISTS "Account owners can upload player avatars" ON storage.objects;
DROP POLICY IF EXISTS "Account owners can update player avatars" ON storage.objects;
DROP POLICY IF EXISTS "Account owners can delete player avatars" ON storage.objects;

CREATE POLICY "Account owners can upload player avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'player-avatars'
  AND (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1
      FROM public.account_profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.player_id::TEXT = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1
      FROM public.players player
      WHERE player.id::TEXT = (storage.foldername(name))[1]
        AND player.created_by_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Account owners can update player avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'player-avatars'
  AND (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1
      FROM public.account_profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.player_id::TEXT = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1
      FROM public.players player
      WHERE player.id::TEXT = (storage.foldername(name))[1]
        AND player.created_by_user_id = auth.uid()
    )
  )
)
WITH CHECK (
  bucket_id = 'player-avatars'
  AND (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1
      FROM public.account_profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.player_id::TEXT = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1
      FROM public.players player
      WHERE player.id::TEXT = (storage.foldername(name))[1]
        AND player.created_by_user_id = auth.uid()
    )
  )
);

CREATE POLICY "Account owners can delete player avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'player-avatars'
  AND (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1
      FROM public.account_profiles profile
      WHERE profile.user_id = auth.uid()
        AND profile.player_id::TEXT = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1
      FROM public.players player
      WHERE player.id::TEXT = (storage.foldername(name))[1]
        AND player.created_by_user_id = auth.uid()
    )
  )
);

NOTIFY pgrst, 'reload schema';
