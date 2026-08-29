-- Corrige a ambiguidade de 'lineup.id' na funcao reconcile_fantasy_protection_cards e reconcile_fantasy_official_predictions
-- Ocorre quando uma variavel de PL/pgSQL tem o mesmo nome do alias da tabela no UPDATE ... FROM

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
      SELECT l.id,
        CASE WHEN top_goals > 0 AND EXISTS (SELECT 1 FROM public.player_round_stats stat JOIN public.players player ON player.id=stat.player_id WHERE stat.round_id=p_round_id AND stat.player_id=l.top_scorer_player_id AND stat.goals=top_goals AND player.member_category='player' AND player.is_selectable) THEN COALESCE((l.predictions_snapshot->'topScorer'->>'reward')::NUMERIC,0) ELSE 0 END scorer,
        CASE WHEN top_assists > 0 AND EXISTS (SELECT 1 FROM public.player_round_stats stat JOIN public.players player ON player.id=stat.player_id WHERE stat.round_id=p_round_id AND stat.player_id=l.top_assist_player_id AND stat.assists=top_assists AND player.member_category='player' AND player.is_selectable) THEN COALESCE((l.predictions_snapshot->'topAssist'->>'reward')::NUMERIC,0) ELSE 0 END assist,
        COALESCE((l.score_breakdown->>'challenge')::NUMERIC,0) challenge
      FROM public.fantasy_test_lineups l WHERE l.test_session_id=container_id AND l.status='scored'
    ) UPDATE public.fantasy_test_lineups target_l SET prediction_points=calculated.scorer+calculated.assist+calculated.challenge,
      total_points=target_l.player_points+calculated.scorer+calculated.assist+calculated.challenge,
      score_breakdown=COALESCE(target_l.score_breakdown,'{}'::JSONB)||jsonb_build_object('topScorer',calculated.scorer,'topAssist',calculated.assist)
    FROM calculated WHERE target_l.id=calculated.id;
    WITH ranked AS (
      SELECT l.id, rank() OVER (ORDER BY l.total_points DESC) AS position
      FROM public.fantasy_test_lineups l WHERE l.test_session_id=container_id AND l.status='scored'
    ) UPDATE public.fantasy_test_lineups target_l SET round_position=ranked.position
      FROM ranked WHERE target_l.id=ranked.id;
  ELSE
    SELECT id INTO container_id FROM public.fantasy_rounds WHERE round_id = p_round_id;
    WITH calculated AS (
      SELECT l.id,
        CASE WHEN top_goals > 0 AND EXISTS (SELECT 1 FROM public.player_round_stats stat JOIN public.players player ON player.id=stat.player_id WHERE stat.round_id=p_round_id AND stat.player_id=l.top_scorer_player_id AND stat.goals=top_goals AND player.member_category='player' AND player.is_selectable) THEN COALESCE((l.predictions_snapshot->'topScorer'->>'reward')::NUMERIC,0) ELSE 0 END scorer,
        CASE WHEN top_assists > 0 AND EXISTS (SELECT 1 FROM public.player_round_stats stat JOIN public.players player ON player.id=stat.player_id WHERE stat.round_id=p_round_id AND stat.player_id=l.top_assist_player_id AND stat.assists=top_assists AND player.member_category='player' AND player.is_selectable) THEN COALESCE((l.predictions_snapshot->'topAssist'->>'reward')::NUMERIC,0) ELSE 0 END assist,
        COALESCE((l.score_breakdown->>'challenge')::NUMERIC,0) challenge
      FROM public.fantasy_lineups l WHERE l.fantasy_round_id=container_id AND l.status='scored'
    ) UPDATE public.fantasy_lineups target_l SET prediction_points=calculated.scorer+calculated.assist+calculated.challenge,
      total_points=target_l.player_points+calculated.scorer+calculated.assist+calculated.challenge+COALESCE((target_l.score_breakdown->>'cardBonus')::NUMERIC,0),
      score_breakdown=COALESCE(target_l.score_breakdown,'{}'::JSONB)||jsonb_build_object('topScorer',calculated.scorer,'topAssist',calculated.assist)
    FROM calculated WHERE target_l.id=calculated.id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_fantasy_protection_cards(p_round_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fr public.fantasy_rounds%ROWTYPE;
  activation RECORD;
  v_lineup public.fantasy_lineups%ROWTYPE;
  target_id UUID;
  target_points NUMERIC;
  market_points NUMERIC;
  target_price NUMERIC;
  final_price NUMERIC;
  median_points NUMERIC;
  target_games INTEGER;
  target_rank INTEGER;
  top_rank_limit INTEGER;
  new_bonus NUMERIC;
  recovery NUMERIC;
  details TEXT;
  target_found BOOLEAN;
BEGIN
  SELECT * INTO v_fr FROM public.fantasy_rounds WHERE round_id=p_round_id;
  IF NOT FOUND THEN RETURN true; END IF;
  SELECT COALESCE(percentile_cont(.5) WITHIN GROUP (ORDER BY round_points),0) INTO median_points
  FROM public.fantasy_player_price_history WHERE fantasy_round_id=v_fr.id AND games>0;

  FOR activation IN SELECT item.*, card.slug FROM public.fantasy_card_activations item
    JOIN public.fantasy_cards card ON card.id=item.card_id
    WHERE item.round_id=p_round_id AND item.status='RESOLVED'
      AND card.slug IN ('samu_do_cartola','bagre_insurance','bagre_or_craque','bagre_value_shield')
    FOR UPDATE OF item
  LOOP
    SELECT * INTO v_lineup FROM public.fantasy_lineups WHERE fantasy_round_id=v_fr.id AND user_id=activation.user_id AND status='scored';
    IF NOT FOUND THEN CONTINUE; END IF;
    target_id := NULLIF(activation.target_snapshot->>'targetPlayerId','')::UUID;
    target_points:=0; market_points:=0; target_price:=0; final_price:=0; target_games:=0; target_rank:=NULL; target_found:=false;
    SELECT COALESCE(item.base_points,0), COALESCE(item.price_locked,0), COALESCE(item.price_after,item.price_locked,0)
    INTO target_points,target_price,final_price FROM public.fantasy_lineup_players item
    WHERE item.lineup_id=v_lineup.id AND item.player_id=target_id;
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
        budget_after=cash_remaining+COALESCE((SELECT sum(item.price_after) FROM public.fantasy_lineup_players item WHERE item.lineup_id=v_lineup.id),0),
        score_breakdown=COALESCE(score_breakdown,'{}'::JSONB)||jsonb_build_object(
          'cardBonus',0,'cardBudgetRecovery',0,'cardSlug',activation.slug,
          'cardDescription',CASE WHEN activation.slug='bagre_value_shield' THEN 'Jogador protegido não encontrado.' ELSE 'Jogador protegido não encontrado na escalação.' END
        )
      WHERE id=v_lineup.id;
      CONTINUE;
    END IF;
    target_points:=COALESCE(target_points,0); target_price:=COALESCE(target_price,0); final_price:=COALESCE(final_price,target_price);
    SELECT COALESCE(history.round_points,0),COALESCE(history.games,0) INTO market_points,target_games FROM public.fantasy_player_price_history history
    WHERE history.fantasy_round_id=v_fr.id AND history.player_id=target_id;
    market_points:=COALESCE(market_points,0); target_games:=COALESCE(target_games,0);
    SELECT 1+count(*) INTO target_rank FROM public.fantasy_player_price_history history
    WHERE history.fantasy_round_id=v_fr.id AND history.round_points>market_points;
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
      budget_after=cash_remaining+COALESCE((SELECT sum(item.price_after) FROM public.fantasy_lineup_players item WHERE item.lineup_id=v_lineup.id),0)+recovery,
      score_breakdown=COALESCE(score_breakdown,'{}'::JSONB)||jsonb_build_object('cardBonus',new_bonus,'cardBudgetRecovery',recovery,'cardSlug',activation.slug,'cardDescription',details)
    WHERE id=v_lineup.id;
  END LOOP;

  WITH ranked AS (
    SELECT l.id, rank() OVER (ORDER BY l.total_points DESC) AS position
    FROM public.fantasy_lineups l WHERE l.fantasy_round_id=v_fr.id AND l.status='scored'
  ) UPDATE public.fantasy_lineups target_l SET round_position=ranked.position
    FROM ranked WHERE target_l.id=ranked.id;

  UPDATE public.fantasy_accounts account SET current_budget=latest.budget_after,total_points=totals.total_points,
    rounds_played=totals.rounds_played,best_round_points=totals.best_round,updated_at=now()
  FROM (SELECT DISTINCT ON (l.user_id) l.user_id,l.budget_after FROM public.fantasy_lineups l
    JOIN public.fantasy_rounds round_data ON round_data.id=l.fantasy_round_id JOIN public.rounds round_item ON round_item.id=round_data.round_id
    WHERE round_data.fantasy_season_id=v_fr.fantasy_season_id AND l.status='scored' ORDER BY l.user_id,round_item.date DESC,round_item.number DESC) latest
  JOIN (SELECT l.user_id,sum(l.total_points) total_points,count(*)::INTEGER rounds_played,max(l.total_points) best_round
    FROM public.fantasy_lineups l JOIN public.fantasy_rounds round_data ON round_data.id=l.fantasy_round_id
    WHERE round_data.fantasy_season_id=v_fr.fantasy_season_id AND l.status='scored' GROUP BY l.user_id) totals ON totals.user_id=latest.user_id
  WHERE account.fantasy_season_id=v_fr.fantasy_season_id AND account.user_id=latest.user_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_fantasy_official_predictions(UUID,BOOLEAN), public.reconcile_fantasy_protection_cards(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_fantasy_official_predictions(UUID,BOOLEAN), public.reconcile_fantasy_protection_cards(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
