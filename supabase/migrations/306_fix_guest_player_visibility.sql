-- Corrige a leitura de convidados adicionados à convocação.
-- Em 255, o `id` sem qualificação nas subconsultas podia resolver para
-- `league_members.id`, ocultando qualquer jogador que não fosse o próprio.
BEGIN;

DROP POLICY IF EXISTS tenant_player_read ON public.players;
CREATE POLICY tenant_player_read ON public.players FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.account_profiles profile
    WHERE profile.user_id = auth.uid() AND profile.player_id = players.id)
  OR EXISTS (SELECT 1 FROM public.league_members member
    WHERE member.player_id = players.id AND member.is_active
      AND public.is_league_member(member.league_id))
);

DROP POLICY IF EXISTS tenant_player_update ON public.players;
CREATE POLICY tenant_player_update ON public.players FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.account_profiles profile
    WHERE profile.user_id = auth.uid() AND profile.player_id = players.id)
  OR EXISTS (SELECT 1 FROM public.league_members member
    WHERE member.player_id = players.id AND public.is_league_admin(member.league_id))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.account_profiles profile
    WHERE profile.user_id = auth.uid() AND profile.player_id = players.id)
  OR EXISTS (SELECT 1 FROM public.league_members member
    WHERE member.player_id = players.id AND public.is_league_admin(member.league_id))
);

DROP POLICY IF EXISTS tenant_player_delete ON public.players;
CREATE POLICY tenant_player_delete ON public.players FOR DELETE TO authenticated USING (
  (public.is_admin_of_any_league() AND created_by_user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.league_members member
      WHERE member.player_id = players.id))
  OR (EXISTS (SELECT 1 FROM public.league_members member
        WHERE member.player_id = players.id AND public.is_league_admin(member.league_id))
      AND NOT EXISTS (SELECT 1 FROM public.league_members member
        WHERE member.player_id = players.id AND NOT public.is_league_admin(member.league_id)))
);

COMMIT;
NOTIFY pgrst, 'reload schema';
