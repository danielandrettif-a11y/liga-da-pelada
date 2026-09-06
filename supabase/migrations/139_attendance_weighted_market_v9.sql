-- Mercado V9: presença e pontos acumulados valem mais que uma média isolada.
-- Uma atuação excelente ajuda, mas quem comparece e produz com frequência
-- passa a disputar as faixas premium do mercado.

BEGIN;

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS market_attendance_weight NUMERIC(6,5) NOT NULL DEFAULT .20;

UPDATE public.fantasy_settings SET
  market_round_weight = .30,
  market_attendance_weight = .20,
  updated_at = now();

UPDATE public.fantasy_rounds fantasy_round SET
  settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::JSONB)
    || jsonb_build_object(
      'market_round_weight', .30,
      'market_attendance_weight', .20,
      'marketVersion', 9
    )
FROM public.rounds round_item
WHERE round_item.id = fantasy_round.round_id
  AND (
    (round_item.number = 3 AND fantasy_round.market_status = 'finished')
    OR (round_item.number >= 4 AND fantasy_round.market_status = 'open')
  );

CREATE OR REPLACE FUNCTION public.apply_fantasy_role_market_v074(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.fantasy_rounds%ROWTYPE;
  snapshot JSONB;
  round_weight NUMERIC;
  attendance_weight NUMERIC;
  contribution_weight NUMERIC;
  reprice_strength NUMERIC;
  price_floor NUMERIC;
  price_ceiling NUMERIC;
  price_curve NUMERIC;
  budget_base NUMERIC;
  budget_soft_cap NUMERIC;
  budget_hard_cap NUMERIC;
  budget_excess_retention NUMERIC;
BEGIN
  SELECT * INTO target
  FROM public.fantasy_rounds
  WHERE round_id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN true; END IF;

  snapshot := target.settings_snapshot;
  round_weight := COALESCE((snapshot->>'market_round_weight')::NUMERIC, .30);
  attendance_weight := COALESCE((snapshot->>'market_attendance_weight')::NUMERIC, .20);
  contribution_weight := GREATEST(0, 1 - round_weight - attendance_weight);
  reprice_strength := COALESCE((snapshot->>'market_reprice_strength')::NUMERIC, .35);
  price_floor := COALESCE((snapshot->>'competitive_price_floor')::NUMERIC, 6);
  price_ceiling := COALESCE((snapshot->>'competitive_price_ceiling')::NUMERIC, 20);
  price_curve := COALESCE((snapshot->>'competitive_price_curve')::NUMERIC, 1.15);
  SELECT GREATEST(fantasy_season.initial_budget, COALESCE(league.players_per_team, 5) * 11)
  INTO budget_base
  FROM public.fantasy_seasons fantasy_season
  JOIN public.leagues league ON league.id = fantasy_season.league_id
  WHERE fantasy_season.id = target.fantasy_season_id;
  budget_base := COALESCE(budget_base, 55);
  budget_soft_cap := budget_base * COALESCE((snapshot->>'budget_soft_cap_multiplier')::NUMERIC, 1.20);
  budget_hard_cap := budget_base * COALESCE((snapshot->>'budget_hard_cap_multiplier')::NUMERIC, 1.40);
  budget_excess_retention := COALESCE((snapshot->>'budget_excess_retention')::NUMERIC, .25);

  WITH performance AS (
    SELECT
      history.player_id,
      history.price_before,
      player.player_profile,
      COALESCE(stat.points, 0)::NUMERIC base_points,
      COALESCE(previous.total_points, 0)::NUMERIC + COALESCE(stat.points, 0)::NUMERIC season_total_points,
      COALESCE(previous.total_games, 0)::NUMERIC + COALESCE(stat.games, 0)::NUMERIC season_games
    FROM public.fantasy_player_price_history history
    JOIN public.player_round_stats stat
      ON stat.round_id = p_round_id
      AND stat.player_id = history.player_id
    JOIN public.players player ON player.id = history.player_id
    LEFT JOIN LATERAL (
      SELECT
        sum(previous_history.round_points)::NUMERIC total_points,
        sum(previous_history.games)::NUMERIC total_games
      FROM public.fantasy_player_price_history previous_history
      WHERE previous_history.fantasy_season_id = target.fantasy_season_id
        AND previous_history.player_id = history.player_id
        AND previous_history.fantasy_round_id <> target.id
        AND previous_history.games > 0
    ) previous ON true
    WHERE history.fantasy_round_id = target.id
      AND stat.games > 0
  ), ranked AS (
    SELECT performance.*,
      rank() OVER (ORDER BY base_points DESC) round_overall_rank,
      count(*) OVER (PARTITION BY base_points) round_overall_ties,
      count(*) OVER () overall_count,
      rank() OVER (PARTITION BY player_profile ORDER BY base_points DESC) round_role_rank,
      count(*) OVER (PARTITION BY player_profile, base_points) round_role_ties,
      count(*) OVER (PARTITION BY player_profile) role_count,
      rank() OVER (ORDER BY season_total_points DESC) contribution_overall_rank,
      count(*) OVER (PARTITION BY season_total_points) contribution_overall_ties,
      rank() OVER (PARTITION BY player_profile ORDER BY season_total_points DESC) contribution_role_rank,
      count(*) OVER (PARTITION BY player_profile, season_total_points) contribution_role_ties,
      rank() OVER (ORDER BY season_games DESC) attendance_overall_rank,
      count(*) OVER (PARTITION BY season_games) attendance_overall_ties,
      rank() OVER (PARTITION BY player_profile ORDER BY season_games DESC) attendance_role_rank,
      count(*) OVER (PARTITION BY player_profile, season_games) attendance_role_ties
    FROM performance
  ), percentiles AS (
    SELECT ranked.*,
      CASE WHEN overall_count <= 1 THEN .5 ELSE (((round_overall_rank - 1) + (round_overall_rank + round_overall_ties - 2))::NUMERIC / 2) / (overall_count - 1) END round_overall_percentile,
      CASE WHEN role_count <= 1 THEN .5 ELSE (((round_role_rank - 1) + (round_role_rank + round_role_ties - 2))::NUMERIC / 2) / (role_count - 1) END round_role_percentile,
      CASE WHEN overall_count <= 1 THEN .5 ELSE (((contribution_overall_rank - 1) + (contribution_overall_rank + contribution_overall_ties - 2))::NUMERIC / 2) / (overall_count - 1) END contribution_overall_percentile,
      CASE WHEN role_count <= 1 THEN .5 ELSE (((contribution_role_rank - 1) + (contribution_role_rank + contribution_role_ties - 2))::NUMERIC / 2) / (role_count - 1) END contribution_role_percentile,
      CASE WHEN overall_count <= 1 THEN .5 ELSE (((attendance_overall_rank - 1) + (attendance_overall_rank + attendance_overall_ties - 2))::NUMERIC / 2) / (overall_count - 1) END attendance_overall_percentile,
      CASE WHEN role_count <= 1 THEN .5 ELSE (((attendance_role_rank - 1) + (attendance_role_rank + attendance_role_ties - 2))::NUMERIC / 2) / (role_count - 1) END attendance_role_percentile
    FROM ranked
  ), mixed AS (
    SELECT percentiles.*,
      CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3 THEN .65 * round_role_percentile + .35 * round_overall_percentile ELSE round_overall_percentile END round_market_percentile,
      CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3 THEN .65 * contribution_role_percentile + .35 * contribution_overall_percentile ELSE contribution_overall_percentile END contribution_market_percentile,
      CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3 THEN .65 * attendance_role_percentile + .35 * attendance_overall_percentile ELSE attendance_overall_percentile END attendance_market_percentile
    FROM percentiles
  ), combined AS (
    SELECT mixed.*,
      round_weight * round_market_percentile
      + contribution_weight * contribution_market_percentile
      + attendance_weight * attendance_market_percentile combined_percentile
    FROM mixed
  ), final_ranking AS (
    SELECT combined.*,
      rank() OVER (ORDER BY combined_percentile) start_rank,
      count(*) OVER (PARTITION BY combined_percentile) tied_count,
      count(*) OVER () participant_count,
      min(combined_percentile) OVER () min_combined,
      max(combined_percentile) OVER () max_combined
    FROM combined
  ), targets AS (
    SELECT final_ranking.*,
      CASE WHEN participant_count <= 1 THEN .5 ELSE (((start_rank - 1) + (start_rank + tied_count - 2))::NUMERIC / 2) / (participant_count - 1) END market_percentile
    FROM final_ranking
  ), proposed AS (
    SELECT targets.*,
      CASE WHEN min_combined = max_combined THEN price_before ELSE
        price_floor + (price_ceiling - price_floor) * power(GREATEST(0, LEAST(1, 1 - market_percentile))::DOUBLE PRECISION, price_curve::DOUBLE PRECISION)::NUMERIC
      END target_price
    FROM targets
  ), bounded AS (
    SELECT proposed.*,
      round(GREATEST(
        COALESCE((snapshot->>'min_player_price')::NUMERIC, 5),
        price_before * (1 - COALESCE((snapshot->>'max_price_decrease')::NUMERIC, .12)),
        LEAST(
          COALESCE((snapshot->>'max_player_price')::NUMERIC, 24),
          price_before * (1 + COALESCE((snapshot->>'max_price_increase')::NUMERIC, .20)),
          price_before + (target_price - price_before) * reprice_strength
        )
      ), 2) calculated_price
    FROM proposed
  ), values_to_apply AS (
    SELECT bounded.*,
      (calculated_price - price_before) / NULLIF(price_before, 0) variation_rate,
      CASE WHEN (calculated_price - price_before) / NULLIF(price_before, 0) > .015 THEN 'UP'
        WHEN (calculated_price - price_before) / NULLIF(price_before, 0) < -.015 THEN 'DOWN'
        ELSE 'STABLE'
      END market_band
    FROM bounded
  )
  UPDATE public.fantasy_player_price_history history SET
    round_points = value.base_points,
    variation_rate = value.variation_rate,
    price_after = value.calculated_price,
    price_change = value.calculated_price - value.price_before,
    market_band = value.market_band,
    round_rank = value.start_rank,
    round_percentile = value.market_percentile,
    metrics = COALESCE(history.metrics, '{}'::JSONB) || jsonb_build_object(
      'scoringVersion', 5,
      'marketVersion', 9,
      'marketMethod', '30% rodada / 50% pontos acumulados / 20% presenca; 65% posicao / 35% geral',
      'seasonContributionPoints', value.season_total_points,
      'seasonGames', value.season_games,
      'competitiveTargetPrice', round(value.target_price, 2)
    )
  FROM values_to_apply value
  WHERE history.fantasy_round_id = target.id
    AND history.player_id = value.player_id;

  UPDATE public.fantasy_player_prices price SET
    current_price = history.price_after,
    rounds_played = (SELECT count(*) FROM public.fantasy_player_price_history item WHERE item.fantasy_season_id = price.fantasy_season_id AND item.player_id = price.player_id AND item.games > 0),
    total_points = COALESCE((SELECT sum(item.round_points) FROM public.fantasy_player_price_history item WHERE item.fantasy_season_id = price.fantasy_season_id AND item.player_id = price.player_id), 0),
    updated_at = now()
  FROM public.fantasy_player_price_history history
  WHERE history.fantasy_round_id = target.id
    AND history.player_id = price.player_id
    AND price.fantasy_season_id = target.fantasy_season_id;

  UPDATE public.fantasy_lineup_players item SET
    price_after = COALESCE((SELECT history.price_after FROM public.fantasy_player_price_history history WHERE history.fantasy_round_id = target.id AND history.player_id = item.player_id), item.price_locked)
  FROM public.fantasy_lineups lineup
  WHERE lineup.id = item.lineup_id
    AND lineup.fantasy_round_id = target.id;

  WITH raw_budgets AS (
    SELECT lineup.id, lineup.cash_remaining + COALESCE(sum(item.price_after), 0) raw_budget
    FROM public.fantasy_lineups lineup
    LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
    WHERE lineup.fantasy_round_id = target.id
      AND lineup.status = 'scored'
    GROUP BY lineup.id, lineup.cash_remaining
  )
  UPDATE public.fantasy_lineups lineup SET
    budget_after = round(CASE WHEN raw.raw_budget <= budget_soft_cap THEN raw.raw_budget ELSE LEAST(budget_hard_cap, budget_soft_cap + (raw.raw_budget - budget_soft_cap) * budget_excess_retention) END, 2)
  FROM raw_budgets raw
  WHERE lineup.id = raw.id;

  UPDATE public.fantasy_accounts account SET
    current_budget = latest.budget_after,
    total_points = totals.total_points,
    rounds_played = totals.rounds_played,
    best_round_points = totals.best_round,
    updated_at = now()
  FROM (
    SELECT DISTINCT ON (lineup.user_id) lineup.user_id, lineup.budget_after
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    WHERE fantasy_round.fantasy_season_id = target.fantasy_season_id
      AND lineup.status = 'scored'
      AND lineup.budget_after IS NOT NULL
    ORDER BY lineup.user_id, round_item.date DESC, round_item.number DESC
  ) latest
  JOIN (
    SELECT lineup.user_id, sum(lineup.total_points) total_points, count(*)::INTEGER rounds_played, max(lineup.total_points) best_round
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
    WHERE fantasy_round.fantasy_season_id = target.fantasy_season_id
      AND lineup.status = 'scored'
    GROUP BY lineup.user_id
  ) totals ON totals.user_id = latest.user_id
  WHERE account.fantasy_season_id = target.fantasy_season_id
    AND account.user_id = latest.user_id;

  RETURN true;
END;
$$;

-- Reprecifica o mercado aberto com os dados reais até a rodada 3. Usa pontos
-- acumulados e jogos disputados; não altera preços travados ou patrimônio antigo.
WITH eligible_seasons AS (
  SELECT fantasy_season.id fantasy_season_id
  FROM public.fantasy_seasons fantasy_season
  WHERE EXISTS (
    SELECT 1 FROM public.fantasy_rounds fantasy_round
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    WHERE fantasy_round.fantasy_season_id = fantasy_season.id
      AND round_item.number = 3
      AND round_item.round_type = 'official'
      AND fantasy_round.market_status = 'finished'
  )
), performance AS (
  SELECT price.fantasy_season_id, price.player_id, player.player_profile,
    sum(history.round_points)::NUMERIC season_total_points,
    sum(history.games)::NUMERIC season_games,
    max(history.round_points) FILTER (WHERE round_item.number = 3)::NUMERIC latest_round_points
  FROM public.fantasy_player_prices price
  JOIN eligible_seasons eligible ON eligible.fantasy_season_id = price.fantasy_season_id
  JOIN public.players player ON player.id = price.player_id
  JOIN public.fantasy_player_price_history history ON history.fantasy_season_id = price.fantasy_season_id AND history.player_id = price.player_id AND history.games > 0
  JOIN public.fantasy_rounds history_round ON history_round.id = history.fantasy_round_id
  JOIN public.rounds round_item ON round_item.id = history_round.round_id AND round_item.number <= 3
  GROUP BY price.fantasy_season_id, price.player_id, player.player_profile
), ranked AS (
  SELECT performance.*,
    rank() OVER (PARTITION BY fantasy_season_id ORDER BY latest_round_points DESC NULLS LAST) round_rank,
    count(*) OVER (PARTITION BY fantasy_season_id, latest_round_points) round_ties,
    count(*) OVER (PARTITION BY fantasy_season_id) overall_count,
    rank() OVER (PARTITION BY fantasy_season_id, player_profile ORDER BY latest_round_points DESC NULLS LAST) round_role_rank,
    count(*) OVER (PARTITION BY fantasy_season_id, player_profile, latest_round_points) round_role_ties,
    count(*) OVER (PARTITION BY fantasy_season_id, player_profile) role_count,
    rank() OVER (PARTITION BY fantasy_season_id ORDER BY season_total_points DESC) contribution_rank,
    count(*) OVER (PARTITION BY fantasy_season_id, season_total_points) contribution_ties,
    rank() OVER (PARTITION BY fantasy_season_id, player_profile ORDER BY season_total_points DESC) contribution_role_rank,
    count(*) OVER (PARTITION BY fantasy_season_id, player_profile, season_total_points) contribution_role_ties,
    rank() OVER (PARTITION BY fantasy_season_id ORDER BY season_games DESC) attendance_rank,
    count(*) OVER (PARTITION BY fantasy_season_id, season_games) attendance_ties,
    rank() OVER (PARTITION BY fantasy_season_id, player_profile ORDER BY season_games DESC) attendance_role_rank,
    count(*) OVER (PARTITION BY fantasy_season_id, player_profile, season_games) attendance_role_ties
  FROM performance
), percentiles AS (
  SELECT ranked.*,
    CASE WHEN overall_count <= 1 THEN .5 ELSE (((round_rank - 1) + (round_rank + round_ties - 2))::NUMERIC / 2) / (overall_count - 1) END round_overall,
    CASE WHEN role_count <= 1 THEN .5 ELSE (((round_role_rank - 1) + (round_role_rank + round_role_ties - 2))::NUMERIC / 2) / (role_count - 1) END round_role,
    CASE WHEN overall_count <= 1 THEN .5 ELSE (((contribution_rank - 1) + (contribution_rank + contribution_ties - 2))::NUMERIC / 2) / (overall_count - 1) END contribution_overall,
    CASE WHEN role_count <= 1 THEN .5 ELSE (((contribution_role_rank - 1) + (contribution_role_rank + contribution_role_ties - 2))::NUMERIC / 2) / (role_count - 1) END contribution_role,
    CASE WHEN overall_count <= 1 THEN .5 ELSE (((attendance_rank - 1) + (attendance_rank + attendance_ties - 2))::NUMERIC / 2) / (overall_count - 1) END attendance_overall,
    CASE WHEN role_count <= 1 THEN .5 ELSE (((attendance_role_rank - 1) + (attendance_role_rank + attendance_role_ties - 2))::NUMERIC / 2) / (role_count - 1) END attendance_role
  FROM ranked
), mixed AS (
  SELECT percentiles.*,
    CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3 THEN .65 * round_role + .35 * round_overall ELSE round_overall END round_score,
    CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3 THEN .65 * contribution_role + .35 * contribution_overall ELSE contribution_overall END contribution_score,
    CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3 THEN .65 * attendance_role + .35 * attendance_overall ELSE attendance_overall END attendance_score
  FROM percentiles
), final_ranking AS (
  SELECT mixed.*,
    .30 * round_score + .50 * contribution_score + .20 * attendance_score combined_score
  FROM mixed
), ordered AS (
  SELECT final_ranking.*,
    rank() OVER (PARTITION BY fantasy_season_id ORDER BY combined_score) start_rank,
    count(*) OVER (PARTITION BY fantasy_season_id, combined_score) tied_count,
    count(*) OVER (PARTITION BY fantasy_season_id) participant_count
  FROM final_ranking
), calibrated AS (
  SELECT ordered.*,
    CASE WHEN participant_count <= 1 THEN .5 ELSE (((start_rank - 1) + (start_rank + tied_count - 2))::NUMERIC / 2) / (participant_count - 1) END market_percentile
  FROM ordered
)
UPDATE public.fantasy_player_prices price SET
  current_price = round(GREATEST(5, LEAST(24, 6 + 14 * power(GREATEST(0, LEAST(1, 1 - calibrated.market_percentile))::DOUBLE PRECISION, 1.15::DOUBLE PRECISION)::NUMERIC)), 2),
  updated_at = now()
FROM calibrated
WHERE price.fantasy_season_id = calibrated.fantasy_season_id
  AND price.player_id = calibrated.player_id;

UPDATE public.fantasy_player_price_history history SET
  metrics = COALESCE(history.metrics, '{}'::JSONB) || jsonb_build_object(
    'marketVersion', 9,
    'attendanceWeightedCalibrationApplied', true,
    'attendanceWeightedCalibrationPrice', price.current_price,
    'attendanceWeightedRule', '30% ultima rodada / 50% pontos acumulados / 20% jogos disputados'
  )
FROM public.fantasy_player_prices price,
  public.fantasy_rounds fantasy_round,
  public.rounds round_item
WHERE history.fantasy_season_id = price.fantasy_season_id
  AND history.player_id = price.player_id
  AND history.fantasy_round_id = fantasy_round.id
  AND round_item.id = fantasy_round.round_id
  AND round_item.number = 3
  AND fantasy_round.market_status = 'finished';

INSERT INTO public.fantasy_audit_log (league_id, fantasy_round_id, action, payload)
SELECT fantasy_season.league_id, fantasy_round.id, 'market_v9_attendance_calibration',
  jsonb_build_object(
    'marketVersion', 9,
    'roundWeight', .30,
    'seasonContributionWeight', .50,
    'attendanceWeight', .20,
    'historicalBudgetsPreserved', true
  )
FROM public.fantasy_seasons fantasy_season
JOIN public.fantasy_rounds fantasy_round ON fantasy_round.fantasy_season_id = fantasy_season.id
JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
WHERE round_item.number = 3
  AND round_item.round_type = 'official'
  AND fantasy_round.market_status = 'finished';

REVOKE ALL ON FUNCTION public.apply_fantasy_role_market_v074(UUID) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
