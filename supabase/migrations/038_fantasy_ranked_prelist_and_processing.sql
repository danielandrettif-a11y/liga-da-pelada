-- Cartola: escalação apenas durante pré-lista Ranked e processamento idempotente.
-- A migration 037 continua preservada para compatibilidade, mas o elenco permanente
-- deixa de criar escalações automaticamente entre rodadas.

DROP TRIGGER IF EXISTS fantasy_rounds_seed_portfolios ON public.fantasy_rounds;

CREATE OR REPLACE FUNCTION public.save_fantasy_prelist_lineup(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID DEFAULT NULL,
  p_top_scorer_player_id UUID DEFAULT NULL,
  p_top_assist_player_id UUID DEFAULT NULL,
  p_top_team_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_round public.rounds%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para escalar.';
  END IF;

  SELECT * INTO target_round
  FROM public.rounds round_item
  WHERE round_item.id = p_round_id
  FOR UPDATE;

  IF NOT FOUND
    OR target_round.round_type <> 'official'
    OR target_round.status <> 'draft'
    OR target_round.preparation_stage <> 'prelist'
  THEN
    RAISE EXCEPTION 'A escalação só pode ser alterada enquanto existir uma pré-lista Ranked aberta.';
  END IF;

  RETURN public.save_fantasy_lineup(
    p_round_id,
    p_player_ids,
    p_captain_player_id,
    p_top_scorer_player_id,
    p_top_assist_player_id,
    p_top_team_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_prelist_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_prelist_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) FROM authenticated;

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_fantasy_round public.fantasy_rounds%ROWTYPE;
  target_fantasy_season public.fantasy_seasons%ROWTYPE;
  target_round public.rounds%ROWTYPE;
  settings_snapshot JSONB;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem processar o Cartola.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));

  SELECT * INTO target_round
  FROM public.rounds round_item
  WHERE round_item.id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rodada não encontrada.';
  END IF;

  SELECT * INTO target_fantasy_round
  FROM public.fantasy_rounds fantasy_round_item
  WHERE fantasy_round_item.round_id = p_round_id
  FOR UPDATE;

  -- Amistosos sem sessão de teste e rodadas antigas sem Cartola não impedem o encerramento.
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF target_round.status <> 'finished' THEN
    RAISE EXCEPTION 'Finalize a rodada antes de processar o Cartola.';
  END IF;

  IF target_fantasy_round.processed_at IS NOT NULL THEN
    RETURN true;
  END IF;

  IF target_fantasy_round.market_status = 'open' THEN
    PERFORM public.lock_fantasy_market(p_round_id);
    SELECT * INTO target_fantasy_round
    FROM public.fantasy_rounds fantasy_round_item
    WHERE fantasy_round_item.round_id = p_round_id
    FOR UPDATE;
  END IF;

  SELECT * INTO target_fantasy_season
  FROM public.fantasy_seasons fantasy_season_item
  WHERE fantasy_season_item.id = target_fantasy_round.fantasy_season_id;

  settings_snapshot := target_fantasy_round.settings_snapshot;

  -- Pontuação individual e bônus de capitão.
  WITH calculated_points AS (
    SELECT
      lineup_player.id AS lineup_player_id,
      lineup.captain_player_id,
      COALESCE(round_stat.goals, 0) * (settings_snapshot->>'goal_points')::NUMERIC
        + COALESCE(round_stat.assists, 0) * (settings_snapshot->>'assist_points')::NUMERIC
        + COALESCE(round_stat.wins, 0) * (settings_snapshot->>'win_points')::NUMERIC AS base_points
    FROM public.fantasy_lineup_players lineup_player
    JOIN public.fantasy_lineups lineup ON lineup.id = lineup_player.lineup_id
    LEFT JOIN public.player_round_stats round_stat
      ON round_stat.round_id = p_round_id
      AND round_stat.player_id = lineup_player.player_id
    WHERE lineup.fantasy_round_id = target_fantasy_round.id
      AND lineup.status = 'locked'
  )
  UPDATE public.fantasy_lineup_players lineup_player
  SET
    base_points = calculated.base_points,
    captain_bonus = CASE
      WHEN lineup_player.player_id = calculated.captain_player_id
        THEN calculated.base_points * ((settings_snapshot->>'captain_multiplier')::NUMERIC - 1)
      ELSE 0
    END,
    total_points = calculated.base_points * CASE
      WHEN lineup_player.player_id = calculated.captain_player_id
        THEN (settings_snapshot->>'captain_multiplier')::NUMERIC
      ELSE 1
    END
  FROM calculated_points calculated
  WHERE lineup_player.id = calculated.lineup_player_id;

  -- Palpites e total da escalação.
  WITH team_wins AS (
    SELECT winner.team_id, count(*)::INTEGER AS wins
    FROM (
      SELECT CASE
        WHEN match_item.score_a > match_item.score_b THEN match_item.team_a_id
        WHEN match_item.score_b > match_item.score_a THEN match_item.team_b_id
      END AS team_id
      FROM public.matches match_item
      WHERE match_item.round_id = p_round_id
        AND match_item.status = 'finished'
    ) winner
    WHERE winner.team_id IS NOT NULL
    GROUP BY winner.team_id
  )
  UPDATE public.fantasy_lineups lineup
  SET
    player_points = COALESCE((
      SELECT sum(lineup_player.total_points)
      FROM public.fantasy_lineup_players lineup_player
      WHERE lineup_player.lineup_id = lineup.id
    ), 0),
    prediction_points =
      CASE WHEN EXISTS (
        SELECT 1
        FROM public.player_round_stats round_stat
        WHERE round_stat.round_id = p_round_id
          AND round_stat.player_id = lineup.top_scorer_player_id
          AND round_stat.goals > 0
          AND round_stat.goals = (
            SELECT max(candidate.goals)
            FROM public.player_round_stats candidate
            WHERE candidate.round_id = p_round_id
          )
      ) THEN (settings_snapshot->>'top_scorer_prediction_points')::NUMERIC ELSE 0 END
      + CASE WHEN EXISTS (
        SELECT 1
        FROM public.player_round_stats round_stat
        WHERE round_stat.round_id = p_round_id
          AND round_stat.player_id = lineup.top_assist_player_id
          AND round_stat.assists > 0
          AND round_stat.assists = (
            SELECT max(candidate.assists)
            FROM public.player_round_stats candidate
            WHERE candidate.round_id = p_round_id
          )
      ) THEN (settings_snapshot->>'top_assist_prediction_points')::NUMERIC ELSE 0 END
      + CASE WHEN EXISTS (
        SELECT 1
        FROM team_wins selected_team
        WHERE selected_team.team_id = lineup.top_team_id
          AND selected_team.wins > 0
          AND selected_team.wins = (SELECT max(candidate.wins) FROM team_wins candidate)
      ) THEN (settings_snapshot->>'top_team_prediction_points')::NUMERIC ELSE 0 END
  WHERE lineup.fantasy_round_id = target_fantasy_round.id
    AND lineup.status = 'locked';

  UPDATE public.fantasy_lineups lineup
  SET total_points = lineup.player_points + lineup.prediction_points
  WHERE lineup.fantasy_round_id = target_fantasy_round.id
    AND lineup.status = 'locked';

  -- Valorização relativa apenas para quem efetivamente entrou em campo.
  WITH performance AS (
    SELECT
      price.player_id,
      price.current_price,
      COALESCE(round_stat.games, 0)::INTEGER AS games,
      COALESCE(round_stat.wins, 0)::INTEGER AS wins,
      COALESCE(round_stat.draws, 0)::INTEGER AS draws,
      COALESCE(round_stat.goals, 0)::INTEGER AS goals,
      COALESCE(round_stat.assists, 0)::INTEGER AS assists,
      COALESCE(round_stat.goals, 0) * (settings_snapshot->>'goal_points')::NUMERIC
        + COALESCE(round_stat.assists, 0) * (settings_snapshot->>'assist_points')::NUMERIC
        + COALESCE(round_stat.wins, 0) * (settings_snapshot->>'win_points')::NUMERIC AS round_points,
      COALESCE((
        SELECT avg(history.round_points)
        FROM public.fantasy_player_price_history history
        WHERE history.fantasy_season_id = target_fantasy_round.fantasy_season_id
          AND history.player_id = price.player_id
          AND history.games > 0
      ), 0) AS historical_average,
      COALESCE((
        SELECT -stddev_pop(recent.round_points)
        FROM (
          SELECT history.round_points
          FROM public.fantasy_player_price_history history
          WHERE history.fantasy_season_id = target_fantasy_round.fantasy_season_id
            AND history.player_id = price.player_id
            AND history.games > 0
          ORDER BY history.created_at DESC
          LIMIT 5
        ) recent
      ), 0) AS consistency
    FROM public.fantasy_player_prices price
    JOIN public.player_round_stats round_stat
      ON round_stat.round_id = p_round_id
      AND round_stat.player_id = price.player_id
    WHERE price.fantasy_season_id = target_fantasy_round.fantasy_season_id
      AND round_stat.games > 0
  ), ranked_signals AS (
    SELECT
      performance.*,
      percent_rank() OVER (ORDER BY performance.round_points) AS recent_signal,
      percent_rank() OVER (ORDER BY performance.wins::NUMERIC / NULLIF(performance.games, 0)) AS win_signal,
      percent_rank() OVER (ORDER BY performance.historical_average) AS historical_signal,
      percent_rank() OVER (ORDER BY performance.consistency) AS consistency_signal
    FROM performance
  ), weighted_scores AS (
    SELECT
      ranked_signals.*,
      ranked_signals.recent_signal * (settings_snapshot->>'recent_weight')::NUMERIC
        + ranked_signals.win_signal * (settings_snapshot->>'win_rate_weight')::NUMERIC
        + ranked_signals.historical_signal * (settings_snapshot->>'historical_weight')::NUMERIC
        + ranked_signals.consistency_signal * (settings_snapshot->>'consistency_weight')::NUMERIC AS performance_score
    FROM ranked_signals
  ), raw_variations AS (
    SELECT
      weighted_scores.*,
      CASE
        WHEN weighted_scores.performance_score >= .5
          THEN ((weighted_scores.performance_score - .5) / .5) * (settings_snapshot->>'max_price_increase')::NUMERIC
        ELSE -((.5 - weighted_scores.performance_score) / .5) * (settings_snapshot->>'max_price_decrease')::NUMERIC
      END AS raw_variation
    FROM weighted_scores
  ), normalized_variations AS (
    SELECT
      raw_variations.*,
      greatest(
        -(settings_snapshot->>'max_price_decrease')::NUMERIC,
        least(
          (settings_snapshot->>'max_price_increase')::NUMERIC,
          raw_variations.raw_variation - avg(raw_variations.raw_variation) OVER ()
        )
      ) AS variation_rate
    FROM raw_variations
  )
  INSERT INTO public.fantasy_player_price_history (
    fantasy_season_id, fantasy_round_id, player_id, price_before, price_after,
    variation_rate, round_points, games, wins, draws, goals, assists, metrics
  )
  SELECT
    target_fantasy_round.fantasy_season_id,
    target_fantasy_round.id,
    normalized.player_id,
    normalized.current_price,
    round(greatest(
      (settings_snapshot->>'min_player_price')::NUMERIC,
      least(
        (settings_snapshot->>'max_player_price')::NUMERIC,
        normalized.current_price * (1 + normalized.variation_rate)
      )
    ), 2),
    normalized.variation_rate,
    normalized.round_points,
    normalized.games,
    normalized.wins,
    normalized.draws,
    normalized.goals,
    normalized.assists,
    jsonb_build_object('score', normalized.performance_score)
  FROM normalized_variations normalized
  ON CONFLICT (fantasy_round_id, player_id) DO NOTHING;

  UPDATE public.fantasy_player_prices price
  SET
    current_price = history.price_after,
    rounds_played = (
      SELECT count(*)
      FROM public.fantasy_player_price_history counted
      WHERE counted.fantasy_season_id = price.fantasy_season_id
        AND counted.player_id = price.player_id
        AND counted.games > 0
    ),
    total_points = COALESCE((
      SELECT sum(counted.round_points)
      FROM public.fantasy_player_price_history counted
      WHERE counted.fantasy_season_id = price.fantasy_season_id
        AND counted.player_id = price.player_id
    ), 0),
    updated_at = now()
  FROM public.fantasy_player_price_history history
  WHERE history.fantasy_round_id = target_fantasy_round.id
    AND history.player_id = price.player_id
    AND price.fantasy_season_id = target_fantasy_round.fantasy_season_id;

  UPDATE public.fantasy_lineup_players lineup_player
  SET price_after = COALESCE((
    SELECT history.price_after
    FROM public.fantasy_player_price_history history
    WHERE history.fantasy_round_id = target_fantasy_round.id
      AND history.player_id = lineup_player.player_id
  ), lineup_player.price_locked)
  WHERE EXISTS (
    SELECT 1
    FROM public.fantasy_lineups lineup
    WHERE lineup.id = lineup_player.lineup_id
      AND lineup.fantasy_round_id = target_fantasy_round.id
  );

  UPDATE public.fantasy_lineups lineup
  SET
    budget_after = lineup.cash_remaining + COALESCE((
      SELECT sum(lineup_player.price_after)
      FROM public.fantasy_lineup_players lineup_player
      WHERE lineup_player.lineup_id = lineup.id
    ), 0),
    status = 'scored'
  WHERE lineup.fantasy_round_id = target_fantasy_round.id
    AND lineup.status = 'locked';

  UPDATE public.fantasy_lineups lineup
  SET budget_after = lineup.budget_before
  WHERE lineup.fantasy_round_id = target_fantasy_round.id
    AND lineup.status = 'missed';

  WITH round_ranking AS (
    SELECT
      lineup.id,
      rank() OVER (ORDER BY lineup.total_points DESC, lineup.updated_at) AS position
    FROM public.fantasy_lineups lineup
    WHERE lineup.fantasy_round_id = target_fantasy_round.id
      AND lineup.status = 'scored'
  )
  UPDATE public.fantasy_lineups lineup
  SET round_position = ranking.position
  FROM round_ranking ranking
  WHERE lineup.id = ranking.id;

  WITH account_totals AS (
    SELECT
      lineup.user_id,
      sum(lineup.total_points) AS total_points,
      count(*)::INTEGER AS rounds_played,
      max(lineup.total_points) AS best_round_points
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round_item ON fantasy_round_item.id = lineup.fantasy_round_id
    WHERE fantasy_round_item.fantasy_season_id = target_fantasy_round.fantasy_season_id
      AND lineup.status = 'scored'
    GROUP BY lineup.user_id
  )
  UPDATE public.fantasy_accounts account
  SET
    total_points = totals.total_points,
    rounds_played = totals.rounds_played,
    best_round_points = totals.best_round_points,
    updated_at = now()
  FROM account_totals totals
  WHERE account.fantasy_season_id = target_fantasy_round.fantasy_season_id
    AND account.user_id = totals.user_id;

  UPDATE public.fantasy_accounts account
  SET current_budget = COALESCE((
    SELECT lineup.budget_after
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round_item ON fantasy_round_item.id = lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id = fantasy_round_item.round_id
    WHERE fantasy_round_item.fantasy_season_id = target_fantasy_round.fantasy_season_id
      AND lineup.user_id = account.user_id
      AND lineup.status = 'scored'
      AND lineup.budget_after IS NOT NULL
    ORDER BY round_item.date DESC, round_item.number DESC
    LIMIT 1
  ), account.current_budget),
  updated_at = now()
  WHERE account.fantasy_season_id = target_fantasy_round.fantasy_season_id;

  UPDATE public.fantasy_rounds fantasy_round_item
  SET market_status = 'finished', processed_at = now()
  WHERE fantasy_round_item.id = target_fantasy_round.id;

  INSERT INTO public.fantasy_audit_log (
    league_id, fantasy_round_id, user_id, action
  ) VALUES (
    target_fantasy_season.league_id,
    target_fantasy_round.id,
    auth.uid(),
    'round_processed'
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.process_fantasy_round(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(UUID) TO authenticated;

