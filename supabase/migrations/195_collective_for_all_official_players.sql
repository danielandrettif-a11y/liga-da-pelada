-- A Coletiva pertence ao elenco oficial da liga, não apenas aos convocados da rodada.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_collective_chat(p_callup_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.is_app_admin() THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.callups callup
      LEFT JOIN public.rounds round_item ON round_item.id = callup.round_id
      WHERE callup.id = p_callup_id
        AND callup.status = 'converted'
        AND EXISTS (
          SELECT 1
          FROM public.account_profiles profile
          JOIN public.players player ON player.id = profile.player_id
          WHERE profile.user_id = auth.uid()
            AND player.member_category = 'player'
        )
        AND (
          round_item.id IS NULL
          OR round_item.status <> 'finished'
          OR callup.date >= CURRENT_DATE - 14
        )
    )
  END;
$$;

COMMENT ON FUNCTION public.can_access_collective_chat(UUID) IS
  'Permite acesso aos administradores e a qualquer conta vinculada a jogador oficial; convidados ficam de fora.';

DROP POLICY IF EXISTS collective_messages_read ON public.collective_messages;
CREATE POLICY collective_messages_read ON public.collective_messages FOR SELECT TO authenticated
  USING (public.can_access_collective_chat(callup_id));

DROP POLICY IF EXISTS collective_messages_insert ON public.collective_messages;
CREATE POLICY collective_messages_insert ON public.collective_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_collective_chat(callup_id)
    AND sender_user_id = auth.uid()
    AND sender_player_id = (
      SELECT profile.player_id
      FROM public.account_profiles profile
      WHERE profile.user_id = auth.uid()
    )
    AND kind IN ('text', 'image', 'audio')
  );

DROP POLICY IF EXISTS collective_reads_own ON public.collective_reads;
CREATE POLICY collective_reads_own ON public.collective_reads FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.can_access_collective_chat(callup_id))
  WITH CHECK (user_id = auth.uid() AND public.can_access_collective_chat(callup_id));

DROP POLICY IF EXISTS collective_media_read ON storage.objects;
CREATE POLICY collective_media_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'collective-media'
    AND public.can_access_collective_chat(((storage.foldername(name))[1])::UUID)
  );

DROP POLICY IF EXISTS collective_media_insert ON storage.objects;
CREATE POLICY collective_media_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'collective-media'
    AND public.can_access_collective_chat(((storage.foldername(name))[1])::UUID)
  );

REVOKE ALL ON FUNCTION public.can_access_collective_chat(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_collective_chat(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
