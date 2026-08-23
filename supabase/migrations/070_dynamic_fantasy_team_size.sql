-- Migration 070: Torna o Cartola dinâmico e adaptável à quantidade de jogadores por time (players_per_team)

-- 1. Salvar Elenco Permanente (entre rodadas) com validação dinâmica
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
  max_lineup_players INTEGER := 5;
  dynamic_initial_budget NUMERIC(10,2) := 55.00;
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

  SELECT COALESCE(league.players_per_team, 5) INTO max_lineup_players
  FROM public.fantasy_seasons fantasy_season
  JOIN public.seasons season_item ON season_item.id = fantasy_season.season_id
  JOIN public.leagues league ON league.id = season_item.league_id
  WHERE fantasy_season.id = p_fantasy_season_id;

  dynamic_initial_budget := max_lineup_players * 11.00;

  SELECT count(DISTINCT selected.id), count(*)
  INTO unique_count, selected_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id);
  IF unique_count <> selected_count THEN RAISE EXCEPTION 'Um jogador não pode aparecer duas vezes.'; END IF;
  IF unique_count > max_lineup_players THEN
    RAISE EXCEPTION 'O elenco aceita no máximo % jogadores.', max_lineup_players;
  END IF;

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
    target_season.id, current_user_id, dynamic_initial_budget
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

  -- Ajuste de poder de compra proporcional se o orçamento base aumentou
  IF portfolio_cost > (target_account.current_budget + (max_lineup_players - 5) * 11.00) THEN
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


