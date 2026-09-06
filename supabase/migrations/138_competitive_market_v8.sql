-- Mercado V8: preços com separação real entre craques, titulares e apostas.
-- A rodada pesa 55%, a temporada 45%; dentro de cada janela, a comparação
-- continua justa por função (65% posição / 35% geral).

BEGIN;

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS competitive_price_floor NUMERIC(10,2) NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS competitive_price_ceiling NUMERIC(10,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS competitive_price_curve NUMERIC(6,3) NOT NULL DEFAULT 1.15,
  ADD COLUMN IF NOT EXISTS market_round_weight NUMERIC(6,5) NOT NULL DEFAULT .55,
  ADD COLUMN IF NOT EXISTS market_reprice_strength NUMERIC(6,5) NOT NULL DEFAULT .35,
  ADD COLUMN IF NOT EXISTS budget_soft_cap_multiplier NUMERIC(6,3) NOT NULL DEFAULT 1.20,
  ADD COLUMN IF NOT EXISTS budget_hard_cap_multiplier NUMERIC(6,3) NOT NULL DEFAULT 1.40,
  ADD COLUMN IF NOT EXISTS budget_excess_retention NUMERIC(6,5) NOT NULL DEFAULT .25;

ALTER TABLE public.fantasy_settings
  ALTER COLUMN min_player_price SET DEFAULT 5,
  ALTER COLUMN max_player_price SET DEFAULT 24,
  ALTER COLUMN max_price_increase SET DEFAULT .20,
  ALTER COLUMN max_price_decrease SET DEFAULT .12;

UPDATE public.fantasy_settings SET
  min_player_price = 5,
  max_player_price = 24,
  max_price_increase = .20,
  max_price_decrease = .12,
  competitive_price_floor = 6,
  competitive_price_ceiling = 20,
  competitive_price_curve = 1.15,
  market_round_weight = .55,
  market_reprice_strength = .35,
  budget_soft_cap_multiplier = 1.20,
  budget_hard_cap_multiplier = 1.40,
  budget_excess_retention = .25,
  updated_at = now();

-- A rodada aberta e as próximas recebem a regra V8. A rodada 3 fica marcada
-- como a fonte da calibração, mas seus pontos e patrimônios não são refeitos.
UPDATE public.fantasy_rounds fantasy_round SET
  settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::JSONB)
    || jsonb_build_object(
      'min_player_price', 5,
      'max_player_price', 24,
      'max_price_increase', .20,
      'max_price_decrease', .12,
      'competitive_price_floor', 6,
      'competitive_price_ceiling', 20,
      'competitive_price_curve', 1.15,
      'market_round_weight', .55,
      'market_reprice_strength', .35,
      'budget_soft_cap_multiplier', 1.20,
      'budget_hard_cap_multiplier', 1.40,
      'budget_excess_retention', .25,
      'marketVersion', 8
    )
FROM public.rounds round_item
WHERE round_item.id = fantasy_round.round_id
  AND (
    (round_item.number = 3 AND fantasy_round.market_status = 'finished')
    OR (round_item.number >= 4 AND fantasy_round.market_status = 'open')
  );

