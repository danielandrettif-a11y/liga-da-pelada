-- Rodadas incompletas com alvo por partida, fila fixa de emprestimos e
-- continuidade logica do rodizio no gol.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS target_players_per_team INTEGER;

UPDATE public.rounds round_item
SET target_players_per_team = league.players_per_team
FROM public.leagues league
WHERE league.id = round_item.league_id
  AND round_item.target_players_per_team IS NULL;

ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS rounds_target_players_per_team_range;
ALTER TABLE public.rounds ADD CONSTRAINT rounds_target_players_per_team_range
  CHECK (target_players_per_team IS NULL OR target_players_per_team BETWEEN 1 AND 10);

ALTER TABLE public.team_players
  ADD COLUMN IF NOT EXISTS loan_order INTEGER;

WITH ordered AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY team_id
      ORDER BY goalkeeper_order NULLS LAST, id
    )::INTEGER AS next_order
  FROM public.team_players
)
UPDATE public.team_players item
SET loan_order = ordered.next_order
FROM ordered
WHERE ordered.id = item.id AND item.loan_order IS NULL;

ALTER TABLE public.team_players DROP CONSTRAINT IF EXISTS team_players_loan_order_positive;
ALTER TABLE public.team_players ADD CONSTRAINT team_players_loan_order_positive
  CHECK (loan_order IS NULL OR loan_order > 0);

CREATE UNIQUE INDEX IF NOT EXISTS team_players_team_loan_order_unique_idx
  ON public.team_players (team_id, loan_order)
  WHERE loan_order IS NOT NULL;

ALTER TABLE public.match_goalkeepers
  ADD COLUMN IF NOT EXISTS rotation_order INTEGER;

UPDATE public.match_goalkeepers goalkeeper
SET rotation_order = team_player.goalkeeper_order
FROM public.team_players team_player
WHERE team_player.team_id = goalkeeper.team_id
  AND team_player.player_id = goalkeeper.player_id
  AND goalkeeper.rotation_order IS NULL;

ALTER TABLE public.match_goalkeepers DROP CONSTRAINT IF EXISTS match_goalkeepers_rotation_order_positive;
ALTER TABLE public.match_goalkeepers ADD CONSTRAINT match_goalkeepers_rotation_order_positive
  CHECK (rotation_order IS NULL OR rotation_order > 0);