-- 2. Salvar Escalação Oficial da Rodada com validação dinâmica
CREATE OR REPLACE FUNCTION public.save_fantasy_lineup_legacy(
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
  current_user_id UUID := auth.uid();
  target_round public.rounds%ROWTYPE;
  target_fantasy_round public.fantasy_rounds%ROWTYPE;
  target_season public.fantasy_seasons%ROWTYPE;
  target_account public.fantasy_accounts%ROWTYPE;
  settings_snapshot JSONB;
  saved_lineup_id UUID;
  unique_count INTEGER;
  valid_count INTEGER;
  lineup_cost NUMERIC(10,2);
  challenge_snapshot JSONB;
  predictions_snapshot JSONB;
  max_lineup_players INTEGER := 5;
  dynamic_initial_budget NUMERIC(10,2) := 55.00;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para escalar.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));

  SELECT * INTO target_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR target_round.round_type <> 'official' OR target_round.status = 'finished' THEN
    RAISE EXCEPTION 'Rodada oficial aberta não encontrada.';
  END IF;
  PERFORM public.ensure_fantasy_round(p_round_id);
  SELECT * INTO target_fantasy_round FROM public.fantasy_rounds WHERE round_id = p_round_id FOR UPDATE;
  IF target_fantasy_round.market_status <> 'open' OR EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = p_round_id
      AND (match_item.started_at IS NOT NULL OR match_item.status = 'live')
  ) THEN RAISE EXCEPTION 'O mercado desta rodada está fechado.'; END IF;

  SELECT * INTO target_season FROM public.fantasy_seasons WHERE id = target_fantasy_round.fantasy_season_id;
  settings_snapshot := target_fantasy_round.settings_snapshot;

  SELECT COALESCE(league.players_per_team, 5) INTO max_lineup_players
  FROM public.leagues league WHERE league.id = target_season.league_id;

  dynamic_initial_budget := max_lineup_players * 11.00;

  SELECT count(DISTINCT selected.id), count(*) INTO unique_count, valid_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id);
  IF unique_count <> valid_count THEN RAISE EXCEPTION 'Um jogador não pode aparecer duas vezes.'; END IF;
  IF unique_count > max_lineup_players THEN
    RAISE EXCEPTION 'A escalação aceita no máximo % jogadores.', max_lineup_players;
  END IF;

  SELECT count(*) INTO valid_count FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])) AND (
    (player.member_category = 'player' AND player.is_selectable = true)
    OR (player.member_category = 'guest' AND EXISTS (
      SELECT 1 FROM public.round_players participant
      WHERE participant.round_id = p_round_id AND participant.player_id = player.id
    ))
  );
  IF valid_count <> unique_count THEN RAISE EXCEPTION 'A escalação contém um jogador inelegível.'; END IF;
  IF p_captain_player_id IS NOT NULL AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))) THEN
    RAISE EXCEPTION 'O capitão precisa estar entre os escalados.';
  END IF;

  IF p_top_scorer_player_id IS NOT NULL THEN
    PERFORM public.build_fantasy_challenge_snapshot(p_round_id, target_season.id, 'VAI_GUARDAR', p_top_scorer_player_id, settings_snapshot, false);
  END IF;
  IF p_top_assist_player_id IS NOT NULL THEN
    PERFORM public.build_fantasy_challenge_snapshot(p_round_id, target_season.id, 'VAI_GUARDAR', p_top_assist_player_id, settings_snapshot, false);
  END IF;
  challenge_snapshot := public.build_fantasy_challenge_snapshot(
    p_round_id, target_season.id, target_fantasy_round.challenge_type,
    p_challenge_player_id, settings_snapshot, false
  );
  predictions_snapshot := jsonb_build_object(
    'topScorer', CASE WHEN p_top_scorer_player_id IS NULL THEN NULL ELSE jsonb_build_object(
      'playerId', p_top_scorer_player_id,
      'playerName', (SELECT name FROM public.players WHERE id = p_top_scorer_player_id),
      'reward', (settings_snapshot->>'top_scorer_prediction_points')::NUMERIC
    ) END,
    'topAssist', CASE WHEN p_top_assist_player_id IS NULL THEN NULL ELSE jsonb_build_object(
      'playerId', p_top_assist_player_id,
      'playerName', (SELECT name FROM public.players WHERE id = p_top_assist_player_id),
      'reward', (settings_snapshot->>'top_assist_prediction_points')::NUMERIC
    ) END,
    'challenge', challenge_snapshot
  );

  INSERT INTO public.fantasy_accounts (fantasy_season_id, user_id, current_budget)
  VALUES (target_season.id, current_user_id, dynamic_initial_budget)
  ON CONFLICT (fantasy_season_id, user_id) DO NOTHING;
  SELECT * INTO target_account FROM public.fantasy_accounts
  WHERE fantasy_season_id = target_season.id AND user_id = current_user_id FOR UPDATE;

  INSERT INTO public.fantasy_player_prices (fantasy_season_id, player_id, current_price)
  SELECT target_season.id, player.id, target_season.initial_player_price
  FROM public.players player WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
  ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;
  SELECT COALESCE(sum(price.current_price), 0) INTO lineup_cost
  FROM public.fantasy_player_prices price
  WHERE price.fantasy_season_id = target_season.id
    AND price.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]));

  IF lineup_cost > (target_account.current_budget + (max_lineup_players - 5) * 11.00) THEN
    RAISE EXCEPTION 'A escalação ultrapassa o patrimônio disponível.';
  END IF;

  INSERT INTO public.fantasy_lineups (
    fantasy_round_id, user_id, status, captain_player_id,
    top_scorer_player_id, top_assist_player_id, top_team_id,
    challenge_player_id, challenge_snapshot, predictions_snapshot,
    budget_before, lineup_cost, cash_remaining, updated_at
  ) VALUES (
    target_fantasy_round.id, current_user_id, 'draft', p_captain_player_id,
    p_top_scorer_player_id, p_top_assist_player_id, NULL,
    p_challenge_player_id, challenge_snapshot, predictions_snapshot,
    target_account.current_budget + (max_lineup_players - 5) * 11.00,
    lineup_cost,
    (target_account.current_budget + (max_lineup_players - 5) * 11.00) - lineup_cost,
    now()
  ) ON CONFLICT (fantasy_round_id, user_id) DO UPDATE SET
    status = 'draft', captain_player_id = EXCLUDED.captain_player_id,
    top_scorer_player_id = EXCLUDED.top_scorer_player_id,
    top_assist_player_id = EXCLUDED.top_assist_player_id, top_team_id = NULL,
    challenge_player_id = EXCLUDED.challenge_player_id,
    challenge_snapshot = EXCLUDED.challenge_snapshot,
    predictions_snapshot = EXCLUDED.predictions_snapshot,
    score_breakdown = '{}'::JSONB,
    budget_before = EXCLUDED.budget_before, lineup_cost = EXCLUDED.lineup_cost,
    cash_remaining = EXCLUDED.cash_remaining, updated_at = now()
  RETURNING id INTO saved_lineup_id;

  DELETE FROM public.fantasy_lineup_players WHERE lineup_id = saved_lineup_id;
  INSERT INTO public.fantasy_lineup_players (
    lineup_id, player_id, price_locked, player_name_locked, avatar_url_locked
  )
  SELECT saved_lineup_id, selected.id, price.current_price, player.name, player.avatar_url
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id)
  JOIN public.players player ON player.id = selected.id
  JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = target_season.id AND price.player_id = selected.id;

  INSERT INTO public.fantasy_audit_log (league_id, fantasy_round_id, user_id, action, payload)
  VALUES (target_season.league_id, target_fantasy_round.id, current_user_id, 'lineup_saved_v1',
    jsonb_build_object('players', unique_count, 'cost', lineup_cost, 'challenge', challenge_snapshot));
  RETURN saved_lineup_id;
END;
$$;


