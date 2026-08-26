-- Integridade competitiva e acabamento dos fluxos introduzidos nas migrations 077-082.

-- A delecao e a reinsercao precisam ser comandos separados. Em um unico CTE, o
-- trigger de capacidade ainda enxerga o snapshot anterior e considera o time cheio.
CREATE OR REPLACE FUNCTION public.shuffle_round_teams(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  team_count INTEGER;
  player_count INTEGER;
  assignments JSONB;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem misturar os times.';
  END IF;

  PERFORM 1 FROM public.rounds round_item
  WHERE round_item.id = p_round_id AND round_item.status <> 'finished'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada não encontrada ou já encerrada.'; END IF;

  IF EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND status = 'live') THEN
    RAISE EXCEPTION 'Encerre a partida ao vivo antes de misturar os times.';
  END IF;

  SELECT count(*) INTO team_count FROM public.teams WHERE round_id = p_round_id;
  SELECT count(*) INTO player_count
  FROM public.team_players item JOIN public.teams team ON team.id = item.team_id
  WHERE team.round_id = p_round_id;
  IF team_count < 2 OR player_count < team_count * 2 THEN
    RAISE EXCEPTION 'São necessários pelo menos dois times completos para fazer uma nova mistura.';
  END IF;

  WITH team_sizes AS (
    SELECT team.id AS team_id, team.position, count(item.player_id)::INTEGER AS player_count
    FROM public.teams team
    LEFT JOIN public.team_players item ON item.team_id = team.id
    WHERE team.round_id = p_round_id
    GROUP BY team.id, team.position
  ), randomized AS (
    SELECT item.player_id, row_number() OVER (ORDER BY random(), item.player_id)::INTEGER AS slot_number
    FROM public.team_players item JOIN public.teams team ON team.id = item.team_id
    WHERE team.round_id = p_round_id
  ), slots AS (
    SELECT size.team_id,
      row_number() OVER (ORDER BY size.position, generated.slot_order)::INTEGER AS slot_number
    FROM team_sizes size
    CROSS JOIN LATERAL generate_series(1, size.player_count) generated(slot_order)
  ), paired AS (
    SELECT slots.team_id, randomized.player_id,
      row_number() OVER (PARTITION BY slots.team_id ORDER BY random(), randomized.player_id)::INTEGER AS goalkeeper_order
    FROM slots JOIN randomized USING (slot_number)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'team_id', team_id, 'player_id', player_id, 'goalkeeper_order', goalkeeper_order
  )), '[]'::JSONB) INTO assignments FROM paired;

  DELETE FROM public.team_players item
  USING public.teams team
  WHERE item.team_id = team.id AND team.round_id = p_round_id;

  INSERT INTO public.team_players (team_id, player_id, goalkeeper_order)
  SELECT row_item.team_id, row_item.player_id, row_item.goalkeeper_order
  FROM jsonb_to_recordset(assignments) AS row_item(team_id UUID, player_id UUID, goalkeeper_order INTEGER);

  UPDATE public.teams SET captain_player_id = NULL WHERE round_id = p_round_id;
  UPDATE public.rounds
  SET notes = concat_ws(E'\n', NULLIF(notes, ''), 'Times misturados pelo administrador em ' || to_char(now(), 'DD/MM HH24:MI'))
  WHERE id = p_round_id;
  RETURN true;
END;
$$;

