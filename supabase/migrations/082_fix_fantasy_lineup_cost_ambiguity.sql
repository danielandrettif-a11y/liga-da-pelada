-- Corrige ambiguidade PL/pgSQL entre a coluna fantasy_lineups.lineup_cost
-- e a variável local usada ao salvar a escalação.

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID DEFAULT NULL,
  p_top_scorer_player_id UUID DEFAULT NULL,
  p_top_assist_player_id UUID DEFAULT NULL,
  p_challenge_player_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_fantasy_season_id UUID;
  max_lineup_players INTEGER := 5;
  available_budget NUMERIC(10,2);
  calculated_lineup_cost NUMERIC(10,2);
  official_count INTEGER;
  saved_lineup_id UUID;
BEGIN
  SELECT fantasy_round.fantasy_season_id, COALESCE(league.players_per_team, 5)
  INTO target_fantasy_season_id, max_lineup_players
  FROM public.fantasy_rounds fantasy_round
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  JOIN public.leagues league ON league.id = season.league_id
  WHERE fantasy_round.round_id = p_round_id;

  SELECT count(*) INTO official_count
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.member_category = 'player' AND player.is_selectable = true;
  IF official_count <> COALESCE(cardinality(p_player_ids), 0) THEN
    RAISE EXCEPTION 'O mercado do Cartola aceita somente jogadores com perfil oficial ativo.';
  END IF;

  SELECT GREATEST(COALESCE(account.current_budget, 0), max_lineup_players * 11.00)
  INTO available_budget
  FROM public.fantasy_accounts account
  WHERE account.fantasy_season_id = target_fantasy_season_id AND account.user_id = auth.uid();
  available_budget := COALESCE(available_budget, max_lineup_players * 11.00);

  SELECT COALESCE(sum(COALESCE(price.current_price, season_item.initial_player_price)), 0)
  INTO calculated_lineup_cost
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(player_id)
  JOIN public.fantasy_seasons season_item ON season_item.id = target_fantasy_season_id
  LEFT JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = season_item.id AND price.player_id = selected.player_id;
  IF calculated_lineup_cost > available_budget THEN
    RAISE EXCEPTION 'A escalação ultrapassa o patrimônio disponível.';
  END IF;

  saved_lineup_id := public.save_fantasy_lineup_pre_official_market_072(
    p_round_id, p_player_ids, p_captain_player_id, p_top_scorer_player_id,
    p_top_assist_player_id, p_challenge_player_id
  );

  UPDATE public.fantasy_lineups lineup
  SET budget_before = available_budget,
      cash_remaining = available_budget - calculated_lineup_cost
  WHERE lineup.id = saved_lineup_id;

  RETURN saved_lineup_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
