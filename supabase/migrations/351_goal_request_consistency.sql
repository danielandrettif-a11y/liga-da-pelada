-- Preserve the original request and receipt so retries cannot change the
-- meaning of an idempotency key or return a later score.
ALTER TABLE public.match_events
  ADD COLUMN IF NOT EXISTS goal_request jsonb,
  ADD COLUMN IF NOT EXISTS goal_receipt jsonb;

-- Existing rows have no original requested minute. Their other input fields
-- are compared on retry, but their original score cannot be reconstructed.
CREATE OR REPLACE FUNCTION public.register_goal(
  p_match_id uuid,
  p_player_id uuid,
  p_team_id uuid,
  p_assist_player_id uuid DEFAULT NULL,
  p_minute integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_is_own_goal boolean DEFAULT false
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_event_id uuid;
  v_is_team_a boolean;
  v_new_score_a integer;
  v_new_score_b integer;
  v_elapsed_seconds integer;
  v_recorded_minute integer;
  target_league_id uuid;
  v_existing record;
  v_request jsonb;
  v_receipt jsonb;
BEGIN
  v_request := jsonb_build_object(
    'player_id', p_player_id,
    'team_id', p_team_id,
    'assist_player_id', p_assist_player_id,
    'minute', p_minute,
    'is_own_goal', COALESCE(p_is_own_goal, false)
  );
  SELECT
    id, status, team_a_id, team_b_id, score_a, score_b, round_id,
    timer_started_at, timer_accumulated_seconds,
    eligibility_elapsed_offset_seconds
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Partida não encontrada.'; END IF;
  SELECT league_id INTO target_league_id
  FROM public.rounds
  WHERE id = v_match.round_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;

  -- A retry must work even after the match is finished or a player is inactive.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, player_id, team_id, assist_player_id, is_own_goal,
           goal_request, goal_receipt
    INTO v_existing
    FROM public.match_events
    WHERE match_id = p_match_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      IF (v_existing.goal_request IS NOT NULL AND v_existing.goal_request <> v_request)
        OR (v_existing.goal_request IS NULL AND (
          v_existing.player_id IS DISTINCT FROM p_player_id
          OR v_existing.team_id IS DISTINCT FROM p_team_id
          OR v_existing.assist_player_id IS DISTINCT FROM p_assist_player_id
          OR COALESCE(v_existing.is_own_goal, false) IS DISTINCT FROM COALESCE(p_is_own_goal, false)
        )) THEN
        RAISE EXCEPTION 'Chave de idempotência reutilizada com outro conteúdo.';
      END IF;
      IF v_existing.goal_receipt IS NOT NULL THEN
        RETURN (v_existing.goal_receipt || jsonb_build_object('idempotent', true))::json;
      END IF;
      RETURN json_build_object(
        'event_id', v_existing.id, 'idempotent', true,
        'score_a', v_match.score_a, 'score_b', v_match.score_b,
        'round_id', v_match.round_id
      );
    END IF;
  END IF;

  IF v_match.status != 'live' THEN RAISE EXCEPTION 'A partida não está em andamento.'; END IF;
  IF p_team_id != v_match.team_a_id AND p_team_id != v_match.team_b_id THEN
    RAISE EXCEPTION 'O time não participa desta partida.';
  END IF;
  IF p_assist_player_id IS NOT NULL AND p_player_id = p_assist_player_id THEN
    RAISE EXCEPTION 'O autor do gol não pode dar assistência para si mesmo.';
  END IF;
  IF p_is_own_goal AND p_assist_player_id IS NOT NULL THEN
    RAISE EXCEPTION 'Gol contra não pode ter assistência.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.match_players
    WHERE match_id = p_match_id
      AND player_id = p_player_id
      AND is_active = true
      AND (
        (NOT p_is_own_goal AND team_id = p_team_id)
        OR (p_is_own_goal AND team_id <> p_team_id)
      )
  ) THEN
    RAISE EXCEPTION 'O jogador escolhido não está ativo no time permitido para este gol.';
  END IF;

  IF p_assist_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.match_players
    WHERE match_id = p_match_id
      AND player_id = p_assist_player_id
      AND team_id = p_team_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'O assistente não está ativo nesta partida.';
  END IF;

  v_elapsed_seconds := GREATEST(
    0,
    COALESCE(v_match.eligibility_elapsed_offset_seconds, 0)
      + COALESCE(v_match.timer_accumulated_seconds, 0)
      + CASE
          WHEN v_match.timer_started_at IS NULL THEN 0
          ELSE GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - v_match.timer_started_at)))::integer
          )
        END
  );

  IF v_elapsed_seconds = 0 AND p_minute IS NOT NULL AND p_minute > 0 THEN
    v_elapsed_seconds := p_minute * 60;
  END IF;
  v_recorded_minute := FLOOR(v_elapsed_seconds / 60.0)::integer;

  INSERT INTO public.match_events (
    match_id, player_id, assist_player_id, team_id, event_type,
    minute, elapsed_seconds, idempotency_key, is_own_goal, goal_request
  ) VALUES (
    p_match_id, p_player_id, p_assist_player_id, p_team_id, 'goal',
    v_recorded_minute, v_elapsed_seconds, p_idempotency_key, p_is_own_goal, v_request
  ) RETURNING id INTO v_event_id;

  v_is_team_a := (p_team_id = v_match.team_a_id);
  v_new_score_a := v_match.score_a + CASE WHEN v_is_team_a THEN 1 ELSE 0 END;
  v_new_score_b := v_match.score_b + CASE WHEN NOT v_is_team_a THEN 1 ELSE 0 END;

  UPDATE public.matches
  SET score_a = v_new_score_a, score_b = v_new_score_b
  WHERE id = p_match_id;

  v_receipt := jsonb_build_object(
    'event_id', v_event_id, 'idempotent', false,
    'score_a', v_new_score_a, 'score_b', v_new_score_b,
    'round_id', v_match.round_id,
    'elapsed_seconds', v_elapsed_seconds
  );
  UPDATE public.match_events SET goal_receipt = v_receipt WHERE id = v_event_id;
  RETURN v_receipt::json;
END;
$$;

REVOKE ALL ON FUNCTION public.register_goal(uuid, uuid, uuid, uuid, integer, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_goal(uuid, uuid, uuid, uuid, integer, text, boolean)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
