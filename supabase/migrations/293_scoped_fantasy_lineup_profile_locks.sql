-- Continua a separacao do Cartola: a tag congelada da escalacao vem da
-- pelada da rodada, nunca de players.player_profile (identidade global).
-- Nao altera escalacoes antigas nem reprocessa rodadas.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_fantasy_selection_in_league(
  p_round_id uuid, p_player_ids uuid[], p_extra_player_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league_id uuid; expected_count integer; found_count integer;
BEGIN
  SELECT round_item.league_id INTO target_league_id
  FROM public.rounds round_item
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = round_item.id
  JOIN public.fantasy_seasons fantasy_season
    ON fantasy_season.id = fantasy_round.fantasy_season_id
    AND fantasy_season.league_id = round_item.league_id
  JOIN public.leagues league ON league.id = round_item.league_id
    AND league.is_active AND league.feature_tier = 'complete'
  WHERE round_item.id = p_round_id;
  IF target_league_id IS NULL OR NOT public.is_league_member(target_league_id) THEN
    RAISE EXCEPTION 'Rodada do Cartola indisponivel nesta pelada.';
  END IF;
  expected_count := COALESCE(cardinality(p_player_ids), 0);
  IF expected_count <> (SELECT count(DISTINCT item) FROM unnest(COALESCE(p_player_ids, ARRAY[]::uuid[])) item) THEN
    RAISE EXCEPTION 'A escalacao contem atletas repetidos.';
  END IF;
  SELECT count(*) INTO found_count FROM public.league_members member
  JOIN public.players player ON player.id = member.player_id
  WHERE member.league_id = target_league_id AND member.is_active
    AND player.id = ANY(COALESCE(p_player_ids, ARRAY[]::uuid[]))
    AND player.member_category = 'player' AND player.is_selectable;
  IF found_count <> expected_count THEN
    RAISE EXCEPTION 'A escalacao contem atleta de outra pelada ou indisponivel.';
  END IF;
  IF p_extra_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.league_members member
    JOIN public.players player ON player.id = member.player_id
    WHERE member.league_id = target_league_id AND member.is_active
      AND member.player_id = p_extra_player_id
      AND player.member_category = 'player' AND player.is_selectable
  ) THEN
    RAISE EXCEPTION 'O reserva nao pertence ao elenco ativo desta pelada.';
  END IF;
  RETURN target_league_id;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_fantasy_selection_in_league(uuid,uuid[],uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup(
  p_round_id uuid, p_player_ids uuid[], p_captain_player_id uuid,
  p_top_scorer_player_id uuid, p_top_assist_player_id uuid,
  p_challenge_player_id uuid, p_lineup_slots jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved uuid; target_league_id uuid; team_size integer;
BEGIN
  target_league_id := public.assert_fantasy_selection_in_league(p_round_id, p_player_ids);
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[p_top_scorer_player_id,p_top_assist_player_id,p_challenge_player_id]) chosen(player_id)
    WHERE chosen.player_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.league_members member
      WHERE member.league_id = target_league_id AND member.player_id = chosen.player_id
        AND member.is_active
    )
  ) THEN RAISE EXCEPTION 'Palpite com atleta de outra pelada.'; END IF;
  SELECT players_per_team INTO team_size FROM public.leagues WHERE id = target_league_id;
  IF NOT public.is_valid_fantasy_formation_v11(p_lineup_slots, team_size) THEN
    RAISE EXCEPTION 'Use 1 GOL e escolha 3 DEF + 2 ATA ou 2 DEF + 3 ATA.';
  END IF;
  saved := public.save_fantasy_lineup_pre_three_positions_220(
    p_round_id, p_player_ids, p_captain_player_id, p_top_scorer_player_id,
    p_top_assist_player_id, p_challenge_player_id, p_lineup_slots);
  UPDATE public.fantasy_lineup_players item SET
    player_profile_locked = member.player_profile,
    is_position_correct = CASE item.slot_role
      WHEN 'GOL' THEN true
      WHEN 'DEF' THEN member.player_profile = 'defensive'
      WHEN 'ATA' THEN member.player_profile IN ('offensive','midfield')
      ELSE false END
  FROM public.league_members member
  WHERE item.lineup_id = saved AND item.player_id = member.player_id
    AND member.league_id = target_league_id AND member.is_active;
  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_fantasy_test_lineup(
  p_round_id uuid, p_player_ids uuid[], p_captain_player_id uuid,
  p_top_scorer_player_id uuid, p_top_assist_player_id uuid,
  p_challenge_player_id uuid, p_lineup_slots jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved uuid; target_league_id uuid; team_size integer;
BEGIN
  target_league_id := public.assert_fantasy_selection_in_league(p_round_id, p_player_ids);
  IF NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Teste do Cartola restrito ao ADM desta pelada.';
  END IF;
  SELECT players_per_team INTO team_size FROM public.leagues WHERE id = target_league_id;
  IF NOT public.is_valid_fantasy_formation_v11(p_lineup_slots, team_size) THEN
    RAISE EXCEPTION 'Formacao invalida para o teste do Cartola.';
  END IF;
  saved := public.save_fantasy_test_lineup_pre_three_positions_220(
    p_round_id, p_player_ids, p_captain_player_id, p_top_scorer_player_id,
    p_top_assist_player_id, p_challenge_player_id, p_lineup_slots);
  UPDATE public.fantasy_test_lineup_players item SET
    player_profile_locked = member.player_profile,
    is_position_correct = CASE item.slot_role
      WHEN 'GOL' THEN true
      WHEN 'DEF' THEN member.player_profile = 'defensive'
      WHEN 'ATA' THEN member.player_profile IN ('offensive','midfield')
      ELSE false END
  FROM public.league_members member
  WHERE item.lineup_id = saved AND item.player_id = member.player_id
    AND member.league_id = target_league_id AND member.is_active;
  RETURN saved;
END;
$$;

-- Os entrypoints historicos sem validacao de pelada continuam usados
-- internamente pelas wrappers, mas nao podem ser invocados pelo cliente.
REVOKE ALL ON FUNCTION public.save_fantasy_lineup_pre_three_positions_220(
  uuid,uuid[],uuid,uuid,uuid,uuid,jsonb),
  public.save_fantasy_test_lineup_pre_three_positions_220(
  uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_fantasy_lineup(
  uuid,uuid[],uuid,uuid,uuid,uuid,jsonb),
  public.save_fantasy_test_lineup(
  uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(
  uuid,uuid[],uuid,uuid,uuid,uuid,jsonb),
  public.save_fantasy_test_lineup(
  uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)
  TO authenticated, service_role;

-- A wrapper de atividade da 251 chama esta rotina. O reserva tambem precisa
-- ser conferido pelo vinculo da pelada, inclusive quando as tags divergem
-- entre duas peladas que compartilham a mesma conta de atleta.
CREATE OR REPLACE FUNCTION public.save_fantasy_lineup_with_reserve_pre_activity_251(
  p_round_id uuid, p_player_ids uuid[], p_captain_player_id uuid,
  p_top_scorer_player_id uuid, p_top_assist_player_id uuid,
  p_challenge_player_id uuid, p_lineup_slots jsonb,
  p_reserve_player_id uuid DEFAULT NULL, p_reserve_slot_role text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  saved_lineup_id uuid; target_fantasy_season_id uuid; target_league_id uuid;
  reserve_profile text; reserve_name text; reserve_avatar text;
  reserve_market_price numeric(10,2); reserve_price_limit numeric(10,2);
  reserve_cost numeric(10,2); cheapest_starter_price numeric(10,2);
  available_cash numeric(10,2);
BEGIN
  IF (p_reserve_player_id IS NULL) <> (p_reserve_slot_role IS NULL) THEN
    RAISE EXCEPTION 'Escolha o jogador e a posicao do banco de reserva.';
  END IF;
  IF p_reserve_slot_role IS NOT NULL AND p_reserve_slot_role NOT IN ('ATA','DEF') THEN
    RAISE EXCEPTION 'O banco aceita somente ATA/ALA ou DEF/VOL.';
  END IF;
  IF p_reserve_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::uuid[])) THEN
    RAISE EXCEPTION 'O reserva nao pode estar entre os titulares.';
  END IF;
  target_league_id := public.assert_fantasy_selection_in_league(
    p_round_id, p_player_ids, p_reserve_player_id);

  saved_lineup_id := public.save_fantasy_lineup(
    p_round_id, p_player_ids, p_captain_player_id,
    p_top_scorer_player_id, p_top_assist_player_id,
    p_challenge_player_id, p_lineup_slots);
  DELETE FROM public.fantasy_lineup_reserves WHERE lineup_id = saved_lineup_id;
  IF p_reserve_player_id IS NULL THEN RETURN saved_lineup_id; END IF;

  SELECT fantasy_round.fantasy_season_id INTO target_fantasy_season_id
  FROM public.fantasy_rounds fantasy_round WHERE fantasy_round.round_id = p_round_id;
  SELECT member.player_profile, player.name, player.avatar_url
    INTO reserve_profile, reserve_name, reserve_avatar
  FROM public.league_members member
  JOIN public.players player ON player.id = member.player_id
  WHERE member.league_id = target_league_id AND member.is_active
    AND member.player_id = p_reserve_player_id
    AND player.member_category = 'player' AND player.is_selectable;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva indisponivel nesta pelada.'; END IF;
  IF (p_reserve_slot_role = 'DEF' AND reserve_profile <> 'defensive')
    OR (p_reserve_slot_role = 'ATA' AND reserve_profile NOT IN ('offensive','midfield')) THEN
    RAISE EXCEPTION 'A posicao do reserva nao corresponde a sua tag nesta pelada.';
  END IF;

  SELECT min(item.price_locked) INTO cheapest_starter_price
  FROM public.fantasy_lineup_players item
  WHERE item.lineup_id = saved_lineup_id AND item.slot_role = p_reserve_slot_role;
  IF cheapest_starter_price IS NULL THEN
    RAISE EXCEPTION 'Escolha um titular da mesma posicao antes do reserva.';
  END IF;
  reserve_price_limit := round(GREATEST(0, cheapest_starter_price - .10), 2);
  SELECT round(COALESCE(price.current_price, season.initial_player_price), 2)
    INTO reserve_market_price
  FROM public.fantasy_seasons season
  LEFT JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = season.id AND price.player_id = p_reserve_player_id
  WHERE season.id = target_fantasy_season_id AND season.league_id = target_league_id;
  IF reserve_market_price IS NULL THEN
    RAISE EXCEPTION 'Preco do reserva indisponivel.';
  END IF;
  IF reserve_market_price > reserve_price_limit THEN
    RAISE EXCEPTION 'Reserva caro demais: custa C$ %, limite C$ %.',
      reserve_market_price, reserve_price_limit;
  END IF;
  reserve_cost := round(reserve_market_price * .5, 2);
  SELECT cash_remaining INTO available_cash
  FROM public.fantasy_lineups WHERE id = saved_lineup_id FOR UPDATE;
  IF reserve_cost > COALESCE(available_cash, 0) THEN
    RAISE EXCEPTION 'Patrimonio insuficiente para comprar o reserva.';
  END IF;
  INSERT INTO public.fantasy_lineup_reserves(
    lineup_id, player_id, slot_role, price_locked, player_name_locked, avatar_url_locked
  ) VALUES (
    saved_lineup_id, p_reserve_player_id, p_reserve_slot_role,
    reserve_cost, reserve_name, reserve_avatar
  );
  UPDATE public.fantasy_lineups SET
    lineup_cost = round(budget_before - cash_remaining + reserve_cost, 2),
    cash_remaining = round(cash_remaining - reserve_cost, 2), updated_at = now()
  WHERE id = saved_lineup_id;
  RETURN saved_lineup_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_fantasy_lineup_with_reserve_pre_activity_251(
  uuid,uuid[],uuid,uuid,uuid,uuid,jsonb,uuid,text)
  FROM PUBLIC, anon, authenticated;

-- A interface atual usa a assinatura com vagas. A assinatura legada sem
-- vagas permanece para chamadas internas das funcoes SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.save_fantasy_lineup(
  uuid,uuid[],uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
