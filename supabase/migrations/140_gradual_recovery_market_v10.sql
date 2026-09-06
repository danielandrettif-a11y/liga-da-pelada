-- Mercado V10: reação gradual, recuperação por apostas baratas e patrimônio real.
--
-- A qualidade de mercado usa 70% da rodada atual e 30% da média por rodada da
-- temporada. Cada janela compara 65% dentro da função e 35% no geral. O preço
-- anda apenas 26% em direção à faixa justa C$ 6--18. Os limites amadurecem de
-- +8%/-6% na R1 até +15%/-12% na R5.

BEGIN;

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS market_initial_up_cap NUMERIC(6,5) NOT NULL DEFAULT .08,
  ADD COLUMN IF NOT EXISTS market_initial_down_cap NUMERIC(6,5) NOT NULL DEFAULT .06,
  ADD COLUMN IF NOT EXISTS market_cap_step NUMERIC(6,5) NOT NULL DEFAULT .02;

ALTER TABLE public.fantasy_settings
  ALTER COLUMN max_player_price SET DEFAULT 20,
  ALTER COLUMN max_price_increase SET DEFAULT .15,
  ALTER COLUMN max_price_decrease SET DEFAULT .12,
  ALTER COLUMN competitive_price_floor SET DEFAULT 6,
  ALTER COLUMN competitive_price_ceiling SET DEFAULT 18,
  ALTER COLUMN competitive_price_curve SET DEFAULT 1.9,
  ALTER COLUMN market_round_weight SET DEFAULT .70,
  ALTER COLUMN market_attendance_weight SET DEFAULT 0,
  ALTER COLUMN market_reprice_strength SET DEFAULT .26;

UPDATE public.fantasy_settings SET
  min_player_price = 5,
  max_player_price = 20,
  max_price_increase = .15,
  max_price_decrease = .12,
  competitive_price_floor = 6,
  competitive_price_ceiling = 18,
  competitive_price_curve = 1.9,
  market_round_weight = .70,
  market_attendance_weight = 0,
  market_reprice_strength = .26,
  market_initial_up_cap = .08,
  market_initial_down_cap = .06,
  market_cap_step = .02,
  updated_at = now();

-- A R3 documenta a origem da calibração. Mercados abertos seguintes recebem a
-- regra nova; pontos, escalações e patrimônios já encerrados não são reescritos.
UPDATE public.fantasy_rounds fantasy_round SET
  settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::JSONB)
    || jsonb_build_object(
      'min_player_price', 5,
      'max_player_price', 20,
      'max_price_increase', .15,
      'max_price_decrease', .12,
      'competitive_price_floor', 6,
      'competitive_price_ceiling', 18,
      'competitive_price_curve', 1.9,
      'market_round_weight', .70,
      'market_attendance_weight', 0,
      'market_reprice_strength', .26,
      'market_initial_up_cap', .08,
      'market_initial_down_cap', .06,
      'market_cap_step', .02,
      'marketVersion', 10
    )
FROM public.rounds round_item
WHERE round_item.id = fantasy_round.round_id
  AND (
    (round_item.number = 3 AND fantasy_round.market_status = 'finished')
    OR (round_item.number >= 4 AND fantasy_round.market_status = 'open')
  );

-- O nome é mantido porque process_fantasy_round já chama esta função.
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
  round_index INTEGER;
  up_cap NUMERIC;
  down_cap NUMERIC;
