-- Reconstrói os scouts específicos de goleiro da rodada 6 diretamente do
-- registro autoritativo de quem jogou no gol em cada partida. A rodada 6
-- ainda permite pontuação de substitutos, por isso match_goalkeepers basta
-- para comprovar a atuação e não depende da flag criada para a rodada 7.

BEGIN;

CREATE TEMP TABLE goalkeeper_stats_219 ON COMMIT DROP AS
WITH target_rounds AS (
  SELECT round_item.id
  FROM public.rounds round_item
  JOIN public.seasons season ON season.id = round_item.season_id
  WHERE season.status = 'active'
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished'
    AND round_item.number = 6
), appearances AS (
  SELECT
    match_item.round_id,
    goalkeeper.player_id,
    count(*)::INTEGER AS goalkeeper_games,
    count(*) FILTER (
      WHERE CASE
        WHEN goalkeeper.team_id = match_item.team_a_id THEN match_item.score_a > match_item.score_b
        ELSE match_item.score_b > match_item.score_a
      END
    )::INTEGER AS goalkeeper_wins,
    count(*) FILTER (WHERE match_item.score_a = match_item.score_b)::INTEGER AS goalkeeper_draws,
    count(*) FILTER (
      WHERE CASE
        WHEN goalkeeper.team_id = match_item.team_a_id THEN match_item.score_a < match_item.score_b
        ELSE match_item.score_b < match_item.score_a
      END
    )::INTEGER AS goalkeeper_losses,
    sum(CASE
      WHEN goalkeeper.team_id = match_item.team_a_id THEN match_item.score_b
      ELSE match_item.score_a
    END)::INTEGER AS goals_conceded,
    count(*) FILTER (
      WHERE CASE
        WHEN goalkeeper.team_id = match_item.team_a_id THEN match_item.score_b
        ELSE match_item.score_a
      END = 0
    )::INTEGER AS clean_sheets
  FROM public.matches match_item
  JOIN target_rounds target ON target.id = match_item.round_id
  JOIN public.match_goalkeepers goalkeeper ON goalkeeper.match_id = match_item.id
  WHERE match_item.status = 'finished'
  GROUP BY match_item.round_id, goalkeeper.player_id
), goalkeeper_events AS (
  SELECT
    match_item.round_id,
    goalkeeper.player_id,
    count(*) FILTER (
      WHERE event.player_id = goalkeeper.player_id AND event.is_own_goal = false
    )::INTEGER AS goalkeeper_goals,
    count(*) FILTER (
      WHERE event.assist_player_id = goalkeeper.player_id AND event.is_own_goal = false
    )::INTEGER AS goalkeeper_assists,
    count(*) FILTER (
      WHERE event.player_id = goalkeeper.player_id AND event.is_own_goal = true
    )::INTEGER AS goalkeeper_own_goals
  FROM public.matches match_item
  JOIN target_rounds target ON target.id = match_item.round_id
  JOIN public.match_goalkeepers goalkeeper ON goalkeeper.match_id = match_item.id
  LEFT JOIN public.match_events event
    ON event.match_id = match_item.id
    AND event.event_type = 'goal'
  WHERE match_item.status = 'finished'
  GROUP BY match_item.round_id, goalkeeper.player_id
)
SELECT
  appearance.round_id,
  appearance.player_id,
  appearance.goalkeeper_games,
  appearance.goalkeeper_wins,
  appearance.goalkeeper_draws,
  appearance.goalkeeper_losses,
  appearance.goals_conceded,
  appearance.clean_sheets,
  COALESCE(event.goalkeeper_goals, 0) AS goalkeeper_goals,
  COALESCE(event.goalkeeper_assists, 0) AS goalkeeper_assists,
  COALESCE(event.goalkeeper_own_goals, 0) AS goalkeeper_own_goals
FROM appearances appearance
LEFT JOIN goalkeeper_events event
  ON event.round_id = appearance.round_id
  AND event.player_id = appearance.player_id;

