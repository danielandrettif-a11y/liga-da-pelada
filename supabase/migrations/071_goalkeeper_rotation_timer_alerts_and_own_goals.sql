-- Ordem BQ de goleiros, alertas deduplicados do cronômetro e gol contra.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS timer_thirty_seconds_alerted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timer_finished_alerted_at TIMESTAMPTZ;

ALTER TABLE public.match_events
  ADD COLUMN IF NOT EXISTS is_own_goal BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.player_round_stats
  ADD COLUMN IF NOT EXISTS own_goals INTEGER NOT NULL DEFAULT 0 CHECK (own_goals >= 0);

ALTER TABLE public.ranking_rules DROP CONSTRAINT IF EXISTS ranking_rules_event_type_check;
ALTER TABLE public.ranking_rules ADD CONSTRAINT ranking_rules_event_type_check
  CHECK (event_type IN (
    'goal', 'assist', 'win', 'draw', 'loss', 'best_goalkeeper',
    'goalkeeper_appearance', 'goal_conceded', 'own_goal'
  ));

INSERT INTO public.ranking_rules (league_id, event_type, points)
SELECT id, 'own_goal', -2 FROM public.leagues
ON CONFLICT (league_id, event_type) DO NOTHING;

-- O placar sempre vai para p_team_id. Em gol contra, o autor precisa estar
-- ativo no outro time e não recebe gol/assistência positivos.
DROP FUNCTION IF EXISTS public.register_goal(UUID, UUID, UUID, UUID, INTEGER, TEXT);

CREATE FUNCTION public.register_goal(
  p_match_id UUID,
  p_player_id UUID,
  p_team_id UUID,
  p_assist_player_id UUID DEFAULT NULL,
  p_minute INTEGER DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_is_own_goal BOOLEAN DEFAULT FALSE
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_event_id UUID;
  v_is_team_a BOOLEAN;
  v_new_score_a INTEGER;
  v_new_score_b INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem registrar gols.';
  END IF;

  SELECT id, status, team_a_id, team_b_id, score_a, score_b, round_id
    INTO v_match
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Partida não encontrada.'; END IF;
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
    SELECT 1 FROM public.match_players
    WHERE match_id = p_match_id
      AND player_id = p_player_id
      AND is_active = TRUE
      AND (
        (NOT p_is_own_goal AND team_id = p_team_id)
        OR (p_is_own_goal AND team_id <> p_team_id)
      )
  ) THEN
    RAISE EXCEPTION 'O jogador escolhido não está ativo no time permitido para este gol.';
  END IF;

  IF p_assist_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.match_players
    WHERE match_id = p_match_id
      AND player_id = p_assist_player_id
      AND team_id = p_team_id
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'O assistente não está ativo nesta partida.';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_event_id
    FROM public.match_events
    WHERE match_id = p_match_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN json_build_object(
        'event_id', v_event_id, 'idempotent', true,
        'score_a', v_match.score_a, 'score_b', v_match.score_b,
        'round_id', v_match.round_id
      );
    END IF;
  END IF;

  INSERT INTO public.match_events (
    match_id, player_id, assist_player_id, team_id, event_type,
    minute, idempotency_key, is_own_goal
  ) VALUES (
    p_match_id, p_player_id, p_assist_player_id, p_team_id, 'goal',
    p_minute, p_idempotency_key, p_is_own_goal
  ) RETURNING id INTO v_event_id;

  v_is_team_a := (p_team_id = v_match.team_a_id);
  v_new_score_a := v_match.score_a + CASE WHEN v_is_team_a THEN 1 ELSE 0 END;
  v_new_score_b := v_match.score_b + CASE WHEN NOT v_is_team_a THEN 1 ELSE 0 END;

  UPDATE public.matches
  SET score_a = v_new_score_a, score_b = v_new_score_b
  WHERE id = p_match_id;

  RETURN json_build_object(
    'event_id', v_event_id, 'idempotent', false,
    'score_a', v_new_score_a, 'score_b', v_new_score_b,
    'round_id', v_match.round_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_goal(UUID, UUID, UUID, UUID, INTEGER, TEXT, BOOLEAN)
  TO authenticated, service_role;
