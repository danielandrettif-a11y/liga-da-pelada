-- Reconcilia todos os totais do Cartola com os scouts e o snapshot imutável
-- da rodada. Corrige fechamentos que ficaram antigos depois de uma alteração
-- nos eventos, resultados ou elegibilidade dos participantes.

BEGIN;

CREATE OR REPLACE FUNCTION public.audit_fantasy_scoring_integrity(
  p_round_id UUID DEFAULT NULL
) RETURNS TABLE (
  round_id UUID,
  user_id UUID,
  player_id UUID,
  stored_base NUMERIC,
  expected_base NUMERIC,
  stored_position_bonus NUMERIC,
  expected_position_bonus NUMERIC,
  stored_captain_bonus NUMERIC,
  expected_captain_bonus NUMERIC,
  stored_total NUMERIC,
  expected_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF auth.role() <> 'service_role' AND NOT public.is_app_admin() THEN
      RAISE EXCEPTION 'Somente administradores podem auditar o Cartola.';
    END IF;
  END IF;

  RETURN QUERY
  WITH source AS (
    SELECT
      round_item.id AS round_id,
      lineup.user_id,
      lineup.captain_player_id,
      item.player_id,
      item.slot_role,
      item.is_position_correct,
      item.base_points,
      item.position_bonus,
      item.captain_bonus,
      item.total_points,
      fantasy_round.settings_snapshot AS snapshot,
      COALESCE(
        fantasy_round.scoring_version,
        (fantasy_round.settings_snapshot->>'scoring_version')::INTEGER,
        (fantasy_round.settings_snapshot->>'version')::INTEGER,
        5
      ) AS scoring_version,
      stat.goals,
      stat.assists,
      stat.wins,
      stat.draws,
      stat.losses,
      stat.goalkeeper_games,
      stat.goalkeeper_goals,
      stat.goalkeeper_assists,
      stat.goalkeeper_own_goals,
      stat.goalkeeper_wins,
      stat.goalkeeper_draws,
      stat.goalkeeper_losses,
      stat.clean_sheets,
      stat.goals_conceded,
      stat.own_goals,
      stat.defensive_clean_games,
      stat.defensive_one_goal_games
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
    LEFT JOIN public.player_round_stats stat
      ON stat.round_id = round_item.id AND stat.player_id = item.player_id
    WHERE lineup.status = 'scored'
      AND round_item.status = 'finished'
      AND (p_round_id IS NULL OR round_item.id = p_round_id)
  ), calculated AS (
    SELECT source.*,
      CASE WHEN source.scoring_version >= 10 AND source.slot_role = 'GOL' THEN
        public.calculate_fantasy_goalkeeper_slot_base_v10(
          source.snapshot, source.goalkeeper_goals, source.goalkeeper_assists,
          source.goalkeeper_wins, source.goalkeeper_draws, source.goalkeeper_losses,
          source.goalkeeper_games, source.goals_conceded, source.goalkeeper_own_goals
        )
      ELSE public.calculate_fantasy_role_base_points_v5(
        source.snapshot, source.goals, source.assists, source.wins, source.draws,
        source.losses, source.goalkeeper_games, source.goals_conceded, source.own_goals
      ) END AS expected_base_value,
      CASE WHEN source.scoring_version >= 9 THEN
        public.calculate_fantasy_position_bonus_v9(
          source.snapshot, source.slot_role, source.is_position_correct,
          source.goals, source.assists, source.draws, source.goalkeeper_games,
          source.clean_sheets, source.defensive_clean_games, source.defensive_one_goal_games
        )
      WHEN source.scoring_version >= 7 THEN
        public.calculate_fantasy_position_bonus_v7(
          source.snapshot, source.slot_role, source.is_position_correct,
          source.goals, source.assists, source.goalkeeper_games,
          source.clean_sheets, source.defensive_clean_games, source.defensive_one_goal_games
        )
      ELSE public.calculate_fantasy_position_bonus_v5(
          source.snapshot, source.slot_role, source.is_position_correct,
          source.goals, source.assists, source.goalkeeper_games,
          source.clean_sheets, source.defensive_clean_games, source.defensive_one_goal_games
        ) END AS expected_position_value
    FROM source
  ), expected AS (
    SELECT calculated.*,
      CASE WHEN calculated.player_id = calculated.captain_player_id THEN round(
        (calculated.expected_base_value + calculated.expected_position_value)
          * (COALESCE((calculated.snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1), 2
      ) ELSE 0 END AS expected_captain_value,
      CASE WHEN calculated.player_id = calculated.captain_player_id THEN round(
        (calculated.expected_base_value + calculated.expected_position_value)
          * COALESCE((calculated.snapshot->>'captain_multiplier')::NUMERIC, 1.5), 2
      ) ELSE calculated.expected_base_value + calculated.expected_position_value END AS expected_total_value
    FROM calculated
  )
  SELECT
    expected.round_id,
    expected.user_id,
    expected.player_id,
    round(COALESCE(expected.base_points, 0) - COALESCE(expected.position_bonus, 0), 2),
    round(COALESCE(expected.expected_base_value, 0), 2),
    round(COALESCE(expected.position_bonus, 0), 2),
    round(COALESCE(expected.expected_position_value, 0), 2),
    round(COALESCE(expected.captain_bonus, 0), 2),
    round(COALESCE(expected.expected_captain_value, 0), 2),
    round(COALESCE(expected.total_points, 0), 2),
    round(COALESCE(expected.expected_total_value, 0), 2)
  FROM expected
  WHERE abs((COALESCE(expected.base_points, 0) - COALESCE(expected.position_bonus, 0)) - COALESCE(expected.expected_base_value, 0)) > .001
    OR abs(COALESCE(expected.position_bonus, 0) - COALESCE(expected.expected_position_value, 0)) > .001
    OR abs(COALESCE(expected.captain_bonus, 0) - COALESCE(expected.expected_captain_value, 0)) > .001
    OR abs(COALESCE(expected.total_points, 0) - COALESCE(expected.expected_total_value, 0)) > .001;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_fantasy_round_totals(
  p_round_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_fantasy_round public.fantasy_rounds%ROWTYPE;
  mismatches_before INTEGER := 0;
  mismatches_after INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF auth.role() <> 'service_role' AND NOT public.is_app_admin() THEN
      RAISE EXCEPTION 'Somente administradores podem reconciliar o Cartola.';
    END IF;
  END IF;

  SELECT * INTO target_fantasy_round
  FROM public.fantasy_rounds
  WHERE round_id = p_round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada do Cartola não encontrada.'; END IF;

  SELECT count(*) INTO mismatches_before
  FROM public.audit_fantasy_scoring_integrity(p_round_id);

  PERFORM public.apply_fantasy_slot_position_bonus(p_round_id, false);

  UPDATE public.fantasy_player_price_history history
  SET round_points = round(COALESCE(stats.points, 0), 2)
  FROM public.player_round_stats stats
  WHERE history.fantasy_round_id = target_fantasy_round.id
    AND stats.round_id = p_round_id
    AND stats.player_id = history.player_id;

  UPDATE public.fantasy_player_prices price
  SET
    total_points = COALESCE((
      SELECT sum(history.round_points)
      FROM public.fantasy_player_price_history history
      WHERE history.fantasy_season_id = target_fantasy_round.fantasy_season_id
        AND history.player_id = price.player_id
    ), 0),
    rounds_played = COALESCE((
      SELECT count(*)
      FROM public.fantasy_player_price_history history
      WHERE history.fantasy_season_id = target_fantasy_round.fantasy_season_id
        AND history.player_id = price.player_id
        AND history.games > 0
    ), 0)::INTEGER,
    updated_at = now()
  WHERE price.fantasy_season_id = target_fantasy_round.fantasy_season_id;

  WITH ranked AS (
    SELECT lineup.id,
      rank() OVER (ORDER BY lineup.total_points DESC, lineup.updated_at, lineup.id)::INTEGER AS position
    FROM public.fantasy_lineups lineup
    WHERE lineup.fantasy_round_id = target_fantasy_round.id
      AND lineup.status = 'scored'
  )
  UPDATE public.fantasy_lineups lineup
  SET round_position = ranked.position
  FROM ranked WHERE ranked.id = lineup.id;

  WITH totals AS (
    SELECT lineup.user_id,
      sum(lineup.total_points) AS total_points,
      count(*)::INTEGER AS rounds_played,
      max(lineup.total_points) AS best_round
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
    WHERE fantasy_round.fantasy_season_id = target_fantasy_round.fantasy_season_id
      AND lineup.status = 'scored'
    GROUP BY lineup.user_id
  )
  UPDATE public.fantasy_accounts account
  SET
    total_points = totals.total_points,
    rounds_played = totals.rounds_played,
    best_round_points = totals.best_round,
    updated_at = now()
  FROM totals
  WHERE account.fantasy_season_id = target_fantasy_round.fantasy_season_id
    AND account.user_id = totals.user_id;

  SELECT count(*) INTO mismatches_after
  FROM public.audit_fantasy_scoring_integrity(p_round_id);

  INSERT INTO public.fantasy_audit_log(
    league_id, fantasy_round_id, user_id, action, payload
  )
  SELECT season.league_id, target_fantasy_round.id, auth.uid(),
    'round_totals_reconciled',
    jsonb_build_object(
      'roundId', p_round_id,
      'mismatchesBefore', mismatches_before,
      'mismatchesAfter', mismatches_after
    )
  FROM public.fantasy_seasons season
  WHERE season.id = target_fantasy_round.fantasy_season_id;

  RETURN jsonb_build_object(
    'success', true,
    'roundId', p_round_id,
    'mismatchesBefore', mismatches_before,
    'mismatchesAfter', mismatches_after
  );
END;
$$;

REVOKE ALL ON FUNCTION public.audit_fantasy_scoring_integrity(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_fantasy_round_totals(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_fantasy_scoring_integrity(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_fantasy_round_totals(UUID) TO authenticated, service_role;

-- Corrige automaticamente todas as rodadas oficiais encerradas da temporada
-- ativa. A função é idempotente e só regrava os mesmos resultados esperados.
DO $$
DECLARE item RECORD;
BEGIN
  FOR item IN
    SELECT round_item.id
    FROM public.rounds round_item
    JOIN public.seasons season ON season.id = round_item.season_id
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = round_item.id
    WHERE season.status = 'active'
      AND round_item.round_type = 'official'
      AND round_item.status = 'finished'
    ORDER BY round_item.date, round_item.number
  LOOP
    PERFORM public.reconcile_fantasy_round_totals(item.id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