-- Mantém o nome histórico da função porque process_fantasy_round já aponta
-- para ela. A implementação passa a ser o motor competitivo V8.
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
  round_weight := COALESCE((snapshot->>'market_round_weight')::NUMERIC, .55);
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
      COALESCE(previous.season_average, COALESCE(stat.points, 0)::NUMERIC) season_average
    FROM public.fantasy_player_price_history history
    JOIN public.player_round_stats stat
      ON stat.round_id = p_round_id
      AND stat.player_id = history.player_id
    JOIN public.players player ON player.id = history.player_id
    LEFT JOIN LATERAL (
      SELECT avg(previous_history.round_points)::NUMERIC season_average
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
      rank() OVER (ORDER BY season_average DESC) season_overall_rank,
      count(*) OVER (PARTITION BY season_average) season_overall_ties,
      rank() OVER (PARTITION BY player_profile ORDER BY season_average DESC) season_role_rank,
      count(*) OVER (PARTITION BY player_profile, season_average) season_role_ties
    FROM performance
  ), percentiles AS (
    SELECT ranked.*,
      CASE WHEN overall_count <= 1 THEN .5 ELSE
        (((round_overall_rank - 1) + (round_overall_rank + round_overall_ties - 2))::NUMERIC / 2) / (overall_count - 1)
      END round_overall_percentile,
      CASE WHEN role_count <= 1 THEN .5 ELSE
        (((round_role_rank - 1) + (round_role_rank + round_role_ties - 2))::NUMERIC / 2) / (role_count - 1)
      END round_role_percentile,
      CASE WHEN overall_count <= 1 THEN .5 ELSE
        (((season_overall_rank - 1) + (season_overall_rank + season_overall_ties - 2))::NUMERIC / 2) / (overall_count - 1)
      END season_overall_percentile,
      CASE WHEN role_count <= 1 THEN .5 ELSE
        (((season_role_rank - 1) + (season_role_rank + season_role_ties - 2))::NUMERIC / 2) / (role_count - 1)
      END season_role_percentile
    FROM ranked
  ), mixed AS (
    SELECT percentiles.*,
      CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3
        THEN .65 * round_role_percentile + .35 * round_overall_percentile
        ELSE round_overall_percentile
      END round_market_percentile,
      CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3
        THEN .65 * season_role_percentile + .35 * season_overall_percentile
        ELSE season_overall_percentile
      END season_market_percentile
    FROM percentiles
  ), combined AS (
    SELECT mixed.*,
      round_weight * round_market_percentile + (1 - round_weight) * season_market_percentile combined_percentile
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
      CASE WHEN participant_count <= 1 THEN .5 ELSE
        (((start_rank - 1) + (start_rank + tied_count - 2))::NUMERIC / 2) / (participant_count - 1)
      END market_percentile
    FROM final_ranking
  ), proposed AS (
    SELECT targets.*,
      CASE WHEN min_combined = max_combined THEN price_before ELSE
        price_floor + (price_ceiling - price_floor)
          * power(GREATEST(0, LEAST(1, 1 - market_percentile))::DOUBLE PRECISION, price_curve::DOUBLE PRECISION)::NUMERIC
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
      CASE
        WHEN (calculated_price - price_before) / NULLIF(price_before, 0) > .015 THEN 'UP'
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
      'marketVersion', 8,
      'marketMethod', '55% rodada / 45% temporada; 65% posicao / 35% geral',
      'roundMarketPercentile', value.round_market_percentile,
      'seasonMarketPercentile', value.season_market_percentile,
      'competitiveTargetPrice', round(value.target_price, 2)
    )
  FROM values_to_apply value
  WHERE history.fantasy_round_id = target.id
    AND history.player_id = value.player_id;

  UPDATE public.fantasy_player_prices price SET
    current_price = history.price_after,
    rounds_played = (
      SELECT count(*) FROM public.fantasy_player_price_history item
      WHERE item.fantasy_season_id = price.fantasy_season_id
        AND item.player_id = price.player_id
        AND item.games > 0
    ),
    total_points = COALESCE((
      SELECT sum(item.round_points) FROM public.fantasy_player_price_history item
      WHERE item.fantasy_season_id = price.fantasy_season_id
        AND item.player_id = price.player_id
    ), 0),
    updated_at = now()
  FROM public.fantasy_player_price_history history
  WHERE history.fantasy_round_id = target.id
    AND history.player_id = price.player_id
    AND price.fantasy_season_id = target.fantasy_season_id;

  UPDATE public.fantasy_lineup_players item SET
    price_after = COALESCE((
      SELECT history.price_after
      FROM public.fantasy_player_price_history history
      WHERE history.fantasy_round_id = target.id
        AND history.player_id = item.player_id
    ), item.price_locked)
  FROM public.fantasy_lineups lineup
  WHERE lineup.id = item.lineup_id
    AND lineup.fantasy_round_id = target.id;

  WITH raw_budgets AS (
    SELECT lineup.id,
      lineup.cash_remaining + COALESCE(sum(item.price_after), 0) raw_budget
    FROM public.fantasy_lineups lineup
    LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
    WHERE lineup.fantasy_round_id = target.id
      AND lineup.status = 'scored'
    GROUP BY lineup.id, lineup.cash_remaining
  )
  UPDATE public.fantasy_lineups lineup SET
    budget_after = round(CASE
      WHEN raw.raw_budget <= budget_soft_cap THEN raw.raw_budget
      ELSE LEAST(
        budget_hard_cap,
        budget_soft_cap + (raw.raw_budget - budget_soft_cap) * budget_excess_retention
      )
    END, 2)
  FROM raw_budgets raw
  WHERE lineup.id = raw.id;

  UPDATE public.fantasy_accounts account SET
    current_budget = latest.budget_after,
    total_points = totals.total_points,
    rounds_played = totals.rounds_played,
    best_round_points = totals.best_round,
    updated_at = now()
  FROM (
    SELECT DISTINCT ON (lineup.user_id)
      lineup.user_id, lineup.budget_after
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    WHERE fantasy_round.fantasy_season_id = target.fantasy_season_id
      AND lineup.status = 'scored'
      AND lineup.budget_after IS NOT NULL
    ORDER BY lineup.user_id, round_item.date DESC, round_item.number DESC
  ) latest
  JOIN (
    SELECT lineup.user_id,
      sum(lineup.total_points) total_points,
      count(*)::INTEGER rounds_played,
      max(lineup.total_points) best_round
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

-- Calibração imediata pelo desempenho acumulado até a rodada 3. Ela muda o
-- preço disponível no mercado, sem reescrever lineups e patrimônios passados;
-- assim ninguém recebe uma fortuna retroativa só porque a régua mudou.
WITH eligible_seasons AS (
  SELECT fantasy_season.id fantasy_season_id
  FROM public.fantasy_seasons fantasy_season
  WHERE EXISTS (
    SELECT 1
    FROM public.fantasy_rounds fantasy_round
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    WHERE fantasy_round.fantasy_season_id = fantasy_season.id
      AND round_item.number = 3
      AND round_item.round_type = 'official'
      AND fantasy_round.market_status = 'finished'
  )
), performance AS (
  SELECT price.fantasy_season_id, price.player_id, player.player_profile,
    avg(history.round_points)::NUMERIC season_average
  FROM public.fantasy_player_prices price
  JOIN eligible_seasons eligible ON eligible.fantasy_season_id = price.fantasy_season_id
  JOIN public.players player ON player.id = price.player_id
  JOIN public.fantasy_player_price_history history
    ON history.fantasy_season_id = price.fantasy_season_id
    AND history.player_id = price.player_id
    AND history.games > 0
  JOIN public.fantasy_rounds history_round ON history_round.id = history.fantasy_round_id
  JOIN public.rounds round_item ON round_item.id = history_round.round_id
    AND round_item.number <= 3
  GROUP BY price.fantasy_season_id, price.player_id, player.player_profile
), ranked AS (
  SELECT performance.*,
    rank() OVER (PARTITION BY fantasy_season_id ORDER BY season_average DESC) overall_rank,
    count(*) OVER (PARTITION BY fantasy_season_id, season_average) overall_ties,
    count(*) OVER (PARTITION BY fantasy_season_id) overall_count,
    rank() OVER (PARTITION BY fantasy_season_id, player_profile ORDER BY season_average DESC) role_rank,
    count(*) OVER (PARTITION BY fantasy_season_id, player_profile, season_average) role_ties,
    count(*) OVER (PARTITION BY fantasy_season_id, player_profile) role_count
  FROM performance
), percentiles AS (
  SELECT ranked.*,
    CASE WHEN overall_count <= 1 THEN .5 ELSE
      (((overall_rank - 1) + (overall_rank + overall_ties - 2))::NUMERIC / 2) / (overall_count - 1)
    END overall_percentile,
    CASE WHEN role_count <= 1 THEN .5 ELSE
      (((role_rank - 1) + (role_rank + role_ties - 2))::NUMERIC / 2) / (role_count - 1)
    END role_percentile
  FROM ranked
), mixed AS (
  SELECT percentiles.*,
    CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3
      THEN .65 * role_percentile + .35 * overall_percentile
      ELSE overall_percentile
    END combined_percentile
  FROM percentiles
), final_ranking AS (
  SELECT mixed.*,
    rank() OVER (PARTITION BY fantasy_season_id ORDER BY combined_percentile) start_rank,
    count(*) OVER (PARTITION BY fantasy_season_id, combined_percentile) tied_count,
    count(*) OVER (PARTITION BY fantasy_season_id) participant_count,
    min(combined_percentile) OVER (PARTITION BY fantasy_season_id) min_combined,
    max(combined_percentile) OVER (PARTITION BY fantasy_season_id) max_combined
  FROM mixed
), values_to_apply AS (
  SELECT final_ranking.*,
    CASE WHEN participant_count <= 1 THEN .5 ELSE
      (((start_rank - 1) + (start_rank + tied_count - 2))::NUMERIC / 2) / (participant_count - 1)
    END market_percentile
  FROM final_ranking
), calibrated AS (
  SELECT values_to_apply.*,
    CASE WHEN min_combined = max_combined THEN 10 ELSE
      6 + 14 * power(
        GREATEST(0, LEAST(1, 1 - market_percentile))::DOUBLE PRECISION,
        1.15::DOUBLE PRECISION
      )::NUMERIC
    END calibrated_price
  FROM values_to_apply
)
UPDATE public.fantasy_player_prices price SET
  current_price = round(GREATEST(5, LEAST(24, calibrated.calibrated_price)), 2),
  updated_at = now()
FROM calibrated
WHERE price.fantasy_season_id = calibrated.fantasy_season_id
  AND price.player_id = calibrated.player_id;

UPDATE public.fantasy_player_price_history history SET
  metrics = COALESCE(history.metrics, '{}'::JSONB) || jsonb_build_object(
    'marketVersion', 8,
    'competitiveCalibrationApplied', true,
    'competitiveCalibrationPrice', price.current_price,
    'competitiveCalibrationRule', 'C$6-C$20 pela media ate a rodada 3; patrimonio historico preservado'
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
SELECT fantasy_season.league_id, fantasy_round.id, 'market_v8_competitive_calibration',
  jsonb_build_object(
    'marketVersion', 8,
    'priceRange', 'C$6-C$20',
    'roundWeight', .55,
    'seasonWeight', .45,
    'positionWeight', .65,
    'overallWeight', .35,
    'budgetSoftCap', '120% do orcamento-base',
    'budgetHardCap', '140% do orcamento-base',
    'excessGainRetention', .25,
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
