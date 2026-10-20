-- Banco de reserva com caução integral e encerramento coerente da convocação.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup_with_reserve_pre_activity_251(
  p_round_id uuid,
  p_player_ids uuid[],
  p_captain_player_id uuid,
  p_top_scorer_player_id uuid,
  p_top_assist_player_id uuid,
  p_challenge_player_id uuid,
  p_lineup_slots jsonb,
  p_reserve_player_id uuid DEFAULT NULL,
  p_reserve_slot_role text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_lineup_id uuid;
  target_fantasy_season_id uuid;
  target_league_id uuid;
  reserve_profile text;
  reserve_name text;
  reserve_avatar text;
  reserve_market_price numeric(10,2);
  reserve_price_limit numeric(10,2);
  reserve_cost numeric(10,2);
  cheapest_starter_price numeric(10,2);
  available_cash numeric(10,2);
BEGIN
  IF (p_reserve_player_id IS NULL) <> (p_reserve_slot_role IS NULL) THEN
    RAISE EXCEPTION 'Escolha o jogador e a posição do banco de reserva.';
  END IF;
  IF p_reserve_slot_role IS NOT NULL AND p_reserve_slot_role NOT IN ('GOL', 'DEF', 'ATA') THEN
    RAISE EXCEPTION 'O banco aceita somente GOL, DEF/VOL ou ATA/ALA.';
  END IF;
  IF p_reserve_player_id IS NOT NULL
    AND p_reserve_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::uuid[])) THEN
    RAISE EXCEPTION 'O jogador do banco não pode estar entre os titulares.';
  END IF;

  SELECT fantasy_round.fantasy_season_id, season.league_id
  INTO target_fantasy_season_id, target_league_id
  FROM public.fantasy_rounds fantasy_round
  JOIN public.fantasy_seasons season ON season.id = fantasy_round.fantasy_season_id
  WHERE fantasy_round.round_id = p_round_id;
  IF target_fantasy_season_id IS NULL THEN
    RAISE EXCEPTION 'Rodada do Cartola não encontrada.';
  END IF;

  IF to_regprocedure('public.assert_fantasy_selection_in_league(uuid,uuid[],uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.assert_fantasy_selection_in_league($1,$2,$3)'
      INTO target_league_id
      USING p_round_id, p_player_ids, p_reserve_player_id;
  END IF;

  saved_lineup_id := public.save_fantasy_lineup(
    p_round_id,
    p_player_ids,
    p_captain_player_id,
    p_top_scorer_player_id,
    p_top_assist_player_id,
    p_challenge_player_id,
    p_lineup_slots
  );

  DELETE FROM public.fantasy_lineup_reserves WHERE lineup_id = saved_lineup_id;
  IF p_reserve_player_id IS NULL THEN RETURN saved_lineup_id; END IF;

  SELECT member.player_profile, player.name, player.avatar_url
  INTO reserve_profile, reserve_name, reserve_avatar
  FROM public.league_members member
  JOIN public.players player ON player.id = member.player_id
  WHERE member.league_id = target_league_id
    AND member.player_id = p_reserve_player_id
    AND member.is_active
    AND player.member_category = 'player'
    AND player.is_selectable;
  IF reserve_name IS NULL THEN
    RAISE EXCEPTION 'O reserva precisa ser um jogador oficial ativo desta pelada.';
  END IF;
  IF p_reserve_slot_role = 'DEF' AND COALESCE(reserve_profile, '') <> 'defensive' THEN
    RAISE EXCEPTION 'Escolha um jogador DEF/VOL para este banco.';
  END IF;
  IF p_reserve_slot_role = 'ATA' AND COALESCE(reserve_profile, '') NOT IN ('offensive', 'midfield') THEN
    RAISE EXCEPTION 'Escolha um jogador ATA/ALA para este banco.';
  END IF;

  SELECT min(lineup_player.price_locked)
  INTO cheapest_starter_price
  FROM public.fantasy_lineup_players lineup_player
  WHERE lineup_player.lineup_id = saved_lineup_id
    AND lineup_player.slot_role = p_reserve_slot_role;
  IF cheapest_starter_price IS NULL THEN
    RAISE EXCEPTION 'Escolha um titular da mesma posição antes de adicionar o reserva.';
  END IF;
  reserve_price_limit := round(GREATEST(0, cheapest_starter_price - .10), 2);

  SELECT round(COALESCE(price.current_price, season.initial_player_price), 2)
  INTO reserve_market_price
  FROM public.fantasy_seasons season
  LEFT JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = season.id
   AND price.player_id = p_reserve_player_id
  WHERE season.id = target_fantasy_season_id;
  IF reserve_market_price IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar o preço atual do reserva.';
  END IF;
  IF reserve_market_price > reserve_price_limit THEN
    RAISE EXCEPTION 'Reserva caro demais: custa C$ %, mas o limite desta posição é C$ %.',
      reserve_market_price, reserve_price_limit;
  END IF;

  -- O preço cheio fica bloqueado durante a rodada e é restituído no fechamento.
  reserve_cost := reserve_market_price;
  SELECT cash_remaining INTO available_cash
  FROM public.fantasy_lineups WHERE id = saved_lineup_id FOR UPDATE;
  IF reserve_cost > COALESCE(available_cash, 0) THEN
    RAISE EXCEPTION 'Patrimônio insuficiente para reservar este jogador.';
  END IF;

  INSERT INTO public.fantasy_lineup_reserves(
    lineup_id, player_id, slot_role, price_locked, player_name_locked, avatar_url_locked
  ) VALUES (
    saved_lineup_id, p_reserve_player_id, p_reserve_slot_role,
    reserve_cost, reserve_name, reserve_avatar
  );

  UPDATE public.fantasy_lineups
  SET lineup_cost = round(budget_before - cash_remaining + reserve_cost, 2),
      cash_remaining = round(cash_remaining - reserve_cost, 2),
      updated_at = now()
  WHERE id = saved_lineup_id;
  RETURN saved_lineup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup_with_reserve_pre_activity_251(
  uuid,uuid[],uuid,uuid,uuid,uuid,jsonb,uuid,text
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_fantasy_reserve_budget(p_round_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target public.fantasy_rounds%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.fantasy_rounds WHERE round_id = p_round_id;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.fantasy_lineup_reserves reserve
  SET price_after = reserve.price_locked,
      updated_at = now()
  FROM public.fantasy_lineups lineup
  WHERE lineup.id = reserve.lineup_id
    AND lineup.fantasy_round_id = target.id;

  UPDATE public.fantasy_lineups lineup
  SET budget_after = round(
    lineup.cash_remaining
    + COALESCE((SELECT sum(item.price_after) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0)
    + COALESCE((SELECT reserve.price_locked FROM public.fantasy_lineup_reserves reserve WHERE reserve.lineup_id = lineup.id), 0)
    + COALESCE((lineup.score_breakdown->>'cardBudgetRecovery')::numeric, 0), 2
  )
  WHERE lineup.fantasy_round_id = target.id AND lineup.status = 'scored';

  WITH ranked AS (
    SELECT id, rank() OVER (ORDER BY total_points DESC, updated_at, id)::integer position
    FROM public.fantasy_lineups
    WHERE fantasy_round_id = target.id AND status = 'scored'
  )
  UPDATE public.fantasy_lineups lineup SET round_position = ranked.position
  FROM ranked WHERE lineup.id = ranked.id;

  UPDATE public.fantasy_accounts account
  SET current_budget = latest.budget_after,
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
      count(*)::integer rounds_played, max(lineup.total_points) best_round
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

REVOKE ALL ON FUNCTION public.reconcile_fantasy_reserve_budget(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_fantasy_reserve_budget(uuid) TO service_role;

-- Concede imediatamente a nova restituição para quem usou reserva na rodada
-- mais recente da temporada, sem reescrever a cadeia de rodadas anteriores.
WITH latest AS (
  SELECT DISTINCT ON (fantasy_round.fantasy_season_id, lineup.user_id)
    fantasy_round.fantasy_season_id,
    lineup.user_id,
    lineup.id AS lineup_id,
    reserve.id AS reserve_id,
    reserve.price_locked,
    COALESCE(reserve.price_after, 0) AS previous_refund
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  LEFT JOIN public.fantasy_lineup_reserves reserve ON reserve.lineup_id = lineup.id
  WHERE lineup.status = 'scored' AND lineup.budget_after IS NOT NULL
  ORDER BY fantasy_round.fantasy_season_id, lineup.user_id,
    round_item.date DESC, round_item.number DESC, round_item.created_at DESC
), refunded AS (
  UPDATE public.fantasy_lineups lineup
  SET budget_after = round(lineup.budget_after + latest.price_locked - latest.previous_refund, 2),
      updated_at = now()
  FROM latest
  WHERE latest.reserve_id IS NOT NULL AND lineup.id = latest.lineup_id
  RETURNING latest.fantasy_season_id, latest.user_id,
    latest.price_locked - latest.previous_refund AS refund_delta
)
UPDATE public.fantasy_accounts account
SET current_budget = round(account.current_budget + refunded.refund_delta, 2),
    updated_at = now()
FROM refunded
WHERE account.fantasy_season_id = refunded.fantasy_season_id
  AND account.user_id = refunded.user_id;

WITH latest_reserves AS (
  SELECT DISTINCT ON (fantasy_round.fantasy_season_id, lineup.user_id)
    reserve.id, reserve.price_locked
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  JOIN public.fantasy_lineup_reserves reserve ON reserve.lineup_id = lineup.id
  WHERE lineup.status = 'scored' AND lineup.budget_after IS NOT NULL
  ORDER BY fantasy_round.fantasy_season_id, lineup.user_id,
    round_item.date DESC, round_item.number DESC, round_item.created_at DESC
)
UPDATE public.fantasy_lineup_reserves reserve
SET price_after = latest_reserves.price_locked, updated_at = now()
FROM latest_reserves
WHERE reserve.id = latest_reserves.id;

-- A RPC legada tenta reabrir a convocação depois de excluir a rodada. Durante
-- essa transação, o gatilho mantém a lista encerrada e remove somente o vínculo.
CREATE OR REPLACE FUNCTION public.keep_callup_closed_when_round_is_deleted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.allow_fantasy_round_delete', true) = 'on'
    AND NEW.round_id IS NULL THEN
    NEW.status := 'closed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_callup_closed_when_round_is_deleted ON public.callups;
CREATE TRIGGER keep_callup_closed_when_round_is_deleted
BEFORE UPDATE OF status, round_id ON public.callups
FOR EACH ROW EXECUTE FUNCTION public.keep_callup_closed_when_round_is_deleted();

COMMENT ON FUNCTION public.reconcile_fantasy_reserve_budget(uuid)
IS 'Devolve integralmente no fechamento o valor pago pelo reserva.';

NOTIFY pgrst, 'reload schema';

COMMIT;