-- Resgates repetidos da mesma escolha sao sucesso idempotente. Uma tentativa de
-- trocar a escolha permanente recebe uma mensagem de dominio, nunca erro de PK.
CREATE OR REPLACE FUNCTION public.claim_fantasy_pass_cosmetic(p_reward_id UUID, p_cosmetic_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_progress INTEGER;
  previous_choice UUID;
BEGIN
  SELECT pass.progress INTO user_progress
  FROM public.fantasy_season_passes pass
  JOIN public.fantasy_season_pass_rewards reward ON reward.fantasy_season_id = pass.fantasy_season_id
  WHERE reward.id = p_reward_id AND pass.user_id = auth.uid();
  IF user_progress IS NULL OR user_progress < (SELECT house FROM public.fantasy_season_pass_rewards WHERE id = p_reward_id) THEN
    RAISE EXCEPTION 'Recompensa ainda não desbloqueada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fantasy_season_pass_reward_options
    WHERE reward_id = p_reward_id AND cosmetic_id = p_cosmetic_id
  ) THEN RAISE EXCEPTION 'Escolha inválida.'; END IF;

  SELECT cosmetic_id INTO previous_choice
  FROM public.fantasy_user_cosmetic_reward_choices
  WHERE user_id = auth.uid() AND reward_id = p_reward_id
  FOR UPDATE;
  IF previous_choice IS NOT NULL AND previous_choice <> p_cosmetic_id THEN
    RAISE EXCEPTION 'Esta recompensa já teve uma escolha permanente.';
  END IF;

  INSERT INTO public.fantasy_user_cosmetic_reward_choices (user_id, reward_id, cosmetic_id)
  VALUES (auth.uid(), p_reward_id, p_cosmetic_id)
  ON CONFLICT (user_id, reward_id) DO NOTHING;
  INSERT INTO public.fantasy_user_cosmetics (user_id, cosmetic_id, source_reward_id)
  VALUES (auth.uid(), p_cosmetic_id, p_reward_id)
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

ALTER TABLE public.fantasy_round_packs DROP CONSTRAINT IF EXISTS fantasy_round_packs_status_check;
ALTER TABLE public.fantasy_round_packs ADD CONSTRAINT fantasy_round_packs_status_check
  CHECK (status IN ('available', 'opened', 'claimed', 'dismissed'));

CREATE OR REPLACE FUNCTION public.dismiss_my_unopened_bronze_pass_pack()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem usar a limpeza de testes.'; END IF;
  UPDATE public.fantasy_round_packs
  SET status = 'dismissed'
  WHERE user_id = auth.uid() AND source = 'season_pass' AND card_tier = 'bronze' AND status = 'available';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_my_cosmetics_preview()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem usar a limpeza de testes.'; END IF;
  UPDATE public.fantasy_user_cosmetic_loadouts loadout SET
    banner_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.banner_cosmetic_id AND own.source_reward_id IS NULL) THEN NULL ELSE banner_cosmetic_id END,
    frame_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.frame_cosmetic_id AND own.source_reward_id IS NULL) THEN NULL ELSE frame_cosmetic_id END,
    title_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.title_cosmetic_id AND own.source_reward_id IS NULL) THEN NULL ELSE title_cosmetic_id END,
    aura_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.aura_cosmetic_id AND own.source_reward_id IS NULL) THEN NULL ELSE aura_cosmetic_id END,
    nameplate_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.nameplate_cosmetic_id AND own.source_reward_id IS NULL) THEN NULL ELSE nameplate_cosmetic_id END,
    background_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.background_cosmetic_id AND own.source_reward_id IS NULL) THEN NULL ELSE background_cosmetic_id END,
    updated_at = now()
  WHERE loadout.user_id = auth.uid();
  DELETE FROM public.fantasy_user_cosmetics WHERE user_id = auth.uid() AND source_reward_id IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

