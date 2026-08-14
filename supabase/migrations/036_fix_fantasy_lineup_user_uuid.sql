-- Evita colisao com CURRENT_USER, palavra reservada do PostgreSQL que retorna NAME.
-- As duas funcoes precisam usar explicitamente o UUID autenticado pelo Supabase.

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup(
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
  v_current_user_id UUID := auth.uid();
  current_round public.rounds%ROWTYPE;
  target_fantasy_round public.fantasy_rounds%ROWTYPE;
  target_fantasy_season public.fantasy_seasons%ROWTYPE;
  target_account public.fantasy_accounts%ROWTYPE;
  saved_lineup_id UUID;
  unique_count INTEGER;
  valid_count INTEGER;
  lineup_cost NUMERIC(10,2);
BEGIN
  IF v_current_user_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para escalar.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));

  SELECT * INTO current_round
  FROM public.rounds round_item
  WHERE round_item.id = p_round_id
  FOR UPDATE;
  IF NOT FOUND OR current_round.round_type <> 'official' THEN
    RAISE EXCEPTION 'Rodada oficial nao encontrada.';
  END IF;

  PERFORM public.ensure_fantasy_round(p_round_id);
  SELECT * INTO target_fantasy_round
  FROM public.fantasy_rounds fantasy_round_item
  WHERE fantasy_round_item.round_id = p_round_id
  FOR UPDATE;
  IF NOT FOUND OR target_fantasy_round.market_status <> 'open'
    OR EXISTS (
      SELECT 1 FROM public.matches match_item
      WHERE match_item.round_id = p_round_id AND match_item.started_at IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'O mercado desta rodada esta fechado.';
  END IF;

  SELECT * INTO target_fantasy_season
  FROM public.fantasy_seasons fantasy_season_item
  WHERE fantasy_season_item.id = target_fantasy_round.fantasy_season_id;

  SELECT count(DISTINCT selected.id), count(*)
  INTO unique_count, valid_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) AS selected(id);
  IF unique_count <> valid_count THEN RAISE EXCEPTION 'Um jogador nao pode aparecer duas vezes.'; END IF;
  IF unique_count > 5 THEN RAISE EXCEPTION 'A escalacao aceita no maximo 5 jogadores.'; END IF;

  SELECT count(*) INTO valid_count
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.is_selectable = true
    AND player.member_category IN ('player', 'guest');
  IF valid_count <> unique_count THEN RAISE EXCEPTION 'A escalacao contem um jogador inelegivel.'; END IF;

  IF p_captain_player_id IS NOT NULL
    AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])))
  THEN
    RAISE EXCEPTION 'O capitao precisa estar entre os escalados.';
  END IF;
  IF p_top_team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.teams team_item
    WHERE team_item.id = p_top_team_id AND team_item.round_id = p_round_id
  ) THEN RAISE EXCEPTION 'O time escolhido nao pertence a esta rodada.'; END IF;
  IF p_top_scorer_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.players player
    WHERE player.id = p_top_scorer_player_id
      AND player.is_selectable = true
      AND player.member_category IN ('player', 'guest')
  ) THEN RAISE EXCEPTION 'Palpite de artilheiro invalido.'; END IF;
  IF p_top_assist_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.players player
    WHERE player.id = p_top_assist_player_id
      AND player.is_selectable = true
      AND player.member_category IN ('player', 'guest')
  ) THEN RAISE EXCEPTION 'Palpite de garcom invalido.'; END IF;

  INSERT INTO public.fantasy_accounts (fantasy_season_id, user_id, current_budget)
  VALUES (
    target_fantasy_round.fantasy_season_id,
    v_current_user_id,
    target_fantasy_season.initial_budget
  )
  ON CONFLICT (fantasy_season_id, user_id) DO NOTHING;

  SELECT * INTO target_account
  FROM public.fantasy_accounts account_item
  WHERE account_item.fantasy_season_id = target_fantasy_round.fantasy_season_id
    AND account_item.user_id = v_current_user_id
  FOR UPDATE;

  INSERT INTO public.fantasy_player_prices (fantasy_season_id, player_id, current_price)
  SELECT target_fantasy_round.fantasy_season_id, player.id, target_fantasy_season.initial_player_price
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
  ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;

  SELECT COALESCE(sum(price.current_price), 0) INTO lineup_cost
  FROM public.fantasy_player_prices price
  WHERE price.fantasy_season_id = target_fantasy_round.fantasy_season_id
    AND price.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]));
  IF lineup_cost > target_account.current_budget THEN
    RAISE EXCEPTION 'A escalacao ultrapassa o patrimonio disponivel.';
  END IF;

  INSERT INTO public.fantasy_lineups (
    fantasy_round_id, user_id, status, captain_player_id, top_scorer_player_id,
    top_assist_player_id, top_team_id, budget_before, lineup_cost, cash_remaining, updated_at
  ) VALUES (
    target_fantasy_round.id, v_current_user_id, 'draft', p_captain_player_id,
    p_top_scorer_player_id, p_top_assist_player_id, p_top_team_id,
    target_account.current_budget, lineup_cost,
    target_account.current_budget - lineup_cost, now()
  ) ON CONFLICT (fantasy_round_id, user_id) DO UPDATE SET
    status = 'draft',
    captain_player_id = EXCLUDED.captain_player_id,
    top_scorer_player_id = EXCLUDED.top_scorer_player_id,
    top_assist_player_id = EXCLUDED.top_assist_player_id,
    top_team_id = EXCLUDED.top_team_id,
    budget_before = EXCLUDED.budget_before,
    lineup_cost = EXCLUDED.lineup_cost,
    cash_remaining = EXCLUDED.cash_remaining,
    updated_at = now()
  RETURNING id INTO saved_lineup_id;

  DELETE FROM public.fantasy_lineup_players item WHERE item.lineup_id = saved_lineup_id;
  INSERT INTO public.fantasy_lineup_players (lineup_id, player_id, price_locked)
  SELECT saved_lineup_id, selected.id, price.current_price
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id)
  JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = target_fantasy_round.fantasy_season_id
    AND price.player_id = selected.id;

  INSERT INTO public.fantasy_audit_log (
    league_id, fantasy_round_id, user_id, action, payload
  ) VALUES (
    target_fantasy_season.league_id,
    target_fantasy_round.id,
    v_current_user_id,
    'lineup_saved',
    jsonb_build_object('players', unique_count, 'cost', lineup_cost)
  );

  RETURN saved_lineup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_fantasy_test_lineup(
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
  v_current_user_id UUID := auth.uid();
  test_session public.fantasy_test_sessions%ROWTYPE;
  saved_lineup_id UUID;
  unique_count INTEGER;
  valid_count INTEGER;
  player_price NUMERIC(10,2);
  available_budget NUMERIC(10,2);
  lineup_cost NUMERIC(10,2);
BEGIN
  IF v_current_user_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para escalar.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));
  SELECT * INTO test_session
  FROM public.fantasy_test_sessions session_item
  WHERE session_item.round_id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Teste do Cartola nao encontrado.'; END IF;
  IF test_session.status <> 'open' THEN RAISE EXCEPTION 'O mercado de teste esta fechado.'; END IF;

  SELECT count(DISTINCT selected.id), count(*)
  INTO unique_count, valid_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) AS selected(id);
  IF unique_count <> valid_count THEN RAISE EXCEPTION 'Um jogador nao pode aparecer duas vezes.'; END IF;
  IF unique_count > 5 THEN RAISE EXCEPTION 'A escalacao aceita no maximo 5 jogadores.'; END IF;

  SELECT count(*) INTO valid_count
  FROM public.round_players participant
  JOIN public.players player ON player.id = participant.player_id
  WHERE participant.round_id = p_round_id
    AND participant.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]));
  IF valid_count <> unique_count THEN
    RAISE EXCEPTION 'No teste, use apenas jogadores convocados para o amistoso.';
  END IF;

  IF p_captain_player_id IS NOT NULL
    AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])))
  THEN RAISE EXCEPTION 'O capitao precisa estar entre os escalados.'; END IF;
  IF p_top_team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.teams team_item
    WHERE team_item.id = p_top_team_id AND team_item.round_id = p_round_id
  ) THEN RAISE EXCEPTION 'O time escolhido nao pertence a este amistoso.'; END IF;
  IF p_top_scorer_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.round_players participant
    WHERE participant.round_id = p_round_id AND participant.player_id = p_top_scorer_player_id
  ) THEN RAISE EXCEPTION 'Palpite de artilheiro invalido.'; END IF;
  IF p_top_assist_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.round_players participant
    WHERE participant.round_id = p_round_id AND participant.player_id = p_top_assist_player_id
  ) THEN RAISE EXCEPTION 'Palpite de garcom invalido.'; END IF;

  player_price := (test_session.settings_snapshot->>'initial_player_price')::NUMERIC;
  available_budget := (test_session.settings_snapshot->>'initial_budget')::NUMERIC;
  lineup_cost := unique_count * player_price;
  IF lineup_cost > available_budget THEN
    RAISE EXCEPTION 'A escalacao ultrapassa o patrimonio de teste.';
  END IF;

  INSERT INTO public.fantasy_test_lineups (
    test_session_id, user_id, status, captain_player_id, top_scorer_player_id,
    top_assist_player_id, top_team_id, budget_before, lineup_cost, cash_remaining, updated_at
  ) VALUES (
    test_session.id, v_current_user_id, 'draft', p_captain_player_id,
    p_top_scorer_player_id, p_top_assist_player_id, p_top_team_id,
    available_budget, lineup_cost, available_budget - lineup_cost, now()
  ) ON CONFLICT (test_session_id, user_id) DO UPDATE SET
    status = 'draft',
    captain_player_id = EXCLUDED.captain_player_id,
    top_scorer_player_id = EXCLUDED.top_scorer_player_id,
    top_assist_player_id = EXCLUDED.top_assist_player_id,
    top_team_id = EXCLUDED.top_team_id,
    budget_before = EXCLUDED.budget_before,
    lineup_cost = EXCLUDED.lineup_cost,
    cash_remaining = EXCLUDED.cash_remaining,
    budget_after = NULL,
    player_points = 0,
    prediction_points = 0,
    total_points = 0,
    round_position = NULL,
    locked_at = NULL,
    updated_at = now()
  RETURNING id INTO saved_lineup_id;

  DELETE FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = saved_lineup_id;
  INSERT INTO public.fantasy_test_lineup_players (lineup_id, player_id, price_locked)
  SELECT saved_lineup_id, selected.id, player_price
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id);

  INSERT INTO public.fantasy_audit_log (league_id, user_id, action, payload)
  VALUES (
    test_session.league_id,
    v_current_user_id,
    'test_lineup_saved',
    jsonb_build_object(
      'test_session_id', test_session.id,
      'players', unique_count,
      'cost', lineup_cost
    )
  );

  RETURN saved_lineup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;

