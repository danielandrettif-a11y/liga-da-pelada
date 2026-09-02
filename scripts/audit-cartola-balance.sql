-- Auditoria anônima e somente leitura do balanceamento do Cartola.
--
-- COMO USAR
-- 1. Execute o arquivo inteiro no SQL Editor do Supabase.
-- 2. A consulta retorna uma linha e uma coluna: audit_payload.
-- 3. Copie somente o JSON dessa célula e salve como cartola-audit.json.
-- 4. Não há INSERT, UPDATE, DELETE, função temporária ou alteração de schema.
--
-- PRIVACIDADE
-- Usuários e atletas são representados por chaves inteiras locais ao arquivo.
-- A consulta não exporta UUIDs, nomes, apelidos, e-mails, avatares ou textos livres.

WITH
season_scope AS (
  SELECT
    fantasy_season.id AS fantasy_season_id,
    fantasy_season.league_id,
    dense_rank() OVER (ORDER BY fantasy_season.league_id)::INTEGER AS league_key,
    dense_rank() OVER (ORDER BY fantasy_season.id)::INTEGER AS season_key,
    season.number AS season_number,
    season.status AS season_status
  FROM public.fantasy_seasons fantasy_season
  JOIN public.seasons season ON season.id = fantasy_season.season_id
),
round_scope AS (
  SELECT
    fantasy_round.id AS fantasy_round_id,
    fantasy_round.round_id,
    season_scope.league_key,
    season_scope.season_key,
    season_scope.season_number,
    season_scope.season_status,
    round_item.number AS round_number,
    round_item.status AS round_status,
    fantasy_round.market_status,
    fantasy_round.rules_version,
    fantasy_round.scoring_version,
    fantasy_round.settings_snapshot,
    fantasy_round.processed_at,
    COALESCE(round_item.ignore_goalkeeper_stats, false) AS ignore_goalkeeper_stats
  FROM public.fantasy_rounds fantasy_round
  JOIN season_scope ON season_scope.fantasy_season_id = fantasy_round.fantasy_season_id
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  WHERE round_item.round_type = 'official'
),
scored_lineups AS (
  SELECT lineup.*
  FROM public.fantasy_lineups lineup
  JOIN round_scope ON round_scope.fantasy_round_id = lineup.fantasy_round_id
  WHERE lineup.status = 'scored'
),
manager_keys AS (
  SELECT DISTINCT
    lineup.user_id,
    dense_rank() OVER (ORDER BY lineup.user_id)::INTEGER AS manager_key
  FROM scored_lineups lineup
),
player_universe AS (
  SELECT stat.player_id
  FROM public.player_round_stats stat
  JOIN round_scope ON round_scope.round_id = stat.round_id
  UNION
  SELECT item.player_id
  FROM public.fantasy_lineup_players item
  JOIN scored_lineups lineup ON lineup.id = item.lineup_id
),
player_keys AS (
  SELECT
    player_id,
    dense_rank() OVER (ORDER BY player_id)::INTEGER AS player_key
  FROM player_universe
),
lineup_keys AS (
  SELECT
    lineup.id AS lineup_id,
    dense_rank() OVER (ORDER BY lineup.id)::INTEGER AS lineup_key
  FROM scored_lineups lineup
),
lineup_counts AS (
  SELECT
    lineup.id AS lineup_id,
    count(item.id)::INTEGER AS lineup_size,
    count(*) FILTER (WHERE item.slot_role = 'GOL')::INTEGER AS gol_slots,
    count(*) FILTER (WHERE item.slot_role = 'DEF')::INTEGER AS def_slots,
    count(*) FILTER (WHERE item.slot_role = 'MEI')::INTEGER AS mei_slots,
    count(*) FILTER (WHERE item.slot_role = 'ATA')::INTEGER AS ata_slots,
    count(*) FILTER (WHERE item.is_position_correct)::INTEGER AS correct_slots,
    count(*) FILTER (WHERE item.total_points > 0)::INTEGER AS positive_players,
    COALESCE(sum(item.total_points), 0)::NUMERIC AS recomposed_player_points
  FROM scored_lineups lineup
  LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
  GROUP BY lineup.id
),
lineup_rows AS (
  SELECT
    round_scope.league_key,
    round_scope.season_key,
    round_scope.season_number,
    round_scope.round_number,
    lineup_keys.lineup_key,
    manager_keys.manager_key,
    lineup_counts.lineup_size,
    CASE
      WHEN lineup_counts.def_slots = 2 AND lineup_counts.mei_slots = 1 AND lineup_counts.ata_slots = 2 THEN '2-1-2'
      WHEN lineup_counts.def_slots = 2 AND lineup_counts.mei_slots = 2 AND lineup_counts.ata_slots = 1 THEN '2-2-1'
      WHEN NOT COALESCE((round_scope.settings_snapshot->>'role_scoring_active')::BOOLEAN, false) THEN 'legacy'
      ELSE 'other'
    END AS formation,
    lineup_counts.gol_slots,
    lineup_counts.def_slots,
    lineup_counts.mei_slots,
    lineup_counts.ata_slots,
    lineup_counts.correct_slots,
    (lineup.captain_player_id IS NOT NULL) AS captain_selected,
    lineup_counts.recomposed_player_points,
    lineup.player_points::NUMERIC AS stored_player_points,
    lineup.prediction_points::NUMERIC AS stored_prediction_points,
    COALESCE((lineup.score_breakdown->>'topScorer')::NUMERIC, 0) AS top_scorer_points,
    COALESCE((lineup.score_breakdown->>'topAssist')::NUMERIC, 0) AS top_assist_points,
    COALESCE((lineup.score_breakdown->>'challenge')::NUMERIC, 0) AS challenge_points,
    COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0) AS card_points,
    lineup.total_points::NUMERIC AS stored_total_points,
    lineup.budget_before::NUMERIC AS budget_before,
    lineup.lineup_cost::NUMERIC AS lineup_cost,
    lineup.budget_after::NUMERIC AS budget_after,
    lineup.round_position,
    COALESCE((round_scope.settings_snapshot->>'role_scoring_active')::BOOLEAN, false) AS role_scoring_active
  FROM scored_lineups lineup
  JOIN round_scope ON round_scope.fantasy_round_id = lineup.fantasy_round_id
  JOIN manager_keys ON manager_keys.user_id = lineup.user_id
  JOIN lineup_keys ON lineup_keys.lineup_id = lineup.id
  JOIN lineup_counts ON lineup_counts.lineup_id = lineup.id
),
selection_rows AS (
  SELECT
    round_scope.league_key,
    round_scope.season_key,
    round_scope.season_number,
    round_scope.round_number,
    lineup_keys.lineup_key,
    manager_keys.manager_key,
    player_keys.player_key,
    item.slot_index,
    item.slot_role,
    item.player_profile_locked AS player_profile,
    item.is_position_correct,
    (lineup.captain_player_id = item.player_id) AS is_captain,
    (item.base_points - item.position_bonus)::NUMERIC AS base_points,
    item.position_bonus::NUMERIC AS position_bonus,
    item.captain_bonus::NUMERIC AS captain_bonus,
    item.total_points::NUMERIC AS total_points,
    item.price_locked::NUMERIC AS price_locked,
    item.price_after::NUMERIC AS price_after,
    COALESCE(stat.games, 0)::INTEGER AS games,
    COALESCE(stat.wins, 0)::INTEGER AS wins,
    COALESCE(stat.draws, 0)::INTEGER AS draws,
    COALESCE(stat.losses, 0)::INTEGER AS losses,
    COALESCE(stat.goals, 0)::INTEGER AS goals,
    COALESCE(stat.assists, 0)::INTEGER AS assists,
    COALESCE(stat.own_goals, 0)::INTEGER AS own_goals,
    COALESCE(stat.goalkeeper_games, 0)::INTEGER AS goalkeeper_games,
    COALESCE(stat.clean_sheets, 0)::INTEGER AS clean_sheets,
    COALESCE(stat.goals_conceded, 0)::INTEGER AS goals_conceded,
    COALESCE(stat.team_goals_conceded, 0)::INTEGER AS team_goals_conceded,
    COALESCE(stat.defensive_clean_games, 0)::INTEGER AS defensive_clean_games,
    COALESCE(stat.defensive_one_goal_games, 0)::INTEGER AS defensive_one_goal_games,
    COALESCE((round_scope.settings_snapshot->>'role_scoring_active')::BOOLEAN, false) AS role_scoring_active
  FROM public.fantasy_lineup_players item
  JOIN scored_lineups lineup ON lineup.id = item.lineup_id
  JOIN round_scope ON round_scope.fantasy_round_id = lineup.fantasy_round_id
  JOIN manager_keys ON manager_keys.user_id = lineup.user_id
  JOIN lineup_keys ON lineup_keys.lineup_id = lineup.id
  JOIN player_keys ON player_keys.player_id = item.player_id
  LEFT JOIN public.player_round_stats stat
    ON stat.round_id = round_scope.round_id AND stat.player_id = item.player_id
),
performance_rows AS (
  SELECT
    round_scope.league_key,
    round_scope.season_key,
    round_scope.season_number,
    round_scope.round_number,
    player_keys.player_key,
    player.player_profile,
    COALESCE(stat.games, 0)::INTEGER AS games,
    COALESCE(stat.wins, 0)::INTEGER AS wins,
    COALESCE(stat.draws, 0)::INTEGER AS draws,
    COALESCE(stat.losses, 0)::INTEGER AS losses,
    COALESCE(stat.goals, 0)::INTEGER AS goals,
    COALESCE(stat.assists, 0)::INTEGER AS assists,
    COALESCE(stat.own_goals, 0)::INTEGER AS own_goals,
    COALESCE(stat.goalkeeper_games, 0)::INTEGER AS goalkeeper_games,
    COALESCE(stat.clean_sheets, 0)::INTEGER AS clean_sheets,
    COALESCE(stat.goals_conceded, 0)::INTEGER AS goals_conceded,
    COALESCE(stat.team_goals_conceded, 0)::INTEGER AS team_goals_conceded,
    COALESCE(stat.defensive_clean_games, 0)::INTEGER AS defensive_clean_games,
    COALESCE(stat.defensive_one_goal_games, 0)::INTEGER AS defensive_one_goal_games,
    history.round_points::NUMERIC AS market_base_points,
    history.price_before::NUMERIC AS price_before,
    history.price_after::NUMERIC AS price_after,
    history.variation_rate::NUMERIC AS variation_rate,
    history.market_band,
    history.round_rank,
    history.round_percentile::NUMERIC AS round_percentile,
    COALESCE((round_scope.settings_snapshot->>'role_scoring_active')::BOOLEAN, false) AS role_scoring_active
  FROM public.player_round_stats stat
  JOIN round_scope ON round_scope.round_id = stat.round_id
  JOIN player_keys ON player_keys.player_id = stat.player_id
  JOIN public.players player ON player.id = stat.player_id
  LEFT JOIN public.fantasy_player_price_history history
    ON history.fantasy_round_id = round_scope.fantasy_round_id
   AND history.player_id = stat.player_id
),
round_rows AS (
  SELECT
    round_scope.league_key,
    round_scope.season_key,
    round_scope.season_number,
    round_scope.season_status,
    round_scope.round_number,
    round_scope.round_status,
    round_scope.market_status,
    round_scope.rules_version,
    round_scope.scoring_version,
    round_scope.processed_at IS NOT NULL AS processed,
    round_scope.ignore_goalkeeper_stats,
    COALESCE((round_scope.settings_snapshot->>'players_per_team')::INTEGER, sizes.players_per_team) AS players_per_team,
    jsonb_build_object(
      'roleScoringActive', COALESCE((round_scope.settings_snapshot->>'role_scoring_active')::BOOLEAN, false),
      'goalPoints', COALESCE((round_scope.settings_snapshot->>'goal_points')::NUMERIC, 5),
      'assistPoints', COALESCE((round_scope.settings_snapshot->>'assist_points')::NUMERIC, 3),
      'winPoints', COALESCE((round_scope.settings_snapshot->>'win_points')::NUMERIC, 4),
      'lossPoints', COALESCE((round_scope.settings_snapshot->>'loss_points')::NUMERIC, -2),
      'goalkeeperAppearancePoints', COALESCE((round_scope.settings_snapshot->>'goalkeeper_appearance_points')::NUMERIC, 3),
      'goalConcededPoints', COALESCE((round_scope.settings_snapshot->>'goal_conceded_points')::NUMERIC, -1),
      'ownGoalPoints', COALESCE((round_scope.settings_snapshot->>'own_goal_points')::NUMERIC, -3),
      'captainMultiplier', COALESCE((round_scope.settings_snapshot->>'captain_multiplier')::NUMERIC, 1.5),
      'topScorerPredictionPoints', COALESCE((round_scope.settings_snapshot->>'top_scorer_prediction_points')::NUMERIC, 8),
      'topAssistPredictionPoints', COALESCE((round_scope.settings_snapshot->>'top_assist_prediction_points')::NUMERIC, 6),
      'goalkeeperCleanSheetBonus', 4,
      'defensiveBaseCleanBonus', 2,
      'defensiveBaseOneGoalBonus', 1,
      'defensiveSlotCleanBonus', 2,
      'defensiveSlotOneGoalBonus', 1,
      'midfieldAssistTotal', 4,
      'midfieldMaestroBonus', 3,
      'attackerBraceBonus', 3
    ) AS rules
  FROM round_scope
  LEFT JOIN LATERAL (
    SELECT max(lineup_counts.lineup_size)::INTEGER AS players_per_team
    FROM scored_lineups lineup
    JOIN lineup_counts ON lineup_counts.lineup_id = lineup.id
    WHERE lineup.fantasy_round_id = round_scope.fantasy_round_id
  ) sizes ON true
)
SELECT jsonb_build_object(
  'schemaVersion', 1,
  'generatedAt', now(),
  'privacy', jsonb_build_object(
    'containsNames', false,
    'containsEmails', false,
    'containsRawIds', false,
    'pseudonymization', 'dense integer keys scoped to this export'
  ),
  'scope', jsonb_build_object(
    'officialRounds', (SELECT count(*) FROM round_rows),
    'scoredLineups', (SELECT count(*) FROM lineup_rows),
    'selections', (SELECT count(*) FROM selection_rows),
    'performances', (SELECT count(*) FROM performance_rows)
  ),
  'rounds', COALESCE((
    SELECT jsonb_agg(to_jsonb(round_rows) ORDER BY league_key, season_number, round_number)
    FROM round_rows
  ), '[]'::JSONB),
  'lineups', COALESCE((
    SELECT jsonb_agg(to_jsonb(lineup_rows) ORDER BY league_key, season_number, round_number, lineup_key)
    FROM lineup_rows
  ), '[]'::JSONB),
  'selections', COALESCE((
    SELECT jsonb_agg(to_jsonb(selection_rows) ORDER BY league_key, season_number, round_number, lineup_key, slot_index)
    FROM selection_rows
  ), '[]'::JSONB),
  'performances', COALESCE((
    SELECT jsonb_agg(to_jsonb(performance_rows) ORDER BY league_key, season_number, round_number, player_key)
    FROM performance_rows
  ), '[]'::JSONB)
) AS audit_payload;
