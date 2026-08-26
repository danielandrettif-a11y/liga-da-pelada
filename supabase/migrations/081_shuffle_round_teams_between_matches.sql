-- Mistura os elencos de uma rodada entre partidas, sem tocar em match_players.
-- Assim, partidas já encerradas preservam seus resultados e os próximos jogos
-- passam a usar a nova formação sorteada.

CREATE OR REPLACE FUNCTION public.shuffle_round_teams(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  team_count INTEGER;
  player_count INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem misturar os times.';
  END IF;

  PERFORM 1
  FROM public.rounds round_item
  WHERE round_item.id = p_round_id AND round_item.status <> 'finished'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rodada não encontrada ou já encerrada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = p_round_id AND match_item.status = 'live'
  ) THEN
    RAISE EXCEPTION 'Encerre a partida ao vivo antes de misturar os times.';
  END IF;

  SELECT count(*) INTO team_count FROM public.teams WHERE round_id = p_round_id;
  SELECT count(*) INTO player_count
  FROM public.team_players team_player
  JOIN public.teams team ON team.id = team_player.team_id
  WHERE team.round_id = p_round_id;

  IF team_count < 2 OR player_count < team_count * 2 THEN
    RAISE EXCEPTION 'São necessários pelo menos dois times completos para fazer uma nova mistura.';
  END IF;

  WITH team_sizes AS (
    SELECT team.id AS team_id, team.position, count(team_player.player_id)::INTEGER AS player_count
    FROM public.teams team
    LEFT JOIN public.team_players team_player ON team_player.team_id = team.id
    WHERE team.round_id = p_round_id
    GROUP BY team.id, team.position
  ), random_players AS (
    SELECT team_player.player_id,
      row_number() OVER (ORDER BY random(), team_player.player_id)::INTEGER AS slot_number
    FROM public.team_players team_player
    JOIN public.teams team ON team.id = team_player.team_id
    WHERE team.round_id = p_round_id
  ), team_slots AS (
    SELECT team_size.team_id,
      row_number() OVER (ORDER BY team_size.position, generated.slot_order)::INTEGER AS slot_number
    FROM team_sizes team_size
    CROSS JOIN LATERAL generate_series(1, team_size.player_count) AS generated(slot_order)
  ), cleared AS (
    DELETE FROM public.team_players team_player
    USING public.teams team
    WHERE team_player.team_id = team.id AND team.round_id = p_round_id
    RETURNING team_player.id
  )
  INSERT INTO public.team_players (team_id, player_id, goalkeeper_order)
  SELECT team_slots.team_id, random_players.player_id,
    row_number() OVER (PARTITION BY team_slots.team_id ORDER BY random(), random_players.player_id)::INTEGER
  FROM team_slots
  JOIN random_players ON random_players.slot_number = team_slots.slot_number;

  -- Capitães anteriores podem ter trocado de time; o administrador escolhe
  -- novos capitães na tela da próxima partida.
  UPDATE public.teams team
  SET captain_player_id = NULL
  WHERE team.round_id = p_round_id;

  UPDATE public.rounds
  SET notes = concat_ws(E'\n', NULLIF(notes, ''), 'Times misturados pelo administrador em ' || to_char(now(), 'DD/MM HH24:MI'))
  WHERE id = p_round_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.shuffle_round_teams(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shuffle_round_teams(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
