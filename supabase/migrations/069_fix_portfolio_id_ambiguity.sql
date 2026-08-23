-- Migration 069: Corrige ambiguidade de 'portfolio_id' na function save_fantasy_portfolio
CREATE OR REPLACE FUNCTION public.save_fantasy_portfolio(
  p_fantasy_season_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  target_season public.fantasy_seasons%ROWTYPE;
  target_account public.fantasy_accounts%ROWTYPE;
  v_portfolio_id UUID;
  unique_count INTEGER;
  selected_count INTEGER;
  portfolio_cost NUMERIC(10,2);
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para montar o elenco.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_fantasy_season_id::TEXT || current_user_id::TEXT, 0));

  SELECT fantasy_season.* INTO target_season
  FROM public.fantasy_seasons fantasy_season
  JOIN public.seasons season_item ON season_item.id = fantasy_season.season_id
  WHERE fantasy_season.id = p_fantasy_season_id
    AND season_item.status = 'active'
  FOR UPDATE OF fantasy_season;
  IF NOT FOUND THEN RAISE EXCEPTION 'Temporada do Cartola não encontrada.'; END IF;

  SELECT count(DISTINCT selected.id), count(*)
  INTO unique_count, selected_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id);
  IF unique_count <> selected_count THEN RAISE EXCEPTION 'Um jogador não pode aparecer duas vezes.'; END IF;
  IF unique_count > 5 THEN RAISE EXCEPTION 'O elenco aceita no máximo 5 jogadores.'; END IF;

  SELECT count(*) INTO selected_count
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.is_selectable = true
    AND player.member_category IN ('player', 'guest');
  IF selected_count <> unique_count THEN RAISE EXCEPTION 'O elenco contém uma pessoa indisponível no mercado.'; END IF;

  IF p_captain_player_id IS NOT NULL
    AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])))
  THEN RAISE EXCEPTION 'O capitão precisa estar entre os jogadores comprados.'; END IF;

  INSERT INTO public.fantasy_player_prices (
    fantasy_season_id, player_id, current_price
  )
  SELECT target_season.id, player.id, target_season.initial_player_price
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
  ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;

  INSERT INTO public.fantasy_accounts (
    fantasy_season_id, user_id, current_budget
  ) VALUES (
    target_season.id, current_user_id, target_season.initial_budget
  ) ON CONFLICT (fantasy_season_id, user_id) DO NOTHING;

  SELECT * INTO target_account
  FROM public.fantasy_accounts account_item
  WHERE account_item.fantasy_season_id = target_season.id
    AND account_item.user_id = current_user_id
  FOR UPDATE;

  SELECT COALESCE(sum(price.current_price), 0) INTO portfolio_cost
  FROM public.fantasy_player_prices price
  WHERE price.fantasy_season_id = target_season.id
    AND price.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]));
  IF portfolio_cost > target_account.current_budget THEN
    RAISE EXCEPTION 'As compras ultrapassam o seu patrimônio disponível.';
  END IF;

  INSERT INTO public.fantasy_portfolios (
    fantasy_season_id, user_id, captain_player_id, updated_at
  ) VALUES (
    target_season.id, current_user_id, p_captain_player_id, now()
  )
  ON CONFLICT (fantasy_season_id, user_id) DO UPDATE SET
    captain_player_id = EXCLUDED.captain_player_id,
    updated_at = now()
  RETURNING id INTO v_portfolio_id;

  DELETE FROM public.fantasy_portfolio_players item
  WHERE item.portfolio_id = v_portfolio_id;

  INSERT INTO public.fantasy_portfolio_players (
    portfolio_id, player_id, price_selected
  )
  SELECT v_portfolio_id, selected.id, price.current_price
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id)
  JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = target_season.id
    AND price.player_id = selected.id;

  INSERT INTO public.fantasy_audit_log (
    league_id, user_id, action, payload
  ) VALUES (
    target_season.league_id,
    current_user_id,
    'portfolio_saved',
    jsonb_build_object('players', unique_count, 'cost', portfolio_cost)
  );

  RETURN v_portfolio_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_portfolio(UUID, UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_portfolio(UUID, UUID[], UUID) TO authenticated;

-- Garante permissões completas para a tabela de notificações do inbox
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_inbox_notifications TO authenticated;

