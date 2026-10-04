-- A regra que impede o substituto de pontuar começa na rodada 7.
-- Restaura a elegibilidade e reconstrói os scouts das rodadas 1 a 6 da
-- temporada ativa antes de reconciliar novamente o Cartola.

BEGIN;

UPDATE public.match_players participant
SET scoring_eligible = true
FROM public.matches match_item
JOIN public.rounds round_item ON round_item.id = match_item.round_id
JOIN public.seasons season ON season.id = round_item.season_id
WHERE participant.match_id = match_item.id
  AND season.status = 'active'
  AND round_item.number < 7
  AND participant.scoring_eligible = false;

CREATE TEMP TABLE restored_round_stats_218 ON COMMIT DROP AS
WITH targets AS (
  SELECT
    stats.id,
    stats.round_id,
    stats.player_id,
    stats.league_id
  FROM public.player_round_stats stats
  JOIN public.rounds round_item ON round_item.id = stats.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  WHERE season.status = 'active'
    AND round_item.number < 7
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished'
    AND NOT EXISTS (
      SELECT 1
      FROM public.player_round_stat_overrides override_item
      WHERE override_item.round_id = stats.round_id
        AND override_item.player_id = stats.player_id
        AND override_item.override_type = 'zero_points'
    )
), result_stats AS (
  SELECT
    match_item.round_id,
    participant.player_id,
    count(*)::INTEGER AS games,
    count(*) FILTER (
      WHERE CASE
        WHEN participant.team_id = match_item.team_a_id
          THEN match_item.score_a > match_item.score_b
        ELSE match_item.score_b > match_item.score_a
      END
    )::INTEGER AS wins,
    count(*) FILTER (
      WHERE match_item.score_a = match_item.score_b
    )::INTEGER AS draws,
    count(*) FILTER (
      WHERE CASE
        WHEN participant.team_id = match_item.team_a_id
          THEN match_item.score_a < match_item.score_b
        ELSE match_item.score_b < match_item.score_a
      END
    )::INTEGER AS losses,
    sum(CASE
      WHEN participant.team_id = match_item.team_a_id THEN match_item.score_b
      ELSE match_item.score_a
    END)::INTEGER AS team_goals_conceded
  FROM public.matches match_item
  JOIN public.match_players participant ON participant.match_id = match_item.id
  JOIN public.rounds round_item ON round_item.id = match_item.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  WHERE season.status = 'active'
    AND round_item.number < 7
    AND match_item.status = 'finished'
    AND participant.result_eligible = true
    AND participant.scoring_eligible = true
  GROUP BY match_item.round_id, participant.player_id
), event_contributions AS (
  SELECT match_item.round_id, event.player_id, 1 AS goals, 0 AS assists, 0 AS own_goals
  FROM public.matches match_item
  JOIN public.match_events event ON event.match_id = match_item.id AND event.event_type = 'goal'
  JOIN public.match_players participant
    ON participant.match_id = match_item.id
    AND participant.player_id = event.player_id
    AND participant.scoring_eligible = true
  JOIN public.rounds round_item ON round_item.id = match_item.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  WHERE season.status = 'active' AND round_item.number < 7
    AND match_item.status = 'finished' AND event.is_own_goal = false

  UNION ALL

  SELECT match_item.round_id, event.assist_player_id, 0, 1, 0
  FROM public.matches match_item
  JOIN public.match_events event ON event.match_id = match_item.id AND event.event_type = 'goal'
  JOIN public.match_players participant
    ON participant.match_id = match_item.id
    AND participant.player_id = event.assist_player_id
    AND participant.scoring_eligible = true
  JOIN public.rounds round_item ON round_item.id = match_item.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  WHERE season.status = 'active' AND round_item.number < 7
    AND match_item.status = 'finished'
    AND event.is_own_goal = false
    AND event.assist_player_id IS NOT NULL

  UNION ALL

  SELECT match_item.round_id, event.player_id, 0, 0, 1
  FROM public.matches match_item
  JOIN public.match_events event ON event.match_id = match_item.id AND event.event_type = 'goal'
  JOIN public.match_players participant
    ON participant.match_id = match_item.id
    AND participant.player_id = event.player_id
    AND participant.scoring_eligible = true
  JOIN public.rounds round_item ON round_item.id = match_item.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  WHERE season.status = 'active' AND round_item.number < 7
    AND match_item.status = 'finished' AND event.is_own_goal = true
), event_stats AS (
  SELECT round_id, player_id,
    sum(goals)::INTEGER AS goals,
    sum(assists)::INTEGER AS assists,
    sum(own_goals)::INTEGER AS own_goals
  FROM event_contributions
  GROUP BY round_id, player_id
), goalkeeper_matches AS (
  SELECT
    match_item.round_id,
    match_item.id AS match_id,
    goalkeeper.player_id,
    goalkeeper.team_id,
    match_item.team_a_id,
    match_item.team_b_id,
    match_item.score_a,
    match_item.score_b
  FROM public.matches match_item
  JOIN public.match_goalkeepers goalkeeper ON goalkeeper.match_id = match_item.id
  JOIN public.match_players participant
    ON participant.match_id = match_item.id
    AND participant.player_id = goalkeeper.player_id
    AND participant.scoring_eligible = true
  JOIN public.rounds round_item ON round_item.id = match_item.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  WHERE season.status = 'active'
    AND round_item.number < 7
    AND match_item.status = 'finished'
), goalkeeper_result_stats AS (
  SELECT
    goalkeeper.round_id,
    goalkeeper.player_id,
    count(*)::INTEGER AS goalkeeper_games,
    count(*) FILTER (
      WHERE CASE
        WHEN goalkeeper.team_id = goalkeeper.team_a_id
          THEN goalkeeper.score_a > goalkeeper.score_b
        ELSE goalkeeper.score_b > goalkeeper.score_a
      END
    )::INTEGER AS goalkeeper_wins,
    count(*) FILTER (
      WHERE goalkeeper.score_a = goalkeeper.score_b
    )::INTEGER AS goalkeeper_draws,
    count(*) FILTER (
      WHERE CASE
        WHEN goalkeeper.team_id = goalkeeper.team_a_id
          THEN goalkeeper.score_a < goalkeeper.score_b
        ELSE goalkeeper.score_b < goalkeeper.score_a
      END
    )::INTEGER AS goalkeeper_losses,
    sum(CASE
      WHEN goalkeeper.team_id = goalkeeper.team_a_id THEN goalkeeper.score_b
      ELSE goalkeeper.score_a
    END)::INTEGER AS goals_conceded,
    count(*) FILTER (
      WHERE CASE
        WHEN goalkeeper.team_id = goalkeeper.team_a_id THEN goalkeeper.score_b
        ELSE goalkeeper.score_a
      END = 0
    )::INTEGER AS clean_sheets
  FROM goalkeeper_matches goalkeeper
  GROUP BY goalkeeper.round_id, goalkeeper.player_id
), goalkeeper_event_contributions AS (
  SELECT goalkeeper.round_id, goalkeeper.player_id, 1 AS goals, 0 AS assists, 0 AS own_goals
  FROM goalkeeper_matches goalkeeper
  JOIN public.match_events event
    ON event.match_id = goalkeeper.match_id
    AND event.event_type = 'goal'
    AND event.player_id = goalkeeper.player_id
  WHERE event.is_own_goal = false

  UNION ALL

  SELECT goalkeeper.round_id, goalkeeper.player_id, 0, 1, 0
  FROM goalkeeper_matches goalkeeper
  JOIN public.match_events event
    ON event.match_id = goalkeeper.match_id
    AND event.event_type = 'goal'
    AND event.assist_player_id = goalkeeper.player_id
  WHERE event.is_own_goal = false

  UNION ALL

  SELECT goalkeeper.round_id, goalkeeper.player_id, 0, 0, 1
  FROM goalkeeper_matches goalkeeper
  JOIN public.match_events event
    ON event.match_id = goalkeeper.match_id
    AND event.event_type = 'goal'
    AND event.player_id = goalkeeper.player_id
  WHERE event.is_own_goal = true
), goalkeeper_event_stats AS (
  SELECT round_id, player_id,
    sum(goals)::INTEGER AS goalkeeper_goals,
    sum(assists)::INTEGER AS goalkeeper_assists,
    sum(own_goals)::INTEGER AS goalkeeper_own_goals
  FROM goalkeeper_event_contributions
  GROUP BY round_id, player_id
), defense_stats AS (
  SELECT
    match_item.round_id,
    participant.player_id,
    count(*) FILTER (
      WHERE CASE
        WHEN participant.team_id = match_item.team_a_id THEN match_item.score_b
        ELSE match_item.score_a
      END = 0
    )::INTEGER AS clean_games,
    count(*) FILTER (
      WHERE CASE
        WHEN participant.team_id = match_item.team_a_id THEN match_item.score_b
        ELSE match_item.score_a
      END = 1
    )::INTEGER AS one_goal_games
  FROM public.matches match_item
  JOIN public.match_players participant ON participant.match_id = match_item.id
  JOIN public.rounds round_item ON round_item.id = match_item.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  LEFT JOIN public.match_goalkeepers goalkeeper
    ON goalkeeper.match_id = match_item.id
    AND goalkeeper.player_id = participant.player_id
  WHERE season.status = 'active'
    AND round_item.number < 7
    AND match_item.status = 'finished'
    AND participant.result_eligible = true
    AND participant.scoring_eligible = true
    AND goalkeeper.player_id IS NULL
  GROUP BY match_item.round_id, participant.player_id
)
SELECT
  target.id,
  target.round_id,
  target.player_id,
  target.league_id,
  COALESCE(result.games, 0) AS games,
  COALESCE(result.wins, 0) AS wins,
  COALESCE(result.draws, 0) AS draws,
  COALESCE(result.losses, 0) AS losses,
  COALESCE(event.goals, 0) AS goals,
  COALESCE(event.assists, 0) AS assists,
  COALESCE(event.own_goals, 0) AS own_goals,
  COALESCE(result.team_goals_conceded, 0) AS team_goals_conceded,
  COALESCE(goalkeeper.goalkeeper_games, 0) AS goalkeeper_games,
  COALESCE(goalkeeper.goalkeeper_wins, 0) AS goalkeeper_wins,
  COALESCE(goalkeeper.goalkeeper_draws, 0) AS goalkeeper_draws,
  COALESCE(goalkeeper.goalkeeper_losses, 0) AS goalkeeper_losses,
  COALESCE(goalkeeper.goals_conceded, 0) AS goals_conceded,
  COALESCE(goalkeeper.clean_sheets, 0) AS clean_sheets,
  COALESCE(goalkeeper_event.goalkeeper_goals, 0) AS goalkeeper_goals,
  COALESCE(goalkeeper_event.goalkeeper_assists, 0) AS goalkeeper_assists,
  COALESCE(goalkeeper_event.goalkeeper_own_goals, 0) AS goalkeeper_own_goals,
  COALESCE(defense.clean_games, 0) AS defensive_clean_games,
  COALESCE(defense.one_goal_games, 0) AS defensive_one_goal_games
