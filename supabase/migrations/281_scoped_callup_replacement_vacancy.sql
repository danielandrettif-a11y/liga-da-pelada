-- Opening a replacement vacancy mutates a callup, round and team under
-- SECURITY DEFINER. The league is resolved from the round before any write.
CREATE OR REPLACE FUNCTION public.open_callup_replacement_vacancy(
  p_round_id uuid,
  p_out_player_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_round public.rounds%ROWTYPE;
  linked_callup public.callups%ROWTYPE;
  previous_team_player public.team_players%ROWTYPE;
BEGIN
  SELECT * INTO selected_round
  FROM public.rounds
  WHERE id = p_round_id AND status = 'draft'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A vaga só pode ser aberta antes do início da rodada.';
  END IF;
  IF NOT public.is_league_admin(selected_round.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = p_round_id
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
  ) THEN
    RAISE EXCEPTION 'A vaga só pode ser aberta antes do primeiro jogo.';
  END IF;

  SELECT * INTO linked_callup
  FROM public.callups
  WHERE round_id = p_round_id
    AND league_id = selected_round.league_id
    AND status IN ('open', 'locked', 'converted')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta rodada não possui uma convocação vinculada.';
  END IF;

  SELECT team_player.* INTO previous_team_player
  FROM public.team_players team_player
  JOIN public.teams team ON team.id = team_player.team_id
  WHERE team.round_id = p_round_id
    AND team_player.player_id = p_out_player_id
  FOR UPDATE OF team_player;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O jogador não está em um time desta rodada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.callup_replacement_slots
    WHERE callup_id = linked_callup.id
      AND team_id = previous_team_player.team_id
      AND replacement_player_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Este time já possui uma vaga aberta na convocação.';
  END IF;

  DELETE FROM public.team_players WHERE id = previous_team_player.id;
  DELETE FROM public.round_players
  WHERE round_id = p_round_id AND player_id = p_out_player_id;
  UPDATE public.teams
  SET captain_player_id = NULL
  WHERE id = previous_team_player.team_id
    AND captain_player_id = p_out_player_id;

  INSERT INTO public.callup_replacement_slots (
    callup_id, round_id, team_id, vacated_player_id, goalkeeper_order, loan_order
  )
  VALUES (
    linked_callup.id, p_round_id, previous_team_player.team_id, p_out_player_id,
    previous_team_player.goalkeeper_order, previous_team_player.loan_order
  );

  DELETE FROM public.callup_entries
  WHERE callup_id = linked_callup.id AND player_id = p_out_player_id;
  PERFORM public.normalize_callup_positions(linked_callup.id);

  UPDATE public.callups callup
  SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.callup_replacement_slots slot
          WHERE slot.callup_id = callup.id AND slot.replacement_player_id IS NULL
        ) THEN 'open'
        ELSE 'converted'
      END,
      updated_at = now()
  WHERE callup.id = linked_callup.id;

  RETURN linked_callup.id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_callup_replacement_vacancy(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_callup_replacement_vacancy(uuid, uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
