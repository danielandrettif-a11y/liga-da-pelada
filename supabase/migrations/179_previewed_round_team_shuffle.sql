-- Aplica uma prévia de sorteio já aprovada pelo administrador.
-- A função valida todos os IDs recebidos para que a confirmação grave
-- exatamente os mesmos atletas e a mesma capacidade de cada time atual.

CREATE OR REPLACE FUNCTION public.apply_round_team_shuffle(
  p_round_id UUID,
  p_assignments JSONB,
  p_formation_mode TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  expected_team_count INTEGER;
  requested_team_count INTEGER;
  distinct_requested_team_count INTEGER;
  expected_player_count INTEGER;
  requested_player_count INTEGER;
  distinct_requested_player_count INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem misturar os times.';
  END IF;
  IF p_formation_mode NOT IN ('random', 'balanced', 'speed', 'adaptive') THEN
    RAISE EXCEPTION 'Tipo de sorteio inválido.';
  END IF;
  IF jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'A formação enviada é inválida.';
  END IF;

  PERFORM 1
  FROM public.rounds round_item
  WHERE round_item.id = p_round_id AND round_item.status <> 'finished'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rodada não encontrada ou já encerrada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND status = 'live') THEN
    RAISE EXCEPTION 'Encerre a partida ao vivo antes de misturar os times.';
  END IF;

  SELECT count(*) INTO expected_team_count
  FROM public.teams
  WHERE round_id = p_round_id;

  SELECT count(*), count(DISTINCT (entry.value ->> 'team_id')::UUID)
  INTO requested_team_count, distinct_requested_team_count
  FROM jsonb_array_elements(p_assignments) AS entry(value);

  IF expected_team_count < 2
    OR requested_team_count <> expected_team_count
    OR distinct_requested_team_count <> expected_team_count THEN
    RAISE EXCEPTION 'A prévia precisa conter cada time da rodada uma única vez.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_assignments) AS entry(value)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.teams team
      WHERE team.id = (entry.value ->> 'team_id')::UUID
        AND team.round_id = p_round_id
    )
  ) THEN
    RAISE EXCEPTION 'A prévia contém um time que não pertence a esta rodada.';
  END IF;

  SELECT count(*) INTO expected_player_count
  FROM public.team_players item
  JOIN public.teams team ON team.id = item.team_id
  WHERE team.round_id = p_round_id;

  WITH requested_teams AS (
    SELECT (entry.value ->> 'team_id')::UUID AS team_id,
           entry.value -> 'player_ids' AS player_ids
    FROM jsonb_array_elements(p_assignments) AS entry(value)
  ), requested_players AS (
    SELECT requested_teams.team_id,
           player_item.value::UUID AS player_id
    FROM requested_teams
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(requested_teams.player_ids, '[]'::JSONB)) AS player_item(value)
  )
  SELECT count(*), count(DISTINCT player_id)
  INTO requested_player_count, distinct_requested_player_count
  FROM requested_players;

  IF requested_player_count <> expected_player_count
    OR distinct_requested_player_count <> expected_player_count THEN
    RAISE EXCEPTION 'A prévia precisa manter todos os jogadores da rodada sem repetições.';
  END IF;

  IF EXISTS (
    WITH requested_teams AS (
      SELECT (entry.value ->> 'team_id')::UUID AS team_id,
             entry.value -> 'player_ids' AS player_ids
      FROM jsonb_array_elements(p_assignments) AS entry(value)
    ), requested_players AS (
      SELECT player_item.value::UUID AS player_id
      FROM requested_teams
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(requested_teams.player_ids, '[]'::JSONB)) AS player_item(value)
    )
    (SELECT player_id FROM requested_players
     EXCEPT
     SELECT item.player_id FROM public.team_players item JOIN public.teams team ON team.id = item.team_id WHERE team.round_id = p_round_id)
    UNION ALL
    (SELECT item.player_id FROM public.team_players item JOIN public.teams team ON team.id = item.team_id WHERE team.round_id = p_round_id
     EXCEPT
     SELECT player_id FROM requested_players)
  ) THEN
    RAISE EXCEPTION 'A prévia não corresponde aos jogadores atuais da rodada.';
  END IF;

  IF EXISTS (
    WITH requested_teams AS (
      SELECT (entry.value ->> 'team_id')::UUID AS team_id,
             entry.value -> 'player_ids' AS player_ids
      FROM jsonb_array_elements(p_assignments) AS entry(value)
    ), requested_counts AS (
      SELECT team_id, count(*)::INTEGER AS player_count
      FROM requested_teams
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(player_ids, '[]'::JSONB)) AS player_item(value)
      GROUP BY team_id
    ), current_counts AS (
      SELECT team.id AS team_id, count(item.player_id)::INTEGER AS player_count
      FROM public.teams team
      LEFT JOIN public.team_players item ON item.team_id = team.id
      WHERE team.round_id = p_round_id
      GROUP BY team.id
    )
    SELECT 1
    FROM current_counts
    LEFT JOIN requested_counts USING (team_id)
    WHERE current_counts.player_count <> COALESCE(requested_counts.player_count, 0)
  ) THEN
    RAISE EXCEPTION 'A prévia precisa preservar a quantidade de jogadores de cada time.';
  END IF;

  DELETE FROM public.team_players item
  USING public.teams team
  WHERE item.team_id = team.id AND team.round_id = p_round_id;

  WITH requested_teams AS (
    SELECT (entry.value ->> 'team_id')::UUID AS team_id,
           entry.value -> 'player_ids' AS player_ids
    FROM jsonb_array_elements(p_assignments) AS entry(value)
  ), requested_players AS (
    SELECT requested_teams.team_id,
           player_item.value::UUID AS player_id,
           player_item.ordinality::INTEGER AS preview_order
    FROM requested_teams
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(requested_teams.player_ids, '[]'::JSONB)) WITH ORDINALITY AS player_item(value, ordinality)
  ), ordered AS (
    SELECT team_id,
           player_id,
           row_number() OVER (PARTITION BY team_id ORDER BY random(), player_id)::INTEGER AS goalkeeper_order,
           row_number() OVER (PARTITION BY team_id ORDER BY preview_order, player_id)::INTEGER AS loan_order
    FROM requested_players
  )
  INSERT INTO public.team_players (team_id, player_id, goalkeeper_order, loan_order)
  SELECT team_id, player_id, goalkeeper_order, loan_order
  FROM ordered;

  UPDATE public.teams
  SET captain_player_id = NULL
  WHERE round_id = p_round_id;

  UPDATE public.rounds
  SET formation_mode = p_formation_mode,
      notes = concat_ws(E'\n', NULLIF(notes, ''), 'Nova formação confirmada pelo administrador em ' || to_char(now(), 'DD/MM HH24:MI'))
  WHERE id = p_round_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_round_team_shuffle(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_round_team_shuffle(UUID, JSONB, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