FROM targets target
LEFT JOIN result_stats result
  ON result.round_id = target.round_id AND result.player_id = target.player_id
LEFT JOIN event_stats event
  ON event.round_id = target.round_id AND event.player_id = target.player_id
LEFT JOIN goalkeeper_result_stats goalkeeper
  ON goalkeeper.round_id = target.round_id AND goalkeeper.player_id = target.player_id
LEFT JOIN goalkeeper_event_stats goalkeeper_event
  ON goalkeeper_event.round_id = target.round_id AND goalkeeper_event.player_id = target.player_id
LEFT JOIN defense_stats defense
  ON defense.round_id = target.round_id AND defense.player_id = target.player_id;

UPDATE public.player_round_stats stats
SET
  games = restored.games,
  wins = restored.wins,
  draws = restored.draws,
  losses = restored.losses,
  goals = restored.goals,
  assists = restored.assists,
  own_goals = restored.own_goals,
  team_goals_conceded = restored.team_goals_conceded,
  goalkeeper_games = restored.goalkeeper_games,
  goalkeeper_wins = restored.goalkeeper_wins,
  goalkeeper_draws = restored.goalkeeper_draws,
  goalkeeper_losses = restored.goalkeeper_losses,
  goals_conceded = restored.goals_conceded,
  clean_sheets = restored.clean_sheets,
  goalkeeper_goals = restored.goalkeeper_goals,
  goalkeeper_assists = restored.goalkeeper_assists,
  goalkeeper_own_goals = restored.goalkeeper_own_goals,
  defensive_clean_games = restored.defensive_clean_games,
  defensive_one_goal_games = restored.defensive_one_goal_games,
  ranking_defensive_clean_games = restored.defensive_clean_games,
  ranking_defensive_one_goal_games = restored.defensive_one_goal_games
