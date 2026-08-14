-- Evita conflito no indice unico da ordem de goleiros durante a troca entre times.

CREATE OR REPLACE FUNCTION public.swap_round_team_players(
  p_round_id UUID,
  p_player_a_id UUID,
  p_player_b_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  entry_a public.team_players%ROWTYPE;
  entry_b public.team_players%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem trocar jogadores.';
  END IF;
  IF p_player_a_id = p_player_b_id THEN
    RAISE EXCEPTION 'Escolha dois jogadores diferentes.';
  END IF;

  PERFORM 1
  FROM public.rounds
  WHERE id = p_round_id AND status <> 'finished'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rodada nao encontrada ou encerrada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.matches
    WHERE round_id = p_round_id AND status = 'live'
  ) THEN
    RAISE EXCEPTION 'Encerre a partida ao vivo antes de trocar os times.';
  END IF;

  SELECT team_player.* INTO entry_a
  FROM public.team_players team_player
  JOIN public.teams team ON team.id = team_player.team_id
  WHERE team.round_id = p_round_id
    AND team_player.player_id = p_player_a_id
  FOR UPDATE OF team_player;

  SELECT team_player.* INTO entry_b
  FROM public.team_players team_player
  JOIN public.teams team ON team.id = team_player.team_id
  WHERE team.round_id = p_round_id
    AND team_player.player_id = p_player_b_id
  FOR UPDATE OF team_player;

  IF entry_a.id IS NULL OR entry_b.id IS NULL THEN
    RAISE EXCEPTION 'Os dois jogadores precisam pertencer a esta rodada.';
  END IF;
  IF entry_a.team_id = entry_b.team_id THEN
    RAISE EXCEPTION 'Escolha jogadores de times diferentes.';
  END IF;

  DELETE FROM public.team_players
  WHERE id IN (entry_a.id, entry_b.id);

  INSERT INTO public.team_players (id, team_id, player_id, goalkeeper_order)
  VALUES
    (entry_a.id, entry_b.team_id, entry_a.player_id, NULL),
    (entry_b.id, entry_a.team_id, entry_b.player_id, NULL);

  -- O indice de ordem e imediato. Primeiro libera todas as posicoes e so
  -- depois atribui a nova sequencia, sem colisoes temporarias 1..5.
  UPDATE public.team_players
  SET goalkeeper_order = NULL
  WHERE team_id IN (entry_a.team_id, entry_b.team_id);

  WITH reordered AS (
    SELECT
      id,
      row_number() OVER (PARTITION BY team_id ORDER BY random(), id)::INTEGER AS new_order
    FROM public.team_players
    WHERE team_id IN (entry_a.team_id, entry_b.team_id)
  )
  UPDATE public.team_players team_player
  SET goalkeeper_order = reordered.new_order
  FROM reordered
  WHERE team_player.id = reordered.id;

  UPDATE public.teams team
  SET captain_player_id = CASE
    WHEN team.id = entry_a.team_id AND team.captain_player_id = entry_a.player_id THEN entry_b.player_id
    WHEN team.id = entry_b.team_id AND team.captain_player_id = entry_b.player_id THEN entry_a.player_id
    ELSE team.captain_player_id
  END
  WHERE team.id IN (entry_a.team_id, entry_b.team_id);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.swap_round_team_players(UUID, UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.swap_round_team_players(UUID, UUID, UUID) FROM PUBLIC, anon;
