-- Permite ao ADM retirar confirmados ou pessoas da fila até o primeiro jogo.
-- Em times já sorteados, a vaga é preservada e a próxima pessoa da fila entra
-- automaticamente no mesmo time pelo gatilho de callup_replacement_slots.
CREATE OR REPLACE FUNCTION public.admin_remove_callup_player(
  p_callup_id UUID,
  p_player_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  current_status text;
  previous_team_player public.team_players%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem gerenciar a lista.';
  END IF;

  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
    AND status IN ('open', 'converted')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A convocação não está disponível para alterações.';
  END IF;

  IF current_callup.round_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.matches match_item
    WHERE match_item.round_id = current_callup.round_id
      AND (
        match_item.started_at IS NOT NULL
        OR match_item.status IN ('in_progress', 'live', 'finished')
      )
  ) THEN
    RAISE EXCEPTION 'A convocação foi encerrada porque o primeiro jogo já começou.';
  END IF;

  SELECT entry.status INTO current_status
  FROM public.callup_entries entry
  WHERE entry.callup_id = p_callup_id
    AND entry.player_id = p_player_id
  FOR UPDATE;
  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Jogador não encontrado na convocação.';
  END IF;

  IF current_callup.round_id IS NOT NULL THEN
    SELECT team_player.* INTO previous_team_player
    FROM public.team_players team_player
    JOIN public.teams team ON team.id = team_player.team_id
    WHERE team.round_id = current_callup.round_id
      AND team_player.player_id = p_player_id
    FOR UPDATE OF team_player;

    IF FOUND THEN
      IF EXISTS (
        SELECT 1
        FROM public.callup_replacement_slots slot
        WHERE slot.callup_id = p_callup_id
          AND slot.team_id = previous_team_player.team_id
          AND slot.replacement_player_id IS NULL
      ) THEN
        RAISE EXCEPTION 'Este time já possui uma vaga aguardando reposição.';
      END IF;

      DELETE FROM public.team_players WHERE id = previous_team_player.id;
      DELETE FROM public.round_players
      WHERE round_id = current_callup.round_id
        AND player_id = p_player_id;
      UPDATE public.teams
      SET captain_player_id = NULL
      WHERE id = previous_team_player.team_id
        AND captain_player_id = p_player_id;

      INSERT INTO public.callup_replacement_slots (
        callup_id, round_id, team_id, vacated_player_id, goalkeeper_order, loan_order
      ) VALUES (
        p_callup_id, current_callup.round_id, previous_team_player.team_id,
        p_player_id, previous_team_player.goalkeeper_order, previous_team_player.loan_order
      );
    ELSIF current_status = 'confirmed' THEN
      RAISE EXCEPTION 'Não foi possível localizar a vaga deste jogador nos times sorteados.';
    END IF;
  END IF;

  DELETE FROM public.callup_entries
  WHERE callup_id = p_callup_id
    AND player_id = p_player_id;
  PERFORM public.normalize_callup_positions(p_callup_id);

  UPDATE public.callups callup
  SET status = CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.callup_replacement_slots slot
          WHERE slot.callup_id = callup.id
            AND slot.replacement_player_id IS NULL
        ) THEN 'open'
        WHEN callup.round_id IS NOT NULL THEN 'converted'
        ELSE 'open'
      END,
      updated_at = now()
  WHERE callup.id = p_callup_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_remove_callup_player(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_callup_player(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