FROM restored_round_stats_218 restored
WHERE stats.id = restored.id;

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
JOIN restored_round_stats_218 restored ON restored.round_id = round_item.id
WHERE stats.id = restored.id;

UPDATE public.player_round_stats stats
SET ranking_position_bonus = public.calculate_ranked_position_bonus_v1(
  stats.league_id,
  stats.ranking_role_weights,
  stats.goals,
  stats.assists,
  stats.draws,
  stats.ranking_defensive_clean_games,
  stats.ranking_defensive_one_goal_games
)
FROM restored_round_stats_218 restored
WHERE stats.id = restored.id;

DO $$
DECLARE item RECORD;
BEGIN
  FOR item IN
    SELECT round_item.id
    FROM public.rounds round_item
    JOIN public.seasons season ON season.id = round_item.season_id
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = round_item.id
    WHERE season.status = 'active'
      AND round_item.number < 7
      AND round_item.round_type = 'official'
      AND round_item.status = 'finished'
    ORDER BY round_item.number
  LOOP
    PERFORM public.reconcile_fantasy_round_totals(item.id);
  END LOOP;
END;
$$;

COMMENT ON COLUMN public.match_players.scoring_eligible IS
  'Quando false, a participação não gera scouts. A exclusão de substitutos começa na rodada 7 da temporada ativa em que a regra foi adotada.';

NOTIFY pgrst, 'reload schema';

COMMIT;