-- 3. Salvar Escalação de Teste (Amistoso) com validação dinâmica
CREATE OR REPLACE FUNCTION public.save_fantasy_test_lineup(
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
  current_user_id UUID := auth.uid();
  test_session public.fantasy_test_sessions%ROWTYPE;
  saved_lineup_id UUID;
  unique_count INTEGER;
  valid_count INTEGER;
  player_price NUMERIC(10,2);
  available_budget NUMERIC(10,2);
  lineup_cost NUMERIC(10,2);
  challenge_snapshot JSONB;
  predictions_snapshot JSONB;
  max_lineup_players INTEGER := 5;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para escalar.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));
  SELECT * INTO test_session FROM public.fantasy_test_sessions WHERE round_id = p_round_id FOR UPDATE;
  IF NOT FOUND OR test_session.status <> 'open' THEN RAISE EXCEPTION 'O mercado de teste está fechado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND (started_at IS NOT NULL OR status = 'live')) THEN
    RAISE EXCEPTION 'O mercado de teste está fechado.';
  END IF;

  SELECT COALESCE(league.players_per_team, 5) INTO max_lineup_players
  FROM public.leagues league WHERE league.id = test_session.league_id;

  SELECT count(DISTINCT selected.id), count(*) INTO unique_count, valid_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id);
  IF unique_count <> valid_count THEN RAISE EXCEPTION 'Um jogador não pode aparecer duas vezes.'; END IF;
  IF unique_count > max_lineup_players THEN
    RAISE EXCEPTION 'A escalação aceita no máximo % jogadores.', max_lineup_players;
  END IF;

  SELECT count(*) INTO valid_count FROM public.round_players participant
  WHERE participant.round_id = p_round_id AND participant.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]));
  IF valid_count <> unique_count THEN RAISE EXCEPTION 'No teste, use apenas jogadores convocados para o amistoso.'; END IF;
  IF p_captain_player_id IS NOT NULL AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))) THEN
    RAISE EXCEPTION 'O capitão precisa estar entre os escalados.';
  END IF;

  IF p_top_scorer_player_id IS NOT NULL THEN
    PERFORM public.build_fantasy_challenge_snapshot(p_round_id, NULL, 'VAI_GUARDAR', p_top_scorer_player_id, test_session.settings_snapshot, true);
  END IF;
  IF p_top_assist_player_id IS NOT NULL THEN
    PERFORM public.build_fantasy_challenge_snapshot(p_round_id, NULL, 'VAI_GUARDAR', p_top_assist_player_id, test_session.settings_snapshot, true);
  END IF;
  challenge_snapshot := public.build_fantasy_challenge_snapshot(
    p_round_id, NULL, test_session.challenge_type, p_challenge_player_id,
    test_session.settings_snapshot, true
  );
  predictions_snapshot := jsonb_build_object(
    'topScorer', CASE WHEN p_top_scorer_player_id IS NULL THEN NULL ELSE jsonb_build_object(
      'playerId', p_top_scorer_player_id, 'playerName', (SELECT name FROM public.players WHERE id = p_top_scorer_player_id),
      'reward', (test_session.settings_snapshot->>'top_scorer_prediction_points')::NUMERIC
    ) END,
    'topAssist', CASE WHEN p_top_assist_player_id IS NULL THEN NULL ELSE jsonb_build_object(
      'playerId', p_top_assist_player_id, 'playerName', (SELECT name FROM public.players WHERE id = p_top_assist_player_id),
      'reward', (test_session.settings_snapshot->>'top_assist_prediction_points')::NUMERIC
    ) END,
    'challenge', challenge_snapshot
  );
  player_price := (test_session.settings_snapshot->>'initial_player_price')::NUMERIC;
  available_budget := max_lineup_players * 11.00;
  lineup_cost := unique_count * player_price;
  IF lineup_cost > available_budget THEN RAISE EXCEPTION 'A escalação ultrapassa o patrimônio disponível.'; END IF;

  INSERT INTO public.fantasy_test_lineups (
    test_session_id, user_id, captain_player_id, top_scorer_player_id,
    top_assist_player_id, challenge_player_id, challenge_snapshot,
    predictions_snapshot, budget_before, lineup_cost, cash_remaining, updated_at
  ) VALUES (
    test_session.id, current_user_id, p_captain_player_id, p_top_scorer_player_id,
    p_top_assist_player_id, p_challenge_player_id, challenge_snapshot,
    predictions_snapshot, available_budget, lineup_cost, available_budget - lineup_cost, now()
  ) ON CONFLICT (test_session_id, user_id) DO UPDATE SET
    captain_player_id = EXCLUDED.captain_player_id,
    top_scorer_player_id = EXCLUDED.top_scorer_player_id,
    top_assist_player_id = EXCLUDED.top_assist_player_id,
    challenge_player_id = EXCLUDED.challenge_player_id,
    challenge_snapshot = EXCLUDED.challenge_snapshot,
    predictions_snapshot = EXCLUDED.predictions_snapshot,
    budget_before = EXCLUDED.budget_before, lineup_cost = EXCLUDED.lineup_cost,
    cash_remaining = EXCLUDED.cash_remaining, updated_at = now()
  RETURNING id INTO saved_lineup_id;

  DELETE FROM public.fantasy_test_lineup_players WHERE lineup_id = saved_lineup_id;
  INSERT INTO public.fantasy_test_lineup_players (
    lineup_id, player_id, price_locked, player_name_locked, avatar_url_locked
  )
  SELECT saved_lineup_id, selected.id, player_price, player.name, player.avatar_url
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id)
  JOIN public.players player ON player.id = selected.id;

  RETURN saved_lineup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;
