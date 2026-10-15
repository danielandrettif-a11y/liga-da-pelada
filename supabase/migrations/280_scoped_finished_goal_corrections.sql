-- All finished-match correction RPCs are SECURITY DEFINER. Resolve the
-- owning league from the event/match before changing scores or audit rows.

CREATE OR REPLACE FUNCTION public.correct_finished_goal(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_event public.match_events%ROWTYPE;
  selected_match public.matches%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
BEGIN
  SELECT * INTO selected_event FROM public.match_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gol nao encontrado.'; END IF;
  SELECT * INTO selected_match FROM public.matches WHERE id = selected_event.match_id FOR UPDATE;
  SELECT * INTO selected_round FROM public.rounds WHERE id = selected_match.round_id FOR UPDATE;
  IF NOT public.is_league_admin(selected_round.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF selected_match.status <> 'finished' OR selected_round.status <> 'finished' THEN
    RAISE EXCEPTION 'Esta correcao e exclusiva para partidas de rodadas finalizadas.';
  END IF;

  DELETE FROM public.match_events WHERE id = p_event_id;
  UPDATE public.matches match_item SET
    score_a = (SELECT count(*) FROM public.match_events event WHERE event.match_id = match_item.id AND event.team_id = match_item.team_a_id),
    score_b = (SELECT count(*) FROM public.match_events event WHERE event.match_id = match_item.id AND event.team_id = match_item.team_b_id)
  WHERE match_item.id = selected_match.id;

  INSERT INTO public.sports_admin_audit (league_id, round_id, match_id, action, changed_by, payload)
  VALUES (selected_round.league_id, selected_round.id, selected_match.id, 'goal_corrected', auth.uid(), jsonb_build_object(
    'event_id', selected_event.id, 'player_id', selected_event.player_id,
    'assist_player_id', selected_event.assist_player_id, 'team_id', selected_event.team_id,
    'minute', selected_event.minute
  ));
  RETURN jsonb_build_object('round_id', selected_round.id, 'match_id', selected_match.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_finished_goal_assist(
  p_event_id uuid,
  p_assist_player_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_event public.match_events%ROWTYPE;
  selected_match public.matches%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
BEGIN
  SELECT * INTO selected_event FROM public.match_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gol não encontrado.'; END IF;
  SELECT * INTO selected_match FROM public.matches WHERE id = selected_event.match_id FOR UPDATE;
  SELECT * INTO selected_round FROM public.rounds WHERE id = selected_match.round_id FOR UPDATE;
  IF NOT public.is_league_admin(selected_round.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF selected_match.status <> 'finished' OR selected_round.status <> 'finished' THEN
    RAISE EXCEPTION 'Esta correção é exclusiva para partidas de rodadas finalizadas.';
  END IF;
  IF selected_event.is_own_goal THEN RAISE EXCEPTION 'Gol contra não pode receber assistência.'; END IF;
  IF p_assist_player_id = selected_event.player_id THEN RAISE EXCEPTION 'O autor do gol não pode dar a própria assistência.'; END IF;
  IF p_assist_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.match_players player_entry
    WHERE player_entry.match_id = selected_event.match_id
      AND player_entry.team_id = selected_event.team_id
      AND player_entry.player_id = p_assist_player_id
  ) THEN
    RAISE EXCEPTION 'O assistente precisa ter participado do mesmo time nesta partida.';
  END IF;

  UPDATE public.match_events SET assist_player_id = p_assist_player_id WHERE id = selected_event.id;

  INSERT INTO public.sports_admin_audit (league_id, round_id, match_id, action, changed_by, payload)
  VALUES (selected_round.league_id, selected_round.id, selected_match.id, 'goal_assist_corrected', auth.uid(), jsonb_build_object(
    'event_id', selected_event.id,
    'player_id', selected_event.player_id,
    'previous_assist_player_id', selected_event.assist_player_id,
    'assist_player_id', p_assist_player_id
  ));

  RETURN jsonb_build_object('round_id', selected_round.id, 'match_id', selected_match.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_finished_goal_event(
  p_event_id uuid,
  p_player_id uuid,
  p_assist_player_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_event public.match_events%ROWTYPE;
  selected_match public.matches%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
BEGIN
  SELECT * INTO selected_event FROM public.match_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gol não encontrado.'; END IF;
  SELECT * INTO selected_match FROM public.matches WHERE id = selected_event.match_id FOR UPDATE;
  SELECT * INTO selected_round FROM public.rounds WHERE id = selected_match.round_id FOR UPDATE;
  IF NOT public.is_league_admin(selected_round.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
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

CREATE OR REPLACE FUNCTION public.add_finished_goal_event(
  p_match_id uuid,
  p_team_id uuid,
  p_player_id uuid,
  p_assist_player_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_match public.matches%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
  created_event_id uuid;
  new_score_a integer;
  new_score_b integer;
BEGIN
  SELECT * INTO selected_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partida não encontrada.'; END IF;
  SELECT * INTO selected_round FROM public.rounds WHERE id = selected_match.round_id FOR UPDATE;
  IF NOT public.is_league_admin(selected_round.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
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
    count(*) FILTER (WHERE event.team_id = selected_match.team_a_id)::integer,
    count(*) FILTER (WHERE event.team_id = selected_match.team_b_id)::integer
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

REVOKE ALL ON FUNCTION public.correct_finished_goal(uuid),
  public.correct_finished_goal_assist(uuid, uuid),
  public.correct_finished_goal_event(uuid, uuid, uuid),
  public.add_finished_goal_event(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_finished_goal(uuid),
  public.correct_finished_goal_assist(uuid, uuid),
  public.correct_finished_goal_event(uuid, uuid, uuid),
  public.add_finished_goal_event(uuid, uuid, uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
