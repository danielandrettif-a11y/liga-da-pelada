-- Cartola: balanceamento V2 de pontuacao-base e mercado 30/30/40.
-- Cartas continuam sendo resolvidas depois deste processador e nao afetam precos.

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS market_up_share NUMERIC(6,5) NOT NULL DEFAULT .30 CHECK (market_up_share > 0 AND market_up_share < 1),
  ADD COLUMN IF NOT EXISTS market_stable_share NUMERIC(6,5) NOT NULL DEFAULT .30 CHECK (market_stable_share >= 0 AND market_stable_share < 1),
  ADD COLUMN IF NOT EXISTS market_min_increase NUMERIC(6,5) NOT NULL DEFAULT .03 CHECK (market_min_increase >= 0 AND market_min_increase <= 1),
  ADD COLUMN IF NOT EXISTS market_min_decrease NUMERIC(6,5) NOT NULL DEFAULT .02 CHECK (market_min_decrease >= 0 AND market_min_decrease <= 1),
  ADD COLUMN IF NOT EXISTS team_goal_conceded_points NUMERIC(8,2) NOT NULL DEFAULT -1;

UPDATE public.fantasy_settings SET
  goal_points = 4,
  assist_points = 2,
  win_points = 5,
  loss_points = -3,
  goalkeeper_appearance_points = 3,
  goal_conceded_points = -1,
  max_price_increase = .12,
  max_price_decrease = .10,
  market_up_share = .30,
  market_stable_share = .30,
  market_min_increase = .03,
  market_min_decrease = .02,
  team_goal_conceded_points = -1,
  updated_at = now();

ALTER TABLE public.player_round_stats
  ADD COLUMN IF NOT EXISTS team_goals_conceded INTEGER NOT NULL DEFAULT 0 CHECK (team_goals_conceded >= 0);

ALTER TABLE public.fantasy_rounds
  ADD COLUMN IF NOT EXISTS scoring_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.fantasy_test_sessions
  ADD COLUMN IF NOT EXISTS scoring_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.fantasy_player_price_history
  ADD COLUMN IF NOT EXISTS market_band TEXT CHECK (market_band IN ('UP', 'STABLE', 'DOWN')),
  ADD COLUMN IF NOT EXISTS round_rank INTEGER CHECK (round_rank IS NULL OR round_rank > 0),
  ADD COLUMN IF NOT EXISTS round_percentile NUMERIC(8,6),
  ADD COLUMN IF NOT EXISTS price_change NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.fantasy_rounds.scoring_version IS
  'Versao imutavel da engine de pontos/precos usada pela rodada.';
COMMENT ON COLUMN public.fantasy_player_price_history.market_band IS
  'Faixa relativa da rodada: 30% UP, 30% STABLE ou 40% DOWN.';

