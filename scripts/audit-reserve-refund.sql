\set ON_ERROR_STOP on

WITH target_rounds AS (
  SELECT
    fantasy_round.id AS fantasy_round_id,
    fantasy_round.fantasy_season_id,
    round_item.id AS round_id,
    round_item.number,
    round_item.date,
    round_item.status,
    fantasy_round.market_status
  FROM public.rounds round_item
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = round_item.id
  WHERE round_item.number = :'round_number'::integer
), starter_totals AS (
  SELECT
    lineup.id AS lineup_id,
    round(COALESCE(sum(starter.price_locked), 0), 2) AS starter_cost,
    round(COALESCE(sum(COALESCE(starter.price_after, starter.price_locked)), 0), 2) AS starter_value_after
  FROM public.fantasy_lineups lineup
  JOIN target_rounds target ON target.fantasy_round_id = lineup.fantasy_round_id
  LEFT JOIN public.fantasy_lineup_players starter ON starter.lineup_id = lineup.id
  WHERE lineup.status = 'scored'
  GROUP BY lineup.id
), calculated AS (
  SELECT
    target.fantasy_round_id,
    target.number,
    target.date,
    target.status AS round_status,
    target.market_status,
    lineup.id AS lineup_id,
    lineup.user_id,
    reserve.id AS reserve_id,
    reserve.applied,
    round(lineup.lineup_cost - starter_totals.starter_cost, 2) AS charged_for_reserve,
    lineup.budget_after AS current_budget_after,
    round(
      lineup.budget_before
      - starter_totals.starter_cost
      + starter_totals.starter_value_after
      + COALESCE((lineup.score_breakdown->>'cardBudgetRecovery')::numeric, 0)
      + CASE WHEN COALESCE(reserve.applied, false) THEN
          COALESCE(reserve_history.price_after, reserve.price_after, reserve.price_locked)
          - COALESCE(replaced.price_after, replaced.price_locked, 0)
          + GREATEST(
              0,
              COALESCE(replaced.price_locked, 0)
              - COALESCE(reserve_history.price_before, reserve.price_locked, 0)
            )
        ELSE 0 END,
      2
    ) AS expected_budget_after
  FROM public.fantasy_lineups lineup
  JOIN target_rounds target ON target.fantasy_round_id = lineup.fantasy_round_id
  JOIN starter_totals ON starter_totals.lineup_id = lineup.id
  JOIN public.fantasy_lineup_reserves reserve ON reserve.lineup_id = lineup.id
  LEFT JOIN public.fantasy_lineup_players replaced
    ON replaced.lineup_id = lineup.id
   AND replaced.player_id = reserve.replaced_player_id
  LEFT JOIN public.fantasy_player_price_history reserve_history
    ON reserve_history.fantasy_round_id = target.fantasy_round_id
   AND reserve_history.player_id = reserve.player_id
  WHERE lineup.status = 'scored'
), differences AS (
  SELECT calculated.*,
    round(expected_budget_after - current_budget_after, 2) AS difference
  FROM calculated
)
SELECT jsonb_pretty(jsonb_build_object(
  'roundNumber', :'round_number'::integer,
  'matchedFantasyRounds', (SELECT count(*) FROM target_rounds),
  'roundStates', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'date', date,
      'roundStatus', status,
      'marketStatus', market_status
    ) ORDER BY date)
    FROM target_rounds
  ), '[]'::jsonb),
  'lineupsWithReserve', count(*),
  'usersWhoLost', count(*) FILTER (WHERE difference > 0),
  'totalLost', COALESCE(sum(GREATEST(difference, 0)), 0),
  'largestLoss', COALESCE(max(GREATEST(difference, 0)), 0),
  'usersWhoBenefited', count(*) FILTER (WHERE difference < 0),
  'totalBenefit', COALESCE(sum(GREATEST(-difference, 0)), 0),
  'totalChargedAtLineup', COALESCE(sum(GREATEST(charged_for_reserve, 0)), 0),
  'substitutionsApplied', count(*) FILTER (WHERE applied)
)) AS reserve_refund_audit
FROM differences;