BEGIN
  SELECT * INTO target
  FROM public.fantasy_rounds
  WHERE round_id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN true; END IF;

  snapshot := COALESCE(target.settings_snapshot, '{}'::JSONB);
  round_weight := COALESCE((snapshot->>'market_round_weight')::NUMERIC, .70);
  reprice_strength := COALESCE((snapshot->>'market_reprice_strength')::NUMERIC, .26);
  price_floor := COALESCE((snapshot->>'competitive_price_floor')::NUMERIC, 6);
  price_ceiling := COALESCE((snapshot->>'competitive_price_ceiling')::NUMERIC, 18);
  price_curve := COALESCE((snapshot->>'competitive_price_curve')::NUMERIC, 1.9);

  SELECT count(*)::INTEGER INTO round_index
  FROM public.fantasy_rounds prior_fantasy_round
  JOIN public.rounds prior_round ON prior_round.id = prior_fantasy_round.round_id
  JOIN public.rounds current_round ON current_round.id = target.round_id
  WHERE prior_fantasy_round.fantasy_season_id = target.fantasy_season_id
    AND prior_round.round_type = 'official'
    AND prior_round.status = 'finished'
    AND (prior_round.date, prior_round.number) <= (current_round.date, current_round.number);
  round_index := GREATEST(1, COALESCE(round_index, 1));
  up_cap := LEAST(
    COALESCE((snapshot->>'max_price_increase')::NUMERIC, .15),
    COALESCE((snapshot->>'market_initial_up_cap')::NUMERIC, .08)
      + (round_index - 1) * COALESCE((snapshot->>'market_cap_step')::NUMERIC, .02)
  );
  down_cap := LEAST(
    COALESCE((snapshot->>'max_price_decrease')::NUMERIC, .12),
    COALESCE((snapshot->>'market_initial_down_cap')::NUMERIC, .06)
      + (round_index - 1) * COALESCE((snapshot->>'market_cap_step')::NUMERIC, .02)
  );

  WITH performance AS (
    SELECT
      history.player_id,
      history.price_before,
      player.player_profile,
      COALESCE(stat.points, 0)::NUMERIC base_points,
      (
        COALESCE(previous.points_sum, 0) + COALESCE(stat.points, 0)
      ) / GREATEST(1, COALESCE(previous.round_count, 0) + 1) season_average
    FROM public.fantasy_player_price_history history
    JOIN public.player_round_stats stat
      ON stat.round_id = p_round_id AND stat.player_id = history.player_id
    JOIN public.players player ON player.id = history.player_id
    LEFT JOIN LATERAL (
      SELECT
        sum(previous_history.round_points)::NUMERIC points_sum,
        count(*)::INTEGER round_count
      FROM public.fantasy_player_price_history previous_history
      JOIN public.fantasy_rounds previous_fantasy_round
        ON previous_fantasy_round.id = previous_history.fantasy_round_id
      JOIN public.rounds previous_round ON previous_round.id = previous_fantasy_round.round_id
      JOIN public.rounds current_round ON current_round.id = target.round_id
      WHERE previous_history.fantasy_season_id = target.fantasy_season_id
        AND previous_history.player_id = history.player_id
        AND previous_history.games > 0
        AND (previous_round.date, previous_round.number) < (current_round.date, current_round.number)
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
  ), qualities AS (
    SELECT ranked.*,
      CASE WHEN overall_count <= 1 THEN .5 ELSE 1 - (((round_overall_rank - 1) + (round_overall_rank + round_overall_ties - 2))::NUMERIC / 2) / (overall_count - 1) END round_overall_quality,
      CASE WHEN role_count <= 1 THEN .5 ELSE 1 - (((round_role_rank - 1) + (round_role_rank + round_role_ties - 2))::NUMERIC / 2) / (role_count - 1) END round_role_quality,
      CASE WHEN overall_count <= 1 THEN .5 ELSE 1 - (((season_overall_rank - 1) + (season_overall_rank + season_overall_ties - 2))::NUMERIC / 2) / (overall_count - 1) END season_overall_quality,
      CASE WHEN role_count <= 1 THEN .5 ELSE 1 - (((season_role_rank - 1) + (season_role_rank + season_role_ties - 2))::NUMERIC / 2) / (role_count - 1) END season_role_quality
    FROM ranked
  ), mixed AS (
    SELECT qualities.*,
      CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3
        THEN .65 * round_role_quality + .35 * round_overall_quality
        ELSE round_overall_quality END round_market_quality,
      CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3
        THEN .65 * season_role_quality + .35 * season_overall_quality
        ELSE season_overall_quality END season_market_quality
    FROM qualities
  ), combined AS (
    SELECT mixed.*,
      round_weight * round_market_quality + (1 - round_weight) * season_market_quality market_quality
    FROM mixed
  ), ordered AS (
    SELECT combined.*,
      rank() OVER (ORDER BY market_quality DESC) start_rank,
      count(*) OVER (PARTITION BY market_quality) tied_count,
      min(market_quality) OVER () min_quality,
      max(market_quality) OVER () max_quality
    FROM combined
  ), proposed AS (
    SELECT ordered.*,
      CASE WHEN min_quality = max_quality THEN price_before ELSE
        price_floor + (price_ceiling - price_floor)
          * power(GREATEST(0, LEAST(1, market_quality))::DOUBLE PRECISION, price_curve::DOUBLE PRECISION)::NUMERIC
      END target_price
    FROM ordered
  ), bounded AS (
    SELECT proposed.*,
      round(LEAST(
        COALESCE((snapshot->>'max_player_price')::NUMERIC, 20),
        GREATEST(
          COALESCE((snapshot->>'min_player_price')::NUMERIC, 5),
          price_before * (1 - down_cap),
          LEAST(
            price_before * (1 + up_cap),
            price_before + (target_price - price_before) * reprice_strength
          )
        )
      ), 2) calculated_price
    FROM proposed
  ), values_to_apply AS (
    SELECT bounded.*,
      (calculated_price - price_before) / NULLIF(price_before, 0) variation_rate,
      CASE WHEN (calculated_price - price_before) / NULLIF(price_before, 0) > .015 THEN 'UP'
        WHEN (calculated_price - price_before) / NULLIF(price_before, 0) < -.015 THEN 'DOWN'
        ELSE 'STABLE' END market_band
    FROM bounded
  )
  UPDATE public.fantasy_player_price_history history SET
    round_points = value.base_points,
    variation_rate = value.variation_rate,
    price_after = value.calculated_price,
    price_change = value.calculated_price - value.price_before,
    market_band = value.market_band,
    round_rank = value.start_rank,
    round_percentile = 1 - value.market_quality,
    metrics = COALESCE(history.metrics, '{}'::JSONB) || jsonb_build_object(
      'scoringVersion', 5,
      'marketVersion', 10,
      'marketMethod', '70% rodada / 30% media da temporada; 65% posicao / 35% geral; reacao gradual',
      'roundMarketQuality', round(value.round_market_quality, 5),
      'seasonMarketQuality', round(value.season_market_quality, 5),
      'marketQuality', round(value.market_quality, 5),
      'competitiveTargetPrice', round(value.target_price, 2),
      'repriceStrength', reprice_strength,
      'roundIndex', round_index,
      'upCap', up_cap,
      'downCap', down_cap
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
  WHERE lineup.id = item.lineup_id AND lineup.fantasy_round_id = target.id;

  -- Sem compressão: escolhas boas ou ruins alteram o patrimônio por inteiro.
  WITH raw_budgets AS (
    SELECT lineup.id, lineup.cash_remaining + COALESCE(sum(item.price_after), 0) raw_budget
    FROM public.fantasy_lineups lineup
    LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
    WHERE lineup.fantasy_round_id = target.id AND lineup.status = 'scored'
    GROUP BY lineup.id, lineup.cash_remaining
  )
  UPDATE public.fantasy_lineups lineup SET budget_after = round(raw.raw_budget, 2)
  FROM raw_budgets raw WHERE lineup.id = raw.id;

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
      AND lineup.status = 'scored' AND lineup.budget_after IS NOT NULL
    ORDER BY lineup.user_id, round_item.date DESC, round_item.number DESC
  ) latest
  JOIN (
    SELECT lineup.user_id, sum(lineup.total_points) total_points,
      count(*)::INTEGER rounds_played, max(lineup.total_points) best_round
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

-- Recalibração única: reexecuta cronologicamente todas as rodadas oficiais já
-- encerradas até a R3, sempre partindo de C$ 10. Só troca o mercado corrente;
-- histórico de escalação, preço travado e patrimônio passado permanecem iguais.
CREATE TEMP TABLE fantasy_market_v10_replay_prices (
  fantasy_season_id UUID NOT NULL,
  player_id UUID NOT NULL,
  current_price NUMERIC NOT NULL,
  PRIMARY KEY (fantasy_season_id, player_id)
) ON COMMIT DROP;

INSERT INTO fantasy_market_v10_replay_prices (fantasy_season_id, player_id, current_price)
SELECT price.fantasy_season_id, price.player_id, COALESCE(settings.initial_player_price, 10)
FROM public.fantasy_player_prices price
JOIN public.fantasy_seasons season ON season.id = price.fantasy_season_id
JOIN public.fantasy_settings settings ON settings.league_id = season.league_id
WHERE EXISTS (
  SELECT 1 FROM public.fantasy_rounds fantasy_round
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  WHERE fantasy_round.fantasy_season_id = price.fantasy_season_id
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished'
    AND round_item.number <= 3
);

DO $$
DECLARE replay_round RECORD;
BEGIN
  FOR replay_round IN
    SELECT fantasy_round.id fantasy_round_id, fantasy_round.fantasy_season_id,
      round_item.id round_id, round_item.number,
      row_number() OVER (PARTITION BY fantasy_round.fantasy_season_id ORDER BY round_item.date, round_item.number)::INTEGER market_index
    FROM public.fantasy_rounds fantasy_round
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    WHERE round_item.round_type = 'official'
      AND round_item.status = 'finished'
      AND round_item.number <= 3
    ORDER BY fantasy_round.fantasy_season_id, round_item.date, round_item.number
  LOOP
    WITH performance AS (
      SELECT replay.player_id, replay.current_price price_before, player.player_profile,
        stat.points::NUMERIC base_points,
        season_stats.season_average
      FROM fantasy_market_v10_replay_prices replay
      JOIN public.player_round_stats stat ON stat.round_id = replay_round.round_id AND stat.player_id = replay.player_id AND stat.games > 0
      JOIN public.players player ON player.id = replay.player_id
      JOIN LATERAL (
        SELECT avg(prior_stat.points)::NUMERIC season_average
        FROM public.fantasy_rounds prior_fantasy_round
        JOIN public.rounds prior_round ON prior_round.id = prior_fantasy_round.round_id
        JOIN public.player_round_stats prior_stat ON prior_stat.round_id = prior_round.id AND prior_stat.player_id = replay.player_id AND prior_stat.games > 0
        WHERE prior_fantasy_round.fantasy_season_id = replay_round.fantasy_season_id
          AND prior_round.round_type = 'official' AND prior_round.status = 'finished'
          AND (prior_round.date, prior_round.number) <= (
            SELECT current_round.date, current_round.number FROM public.rounds current_round WHERE current_round.id = replay_round.round_id
          )
      ) season_stats ON true
      WHERE replay.fantasy_season_id = replay_round.fantasy_season_id
    ), ranked AS (
      SELECT performance.*,
        rank() OVER (ORDER BY base_points DESC) rr, count(*) OVER (PARTITION BY base_points) rt,
        rank() OVER (PARTITION BY player_profile ORDER BY base_points DESC) rpr, count(*) OVER (PARTITION BY player_profile, base_points) rpt,
        rank() OVER (ORDER BY season_average DESC) sr, count(*) OVER (PARTITION BY season_average) st,
        rank() OVER (PARTITION BY player_profile ORDER BY season_average DESC) spr, count(*) OVER (PARTITION BY player_profile, season_average) spt,
        count(*) OVER () oc, count(*) OVER (PARTITION BY player_profile) rc
      FROM performance
    ), quality AS (
      SELECT ranked.*,
        CASE WHEN oc <= 1 THEN .5 ELSE 1 - (((rr - 1) + (rr + rt - 2))::NUMERIC / 2) / (oc - 1) END roq,
        CASE WHEN rc <= 1 THEN .5 ELSE 1 - (((rpr - 1) + (rpr + rpt - 2))::NUMERIC / 2) / (rc - 1) END rpq,
        CASE WHEN oc <= 1 THEN .5 ELSE 1 - (((sr - 1) + (sr + st - 2))::NUMERIC / 2) / (oc - 1) END soq,
        CASE WHEN rc <= 1 THEN .5 ELSE 1 - (((spr - 1) + (spr + spt - 2))::NUMERIC / 2) / (rc - 1) END spq
      FROM ranked
    ), combined AS (
      SELECT quality.*,
        .70 * (CASE WHEN player_profile IN ('defensive','midfield','offensive') AND rc >= 3 THEN .65 * rpq + .35 * roq ELSE roq END)
        + .30 * (CASE WHEN player_profile IN ('defensive','midfield','offensive') AND rc >= 3 THEN .65 * spq + .35 * soq ELSE soq END) market_quality
      FROM quality
    ), proposed AS (
      SELECT combined.*,
        6 + 12 * power(GREATEST(0, LEAST(1, market_quality))::DOUBLE PRECISION, 1.9::DOUBLE PRECISION)::NUMERIC target_price,
        min(market_quality) OVER () min_quality, max(market_quality) OVER () max_quality
      FROM combined
    ), bounded AS (
      SELECT proposed.*,
        round(CASE WHEN min_quality = max_quality THEN price_before ELSE LEAST(
          20,
          GREATEST(
            5,
            price_before * (1 - LEAST(.12, .06 + (replay_round.market_index - 1) * .02)),
            LEAST(
              price_before * (1 + LEAST(.15, .08 + (replay_round.market_index - 1) * .02)),
              price_before + (target_price - price_before) * .26
            )
          )
        ) END, 2) calculated_price
      FROM proposed
    )
    UPDATE fantasy_market_v10_replay_prices replay SET current_price = bounded.calculated_price
    FROM bounded
    WHERE replay.fantasy_season_id = replay_round.fantasy_season_id
      AND replay.player_id = bounded.player_id;
  END LOOP;
END;
$$;

UPDATE public.fantasy_player_prices price SET
  current_price = replay.current_price,
  updated_at = now()
FROM fantasy_market_v10_replay_prices replay
WHERE price.fantasy_season_id = replay.fantasy_season_id
  AND price.player_id = replay.player_id;

UPDATE public.fantasy_player_price_history history SET
  metrics = COALESCE(history.metrics, '{}'::JSONB) || jsonb_build_object(
    'marketVersion', 10,
    'gradualCalibrationApplied', true,
    'gradualCalibrationPrice', replay.current_price,
    'historicalLineupsPreserved', true,
    'calibrationRule', 'replay R1-R3; 70% rodada / 30% media; limites progressivos'
  )
FROM fantasy_market_v10_replay_prices replay,
  public.fantasy_rounds fantasy_round,
  public.rounds round_item
WHERE history.fantasy_season_id = replay.fantasy_season_id
  AND history.player_id = replay.player_id
  AND history.fantasy_round_id = fantasy_round.id
  AND round_item.id = fantasy_round.round_id
  AND round_item.number = 3
  AND round_item.round_type = 'official';

-- Permite administrar os parâmetros do V10 pela tela existente.
CREATE OR REPLACE FUNCTION public.update_fantasy_settings(p_settings JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_league_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar configurações do Cartola.';
  END IF;
  SELECT id INTO v_league_id FROM public.leagues LIMIT 1;
  IF v_league_id IS NULL THEN RAISE EXCEPTION 'Liga não encontrada.'; END IF;

  UPDATE public.fantasy_settings SET
    currency_name = COALESCE(p_settings->>'currency_name', currency_name),
    initial_budget = COALESCE((p_settings->>'initial_budget')::NUMERIC, initial_budget),
    initial_player_price = COALESCE((p_settings->>'initial_player_price')::NUMERIC, initial_player_price),
    min_player_price = COALESCE((p_settings->>'min_player_price')::NUMERIC, min_player_price),
    max_player_price = COALESCE((p_settings->>'max_player_price')::NUMERIC, max_player_price),
    captain_multiplier = COALESCE((p_settings->>'captain_multiplier')::NUMERIC, captain_multiplier),
    top_scorer_prediction_points = COALESCE((p_settings->>'top_scorer_prediction_points')::NUMERIC, top_scorer_prediction_points),
    top_assist_prediction_points = COALESCE((p_settings->>'top_assist_prediction_points')::NUMERIC, top_assist_prediction_points),
    king_of_wins_points = COALESCE((p_settings->>'king_of_wins_points')::NUMERIC, king_of_wins_points),
    mvp_prediction_points = COALESCE((p_settings->>'mvp_prediction_points')::NUMERIC, mvp_prediction_points),
    bet_of_round_points = COALESCE((p_settings->>'bet_of_round_points')::NUMERIC, bet_of_round_points),
    bet_rank_band_1 = COALESCE((p_settings->>'bet_rank_band_1')::INTEGER, bet_rank_band_1),
    bet_rank_band_2 = COALESCE((p_settings->>'bet_rank_band_2')::INTEGER, bet_rank_band_2),
    bet_rank_band_3 = COALESCE((p_settings->>'bet_rank_band_3')::INTEGER, bet_rank_band_3),
    bet_rank_band_4 = COALESCE((p_settings->>'bet_rank_band_4')::INTEGER, bet_rank_band_4),
    score_goal_reward_band_1 = COALESCE((p_settings->>'score_goal_reward_band_1')::NUMERIC, score_goal_reward_band_1),
    score_goal_reward_band_2 = COALESCE((p_settings->>'score_goal_reward_band_2')::NUMERIC, score_goal_reward_band_2),
    score_goal_reward_band_3 = COALESCE((p_settings->>'score_goal_reward_band_3')::NUMERIC, score_goal_reward_band_3),
    score_goal_reward_band_4 = COALESCE((p_settings->>'score_goal_reward_band_4')::NUMERIC, score_goal_reward_band_4),
    recent_weight = COALESCE((p_settings->>'recent_weight')::NUMERIC, recent_weight),
    win_rate_weight = COALESCE((p_settings->>'win_rate_weight')::NUMERIC, win_rate_weight),
    historical_weight = COALESCE((p_settings->>'historical_weight')::NUMERIC, historical_weight),
    consistency_weight = COALESCE((p_settings->>'consistency_weight')::NUMERIC, consistency_weight),
    smoothing_games = COALESCE((p_settings->>'smoothing_games')::INTEGER, smoothing_games),
    max_price_increase = COALESCE((p_settings->>'max_price_increase')::NUMERIC, max_price_increase),
    max_price_decrease = COALESCE((p_settings->>'max_price_decrease')::NUMERIC, max_price_decrease),
    competitive_price_floor = COALESCE((p_settings->>'competitive_price_floor')::NUMERIC, competitive_price_floor),
    competitive_price_ceiling = COALESCE((p_settings->>'competitive_price_ceiling')::NUMERIC, competitive_price_ceiling),
    competitive_price_curve = COALESCE((p_settings->>'competitive_price_curve')::NUMERIC, competitive_price_curve),
    market_round_weight = COALESCE((p_settings->>'market_round_weight')::NUMERIC, market_round_weight),
    market_reprice_strength = COALESCE((p_settings->>'market_reprice_strength')::NUMERIC, market_reprice_strength),
    market_initial_up_cap = COALESCE((p_settings->>'market_initial_up_cap')::NUMERIC, market_initial_up_cap),
    market_initial_down_cap = COALESCE((p_settings->>'market_initial_down_cap')::NUMERIC, market_initial_down_cap),
    market_cap_step = COALESCE((p_settings->>'market_cap_step')::NUMERIC, market_cap_step),
    min_sample_for_radar = COALESCE((p_settings->>'min_sample_for_radar')::INTEGER, min_sample_for_radar),
    updated_at = now()
  WHERE league_id = v_league_id;
  RETURN true;
END;
$$;

INSERT INTO public.fantasy_audit_log (league_id, fantasy_round_id, action, payload)
SELECT season.league_id, latest.fantasy_round_id, 'market_v10_gradual_calibration',
  jsonb_build_object(
    'marketVersion', 10,
    'roundWeight', .70,
    'seasonAverageWeight', .30,
    'positionWeight', .65,
    'overallWeight', .35,
    'priceFloor', 6,
    'priceCeiling', 18,
    'curve', 1.9,
    'repriceStrength', .26,
    'initialUpCap', .08,
    'initialDownCap', .06,
    'capStep', .02,
    'matureUpCap', .15,
    'matureDownCap', .12,
    'historicalBudgetsPreserved', true,
    'futureBudgetCompression', false
  )
FROM public.fantasy_seasons season
JOIN LATERAL (
  SELECT fantasy_round.id fantasy_round_id
  FROM public.fantasy_rounds fantasy_round
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  WHERE fantasy_round.fantasy_season_id = season.id
    AND round_item.round_type = 'official' AND round_item.status = 'finished' AND round_item.number <= 3
  ORDER BY round_item.date DESC, round_item.number DESC LIMIT 1
) latest ON true
WHERE EXISTS (SELECT 1 FROM fantasy_market_v10_replay_prices replay WHERE replay.fantasy_season_id = season.id);

REVOKE ALL ON FUNCTION public.apply_fantasy_role_market_v074(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_fantasy_settings(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
