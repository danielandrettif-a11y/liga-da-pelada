-- Adiciona um gol ausente a uma partida finalizada e registra a correção.

CREATE OR REPLACE FUNCTION public.add_finished_goal_event(
  p_match_id UUID,
  p_team_id UUID,
  p_player_id UUID,
  p_assist_player_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_match public.matches%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
  created_event_id UUID;
  new_score_a INTEGER;
  new_score_b INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem adicionar gols em partidas finalizadas.';
  END IF;

  SELECT * INTO selected_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partida não encontrada.'; END IF;
  SELECT * INTO selected_round FROM public.rounds WHERE id = selected_match.round_id FOR UPDATE;

  IF selected_match.status <> 'finished' OR selected_round.status <> 'finished' THEN
    RAISE EXCEPTION 'Esta correção é exclusiva para partidas de rodadas finalizadas.';
  END IF;
  IF p_team_id <> selected_match.team_a_id AND p_team_id <> selected_match.team_b_id THEN
    RAISE EXCEPTION 'O time não participa desta partida.';
  END IF;
  IF p_assist_player_id = p_player_id THEN
    RAISE EXCEPTION 'O autor do gol não pode dar a própria assistência.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.match_players player_entry
    WHERE player_entry.match_id = selected_match.id
      AND player_entry.team_id = p_team_id
      AND player_entry.player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'O autor do gol precisa ter participado pelo time nesta partida.';
  END IF;
  IF p_assist_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.match_players player_entry
    WHERE player_entry.match_id = selected_match.id
      AND player_entry.team_id = p_team_id
      AND player_entry.player_id = p_assist_player_id
  ) THEN
    RAISE EXCEPTION 'O assistente precisa ter participado pelo time nesta partida.';
  END IF;

  INSERT INTO public.match_events (
    match_id, player_id, assist_player_id, team_id, event_type, is_own_goal
  ) VALUES (
    selected_match.id, p_player_id, p_assist_player_id, p_team_id, 'goal', false
  ) RETURNING id INTO created_event_id;

  SELECT
    count(*) FILTER (WHERE event.team_id = selected_match.team_a_id)::INTEGER,
    count(*) FILTER (WHERE event.team_id = selected_match.team_b_id)::INTEGER
  INTO new_score_a, new_score_b
  FROM public.match_events event
  WHERE event.match_id = selected_match.id;

  UPDATE public.matches
  SET score_a = new_score_a, score_b = new_score_b
  WHERE id = selected_match.id;

  INSERT INTO public.sports_admin_audit (
    league_id, round_id, match_id, action, changed_by, payload
  ) VALUES (
    selected_round.league_id,
    selected_round.id,
    selected_match.id,
    'goal_event_added',
    auth.uid(),
    jsonb_build_object(
      'event_id', created_event_id,
      'player_id', p_player_id,
      'assist_player_id', p_assist_player_id,
      'team_id', p_team_id
    )
  );

  RETURN jsonb_build_object(
    'round_id', selected_round.id,
    'match_id', selected_match.id,
    'event_id', created_event_id,
    'score_a', new_score_a,
    'score_b', new_score_b
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_finished_goal_event(UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_finished_goal_event(UUID, UUID, UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
