-- delete_match_event foi criado como SECURITY DEFINER na migration 047 sem
-- autorizacao interna. A checagem da Server Action nao protege a RPC direta.
-- Segue o mesmo limite de autorizacao usado por register_goal desde a 279.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_match_event(
  p_event_id uuid,
  p_match_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_event record;
  v_is_team_a boolean;
  v_new_score_a integer;
  v_new_score_b integer;
  target_league_id uuid;
BEGIN
  SELECT id, status, team_a_id, team_b_id, score_a, score_b, round_id
    INTO v_match
    FROM public.matches
    WHERE id = p_match_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida não encontrada.';
  END IF;

  SELECT league_id INTO target_league_id
  FROM public.rounds
  WHERE id = v_match.round_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;

  IF v_match.status != 'live' THEN
    RAISE EXCEPTION 'A partida não está em andamento.';
  END IF;

  SELECT id, team_id
    INTO v_event
    FROM public.match_events
    WHERE id = p_event_id AND match_id = p_match_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado nesta partida.';
  END IF;

  DELETE FROM public.match_events
  WHERE id = p_event_id AND match_id = p_match_id;

  v_is_team_a := (v_event.team_id = v_match.team_a_id);
  v_new_score_a := CASE WHEN v_is_team_a THEN GREATEST(0, v_match.score_a - 1) ELSE v_match.score_a END;
  v_new_score_b := CASE WHEN NOT v_is_team_a THEN GREATEST(0, v_match.score_b - 1) ELSE v_match.score_b END;

  UPDATE public.matches SET
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
$$;

REVOKE ALL ON FUNCTION public.delete_match_event(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_match_event(uuid, uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
