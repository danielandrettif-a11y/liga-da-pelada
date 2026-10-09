-- Banco de reserva: o preço cheio do atleta deve ser pelo menos C$ 0,10
-- inferior ao titular mais barato da mesma posição. O custo pago continua 50%.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup_with_reserve(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID,
  p_top_scorer_player_id UUID,
  p_top_assist_player_id UUID,
  p_challenge_player_id UUID,
  p_lineup_slots JSONB,
  p_reserve_player_id UUID DEFAULT NULL,
  p_reserve_slot_role TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_lineup_id UUID;
  target_fantasy_season_id UUID;
  reserve_profile TEXT;
  reserve_name TEXT;
  reserve_avatar TEXT;
  reserve_market_price NUMERIC(10,2);
  reserve_price_limit NUMERIC(10,2);
  reserve_cost NUMERIC(10,2);
  cheapest_starter_price NUMERIC(10,2);
  available_cash NUMERIC(10,2);
BEGIN
  IF (p_reserve_player_id IS NULL) <> (p_reserve_slot_role IS NULL) THEN
    RAISE EXCEPTION 'Escolha o jogador e a posição do banco de reserva.';
  END IF;

  IF p_reserve_slot_role IS NOT NULL AND p_reserve_slot_role NOT IN ('ATA','DEF') THEN
    RAISE EXCEPTION 'O banco aceita somente ATA/ALA ou DEF/VOL.';
  END IF;

  IF p_reserve_player_id IS NOT NULL
    AND p_reserve_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])) THEN
    RAISE EXCEPTION 'O jogador do banco não pode estar entre os titulares.';
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

  DELETE FROM public.fantasy_lineup_reserves
  WHERE lineup_id = saved_lineup_id;

  IF p_reserve_player_id IS NULL THEN
    RETURN saved_lineup_id;
  END IF;

  SELECT fantasy_round.fantasy_season_id
  INTO target_fantasy_season_id
  FROM public.fantasy_rounds fantasy_round
  WHERE fantasy_round.round_id = p_round_id;

  SELECT player.player_profile, player.name, player.avatar_url
  INTO reserve_profile, reserve_name, reserve_avatar
  FROM public.players player
  WHERE player.id = p_reserve_player_id
    AND player.member_category = 'player'
    AND player.is_selectable = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O reserva precisa ser um jogador oficial ativo.';
  END IF;

  IF p_reserve_slot_role = 'DEF' AND COALESCE(reserve_profile, '') <> 'defensive' THEN
    RAISE EXCEPTION 'Escolha um jogador DEF/VOL para este banco.';
  END IF;

  IF p_reserve_slot_role = 'ATA'
    AND COALESCE(reserve_profile, '') NOT IN ('offensive','midfield') THEN
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

  reserve_cost := round(reserve_market_price * .5, 2);

  SELECT cash_remaining
  INTO available_cash
  FROM public.fantasy_lineups
  WHERE id = saved_lineup_id
  FOR UPDATE;

  IF reserve_cost > COALESCE(available_cash, 0) THEN
    RAISE EXCEPTION 'Patrimônio insuficiente para comprar o reserva.';
  END IF;

  INSERT INTO public.fantasy_lineup_reserves(
    lineup_id,
    player_id,
    slot_role,
    price_locked,
    player_name_locked,
    avatar_url_locked
  ) VALUES (
    saved_lineup_id,
    p_reserve_player_id,
    p_reserve_slot_role,
    reserve_cost,
    reserve_name,
    reserve_avatar
  );

  UPDATE public.fantasy_lineups
  SET
    lineup_cost = round(budget_before - cash_remaining + reserve_cost, 2),
    cash_remaining = round(cash_remaining - reserve_cost, 2),
    updated_at = now()
  WHERE id = saved_lineup_id;

  RETURN saved_lineup_id;
END
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup_with_reserve(
  UUID,UUID[],UUID,UUID,UUID,UUID,JSONB,UUID,TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup_with_reserve(
  UUID,UUID[],UUID,UUID,UUID,UUID,JSONB,UUID,TEXT
) TO authenticated, service_role;

COMMENT ON FUNCTION public.save_fantasy_lineup_with_reserve(
  UUID,UUID[],UUID,UUID,UUID,UUID,JSONB,UUID,TEXT
) IS 'Salva a escalação e permite reserva ATA/DEF somente se seu preço cheio ficar C$ 0,10 abaixo do titular mais barato da posição.';

NOTIFY pgrst, 'reload schema';

COMMIT;
