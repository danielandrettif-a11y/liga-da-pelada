-- Remove somente a pontuação ligada à atuação no gol da rodada oficial ativa.
-- Gols, assistências, vitórias, derrotas e o histórico operacional das
-- partidas são preservados. A migration é idempotente: depois da primeira
-- execução os campos de goleiro ficam em zero e não há nova subtração.

WITH target_rounds AS (
  SELECT id, league_id
  FROM public.rounds
  WHERE round_type = 'official'
    AND status = 'active'
)
UPDATE public.rounds round_item
SET
  ignore_goalkeeper_stats = true,
  best_goalkeeper_player_id = NULL
FROM target_rounds target
WHERE round_item.id = target.id;

-- Caso alguma partida já tenha sido consolidada antes da correção, remove a
-- aparição e os gols sofridos do ranking normal e limpa somente esses scouts.
WITH target_rounds AS (
  SELECT id, league_id
  FROM public.rounds
  WHERE round_type = 'official'
    AND status = 'active'
)
UPDATE public.player_round_stats stat
SET
  points = stat.points
    - COALESCE(stat.goalkeeper_games, 0) * COALESCE((
      SELECT rule.points
      FROM public.ranking_rules rule
      WHERE rule.league_id = target.league_id
        AND rule.event_type = 'goalkeeper_appearance'
      LIMIT 1
    ), 0)
    - COALESCE(stat.goals_conceded, 0) * COALESCE((
      SELECT rule.points
      FROM public.ranking_rules rule
      WHERE rule.league_id = target.league_id
        AND rule.event_type = 'goal_conceded'
      LIMIT 1
    ), 0),
  goalkeeper_games = 0,
  goals_conceded = 0,
  clean_sheets = 0
FROM target_rounds target
WHERE stat.round_id = target.id
  AND (
    COALESCE(stat.goalkeeper_games, 0) <> 0
    OR COALESCE(stat.goals_conceded, 0) <> 0
    OR COALESCE(stat.clean_sheets, 0) <> 0
  );

-- O Cartola ao vivo já respeita ignore_goalkeeper_stats. Guardamos também
-- zeros no snapshot desta rodada para impedir que uma consolidação futura
-- recupere aparição, gol sofrido ou bônus da casa GOL.
WITH target_rounds AS (
  SELECT id
  FROM public.rounds
  WHERE round_type = 'official'
    AND status = 'active'
)
UPDATE public.fantasy_rounds fantasy_round
SET settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::JSONB)
  || jsonb_build_object(
    'goalkeeper_appearance_points', 0,
    'goal_conceded_points', 0
  )
FROM target_rounds target
WHERE fantasy_round.round_id = target.id;

NOTIFY pgrst, 'reload schema';