-- A troca preserva os números das vagas nos dois times afetados.
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

  PERFORM 1 FROM public.rounds WHERE id = p_round_id AND status <> 'finished' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada nao encontrada ou encerrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND status = 'live') THEN
    RAISE EXCEPTION 'Encerre a partida ao vivo antes de trocar os times.';
  END IF;

  SELECT item.* INTO entry_a
  FROM public.team_players item JOIN public.teams team ON team.id = item.team_id
  WHERE team.round_id = p_round_id AND item.player_id = p_player_a_id
  FOR UPDATE OF item;

  SELECT item.* INTO entry_b
  FROM public.team_players item JOIN public.teams team ON team.id = item.team_id
  WHERE team.round_id = p_round_id AND item.player_id = p_player_b_id
  FOR UPDATE OF item;

  IF entry_a.id IS NULL OR entry_b.id IS NULL THEN
    RAISE EXCEPTION 'Os dois jogadores precisam pertencer a esta rodada.';
  END IF;
  IF entry_a.team_id = entry_b.team_id THEN
    RAISE EXCEPTION 'Escolha jogadores de times diferentes.';
  END IF;

  -- Remove primeiro para que o trigger de capacidade enxergue uma vaga livre.
  DELETE FROM public.team_players WHERE id IN (entry_a.id, entry_b.id);

  INSERT INTO public.team_players (id, team_id, player_id, goalkeeper_order, loan_order)
  VALUES
    (entry_a.id, entry_b.team_id, entry_a.player_id, entry_b.goalkeeper_order, entry_b.loan_order),
    (entry_b.id, entry_a.team_id, entry_b.player_id, entry_a.goalkeeper_order, entry_a.loan_order);

  UPDATE public.teams team
  SET captain_player_id = CASE
    WHEN team.id = entry_a.team_id AND team.captain_player_id = entry_a.player_id THEN entry_b.player_id
    WHEN team.id = entry_b.team_id AND team.captain_player_id = entry_b.player_id THEN entry_a.player_id
    ELSE team.captain_player_id
  END
  WHERE id IN (entry_a.team_id, entry_b.team_id)
  ;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.swap_round_team_players(UUID, UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.swap_round_team_players(UUID, UUID, UUID) FROM PUBLIC, anon;

-- O sorteio entre partidas grava uma nova fila valida junto da ordem do gol.
CREATE OR REPLACE FUNCTION public.shuffle_round_teams(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  team_count INTEGER;
  player_count INTEGER;
  assignments JSONB;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem misturar os times.';
  END IF;

  PERFORM 1 FROM public.rounds round_item
  WHERE round_item.id = p_round_id AND round_item.status <> 'finished'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada não encontrada ou já encerrada.'; END IF;

  IF EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND status = 'live') THEN
    RAISE EXCEPTION 'Encerre a partida ao vivo antes de misturar os times.';
  END IF;

  SELECT count(*) INTO team_count FROM public.teams WHERE round_id = p_round_id;
  SELECT count(*) INTO player_count
  FROM public.team_players item JOIN public.teams team ON team.id = item.team_id
  WHERE team.round_id = p_round_id;
  IF team_count < 2 OR player_count < team_count * 2 THEN
    RAISE EXCEPTION 'São necessários pelo menos dois times completos para fazer uma nova mistura.';
  END IF;

  WITH team_sizes AS (
    SELECT team.id AS team_id, team.position, count(item.player_id)::INTEGER AS player_count
    FROM public.teams team
    LEFT JOIN public.team_players item ON item.team_id = team.id
    WHERE team.round_id = p_round_id
    GROUP BY team.id, team.position
  ), randomized AS (
    SELECT item.player_id,
      row_number() OVER (ORDER BY random(), item.player_id)::INTEGER AS slot_number
    FROM public.team_players item JOIN public.teams team ON team.id = item.team_id
    WHERE team.round_id = p_round_id
  ), slots AS (
    SELECT size.team_id,
      row_number() OVER (ORDER BY size.position, generated.slot_order)::INTEGER AS slot_number
    FROM team_sizes size
    CROSS JOIN LATERAL generate_series(1, size.player_count) generated(slot_order)
  ), paired_base AS (
    SELECT slots.team_id, randomized.player_id
    FROM slots JOIN randomized USING (slot_number)
  ), paired AS (
    SELECT team_id, player_id,
      row_number() OVER (PARTITION BY team_id ORDER BY random(), player_id)::INTEGER AS goalkeeper_order,
      row_number() OVER (PARTITION BY team_id ORDER BY random(), player_id)::INTEGER AS loan_order
    FROM paired_base
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'team_id', team_id,
    'player_id', player_id,
    'goalkeeper_order', goalkeeper_order,
    'loan_order', loan_order
  )), '[]'::JSONB)
  INTO assignments FROM paired;

  DELETE FROM public.team_players item
  USING public.teams team
  WHERE item.team_id = team.id AND team.round_id = p_round_id;

  INSERT INTO public.team_players (team_id, player_id, goalkeeper_order, loan_order)
  SELECT row_item.team_id, row_item.player_id, row_item.goalkeeper_order, row_item.loan_order
  FROM jsonb_to_recordset(assignments) AS row_item(
    team_id UUID,
    player_id UUID,
    goalkeeper_order INTEGER,
    loan_order INTEGER
  );

  UPDATE public.teams SET captain_player_id = NULL WHERE round_id = p_round_id;
  UPDATE public.rounds
  SET notes = concat_ws(E'\n', NULLIF(notes, ''), 'Times misturados pelo administrador em ' || to_char(now(), 'DD/MM HH24:MI'))
  WHERE id = p_round_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.shuffle_round_teams(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shuffle_round_teams(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
