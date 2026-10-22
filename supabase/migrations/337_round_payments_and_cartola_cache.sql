-- Consolida leituras de pagamentos, torna a gravacao financeira atomica e
-- expoe uma fonte de cache do mercado apenas para o service_role do servidor.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_round_payment_read_model(p_round_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH target AS (
    SELECT round_item.*
    FROM public.rounds round_item
    WHERE round_item.id = p_round_id
      AND public.is_league_member(round_item.league_id)
  )
  SELECT CASE WHEN EXISTS (SELECT 1 FROM target) THEN jsonb_build_object(
    'round', (SELECT to_jsonb(target) FROM target),
    'players', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'player', to_jsonb(player),
          'paid', coalesce(payment.paid, false),
          'paid_at', payment.paid_at
        ) ORDER BY player.name
      )
      FROM public.round_players participant
      JOIN target ON target.id = participant.round_id
      JOIN public.players player ON player.id = participant.player_id
      LEFT JOIN public.round_payments payment
        ON payment.round_id = participant.round_id
        AND payment.player_id = participant.player_id
    ), '[]'::jsonb),
    'charge_lines', coalesce((
      SELECT jsonb_agg(to_jsonb(line) ORDER BY line.id)
      FROM public.round_payment_charge_lines line
      JOIN target ON target.id = line.round_id
    ), '[]'::jsonb),
    'obligations', coalesce((
      SELECT jsonb_agg(to_jsonb(obligation) ORDER BY obligation.recipient_name, obligation.player_id)
      FROM public.round_payment_obligations obligation
      JOIN target ON target.id = obligation.round_id
    ), '[]'::jsonb),
    'expense_installments', coalesce((
      SELECT jsonb_agg(to_jsonb(installment) ORDER BY installment.installment_number)
      FROM public.round_expense_installments installment
      JOIN target ON target.id = installment.round_id
      WHERE installment.status = 'active'
    ), '[]'::jsonb)
  ) ELSE NULL END;
$$;

