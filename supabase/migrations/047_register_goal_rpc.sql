-- ==============================================================================
-- Migration 047: RPCs transacionais para Registro e Remoção de Gol com Lock
-- e Idempotência (Performance & Concorrência)
-- ==============================================================================

-- 1. Coluna de idempotência para evitar duplicação por duplo clique/retentativas
ALTER TABLE match_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS match_events_idempotency_key_idx
  ON match_events(match_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. RPC register_goal: Atômica com SELECT FOR UPDATE
CREATE OR REPLACE FUNCTION register_goal(
  p_match_id UUID,
  p_player_id UUID,
  p_team_id UUID,
  p_assist_player_id UUID DEFAULT NULL,
  p_minute INTEGER DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_match RECORD;
  v_event_id UUID;
  v_is_team_a BOOLEAN;
  v_new_score_a INTEGER;
  v_new_score_b INTEGER;
BEGIN
  -- Bloqueia a linha da partida para evitar race condition
  SELECT id, status, team_a_id, team_b_id, score_a, score_b, round_id
    INTO v_match
    FROM matches
    WHERE id = p_match_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida não encontrada.';
  END IF;

  IF v_match.status != 'live' THEN
    RAISE EXCEPTION 'A partida não está em andamento.';
  END IF;

  IF p_team_id != v_match.team_a_id AND p_team_id != v_match.team_b_id THEN
    RAISE EXCEPTION 'O time não participa desta partida.';
  END IF;

  IF p_assist_player_id IS NOT NULL AND p_player_id = p_assist_player_id THEN
    RAISE EXCEPTION 'O autor do gol não pode dar assistência para si mesmo.';
  END IF;

  -- Valida se o artilheiro está ativo na partida
  IF NOT EXISTS (
    SELECT 1 FROM match_players
    WHERE match_id = p_match_id
      AND player_id = p_player_id
      AND team_id = p_team_id
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'O jogador não está ativo nesta partida.';
  END IF;

  -- Valida se o assistente está ativo na partida (caso informado)
  IF p_assist_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM match_players
    WHERE match_id = p_match_id
      AND player_id = p_assist_player_id
      AND team_id = p_team_id
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'O assistente não está ativo nesta partida.';
  END IF;

  -- Checagem de idempotência: se já existe evento com essa chave nesta partida, retorna existente
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_event_id
    FROM match_events
    WHERE match_id = p_match_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN json_build_object(
        'event_id', v_event_id,
        'idempotent', true,
        'score_a', v_match.score_a,
        'score_b', v_match.score_b,
        'round_id', v_match.round_id
      );
    END IF;
  END IF;

  -- Inserir evento de gol
  INSERT INTO match_events (
    match_id,
    player_id,
    assist_player_id,
    team_id,
    event_type,
    minute,
    idempotency_key
  ) VALUES (
    p_match_id,
    p_player_id,
    p_assist_player_id,
    p_team_id,
    'goal',
    p_minute,
    p_idempotency_key
  ) RETURNING id INTO v_event_id;

  -- Atualizar placar atômico
  v_is_team_a := (p_team_id = v_match.team_a_id);
  v_new_score_a := v_match.score_a + CASE WHEN v_is_team_a THEN 1 ELSE 0 END;
  v_new_score_b := v_match.score_b + CASE WHEN NOT v_is_team_a THEN 1 ELSE 0 END;

  UPDATE matches SET
    score_a = v_new_score_a,
    score_b = v_new_score_b
  WHERE id = p_match_id;

  RETURN json_build_object(
    'event_id', v_event_id,
    'idempotent', false,
    'score_a', v_new_score_a,
    'score_b', v_new_score_b,
    'round_id', v_match.round_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC delete_match_event: Atômica com SELECT FOR UPDATE
CREATE OR REPLACE FUNCTION delete_match_event(
  p_event_id UUID,
  p_match_id UUID
) RETURNS JSON AS $$
DECLARE
  v_match RECORD;
  v_event RECORD;
  v_is_team_a BOOLEAN;
  v_new_score_a INTEGER;
  v_new_score_b INTEGER;
BEGIN
  -- Bloqueia a linha da partida
  SELECT id, status, team_a_id, team_b_id, score_a, score_b, round_id
    INTO v_match
    FROM matches
    WHERE id = p_match_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida não encontrada.';
  END IF;

  IF v_match.status != 'live' THEN
    RAISE EXCEPTION 'A partida não está em andamento.';
  END IF;

  -- Busca o evento
  SELECT id, team_id
    INTO v_event
    FROM match_events
    WHERE id = p_event_id AND match_id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado nesta partida.';
  END IF;

  -- Remove o evento
  DELETE FROM match_events WHERE id = p_event_id;

  -- Atualiza o placar subtraindo 1 (com mínimo 0)
  v_is_team_a := (v_event.team_id = v_match.team_a_id);
  v_new_score_a := CASE WHEN v_is_team_a THEN GREATEST(0, v_match.score_a - 1) ELSE v_match.score_a END;
  v_new_score_b := CASE WHEN NOT v_is_team_a THEN GREATEST(0, v_match.score_b - 1) ELSE v_match.score_b END;

  UPDATE matches SET
    score_a = v_new_score_a,
    score_b = v_new_score_b
  WHERE id = p_match_id;

  RETURN json_build_object(
    'deleted', true,
    'score_a', v_new_score_a,
    'score_b', v_new_score_b,
    'round_id', v_match.round_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Permissões de execução
GRANT EXECUTE ON FUNCTION register_goal TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_match_event TO authenticated, service_role;
