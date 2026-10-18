-- As RPCs legadas exigiam o papel global is_app_admin(), mesmo depois do
-- isolamento por pelada da migration 255. O alvo da operacao define a liga;
-- a autorizacao nunca deve depender da pelada selecionada no navegador.
BEGIN;

CREATE OR REPLACE FUNCTION public.substitute_match_player(
  p_match_id uuid,
  p_team_id uuid,
  p_player_out_id uuid,
  p_player_in_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'tired',
  p_mark_injured boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_match public.matches%ROWTYPE;
  target_league_id uuid;
  outgoing public.match_players%ROWTYPE;
  incoming_original_team_id uuid;
  elapsed integer;
  substitution_id uuid;
BEGIN
  SELECT * INTO current_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND OR current_match.status <> 'live' THEN
    RAISE EXCEPTION 'A partida nao esta em andamento.';
  END IF;

  SELECT league_id INTO target_league_id
  FROM public.rounds
  WHERE id = current_match.round_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente administradores desta pelada podem fazer substituicoes.';
  END IF;
  IF p_reason NOT IN ('tired', 'injury', 'other') THEN
    RAISE EXCEPTION 'Motivo de substituicao invalido.';
  END IF;

  IF p_team_id NOT IN (current_match.team_a_id, current_match.team_b_id) THEN
    RAISE EXCEPTION 'O time informado nao participa desta partida.';
  END IF;

  SELECT * INTO outgoing
  FROM public.match_players
  WHERE match_id = p_match_id
    AND team_id = p_team_id
    AND player_id = p_player_out_id
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O jogador que vai sair nao esta em campo.';
  END IF;

  elapsed := COALESCE(current_match.eligibility_elapsed_offset_seconds, 0)
    + COALESCE(current_match.timer_accumulated_seconds, 0);
  IF current_match.timer_started_at IS NOT NULL THEN
    elapsed := elapsed + GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (now() - current_match.timer_started_at)))::integer
    );
  END IF;

  IF p_player_in_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.match_players
      WHERE match_id = p_match_id AND player_id = p_player_in_id
    ) THEN
      RAISE EXCEPTION 'Este jogador ja participou da partida e nao pode voltar.';
    END IF;

    SELECT team_player.team_id INTO incoming_original_team_id
    FROM public.team_players AS team_player
    JOIN public.teams AS original_team ON original_team.id = team_player.team_id
    JOIN public.round_players AS round_player
      ON round_player.round_id = current_match.round_id
      AND round_player.player_id = team_player.player_id
    WHERE team_player.player_id = p_player_in_id
      AND original_team.round_id = current_match.round_id
      AND team_player.team_id NOT IN (current_match.team_a_id, current_match.team_b_id)
      AND round_player.availability_status = 'available'
    LIMIT 1
    FOR UPDATE OF round_player;

    IF incoming_original_team_id IS NULL THEN
      RAISE EXCEPTION 'O substituto precisa estar disponivel em um time que esteja aguardando.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.match_players AS active_player
      JOIN public.matches AS live_match ON live_match.id = active_player.match_id
      WHERE active_player.player_id = p_player_in_id
        AND active_player.is_active = true
        AND live_match.status = 'live'
    ) THEN
      RAISE EXCEPTION 'Este jogador ja esta em outra partida ao vivo.';
    END IF;
  END IF;

  UPDATE public.match_players
  SET is_active = false, left_elapsed_seconds = elapsed
  WHERE id = outgoing.id;

  IF p_player_in_id IS NOT NULL THEN
    INSERT INTO public.match_players (
      match_id, player_id, team_id, original_team_id, is_starter,
      is_active, result_eligible, entered_elapsed_seconds
    ) VALUES (
      p_match_id, p_player_in_id, p_team_id, incoming_original_team_id,
      false, true, elapsed <= (current_match.duration_seconds / 2), elapsed
    );
  END IF;

  IF p_mark_injured THEN
    UPDATE public.round_players
    SET availability_status = 'injured', availability_updated_at = now()
    WHERE round_id = current_match.round_id AND player_id = p_player_out_id;
  END IF;

  INSERT INTO public.match_substitutions (
    match_id, team_id, player_out_id, player_in_id,
    player_in_original_team_id, reason, marked_injured, elapsed_seconds, created_by
  ) VALUES (
    p_match_id, p_team_id, p_player_out_id, p_player_in_id,
    incoming_original_team_id, p_reason, p_mark_injured, elapsed, auth.uid()
  )
  RETURNING id INTO substitution_id;

  RETURN substitution_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_last_match_substitution(p_substitution_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  substitution public.match_substitutions%ROWTYPE;
  latest_substitution_id uuid;
  match_status text;
  target_league_id uuid;
BEGIN
  SELECT * INTO substitution
  FROM public.match_substitutions
  WHERE id = p_substitution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Substituicao nao encontrada.';
  END IF;

  SELECT match_item.status, round_item.league_id
    INTO match_status, target_league_id
  FROM public.matches AS match_item
  JOIN public.rounds AS round_item ON round_item.id = match_item.round_id
  WHERE match_item.id = substitution.match_id
  FOR UPDATE OF match_item;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente administradores desta pelada podem corrigir substituicoes.';
  END IF;
  IF match_status <> 'live' THEN
    RAISE EXCEPTION 'Somente partidas em andamento podem ser corrigidas.';
  END IF;

  SELECT id INTO latest_substitution_id
  FROM public.match_substitutions
  WHERE match_id = substitution.match_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF latest_substitution_id <> p_substitution_id THEN
    RAISE EXCEPTION 'Apenas a substituicao mais recente pode ser desfeita.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.match_events
    WHERE match_id = substitution.match_id
      AND created_at > substitution.created_at
  ) THEN
    RAISE EXCEPTION 'Ha um gol registrado depois desta substituicao.';
  END IF;

  IF substitution.marked_injured THEN
    UPDATE public.round_players AS round_player
    SET availability_status = 'available', availability_updated_at = now()
    FROM public.matches AS match_item
    WHERE match_item.id = substitution.match_id
      AND round_player.round_id = match_item.round_id
      AND round_player.player_id = substitution.player_out_id;
  END IF;

  UPDATE public.match_players
  SET is_active = true, left_elapsed_seconds = NULL
  WHERE match_id = substitution.match_id
    AND player_id = substitution.player_out_id;

  IF substitution.player_in_id IS NOT NULL THEN
    DELETE FROM public.match_players
    WHERE match_id = substitution.match_id
      AND player_id = substitution.player_in_id;
  END IF;

  DELETE FROM public.match_substitutions WHERE id = p_substitution_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_round_player_availability(
  p_round_id uuid,
  p_player_id uuid,
  p_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  round_player_id uuid;
  target_league_id uuid;
BEGIN
  SELECT league_id INTO target_league_id
  FROM public.rounds
  WHERE id = p_round_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente administradores desta pelada podem alterar a disponibilidade.';
  END IF;
  IF p_status NOT IN ('available', 'injured') THEN
    RAISE EXCEPTION 'Status de disponibilidade invalido.';
  END IF;

  SELECT id INTO round_player_id
  FROM public.round_players
  WHERE round_id = p_round_id AND player_id = p_player_id
  FOR UPDATE;

  IF round_player_id IS NULL THEN
    RAISE EXCEPTION 'Jogador nao encontrado nesta rodada.';
  END IF;

  IF p_status = 'injured' AND EXISTS (
    SELECT 1
    FROM public.match_players AS participant
    JOIN public.matches AS match_item ON match_item.id = participant.match_id
    WHERE match_item.round_id = p_round_id
      AND match_item.status = 'live'
      AND participant.player_id = p_player_id
      AND participant.is_active = true
  ) THEN
    RAISE EXCEPTION 'Retire o jogador da partida ao vivo antes de marca-lo como machucado.';
  END IF;

  UPDATE public.round_players
  SET availability_status = p_status, availability_updated_at = now()
  WHERE id = round_player_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.substitute_match_player(uuid, uuid, uuid, uuid, text, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.undo_last_match_substitution(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_round_player_availability(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.substitute_match_player(uuid, uuid, uuid, uuid, text, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_last_match_substitution(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_round_player_availability(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