REVOKE ALL ON FUNCTION public.get_round_payment_read_model(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_round_payment_read_model(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_round_financials(
  p_round_id uuid,
  p_league_id uuid,
  p_payment_pix text,
  p_payment_total numeric,
  p_recipient_id uuid DEFAULT NULL,
  p_recipient_name text DEFAULT NULL,
  p_expense_item_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_round public.rounds%ROWTYPE;
  original_state jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF nullif(btrim(p_payment_pix), '') IS NULL OR p_payment_total <= 0 THEN
    RAISE EXCEPTION 'Dados de pagamento invalidos.';
  END IF;

  SELECT * INTO current_round
  FROM public.rounds
  WHERE id = p_round_id AND league_id = p_league_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada fora da pelada selecionada.'; END IF;

  original_state := jsonb_build_object(
    'status', current_round.status,
    'payment_pix', current_round.payment_pix,
    'payment_total', current_round.payment_total,
    'payment_recipient_id', current_round.payment_recipient_id,
    'payment_recipient_name', current_round.payment_recipient_name,
    'expense_item_ids', coalesce((
      SELECT jsonb_agg(DISTINCT installment.expense_item_id)
      FROM public.round_expense_installments installment
      WHERE installment.round_id = p_round_id AND installment.status = 'active'
    ), '[]'::jsonb)
  );

  UPDATE public.rounds
  SET status = 'finished',
      payment_pix = left(btrim(p_payment_pix), 200),
      payment_total = round(p_payment_total, 2),
      payment_recipient_id = p_recipient_id,
      payment_recipient_name = nullif(btrim(p_recipient_name), '')
  WHERE id = p_round_id;

  PERFORM public.sync_round_payment_plan(
    p_round_id,
    coalesce((
      SELECT array_agg(DISTINCT selected.item_id)
      FROM unnest(coalesce(p_expense_item_ids, ARRAY[]::uuid[])) AS selected(item_id)
    ), ARRAY[]::uuid[])
  );

  RETURN original_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_round_financials(
  p_round_id uuid,
  p_league_id uuid,
  p_original_state jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  UPDATE public.rounds
  SET status = coalesce(p_original_state ->> 'status', status),
      payment_pix = p_original_state ->> 'payment_pix',
      payment_total = nullif(p_original_state ->> 'payment_total', '')::numeric,
      payment_recipient_id = nullif(p_original_state ->> 'payment_recipient_id', '')::uuid,
      payment_recipient_name = p_original_state ->> 'payment_recipient_name'
  WHERE id = p_round_id AND league_id = p_league_id;
  IF FOUND THEN
    PERFORM public.sync_round_payment_plan(
      p_round_id,
      coalesce(ARRAY(
        SELECT item.value::uuid
        FROM jsonb_array_elements_text(
          coalesce(p_original_state -> 'expense_item_ids', '[]'::jsonb)
        ) AS item(value)
      ), ARRAY[]::uuid[])
    );
  END IF;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_round_financials(uuid, uuid, text, numeric, uuid, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_round_financials(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_round_financials(uuid, uuid, text, numeric, uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_round_financials(uuid, uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_fantasy_market_cache_source(p_fantasy_season_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT fs.id, fs.season_id, fs.league_id
    FROM public.fantasy_seasons fs
    WHERE fs.id = p_fantasy_season_id
  )
  SELECT jsonb_build_object(
    'prices', coalesce((
      SELECT jsonb_agg(to_jsonb(price))
      FROM public.fantasy_player_prices price
      JOIN target ON target.id = price.fantasy_season_id
    ), '[]'::jsonb),
    'stats', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'round_id', stats.round_id, 'player_id', stats.player_id,
        'goals', stats.goals, 'assists', stats.assists,
        'wins', stats.wins, 'draws', stats.draws, 'losses', stats.losses,
        'own_goals', stats.own_goals, 'games', stats.games,
        'goalkeeper_games', stats.goalkeeper_games,
        'goalkeeper_goals', stats.goalkeeper_goals,
        'goalkeeper_assists', stats.goalkeeper_assists,
        'goalkeeper_own_goals', stats.goalkeeper_own_goals,
        'goalkeeper_wins', stats.goalkeeper_wins,
        'goalkeeper_draws', stats.goalkeeper_draws,
        'goalkeeper_losses', stats.goalkeeper_losses,
        'goals_conceded', stats.goals_conceded,
        'clean_sheets', stats.clean_sheets,
        'defensive_clean_games', stats.defensive_clean_games,
        'defensive_one_goal_games', stats.defensive_one_goal_games,
        'team_goals_conceded', stats.team_goals_conceded,
        'ranking_points', stats.ranking_points
      ))
      FROM public.player_round_stats stats
      JOIN public.rounds round_item ON round_item.id = stats.round_id AND round_item.round_type = 'official'
      JOIN target ON target.season_id = round_item.season_id AND target.league_id = round_item.league_id
    ), '[]'::jsonb),
    'players', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', player.id, 'name', player.name,
        'avatar_url', player.avatar_url,
        'player_profile', member.player_profile,
        'overall_traits', member.overall_traits,
        'is_goalkeeper', player.is_goalkeeper,
        'member_category', player.member_category,
        'is_selectable', player.is_selectable,
        'is_competitive_profile_complete', true
      ) ORDER BY player.name)
      FROM target
      JOIN public.league_members member ON member.league_id = target.league_id AND member.is_active
      JOIN public.players player ON player.id = member.player_id
      WHERE player.member_category = 'player' AND player.is_selectable
        AND nullif(btrim(player.name), '') IS NOT NULL
        AND nullif(btrim(player.avatar_url), '') IS NOT NULL
        AND member.player_profile IN ('defensive', 'offensive')
        AND coalesce(cardinality(member.overall_traits), 0) BETWEEN 1 AND 2
    ), '[]'::jsonb),
    'history', coalesce((
      SELECT jsonb_agg(to_jsonb(history) ORDER BY history.created_at DESC)
      FROM public.fantasy_player_price_history history
      JOIN target ON target.id = history.fantasy_season_id
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_fantasy_market_cache_source(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fantasy_market_cache_source(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_fantasy_market_cache_version(p_fantasy_season_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH target AS (
    SELECT fantasy.id, fantasy.season_id, fantasy.league_id
    FROM public.fantasy_seasons fantasy
    WHERE fantasy.id = p_fantasy_season_id
      AND public.is_league_member(fantasy.league_id)
  ),
  price_version AS (
    SELECT max(price.updated_at)::text AS updated_at, count(*)::text AS row_count
    FROM public.fantasy_player_prices price
    JOIN target ON target.id = price.fantasy_season_id
  ),
  history_version AS (
    SELECT max(history.created_at)::text AS created_at, count(*)::text AS row_count
    FROM public.fantasy_player_price_history history
    JOIN target ON target.id = history.fantasy_season_id
  ),
  stats_version AS (
    SELECT
      count(*)::text AS row_count,
      coalesce(sum(stats.goals + stats.assists + stats.games + stats.wins + stats.draws + stats.losses + stats.goals_conceded), 0)::text AS checksum,
      coalesce(sum(stats.ranking_points), 0)::text AS ranking_checksum
    FROM public.player_round_stats stats
    JOIN public.rounds round_item ON round_item.id = stats.round_id
    JOIN target ON target.season_id = round_item.season_id AND target.league_id = round_item.league_id
    WHERE round_item.round_type = 'official'
  )
  SELECT md5(concat_ws('|',
    price_version.updated_at, price_version.row_count,
    history_version.created_at, history_version.row_count,
    stats_version.row_count, stats_version.checksum, stats_version.ranking_checksum
  ))
  FROM price_version, history_version, stats_version;
$$;

REVOKE ALL ON FUNCTION public.get_fantasy_market_cache_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fantasy_market_cache_version(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
