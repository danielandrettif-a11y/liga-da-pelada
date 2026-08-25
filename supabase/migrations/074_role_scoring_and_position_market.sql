-- Pontuação por atuação real + bônus da vaga de escalação.
-- DEF recebe proteção por jogo; GOL só dá clean sheet ao cartoleiro que
-- escalou o atleta na vaga e o atleta realmente atuou no gol.

ALTER TABLE public.player_round_stats
  ADD COLUMN IF NOT EXISTS defensive_clean_games INTEGER NOT NULL DEFAULT 0 CHECK (defensive_clean_games >= 0),
  ADD COLUMN IF NOT EXISTS defensive_one_goal_games INTEGER NOT NULL DEFAULT 0 CHECK (defensive_one_goal_games >= 0);

-- Campos legados permanecem para snapshots antigos, mas deixam de afetar a
-- regra atual: derrota vale igual para todos e gol sofrido só conta no gol.
UPDATE public.fantasy_settings
SET goalkeeper_loss_points = loss_points, team_goal_conceded_points = 0;
UPDATE public.fantasy_rounds
SET settings_snapshot = settings_snapshot || jsonb_build_object('goalkeeper_loss_points', COALESCE((settings_snapshot->>'loss_points')::NUMERIC, -2), 'team_goal_conceded_points', 0)
WHERE market_status = 'open';
UPDATE public.fantasy_test_sessions
SET settings_snapshot = settings_snapshot || jsonb_build_object('goalkeeper_loss_points', COALESCE((settings_snapshot->>'loss_points')::NUMERIC, -2), 'team_goal_conceded_points', 0)
WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.calculate_fantasy_role_base_points(
  p_settings JSONB,
  p_goals INTEGER,
  p_assists INTEGER,
  p_wins INTEGER,
  p_losses INTEGER,
  p_goalkeeper_games INTEGER,
  p_goals_conceded INTEGER,
  p_own_goals INTEGER,
  p_player_profile TEXT,
  p_defensive_clean_games INTEGER,
  p_defensive_one_goal_games INTEGER
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(p_goals, 0) * COALESCE((p_settings->>'goal_points')::NUMERIC, 5)
    + COALESCE(p_assists, 0) * COALESCE((p_settings->>'assist_points')::NUMERIC, 3)
    + COALESCE(p_wins, 0) * COALESCE((p_settings->>'win_points')::NUMERIC, 4)
    + COALESCE(p_losses, 0) * COALESCE((p_settings->>'loss_points')::NUMERIC, -2)
    + COALESCE(p_goalkeeper_games, 0) * COALESCE((p_settings->>'goalkeeper_appearance_points')::NUMERIC, 3)
    + COALESCE(p_goals_conceded, 0) * COALESCE((p_settings->>'goal_conceded_points')::NUMERIC, -1)
    + CASE WHEN p_player_profile = 'defensive'
      THEN COALESCE(p_defensive_clean_games, 0) * 2 + COALESCE(p_defensive_one_goal_games, 0)
      ELSE 0 END
    + COALESCE(p_own_goals, 0) * COALESCE((p_settings->>'own_goal_points')::NUMERIC, -3);
$$;

CREATE OR REPLACE FUNCTION public.apply_fantasy_slot_position_bonus(
  p_round_id UUID,
  p_is_test BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_snapshot JSONB; target_container UUID;
BEGIN
  IF p_is_test THEN
    SELECT id, settings_snapshot INTO target_container, target_snapshot FROM public.fantasy_test_sessions WHERE round_id = p_round_id;
  ELSE
    SELECT id, settings_snapshot INTO target_container, target_snapshot FROM public.fantasy_rounds WHERE round_id = p_round_id;
  END IF;
  IF target_container IS NULL THEN RETURN true; END IF;

  IF p_is_test THEN
    WITH calculated AS (
      SELECT item.id, item.player_id, lineup.captain_player_id,
        public.calculate_fantasy_role_base_points(target_snapshot, stat.goals, stat.assists, stat.wins, stat.losses, stat.goalkeeper_games, stat.goals_conceded, stat.own_goals, item.player_profile_locked, stat.defensive_clean_games, stat.defensive_one_goal_games) AS base_points,
        CASE
          WHEN item.slot_role = 'GOL' AND COALESCE(stat.goalkeeper_games, 0) > 0 THEN COALESCE(stat.clean_sheets, 0) * 4
          WHEN item.is_position_correct AND item.slot_role = 'DEF' THEN COALESCE(stat.defensive_clean_games, 0) * 2 + COALESCE(stat.defensive_one_goal_games, 0)
          WHEN item.is_position_correct AND item.slot_role = 'MEI' THEN COALESCE(stat.assists, 0) * (4 - COALESCE((target_snapshot->>'assist_points')::NUMERIC, 3)) + CASE WHEN COALESCE(stat.assists, 0) >= 2 THEN 3 ELSE 0 END
          WHEN item.is_position_correct AND item.slot_role = 'ATA' THEN CASE WHEN COALESCE(stat.goals, 0) >= 2 THEN 3 ELSE 0 END
          ELSE 0 END AS position_bonus
      FROM public.fantasy_test_lineup_players item
      JOIN public.fantasy_test_lineups lineup ON lineup.id = item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.test_session_id = target_container AND lineup.status = 'scored'
    )
    UPDATE public.fantasy_test_lineup_players item SET
      base_points = calculated.base_points + calculated.position_bonus, position_bonus = calculated.position_bonus,
      captain_bonus = CASE WHEN calculated.player_id = calculated.captain_player_id THEN (calculated.base_points + calculated.position_bonus) * (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1) ELSE 0 END,
      total_points = (calculated.base_points + calculated.position_bonus) * CASE WHEN calculated.player_id = calculated.captain_player_id THEN COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) ELSE 1 END
    FROM calculated WHERE item.id = calculated.id;
    UPDATE public.fantasy_test_lineups lineup SET
      player_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      total_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0) + COALESCE(lineup.prediction_points, 0),
      score_breakdown = COALESCE(lineup.score_breakdown, '{}'::JSONB) || jsonb_build_object('playersBase', COALESCE((SELECT sum(item.base_points - item.position_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0), 'positionBonus', COALESCE((SELECT sum(item.position_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0), 'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0));
  ELSE
    WITH calculated AS (
      SELECT item.id, item.player_id, lineup.captain_player_id,
        public.calculate_fantasy_role_base_points(target_snapshot, stat.goals, stat.assists, stat.wins, stat.losses, stat.goalkeeper_games, stat.goals_conceded, stat.own_goals, item.player_profile_locked, stat.defensive_clean_games, stat.defensive_one_goal_games) AS base_points,
        CASE
          WHEN item.slot_role = 'GOL' AND COALESCE(stat.goalkeeper_games, 0) > 0 THEN COALESCE(stat.clean_sheets, 0) * 4
          WHEN item.is_position_correct AND item.slot_role = 'DEF' THEN COALESCE(stat.defensive_clean_games, 0) * 2 + COALESCE(stat.defensive_one_goal_games, 0)
          WHEN item.is_position_correct AND item.slot_role = 'MEI' THEN COALESCE(stat.assists, 0) * (4 - COALESCE((target_snapshot->>'assist_points')::NUMERIC, 3)) + CASE WHEN COALESCE(stat.assists, 0) >= 2 THEN 3 ELSE 0 END
          WHEN item.is_position_correct AND item.slot_role = 'ATA' THEN CASE WHEN COALESCE(stat.goals, 0) >= 2 THEN 3 ELSE 0 END
          ELSE 0 END AS position_bonus
      FROM public.fantasy_lineup_players item
      JOIN public.fantasy_lineups lineup ON lineup.id = item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.fantasy_round_id = target_container AND lineup.status = 'scored'
    )
    UPDATE public.fantasy_lineup_players item SET
      base_points = calculated.base_points + calculated.position_bonus, position_bonus = calculated.position_bonus,
      captain_bonus = CASE WHEN calculated.player_id = calculated.captain_player_id THEN (calculated.base_points + calculated.position_bonus) * (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1) ELSE 0 END,
      total_points = (calculated.base_points + calculated.position_bonus) * CASE WHEN calculated.player_id = calculated.captain_player_id THEN COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) ELSE 1 END
    FROM calculated WHERE item.id = calculated.id;
    UPDATE public.fantasy_lineups lineup SET
      player_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      total_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0) + COALESCE(lineup.prediction_points, 0) + COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0),
      score_breakdown = COALESCE(lineup.score_breakdown, '{}'::JSONB) || jsonb_build_object('playersBase', COALESCE((SELECT sum(item.base_points - item.position_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0), 'positionBonus', COALESCE((SELECT sum(item.position_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0), 'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0));
  END IF;
  RETURN true;
END;
$$;

-- Recalcula o mercado usando exclusivamente pontos-base: 65% por posição e
-- 35% pela rodada geral. Grupos com menos de 3 atletas usam o geral.
CREATE OR REPLACE FUNCTION public.apply_fantasy_role_market_v074(p_round_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.fantasy_rounds%ROWTYPE; snapshot JSONB;
BEGIN
  SELECT * INTO target FROM public.fantasy_rounds WHERE round_id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN true; END IF; snapshot := target.settings_snapshot;
  WITH performance AS (
    SELECT history.player_id, history.price_before, player.player_profile,
      public.calculate_fantasy_role_base_points(snapshot, stat.goals, stat.assists, stat.wins, stat.losses, stat.goalkeeper_games, stat.goals_conceded, stat.own_goals, player.player_profile, stat.defensive_clean_games, stat.defensive_one_goal_games) AS base_points
    FROM public.fantasy_player_price_history history JOIN public.player_round_stats stat ON stat.round_id = p_round_id AND stat.player_id = history.player_id JOIN public.players player ON player.id = history.player_id
    WHERE history.fantasy_round_id = target.id AND stat.games > 0
  ), overall_ranked AS (
    SELECT performance.*, rank() OVER (ORDER BY base_points DESC) AS overall_start_rank, count(*) OVER (PARTITION BY base_points) AS overall_tied_count, count(*) OVER () AS overall_count,
      rank() OVER (PARTITION BY player_profile ORDER BY base_points DESC) AS role_start_rank, count(*) OVER (PARTITION BY player_profile, base_points) AS role_tied_count, count(*) OVER (PARTITION BY player_profile) AS role_count
    FROM performance
  ), overall AS (
    SELECT overall_ranked.*,
      CASE WHEN overall_count <= 1 THEN .5::NUMERIC ELSE (((overall_start_rank - 1) + (overall_start_rank + overall_tied_count - 2))::NUMERIC / 2) / (overall_count - 1) END AS overall_percentile,
      CASE WHEN role_count <= 1 THEN .5::NUMERIC ELSE (((role_start_rank - 1) + (role_start_rank + role_tied_count - 2))::NUMERIC / 2) / (role_count - 1) END AS role_percentile
    FROM overall_ranked
  ), mixed AS (
    SELECT overall.*, CASE WHEN player_profile IN ('defensive', 'midfield', 'offensive') AND role_count >= 3 THEN .65 * role_percentile + .35 * overall_percentile ELSE overall_percentile END AS market_percentile FROM overall
  ), ranked AS (
    SELECT mixed.*, rank() OVER (ORDER BY market_percentile)::INTEGER AS start_rank, count(*) OVER (PARTITION BY market_percentile)::INTEGER AS tied_count, count(*) OVER ()::INTEGER AS participant_count, min(market_percentile) OVER () AS min_percentile, max(market_percentile) OVER () AS max_percentile FROM mixed
  ), classified AS (
    SELECT ranked.*, CASE WHEN min_percentile = max_percentile THEN 'STABLE' WHEN market_percentile < COALESCE((snapshot->>'market_up_share')::NUMERIC, .30) THEN 'UP' WHEN market_percentile < COALESCE((snapshot->>'market_up_share')::NUMERIC, .30) + COALESCE((snapshot->>'market_stable_share')::NUMERIC, .30) THEN 'STABLE' ELSE 'DOWN' END AS market_band FROM ranked
  ), ranges AS (
    SELECT classified.*, min(market_percentile) FILTER (WHERE market_band = 'UP') OVER () AS up_min, max(market_percentile) FILTER (WHERE market_band = 'UP') OVER () AS up_max, min(market_percentile) FILTER (WHERE market_band = 'DOWN') OVER () AS down_min, max(market_percentile) FILTER (WHERE market_band = 'DOWN') OVER () AS down_max FROM classified
  ), values_to_apply AS (
    SELECT ranges.*, CASE market_band WHEN 'UP' THEN CASE WHEN up_min = up_max THEN COALESCE((snapshot->>'max_price_increase')::NUMERIC, .12) ELSE COALESCE((snapshot->>'max_price_increase')::NUMERIC, .12) - ((market_percentile - up_min) / (up_max - up_min)) * (COALESCE((snapshot->>'max_price_increase')::NUMERIC, .12) - COALESCE((snapshot->>'market_min_increase')::NUMERIC, .03)) END WHEN 'DOWN' THEN CASE WHEN down_min = down_max THEN -COALESCE((snapshot->>'max_price_decrease')::NUMERIC, .10) ELSE -(COALESCE((snapshot->>'market_min_decrease')::NUMERIC, .02) + ((market_percentile - down_min) / (down_max - down_min)) * (COALESCE((snapshot->>'max_price_decrease')::NUMERIC, .10) - COALESCE((snapshot->>'market_min_decrease')::NUMERIC, .02))) END ELSE 0 END AS variation_rate FROM ranges
  )
  UPDATE public.fantasy_player_price_history history SET round_points = value.base_points, variation_rate = value.variation_rate, price_after = round(greatest(COALESCE((snapshot->>'min_player_price')::NUMERIC, 5), least(COALESCE((snapshot->>'max_player_price')::NUMERIC, 25), value.price_before * (1 + value.variation_rate))), 2), market_band = value.market_band, round_rank = value.start_rank, round_percentile = value.market_percentile, metrics = COALESCE(history.metrics, '{}'::JSONB) || jsonb_build_object('scoringVersion', 4, 'marketMethod', '65% posição / 35% geral') FROM values_to_apply value WHERE history.fantasy_round_id = target.id AND history.player_id = value.player_id;
  UPDATE public.fantasy_player_price_history SET price_change = price_after - price_before WHERE fantasy_round_id = target.id;
  UPDATE public.fantasy_player_prices price SET current_price = history.price_after, rounds_played = (SELECT count(*) FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = price.fantasy_season_id AND h.player_id = price.player_id AND h.games > 0), total_points = COALESCE((SELECT sum(h.round_points) FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = price.fantasy_season_id AND h.player_id = price.player_id), 0), updated_at = now() FROM public.fantasy_player_price_history history WHERE history.fantasy_round_id = target.id AND history.player_id = price.player_id AND price.fantasy_season_id = target.fantasy_season_id;
  UPDATE public.fantasy_lineup_players item SET price_after = COALESCE((SELECT history.price_after FROM public.fantasy_player_price_history history WHERE history.fantasy_round_id = target.id AND history.player_id = item.player_id), item.price_locked) FROM public.fantasy_lineups lineup WHERE lineup.id = item.lineup_id AND lineup.fantasy_round_id = target.id;
  UPDATE public.fantasy_lineups lineup SET budget_after = lineup.cash_remaining + COALESCE((SELECT sum(item.price_after) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0) WHERE lineup.fantasy_round_id = target.id AND lineup.status = 'scored';
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
    WHERE fantasy_round.fantasy_season_id = target.fantasy_season_id AND lineup.status = 'scored' AND lineup.budget_after IS NOT NULL
    ORDER BY lineup.user_id, round_item.date DESC, round_item.number DESC
  ) latest
  JOIN (
    SELECT lineup.user_id, sum(lineup.total_points) AS total_points, count(*)::INTEGER AS rounds_played, max(lineup.total_points) AS best_round
    FROM public.fantasy_lineups lineup JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
    WHERE fantasy_round.fantasy_season_id = target.fantasy_season_id AND lineup.status = 'scored'
    GROUP BY lineup.user_id
  ) totals ON totals.user_id = latest.user_id
  WHERE account.fantasy_season_id = target.fantasy_season_id AND account.user_id = latest.user_id;
  RETURN true;
END;
$$;

DO $$ BEGIN
  IF to_regprocedure('public.process_fantasy_round_pre_role_scoring_074(uuid)') IS NULL THEN ALTER FUNCTION public.process_fantasy_round(UUID) RENAME TO process_fantasy_round_pre_role_scoring_074; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.process_fantasy_round_pre_role_scoring_074(p_round_id);
  PERFORM public.apply_fantasy_slot_position_bonus(p_round_id, false);
  PERFORM public.apply_fantasy_role_market_v074(p_round_id);
  RETURN true;
END;
$$;

DO $$ BEGIN
  IF to_regprocedure('public.process_fantasy_test_round_pre_role_scoring_074(uuid)') IS NULL THEN ALTER FUNCTION public.process_fantasy_test_round(UUID) RENAME TO process_fantasy_test_round_pre_role_scoring_074; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.process_fantasy_test_round(p_round_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.process_fantasy_test_round_pre_role_scoring_074(p_round_id);
  PERFORM public.apply_fantasy_slot_position_bonus(p_round_id, true);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_fantasy_role_base_points(JSONB, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_fantasy_slot_position_bonus(UUID, BOOLEAN), public.apply_fantasy_role_market_v074(UUID), public.process_fantasy_round_pre_role_scoring_074(UUID), public.process_fantasy_test_round_pre_role_scoring_074(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(UUID), public.process_fantasy_test_round(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