-- Defesa em profundidade para escalação e palpites: o cliente nunca e a unica
-- barreira contra convidados ou perfis inativos.
CREATE OR REPLACE FUNCTION public.save_fantasy_lineup(
  p_round_id UUID, p_player_ids UUID[], p_captain_player_id UUID DEFAULT NULL,
  p_top_scorer_player_id UUID DEFAULT NULL, p_top_assist_player_id UUID DEFAULT NULL,
  p_challenge_player_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_fantasy_season_id UUID; max_lineup_players INTEGER := 5;
  available_budget NUMERIC(10,2); calculated_lineup_cost NUMERIC(10,2);
  official_count INTEGER; saved_lineup_id UUID;
BEGIN
  SELECT fantasy_round.fantasy_season_id, COALESCE(league.players_per_team, 5)
  INTO target_fantasy_season_id, max_lineup_players
  FROM public.fantasy_rounds fantasy_round
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  JOIN public.leagues league ON league.id = season.league_id
  WHERE fantasy_round.round_id = p_round_id;

  SELECT count(*) INTO official_count FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.member_category = 'player' AND player.is_selectable = true;
  IF official_count <> COALESCE(cardinality(p_player_ids), 0) THEN
    RAISE EXCEPTION 'O mercado do Cartola aceita somente jogadores com perfil oficial ativo.';
  END IF;
  IF p_captain_player_id IS NOT NULL AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))) THEN
    RAISE EXCEPTION 'O capitão precisa estar na escalação.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[p_top_scorer_player_id, p_top_assist_player_id, p_challenge_player_id]) chosen(player_id)
    LEFT JOIN public.players player ON player.id = chosen.player_id
    WHERE chosen.player_id IS NOT NULL AND (player.id IS NULL OR player.member_category <> 'player' OR NOT player.is_selectable)
  ) THEN RAISE EXCEPTION 'Os palpites do Cartola aceitam somente jogadores com perfil oficial ativo.'; END IF;

  SELECT GREATEST(COALESCE(account.current_budget, 0), max_lineup_players * 11.00)
  INTO available_budget FROM public.fantasy_accounts account
  WHERE account.fantasy_season_id = target_fantasy_season_id AND account.user_id = auth.uid();
  available_budget := COALESCE(available_budget, max_lineup_players * 11.00);
  SELECT COALESCE(sum(COALESCE(price.current_price, season_item.initial_player_price)), 0)
  INTO calculated_lineup_cost
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(player_id)
  JOIN public.fantasy_seasons season_item ON season_item.id = target_fantasy_season_id
  LEFT JOIN public.fantasy_player_prices price ON price.fantasy_season_id = season_item.id AND price.player_id = selected.player_id;
  IF calculated_lineup_cost > available_budget THEN RAISE EXCEPTION 'A escalação ultrapassa o patrimônio disponível.'; END IF;

  saved_lineup_id := public.save_fantasy_lineup_pre_official_market_072(
    p_round_id, p_player_ids, p_captain_player_id, p_top_scorer_player_id, p_top_assist_player_id, p_challenge_player_id
  );
  UPDATE public.fantasy_lineups lineup SET budget_before = available_budget,
    cash_remaining = available_budget - calculated_lineup_cost WHERE lineup.id = saved_lineup_id;
  RETURN saved_lineup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_fantasy_test_lineup(
  p_round_id UUID, p_player_ids UUID[], p_captain_player_id UUID DEFAULT NULL,
  p_top_scorer_player_id UUID DEFAULT NULL, p_top_assist_player_id UUID DEFAULT NULL,
  p_challenge_player_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE official_count INTEGER;
BEGIN
  SELECT count(*) INTO official_count FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.member_category='player' AND player.is_selectable=true;
  IF official_count <> COALESCE(cardinality(p_player_ids),0) THEN
    RAISE EXCEPTION 'O mercado do Cartola aceita somente jogadores com perfil oficial ativo.';
  END IF;
  IF p_captain_player_id IS NOT NULL AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids,ARRAY[]::UUID[]))) THEN
    RAISE EXCEPTION 'O capitão precisa estar na escalação.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[p_top_scorer_player_id,p_top_assist_player_id,p_challenge_player_id]) chosen(player_id)
    LEFT JOIN public.players player ON player.id=chosen.player_id
    WHERE chosen.player_id IS NOT NULL AND (player.id IS NULL OR player.member_category<>'player' OR NOT player.is_selectable)
  ) THEN RAISE EXCEPTION 'Os palpites do Cartola aceitam somente jogadores com perfil oficial ativo.'; END IF;
  RETURN public.save_fantasy_test_lineup_pre_official_market_072(
    p_round_id,p_player_ids,p_captain_player_id,p_top_scorer_player_id,p_top_assist_player_id,p_challenge_player_id
  );