-- Limpa valores antigos somente para atletas sem anulação administrativa.
UPDATE public.player_round_stats stats
SET
  goalkeeper_games = 0,
  goalkeeper_wins = 0,
  goalkeeper_draws = 0,
  goalkeeper_losses = 0,
  goals_conceded = 0,
  clean_sheets = 0,
  goalkeeper_goals = 0,
  goalkeeper_assists = 0,
  goalkeeper_own_goals = 0
FROM public.rounds round_item
JOIN public.seasons season ON season.id = round_item.season_id
WHERE stats.round_id = round_item.id
  AND season.status = 'active'
  AND round_item.round_type = 'official'
  AND round_item.status = 'finished'
  AND round_item.number = 6
  AND NOT EXISTS (
    SELECT 1
    FROM public.player_round_stat_overrides override_item
    WHERE override_item.round_id = stats.round_id
      AND override_item.player_id = stats.player_id
      AND override_item.override_type = 'zero_points'
  );

UPDATE public.player_round_stats stats
SET
  goalkeeper_games = restored.goalkeeper_games,
  goalkeeper_wins = restored.goalkeeper_wins,
  goalkeeper_draws = restored.goalkeeper_draws,
  goalkeeper_losses = restored.goalkeeper_losses,
  goals_conceded = restored.goals_conceded,
  clean_sheets = restored.clean_sheets,
  goalkeeper_goals = restored.goalkeeper_goals,
  goalkeeper_assists = restored.goalkeeper_assists,
  goalkeeper_own_goals = restored.goalkeeper_own_goals
FROM goalkeeper_stats_219 restored
WHERE stats.round_id = restored.round_id
  AND stats.player_id = restored.player_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.player_round_stat_overrides override_item
    WHERE override_item.round_id = stats.round_id
      AND override_item.player_id = stats.player_id
      AND override_item.override_type = 'zero_points'
  );

-- A pontuação-base da Ranked também carrega atuação e gols sofridos no gol.
-- Mantemos o snapshot congelado da própria rodada para não aplicar regras
-- atuais retroativamente.
UPDATE public.player_round_stats stats
SET points = round(
  stats.goals * COALESCE((round_item.scoring_snapshot->>'goal')::NUMERIC, 4)
  + stats.assists * COALESCE((round_item.scoring_snapshot->>'assist')::NUMERIC, 2.5)
  + stats.wins * COALESCE((round_item.scoring_snapshot->>'win')::NUMERIC, 3)
  + stats.draws * COALESCE((round_item.scoring_snapshot->>'draw')::NUMERIC, 1)
  + stats.losses * COALESCE((round_item.scoring_snapshot->>'loss')::NUMERIC, -2.5)
  + stats.own_goals * COALESCE((round_item.scoring_snapshot->>'ownGoal')::NUMERIC, -3)
  + stats.goalkeeper_games * CASE
      WHEN round_item.suppress_goalkeeper_rewards THEN 0
      ELSE COALESCE((round_item.scoring_snapshot->>'goalkeeperAppearance')::NUMERIC, 2)
    END
  + stats.goals_conceded * COALESCE((round_item.scoring_snapshot->>'goalkeeperGoalConceded')::NUMERIC, -1),
  2
)
FROM public.rounds round_item
JOIN public.seasons season ON season.id = round_item.season_id
WHERE stats.round_id = round_item.id
  AND season.status = 'active'
  AND round_item.round_type = 'official'
  AND round_item.status = 'finished'
  AND round_item.number = 6
  AND NOT EXISTS (
    SELECT 1
    FROM public.player_round_stat_overrides override_item
    WHERE override_item.round_id = stats.round_id
      AND override_item.player_id = stats.player_id
      AND override_item.override_type = 'zero_points'
  );

-- Regrava jogadores, capitães, escalações, ranking e totais da temporada com
-- os scouts recuperados acima.
DO $$
DECLARE target_round_id UUID;
BEGIN
  SELECT round_item.id INTO target_round_id
  FROM public.rounds round_item
  JOIN public.seasons season ON season.id = round_item.season_id
  WHERE season.status = 'active'
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished'
    AND round_item.number = 6
  LIMIT 1;

  IF target_round_id IS NOT NULL THEN
    PERFORM public.reconcile_fantasy_round_totals(target_round_id);
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