-- Novas rodadas recebem V2. Rodadas que ja existiam permanecem em V1.
CREATE OR REPLACE FUNCTION public.prepare_fantasy_v1_round()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.challenge_type IS NULL THEN
    NEW.challenge_type := public.pick_fantasy_challenge_type();
  END IF;
  IF NEW.rules_version = 0 THEN NEW.rules_version := 1; END IF;
  NEW.scoring_version := 2;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_fantasy_base_points(
  p_settings JSONB,
  p_goals INTEGER,
  p_assists INTEGER,
  p_wins INTEGER,
  p_losses INTEGER,
  p_goalkeeper_games INTEGER,
  p_team_goals_conceded INTEGER
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(p_goals, 0) * COALESCE((p_settings->>'goal_points')::NUMERIC, 4)
    + COALESCE(p_assists, 0) * COALESCE((p_settings->>'assist_points')::NUMERIC, 2)
    + COALESCE(p_wins, 0) * COALESCE((p_settings->>'win_points')::NUMERIC, 5)
    + COALESCE(p_losses, 0) * COALESCE((p_settings->>'loss_points')::NUMERIC, -3)
    + COALESCE(p_goalkeeper_games, 0) * COALESCE((p_settings->>'goalkeeper_appearance_points')::NUMERIC, 3)
    + COALESCE(p_team_goals_conceded, 0) * COALESCE((p_settings->>'team_goal_conceded_points')::NUMERIC, -1);
$$;

-- Mantém o bônus do goleiro e aplica uma única penalidade defensiva a todos
-- que entraram em campo, inclusive ao goleiro.
CREATE OR REPLACE FUNCTION public.update_fantasy_goalkeeper_points(
  p_goalkeeper_appearance_points NUMERIC,
  p_goal_conceded_points NUMERIC,
  p_team_goal_conceded_points NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE active_league_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem configurar o Cartola.'; END IF;
  IF p_goalkeeper_appearance_points NOT BETWEEN -100 AND 100
    OR p_goal_conceded_points NOT BETWEEN -100 AND 100
    OR p_team_goal_conceded_points NOT BETWEEN -100 AND 100 THEN
    RAISE EXCEPTION 'Pontuacao de goleiro invalida.';
  END IF;
  SELECT id INTO active_league_id FROM public.leagues WHERE is_active = true ORDER BY created_at LIMIT 1;
  UPDATE public.fantasy_settings SET
    goalkeeper_appearance_points = p_goalkeeper_appearance_points,
    goal_conceded_points = p_goal_conceded_points,
    team_goal_conceded_points = p_team_goal_conceded_points,
    updated_at = now()
  WHERE league_id = active_league_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.update_fantasy_goalkeeper_points(NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_fantasy_goalkeeper_points(NUMERIC, NUMERIC, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_fantasy_balance_v2(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.fantasy_rounds%ROWTYPE;
  snapshot JSONB;
BEGIN
  SELECT * INTO target FROM public.fantasy_rounds WHERE round_id = p_round_id FOR UPDATE;
  IF NOT FOUND OR target.scoring_version < 2 THEN RETURN true; END IF;
  snapshot := target.settings_snapshot;

  -- Uma unica regra alimenta escalação, histórico e preço.
  WITH calculated AS (
    SELECT item.id, item.player_id, lineup.captain_player_id,
      public.calculate_fantasy_base_points(
        snapshot, stat.goals, stat.assists, stat.wins, stat.losses,
        stat.goalkeeper_games, stat.team_goals_conceded
      ) AS base_points
    FROM public.fantasy_lineup_players item
    JOIN public.fantasy_lineups lineup ON lineup.id = item.lineup_id
    LEFT JOIN public.player_round_stats stat
      ON stat.round_id = p_round_id AND stat.player_id = item.player_id
    WHERE lineup.fantasy_round_id = target.id AND lineup.status = 'scored'
  )
  UPDATE public.fantasy_lineup_players item SET
    base_points = calculated.base_points,
    captain_bonus = CASE WHEN calculated.player_id = calculated.captain_player_id
      THEN calculated.base_points * (COALESCE((snapshot->>'captain_multiplier')::NUMERIC, 2) - 1)
      ELSE 0 END,
    total_points = calculated.base_points * CASE WHEN calculated.player_id = calculated.captain_player_id
      THEN COALESCE((snapshot->>'captain_multiplier')::NUMERIC, 2) ELSE 1 END
  FROM calculated WHERE item.id = calculated.id;

  UPDATE public.fantasy_lineups lineup SET
    player_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
    total_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0)
      + lineup.prediction_points,
    score_breakdown = COALESCE(lineup.score_breakdown, '{}'::JSONB) || jsonb_build_object(
      'playersBase', COALESCE((SELECT sum(item.base_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      'scoringVersion', 2
    )
  WHERE lineup.fantasy_round_id = target.id AND lineup.status = 'scored';

  -- Midrank preserva a mesma faixa e variacao para todos os empatados.
  WITH performance AS (
    SELECT history.player_id, history.price_before,
      public.calculate_fantasy_base_points(
        snapshot, stat.goals, stat.assists, stat.wins, stat.losses,
        stat.goalkeeper_games, stat.team_goals_conceded
      ) AS base_points,
      stat.games, stat.wins, stat.draws, stat.goals, stat.assists,
      stat.goalkeeper_games, stat.goals_conceded, stat.team_goals_conceded
    FROM public.fantasy_player_price_history history
    JOIN public.player_round_stats stat
      ON stat.round_id = p_round_id AND stat.player_id = history.player_id
    WHERE history.fantasy_round_id = target.id AND stat.games > 0
  ), ranked AS (
    SELECT performance.*,
      rank() OVER (ORDER BY base_points DESC)::INTEGER AS start_rank,
      count(*) OVER (PARTITION BY base_points)::INTEGER AS tied_count,
      count(*) OVER ()::INTEGER AS participant_count,
      min(base_points) OVER () AS min_points,
      max(base_points) OVER () AS max_points
    FROM performance
  ), positioned AS (
    SELECT ranked.*,
      CASE WHEN participant_count <= 1 THEN .5::NUMERIC
        ELSE (((start_rank - 1) + (start_rank + tied_count - 2))::NUMERIC / 2) / (participant_count - 1)
      END AS percentile
    FROM ranked
  ), classified AS (
    SELECT positioned.*,
      CASE
        WHEN min_points = max_points THEN 'STABLE'
        WHEN percentile < COALESCE((snapshot->>'market_up_share')::NUMERIC, .30) THEN 'UP'
        WHEN percentile < COALESCE((snapshot->>'market_up_share')::NUMERIC, .30)
          + COALESCE((snapshot->>'market_stable_share')::NUMERIC, .30) THEN 'STABLE'
        ELSE 'DOWN'
      END AS market_band
    FROM positioned
  ), banded AS (
    SELECT classified.*,
      min(percentile) FILTER (WHERE market_band = 'UP') OVER () AS up_min_percentile,
      max(percentile) FILTER (WHERE market_band = 'UP') OVER () AS up_max_percentile,
      min(percentile) FILTER (WHERE market_band = 'DOWN') OVER () AS down_min_percentile,
      max(percentile) FILTER (WHERE market_band = 'DOWN') OVER () AS down_max_percentile
    FROM classified
  ), variations AS (
    SELECT banded.*,
      CASE market_band
        WHEN 'UP' THEN CASE WHEN up_min_percentile = up_max_percentile
          THEN COALESCE((snapshot->>'max_price_increase')::NUMERIC, .12)
          ELSE COALESCE((snapshot->>'max_price_increase')::NUMERIC, .12)
            - ((percentile - up_min_percentile) / (up_max_percentile - up_min_percentile))
              * (COALESCE((snapshot->>'max_price_increase')::NUMERIC, .12)
                - COALESCE((snapshot->>'market_min_increase')::NUMERIC, .03))
          END
        WHEN 'DOWN' THEN CASE WHEN down_min_percentile = down_max_percentile
          THEN -COALESCE((snapshot->>'max_price_decrease')::NUMERIC, .10)
          ELSE -(COALESCE((snapshot->>'market_min_decrease')::NUMERIC, .02)
            + ((percentile - down_min_percentile) / (down_max_percentile - down_min_percentile))
              * (COALESCE((snapshot->>'max_price_decrease')::NUMERIC, .10)
                - COALESCE((snapshot->>'market_min_decrease')::NUMERIC, .02)))
          END
        ELSE 0
      END AS variation_rate
    FROM banded
  ), final_values AS (
    SELECT variations.*,
      round(greatest(
        COALESCE((snapshot->>'min_player_price')::NUMERIC, 5),
        least(COALESCE((snapshot->>'max_player_price')::NUMERIC, 25), price_before * (1 + variation_rate))
      ), 2) AS price_after
    FROM variations
  )
  UPDATE public.fantasy_player_price_history history SET
    round_points = final_values.base_points,
    variation_rate = final_values.variation_rate,
    price_after = final_values.price_after,
    price_change = final_values.price_after - final_values.price_before,
    market_band = final_values.market_band,
    round_rank = final_values.start_rank,
    round_percentile = final_values.percentile,
    metrics = COALESCE(history.metrics, '{}'::JSONB) || jsonb_build_object(
      'scoringVersion', 2,
      'marketBand', final_values.market_band,
      'roundRank', final_values.start_rank,
      'roundPercentile', final_values.percentile,
      'goalkeeperGames', final_values.goalkeeper_games,
      'goalsConceded', final_values.goals_conceded,
      'teamGoalsConceded', final_values.team_goals_conceded
    )
  FROM final_values
  WHERE history.fantasy_round_id = target.id AND history.player_id = final_values.player_id;

  UPDATE public.fantasy_player_prices price SET
    current_price = history.price_after,
    rounds_played = (SELECT count(*) FROM public.fantasy_player_price_history counted
      WHERE counted.fantasy_season_id = price.fantasy_season_id AND counted.player_id = price.player_id AND counted.games > 0),
    total_points = COALESCE((SELECT sum(counted.round_points) FROM public.fantasy_player_price_history counted
      WHERE counted.fantasy_season_id = price.fantasy_season_id AND counted.player_id = price.player_id), 0),
    updated_at = now()
  FROM public.fantasy_player_price_history history
  WHERE history.fantasy_round_id = target.id
    AND history.player_id = price.player_id
    AND price.fantasy_season_id = target.fantasy_season_id;

  UPDATE public.fantasy_lineup_players item SET
    price_after = COALESCE((SELECT history.price_after FROM public.fantasy_player_price_history history
      WHERE history.fantasy_round_id = target.id AND history.player_id = item.player_id), item.price_locked)
  FROM public.fantasy_lineups lineup
  WHERE lineup.id = item.lineup_id AND lineup.fantasy_round_id = target.id;

  UPDATE public.fantasy_lineups lineup SET
    budget_after = lineup.cash_remaining + COALESCE((SELECT sum(item.price_after)
      FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0)
  WHERE lineup.fantasy_round_id = target.id AND lineup.status = 'scored';

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
    SELECT lineup.user_id, sum(lineup.total_points) AS total_points,
      count(*)::INTEGER AS rounds_played, max(lineup.total_points) AS best_round
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
    WHERE fantasy_round.fantasy_season_id = target.fantasy_season_id AND lineup.status = 'scored'
    GROUP BY lineup.user_id
  ) totals ON totals.user_id = latest.user_id
  WHERE account.fantasy_season_id = target.fantasy_season_id AND account.user_id = latest.user_id;

  RETURN true;
END;
$$;

-- Preserva a ordem: processador/base V1 -> balanceamento V2 -> cartas.
DO $$
BEGIN
  IF to_regprocedure('public.process_fantasy_round_pre_balance_v2(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_round_pre_cards(UUID) RENAME TO process_fantasy_round_pre_balance_v2;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_round_pre_cards(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target public.fantasy_rounds%ROWTYPE;
BEGIN
  PERFORM public.process_fantasy_round_pre_balance_v2(p_round_id);
  SELECT * INTO target FROM public.fantasy_rounds WHERE round_id = p_round_id;
  IF FOUND AND target.scoring_version >= 2 THEN
    PERFORM public.apply_fantasy_balance_v2(p_round_id);
  END IF;
  RETURN true;
END;
$$;

-- Sandbox usa a mesma pontuacao-base. Nao ha valorizacao em amistoso de teste.
DO $$
BEGIN
  IF to_regprocedure('public.process_fantasy_test_round_pre_balance_v2(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_test_round(UUID) RENAME TO process_fantasy_test_round_pre_balance_v2;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_test_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target public.fantasy_test_sessions%ROWTYPE;
BEGIN
  PERFORM public.process_fantasy_test_round_pre_balance_v2(p_round_id);
  SELECT * INTO target FROM public.fantasy_test_sessions WHERE round_id = p_round_id;
  IF NOT FOUND OR target.scoring_version < 2 THEN RETURN true; END IF;

  WITH calculated AS (
    SELECT item.id, item.player_id, lineup.captain_player_id,
      public.calculate_fantasy_base_points(
        target.settings_snapshot, stat.goals, stat.assists, stat.wins, stat.losses,
        stat.goalkeeper_games, stat.team_goals_conceded
      ) AS base_points
    FROM public.fantasy_test_lineup_players item
    JOIN public.fantasy_test_lineups lineup ON lineup.id = item.lineup_id
    LEFT JOIN public.player_round_stats stat
      ON stat.round_id = p_round_id AND stat.player_id = item.player_id
    WHERE lineup.test_session_id = target.id AND lineup.status = 'scored'
  )
  UPDATE public.fantasy_test_lineup_players item SET
    base_points = calculated.base_points,
    captain_bonus = CASE WHEN calculated.player_id = calculated.captain_player_id
      THEN calculated.base_points * (COALESCE((target.settings_snapshot->>'captain_multiplier')::NUMERIC, 2) - 1)
      ELSE 0 END,
    total_points = calculated.base_points * CASE WHEN calculated.player_id = calculated.captain_player_id
      THEN COALESCE((target.settings_snapshot->>'captain_multiplier')::NUMERIC, 2) ELSE 1 END
  FROM calculated WHERE item.id = calculated.id;

  UPDATE public.fantasy_test_lineups lineup SET
    player_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
    total_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0)
      + lineup.prediction_points,
    score_breakdown = COALESCE(lineup.score_breakdown, '{}'::JSONB) || jsonb_build_object(
      'playersBase', COALESCE((SELECT sum(item.base_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      'scoringVersion', 2
    )
  WHERE lineup.test_session_id = target.id AND lineup.status = 'scored';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_fantasy_base_points(JSONB, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_fantasy_base_points(JSONB, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_fantasy_balance_v2(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fantasy_round_pre_balance_v2(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fantasy_round_pre_cards(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fantasy_test_round_pre_balance_v2(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(UUID), public.process_fantasy_test_round(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