END;
$$;

-- Recalcula artilheiro e garcom usando apenas o universo que realmente participa
-- do Cartola. O desafio continua com seu snapshot proprio.
CREATE OR REPLACE FUNCTION public.reconcile_fantasy_official_predictions(p_round_id UUID, p_is_test BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE container_id UUID; top_goals INTEGER; top_assists INTEGER;
BEGIN
  SELECT max(stat.goals), max(stat.assists) INTO top_goals, top_assists
  FROM public.player_round_stats stat JOIN public.players player ON player.id = stat.player_id
  WHERE stat.round_id = p_round_id AND player.member_category = 'player' AND player.is_selectable = true;
  top_goals := COALESCE(top_goals, 0); top_assists := COALESCE(top_assists, 0);

  IF p_is_test THEN
    SELECT id INTO container_id FROM public.fantasy_test_sessions WHERE round_id = p_round_id;
    WITH calculated AS (
      SELECT lineup.id,
        CASE WHEN top_goals > 0 AND EXISTS (SELECT 1 FROM public.player_round_stats stat JOIN public.players player ON player.id=stat.player_id WHERE stat.round_id=p_round_id AND stat.player_id=lineup.top_scorer_player_id AND stat.goals=top_goals AND player.member_category='player' AND player.is_selectable) THEN COALESCE((lineup.predictions_snapshot->'topScorer'->>'reward')::NUMERIC,0) ELSE 0 END scorer,
        CASE WHEN top_assists > 0 AND EXISTS (SELECT 1 FROM public.player_round_stats stat JOIN public.players player ON player.id=stat.player_id WHERE stat.round_id=p_round_id AND stat.player_id=lineup.top_assist_player_id AND stat.assists=top_assists AND player.member_category='player' AND player.is_selectable) THEN COALESCE((lineup.predictions_snapshot->'topAssist'->>'reward')::NUMERIC,0) ELSE 0 END assist,
        COALESCE((lineup.score_breakdown->>'challenge')::NUMERIC,0) challenge
      FROM public.fantasy_test_lineups lineup WHERE lineup.test_session_id=container_id AND lineup.status='scored'
    ) UPDATE public.fantasy_test_lineups lineup SET prediction_points=calculated.scorer+calculated.assist+calculated.challenge,
      total_points=lineup.player_points+calculated.scorer+calculated.assist+calculated.challenge,
      score_breakdown=COALESCE(lineup.score_breakdown,'{}'::JSONB)||jsonb_build_object('topScorer',calculated.scorer,'topAssist',calculated.assist)
    FROM calculated WHERE lineup.id=calculated.id;
    WITH ranked AS (
      SELECT id, rank() OVER (ORDER BY total_points DESC) AS position
      FROM public.fantasy_test_lineups WHERE test_session_id=container_id AND status='scored'
    ) UPDATE public.fantasy_test_lineups lineup SET round_position=ranked.position
      FROM ranked WHERE lineup.id=ranked.id;
  ELSE
    SELECT id INTO container_id FROM public.fantasy_rounds WHERE round_id = p_round_id;
    WITH calculated AS (
      SELECT lineup.id,
        CASE WHEN top_goals > 0 AND EXISTS (SELECT 1 FROM public.player_round_stats stat JOIN public.players player ON player.id=stat.player_id WHERE stat.round_id=p_round_id AND stat.player_id=lineup.top_scorer_player_id AND stat.goals=top_goals AND player.member_category='player' AND player.is_selectable) THEN COALESCE((lineup.predictions_snapshot->'topScorer'->>'reward')::NUMERIC,0) ELSE 0 END scorer,
        CASE WHEN top_assists > 0 AND EXISTS (SELECT 1 FROM public.player_round_stats stat JOIN public.players player ON player.id=stat.player_id WHERE stat.round_id=p_round_id AND stat.player_id=lineup.top_assist_player_id AND stat.assists=top_assists AND player.member_category='player' AND player.is_selectable) THEN COALESCE((lineup.predictions_snapshot->'topAssist'->>'reward')::NUMERIC,0) ELSE 0 END assist,
        COALESCE((lineup.score_breakdown->>'challenge')::NUMERIC,0) challenge
      FROM public.fantasy_lineups lineup WHERE lineup.fantasy_round_id=container_id AND lineup.status='scored'
    ) UPDATE public.fantasy_lineups lineup SET prediction_points=calculated.scorer+calculated.assist+calculated.challenge,
      total_points=lineup.player_points+calculated.scorer+calculated.assist+calculated.challenge+COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC,0),
      score_breakdown=COALESCE(lineup.score_breakdown,'{}'::JSONB)||jsonb_build_object('topScorer',calculated.scorer,'topAssist',calculated.assist)
    FROM calculated WHERE lineup.id=calculated.id;
  END IF;
  RETURN true;
