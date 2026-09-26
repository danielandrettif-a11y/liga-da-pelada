-- Permite corrigir autor e assistência de um gol depois do encerramento,
-- mantendo o placar e registrando quem fez a alteração.

ALTER TABLE public.sports_admin_audit
  ADD COLUMN IF NOT EXISTS changed_by_name TEXT;

UPDATE public.sports_admin_audit audit
SET changed_by_name = COALESCE(
  NULLIF(TRIM(player.name), ''),
  NULLIF(TRIM(user_account.raw_user_meta_data ->> 'name'), ''),
  NULLIF(TRIM(user_account.raw_user_meta_data ->> 'full_name'), ''),
  NULLIF(SPLIT_PART(user_account.email, '@', 1), ''),
  'Administrador'
)
FROM auth.users user_account
LEFT JOIN public.account_profiles profile ON profile.user_id = user_account.id
LEFT JOIN public.players player ON player.id = profile.player_id
WHERE audit.changed_by = user_account.id
  AND audit.changed_by_name IS NULL;

CREATE OR REPLACE FUNCTION public.set_sports_admin_audit_name()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_name TEXT;
BEGIN
  SELECT COALESCE(
    NULLIF(TRIM(player.name), ''),
    NULLIF(TRIM(user_account.raw_user_meta_data ->> 'name'), ''),
    NULLIF(TRIM(user_account.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(SPLIT_PART(user_account.email, '@', 1), ''),
    'Administrador'
  ) INTO actor_name
  FROM auth.users user_account
  LEFT JOIN public.account_profiles profile ON profile.user_id = user_account.id
  LEFT JOIN public.players player ON player.id = profile.player_id
  WHERE user_account.id = NEW.changed_by;
  NEW.changed_by_name := COALESCE(actor_name, 'Administrador');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sports_admin_audit_set_name ON public.sports_admin_audit;
CREATE TRIGGER sports_admin_audit_set_name
BEFORE INSERT ON public.sports_admin_audit
FOR EACH ROW EXECUTE FUNCTION public.set_sports_admin_audit_name();

CREATE OR REPLACE FUNCTION public.correct_finished_goal_event(
  p_event_id UUID,
  p_player_id UUID,
  p_assist_player_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_event public.match_events%ROWTYPE;
  selected_match public.matches%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem corrigir gols.';
  END IF;

  SELECT * INTO selected_event FROM public.match_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gol não encontrado.'; END IF;
  SELECT * INTO selected_match FROM public.matches WHERE id = selected_event.match_id FOR UPDATE;
  SELECT * INTO selected_round FROM public.rounds WHERE id = selected_match.round_id FOR UPDATE;

  IF selected_match.status <> 'finished' OR selected_round.status <> 'finished' THEN
    RAISE EXCEPTION 'Esta correção é exclusiva para partidas de rodadas finalizadas.';
  END IF;
  IF selected_event.event_type <> 'goal' OR selected_event.is_own_goal THEN
    RAISE EXCEPTION 'A correção de autor e assistência é exclusiva para gols normais.';
  END IF;
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'Escolha o autor do gol.'; END IF;
  IF p_assist_player_id = p_player_id THEN
    RAISE EXCEPTION 'O autor do gol não pode dar a própria assistência.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.match_players player_entry
    WHERE player_entry.match_id = selected_event.match_id
      AND player_entry.team_id = selected_event.team_id
      AND player_entry.player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'O autor do gol precisa ter participado pelo mesmo time nesta partida.';
  END IF;
  IF p_assist_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.match_players player_entry
    WHERE player_entry.match_id = selected_event.match_id
      AND player_entry.team_id = selected_event.team_id
      AND player_entry.player_id = p_assist_player_id
  ) THEN
    RAISE EXCEPTION 'O assistente precisa ter participado pelo mesmo time nesta partida.';
  END IF;

  IF selected_event.player_id IS NOT DISTINCT FROM p_player_id
    AND selected_event.assist_player_id IS NOT DISTINCT FROM p_assist_player_id THEN
    RETURN jsonb_build_object('round_id', selected_round.id, 'match_id', selected_match.id);
  END IF;

  UPDATE public.match_events
  SET player_id = p_player_id,
      assist_player_id = p_assist_player_id
  WHERE id = selected_event.id;

  INSERT INTO public.sports_admin_audit (league_id, round_id, match_id, action, changed_by, payload)
  VALUES (
    selected_round.league_id,
    selected_round.id,
    selected_match.id,
    'goal_event_corrected',
    auth.uid(),
    jsonb_build_object(
      'event_id', selected_event.id,
      'previous_player_id', selected_event.player_id,
      'player_id', p_player_id,
      'previous_assist_player_id', selected_event.assist_player_id,
      'assist_player_id', p_assist_player_id
    )
  );

  RETURN jsonb_build_object('round_id', selected_round.id, 'match_id', selected_match.id);
END;
$$;

REVOKE ALL ON FUNCTION public.correct_finished_goal_event(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_finished_goal_event(UUID, UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
