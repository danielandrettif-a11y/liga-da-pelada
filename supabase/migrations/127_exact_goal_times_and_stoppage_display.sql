-- Guarda o instante exato do gol para que o histórico diferencie o tempo
-- regulamentar dos acréscimos. Registros antigos permanecem com NULL porque
-- o campo minute não permite recuperar os segundos que foram descartados.

ALTER TABLE public.match_events
  ADD COLUMN IF NOT EXISTS elapsed_seconds INTEGER;

ALTER TABLE public.match_events
  DROP CONSTRAINT IF EXISTS match_events_elapsed_seconds_check;

ALTER TABLE public.match_events
  ADD CONSTRAINT match_events_elapsed_seconds_check
  CHECK (elapsed_seconds IS NULL OR elapsed_seconds >= 0);

COMMENT ON COLUMN public.match_events.elapsed_seconds IS
  'Segundo oficial do gol, incluindo offsets causados por reinício do cronômetro.';

CREATE OR REPLACE FUNCTION public.register_goal(
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
  v_elapsed_seconds INTEGER;
  v_recorded_minute INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem registrar gols.';
  END IF;

  SELECT
    id, status, team_a_id, team_b_id, score_a, score_b, round_id,
    timer_started_at, timer_accumulated_seconds,
    eligibility_elapsed_offset_seconds
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
    SELECT 1
    FROM public.match_players
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
    SELECT 1
    FROM public.match_players
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

  -- O servidor é a fonte de verdade do tempo. O offset preserva o tempo
  -- oficial quando o administrador zera o relógio durante a partida.
  v_elapsed_seconds := GREATEST(
    0,
    COALESCE(v_match.eligibility_elapsed_offset_seconds, 0)
      + COALESCE(v_match.timer_accumulated_seconds, 0)
      + CASE
          WHEN v_match.timer_started_at IS NULL THEN 0
          ELSE GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - v_match.timer_started_at)))::INTEGER
          )
        END
  );

  -- p_minute continua na assinatura por compatibilidade. Só é usado quando
  -- não há nenhum estado de cronômetro disponível no servidor.
  IF v_elapsed_seconds = 0 AND p_minute IS NOT NULL AND p_minute > 0 THEN
    v_elapsed_seconds := p_minute * 60;
  END IF;
  v_recorded_minute := FLOOR(v_elapsed_seconds / 60.0)::INTEGER;

  INSERT INTO public.match_events (
    match_id, player_id, assist_player_id, team_id, event_type,
    minute, elapsed_seconds, idempotency_key, is_own_goal
  ) VALUES (
    p_match_id, p_player_id, p_assist_player_id, p_team_id, 'goal',
    v_recorded_minute, v_elapsed_seconds, p_idempotency_key, p_is_own_goal
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
    'round_id', v_match.round_id,
    'elapsed_seconds', v_elapsed_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_goal(UUID, UUID, UUID, UUID, INTEGER, TEXT, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_goal(UUID, UUID, UUID, UUID, INTEGER, TEXT, BOOLEAN)
  TO authenticated, service_role;