END;
$$;

-- As cartas de protecao dependem da pontuacao e do preco finais da v074.
CREATE OR REPLACE FUNCTION public.reconcile_fantasy_protection_cards(p_round_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fr public.fantasy_rounds%ROWTYPE; activation RECORD; lineup public.fantasy_lineups%ROWTYPE;
  target_id UUID; target_points NUMERIC; market_points NUMERIC; target_price NUMERIC; final_price NUMERIC;
  median_points NUMERIC; target_games INTEGER; target_rank INTEGER; top_rank_limit INTEGER; new_bonus NUMERIC; recovery NUMERIC;
  details TEXT; target_found BOOLEAN;
BEGIN
  SELECT * INTO fr FROM public.fantasy_rounds WHERE round_id=p_round_id;
  IF NOT FOUND THEN RETURN true; END IF;
  SELECT COALESCE(percentile_cont(.5) WITHIN GROUP (ORDER BY round_points),0) INTO median_points
  FROM public.fantasy_player_price_history WHERE fantasy_round_id=fr.id AND games>0;

  FOR activation IN SELECT item.*, card.slug FROM public.fantasy_card_activations item
    JOIN public.fantasy_cards card ON card.id=item.card_id
    WHERE item.round_id=p_round_id AND item.status='RESOLVED'
      AND card.slug IN ('samu_do_cartola','bagre_insurance','bagre_or_craque','bagre_value_shield')
    FOR UPDATE OF item
  LOOP
    SELECT * INTO lineup FROM public.fantasy_lineups WHERE fantasy_round_id=fr.id AND user_id=activation.user_id AND status='scored';
    IF NOT FOUND THEN CONTINUE; END IF;
    target_id := NULLIF(activation.target_snapshot->>'targetPlayerId','')::UUID;
    target_points:=0; market_points:=0; target_price:=0; final_price:=0; target_games:=0; target_rank:=NULL; target_found:=false;
    SELECT COALESCE(item.base_points,0), COALESCE(item.price_locked,0), COALESCE(item.price_after,item.price_locked,0)
    INTO target_points,target_price,final_price FROM public.fantasy_lineup_players item
    WHERE item.lineup_id=lineup.id AND item.player_id=target_id;
    target_found:=FOUND;
    IF NOT target_found THEN
      UPDATE public.fantasy_card_activations SET result_bonus=0,
        result_details=jsonb_build_object(
          'applied',false,
          'description',CASE WHEN activation.slug='bagre_value_shield' THEN 'Jogador protegido não encontrado.' ELSE 'Jogador protegido não encontrado na escalação.' END,
          'budgetRecovery',0
        ),resolved_at=now()
      WHERE id=activation.id;
      UPDATE public.fantasy_lineups SET
        total_points=player_points+prediction_points,
        budget_after=cash_remaining+COALESCE((SELECT sum(item.price_after) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0),
        score_breakdown=COALESCE(score_breakdown,'{}'::JSONB)||jsonb_build_object(
          'cardBonus',0,'cardBudgetRecovery',0,'cardSlug',activation.slug,
          'cardDescription',CASE WHEN activation.slug='bagre_value_shield' THEN 'Jogador protegido não encontrado.' ELSE 'Jogador protegido não encontrado na escalação.' END
        )
      WHERE id=lineup.id;
      CONTINUE;
    END IF;
    target_points:=COALESCE(target_points,0); target_price:=COALESCE(target_price,0); final_price:=COALESCE(final_price,target_price);
    SELECT COALESCE(history.round_points,0),COALESCE(history.games,0) INTO market_points,target_games FROM public.fantasy_player_price_history history
    WHERE history.fantasy_round_id=fr.id AND history.player_id=target_id;
    market_points:=COALESCE(market_points,0); target_games:=COALESCE(target_games,0);
    SELECT 1+count(*) INTO target_rank FROM public.fantasy_player_price_history history
    WHERE history.fantasy_round_id=fr.id AND history.round_points>market_points;
    new_bonus:=0; recovery:=0;
    IF activation.slug='samu_do_cartola' THEN
      new_bonus:=greatest(0,-target_points);
      details:=CASE WHEN new_bonus>0
        THEN format('Samu do Cartola: pontuação negativa ajustada para 0 (+%s pts).',to_char(new_bonus,'FM999999990.0'))
        ELSE 'O jogador não terminou com pontuação negativa.' END;
    ELSIF activation.slug='bagre_insurance' THEN
      IF target_points<0 THEN
        new_bonus:=-target_points;
        details:=format('Seguro contra Bagres: pontuação negativa ajustada para 0 (+%s pts).',to_char(new_bonus,'FM999999990.0'));
      ELSIF market_points>0 AND market_points<median_points THEN
        new_bonus:=COALESCE((activation.effect_snapshot->'effectConfig'->>'belowMedianBonus')::NUMERIC,2);
        details:=format('Seguro contra Bagres: pontuação positiva abaixo da mediana (+%s pts).',to_char(new_bonus,'FM999999990.0'));
      ELSE details:='Seguro contra Bagres não foi acionado.';
      END IF;
    ELSIF activation.slug='bagre_or_craque' THEN
      top_rank_limit:=COALESCE((activation.effect_snapshot->'effectConfig'->>'topRank')::INTEGER,5);
      IF target_points<0 THEN
        new_bonus:=-target_points;
        details:=format('Bagre ou Craque?: pontuação negativa ajustada para 0 (+%s pts).',to_char(new_bonus,'FM999999990.0'));
      ELSIF target_games>0 AND target_rank<=top_rank_limit THEN
        new_bonus:=COALESCE((activation.effect_snapshot->'effectConfig'->>'topBonus')::NUMERIC,5);
        details:=format('Bagre ou Craque?: jogador terminou em %sº (+%s pts).',target_rank,to_char(new_bonus,'FM999999990.0'));
      ELSE details:='Bagre ou Craque? não foi acionada.';
      END IF;
    ELSE
      recovery:=least(COALESCE((activation.effect_snapshot->'effectConfig'->>'maxRecovery')::NUMERIC,2),greatest(0,target_price-final_price));
      details:=CASE WHEN recovery>0
        THEN format('Fundo Garantidor recuperou C$%s da desvalorização.',to_char(recovery,'FM999999990.00'))
        ELSE 'O jogador protegido não desvalorizou.' END;
    END IF;
    UPDATE public.fantasy_card_activations SET result_bonus=new_bonus,
      result_details=jsonb_build_object('applied',new_bonus>0 OR recovery>0,'description',details,'budgetRecovery',recovery),resolved_at=now()
    WHERE id=activation.id;
    UPDATE public.fantasy_lineups SET
      total_points=player_points+prediction_points+new_bonus,
      budget_after=cash_remaining+COALESCE((SELECT sum(item.price_after) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0)+recovery,
      score_breakdown=COALESCE(score_breakdown,'{}'::JSONB)||jsonb_build_object('cardBonus',new_bonus,'cardBudgetRecovery',recovery,'cardSlug',activation.slug,'cardDescription',details)
    WHERE id=lineup.id;
  END LOOP;

  WITH ranked AS (
    SELECT id, rank() OVER (ORDER BY total_points DESC) AS position
    FROM public.fantasy_lineups WHERE fantasy_round_id=fr.id AND status='scored'
  ) UPDATE public.fantasy_lineups lineup SET round_position=ranked.position
    FROM ranked WHERE lineup.id=ranked.id;

  UPDATE public.fantasy_accounts account SET current_budget=latest.budget_after,total_points=totals.total_points,
    rounds_played=totals.rounds_played,best_round_points=totals.best_round,updated_at=now()
  FROM (SELECT DISTINCT ON (lineup.user_id) lineup.user_id,lineup.budget_after FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds round_data ON round_data.id=lineup.fantasy_round_id JOIN public.rounds round_item ON round_item.id=round_data.round_id
    WHERE round_data.fantasy_season_id=fr.fantasy_season_id AND lineup.status='scored' ORDER BY lineup.user_id,round_item.date DESC,round_item.number DESC) latest
  JOIN (SELECT lineup.user_id,sum(lineup.total_points) total_points,count(*)::INTEGER rounds_played,max(lineup.total_points) best_round
    FROM public.fantasy_lineups lineup JOIN public.fantasy_rounds round_data ON round_data.id=lineup.fantasy_round_id
    WHERE round_data.fantasy_season_id=fr.fantasy_season_id AND lineup.status='scored' GROUP BY lineup.user_id) totals ON totals.user_id=latest.user_id
  WHERE account.fantasy_season_id=fr.fantasy_season_id AND account.user_id=latest.user_id;
  RETURN true;
END;
$$;

DO $$ BEGIN
  IF to_regprocedure('public.process_fantasy_round_pre_integrity_083(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_round(UUID) RENAME TO process_fantasy_round_pre_integrity_083;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.process_fantasy_round_pre_integrity_083(p_round_id);
  PERFORM public.reconcile_fantasy_official_predictions(p_round_id,false);
  PERFORM public.reconcile_fantasy_protection_cards(p_round_id);
  RETURN true;
END; $$;

DO $$ BEGIN
  IF to_regprocedure('public.process_fantasy_test_round_pre_integrity_083(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_test_round(UUID) RENAME TO process_fantasy_test_round_pre_integrity_083;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.process_fantasy_test_round(p_round_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.process_fantasy_test_round_pre_integrity_083(p_round_id);
  PERFORM public.reconcile_fantasy_official_predictions(p_round_id,true);
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.shuffle_round_teams(UUID), public.claim_fantasy_pass_cosmetic(UUID,UUID),
  public.dismiss_my_unopened_bronze_pass_pack(), public.cleanup_my_cosmetics_preview(),
  public.reconcile_fantasy_official_predictions(UUID,BOOLEAN), public.reconcile_fantasy_protection_cards(UUID),
  public.process_fantasy_round_pre_integrity_083(UUID), public.process_fantasy_test_round_pre_integrity_083(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shuffle_round_teams(UUID), public.claim_fantasy_pass_cosmetic(UUID,UUID),
  public.dismiss_my_unopened_bronze_pass_pack(), public.cleanup_my_cosmetics_preview(),
  public.save_fantasy_lineup(UUID,UUID[],UUID,UUID,UUID,UUID),
  public.save_fantasy_test_lineup(UUID,UUID[],UUID,UUID,UUID,UUID),
  public.process_fantasy_round(UUID), public.process_fantasy_test_round(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
