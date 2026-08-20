-- Cartola V3.2: catálogo completo de cartas e resolução de todos os efeitos.

INSERT INTO public.fantasy_cards
  (slug, name, description, rarity, effect_type, effect_config, enabled, image_url)
VALUES
  ('super_captain', 'Super Capitão', 'Seu capitão passa de 2x para 3x. Bônus adicional limitado a +8 pontos.', 'LEGENDARY', 'CAPTAIN_MULTIPLIER', '{"multiplier":3,"maxBonus":8}', true, '/images/cards/super_captain.jpg'),
  ('extra_credit', 'Crédito Extra', '+C$5,00 temporários para montar seu elenco nesta rodada.', 'COMMON', 'BUDGET_BONUS', '{"bonus":5}', true, '/images/cards/extra_credit.png'),
  ('double_prediction', 'Palpite Duplo', 'Acerte um palpite de gol e outro de assistência para ganhar +6 pontos.', 'RARE', 'PREDICTION_MULTIPLIER', '{"bonus":6}', true, '/images/cards/double_prediction.jpg'),
  ('bargain', 'Barganha', '20% de desconto no preço de um jogador escalado para fins de orçamento.', 'COMMON', 'PLAYER_DISCOUNT', '{"discountPercent":20}', true, '/images/cards/bargain.png'),
  ('vice_captain', 'Vice-Capitão', 'Se o Vice superar o Capitão em pontos-base, assume a braçadeira e o 2x. Bônus líquido limitado a +8.', 'EPIC', 'VICE_CAPTAIN', '{"maxBonus":8}', true, '/images/cards/vice_captain.jpg'),
  ('golden_goal', 'Gol de Ouro', 'Se o jogador marcar 1 ou mais gols, ganhe +3 pontos.', 'COMMON', 'CONDITIONAL_PLAYER_BONUS', '{"metric":"goals","threshold":1,"bonus":3}', true, '/images/cards/golden_goal.jpg'),
  ('golden_assist', 'Passe de Ouro', 'Se o jogador der 1 ou mais assistências, ganhe +3 pontos.', 'COMMON', 'CONDITIONAL_PLAYER_BONUS', '{"metric":"assists","threshold":1,"bonus":3}', true, '/images/cards/golden_assist.jpg'),
  ('scout', 'Caça-Talentos', 'Ganhe 50% dos pontos-base, limitado a +6, de atleta abaixo da mediana de preço.', 'EPIC', 'CONDITIONAL_PLAYER_BONUS', '{"percentage":0.5,"maxBonus":6,"belowMedianPrice":true}', true, '/images/cards/scout.jpg'),
  ('duo', 'Dobradinha', 'Se os dois escolhidos ficarem acima da média da rodada, ganhe +5 pontos.', 'RARE', 'CONDITIONAL_DUO_BONUS', '{"bonus":5,"aboveRoundAverage":true}', true, '/images/cards/duo.jpg'),
  ('all_in', 'All-In', 'Escolha um dos 50% mais baratos. Se terminar no TOP 5, ganhe +6 pontos.', 'EPIC', 'CONDITIONAL_PLAYER_BONUS', '{"bonus":6,"cheapestPercentile":0.5,"topRank":5}', true, '/images/cards/all_in.jpg'),
  ('so_vim_pela_resenha', 'Só Vim Pela Resenha', 'Com 0 gols, 0 assistências e 2 ou mais vitórias, ganhe +3 pontos.', 'COMMON', 'CONDITIONAL_PLAYER_BONUS', '{"maxGoals":0,"maxAssists":0,"minWins":2,"bonus":3}', true, '/images/cards/so_vim_pela_resenha.jpg'),
  ('samu_do_cartola', 'Samu do Cartola', 'Se o escolhido terminar negativo, sua pontuação é ajustada para zero.', 'COMMON', 'PLAYER_SCORE_PROTECTION', '{"mode":"NEGATIVE_TO_ZERO"}', true, '/images/cards/samu_do_cartola.jpg'),
  ('tava_em_campo', 'Tava em Campo?', 'Se o escolhido for o menor pontuador-base da sua escalação, ganhe +2 pontos.', 'COMMON', 'CONDITIONAL_PLAYER_BONUS', '{"lineupRank":"LOWEST","bonus":2}', true, '/images/cards/tava_em_campo.jpg'),
  ('my_mvp', 'Craque do Meu Time', 'Se o escolhido for o maior pontuador-base da sua escalação, ganhe +4 pontos.', 'RARE', 'CONDITIONAL_PLAYER_BONUS', '{"lineupRank":"HIGHEST","bonus":4}', true, '/images/cards/my_mvp.jpg'),
  ('head_to_head', 'Duelo Direto', 'Supere em pontos-base o adversário sorteado pelo BQ e ganhe +5 pontos.', 'RARE', 'HEAD_TO_HEAD_BONUS', '{"bonus":5}', true, '/images/cards/head_to_head.jpg'),
  ('bagre_insurance', 'Seguro contra Bagres', 'Negativo vira zero; positivo abaixo da mediana recebe +2 pontos.', 'RARE', 'PLAYER_SCORE_PROTECTION', '{"mode":"NEGATIVE_OR_BELOW_MEDIAN","belowMedianBonus":2}', true, '/images/cards/bagre_insurance.jpg'),
  ('bagre_value_shield', 'Fundo Garantidor de Bagres', 'Recupere até C$2,00 da desvalorização do atleta escolhido.', 'RARE', 'PLAYER_VALUE_SHIELD', '{"maxRecovery":2}', true, '/images/cards/bagre_value_shield.jpg'),
  ('triple_crown', 'Tríplice Coroa', 'Com 1+ gol, 1+ assistência e 1+ vitória, ganhe +6 pontos.', 'EPIC', 'CONDITIONAL_PLAYER_BONUS', '{"minGoals":1,"minAssists":1,"minWins":1,"bonus":6}', true, '/images/cards/triple_crown.jpg'),
  ('bagre_or_craque', 'Bagre ou Craque?', 'Negativo vira zero; se terminar no TOP 5, ganhe +5 pontos.', 'EPIC', 'PLAYER_SCORE_PROTECTION', '{"mode":"NEGATIVE_OR_TOP_RANK","topRank":5,"topBonus":5}', true, '/images/cards/bagre_or_craque.jpg'),
  ('dream_team', 'Seleção dos Sonhos', 'Se os cinco escalados terminarem no TOP 8, ganhe +8 pontos.', 'LEGENDARY', 'LINEUP_CONDITION_BONUS', '{"allPlayersTopRank":8,"bonus":8}', true, '/images/cards/dream_team.jpg')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  rarity = EXCLUDED.rarity,
  effect_type = EXCLUDED.effect_type,
  effect_config = EXCLUDED.effect_config,
  enabled = EXCLUDED.enabled,
  image_url = EXCLUDED.image_url;

UPDATE public.fantasy_cards
SET enabled = false
WHERE slug IN ('safe_prediction', 'emergency_sub');

CREATE OR REPLACE FUNCTION public.apply_fantasy_card_activations(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fr public.fantasy_rounds%ROWTYPE;
  activation RECORD;
  lineup public.fantasy_lineups%ROWTYPE;
  target_one UUID;
  target_two UUID;
  slug TEXT;
  config JSONB;
  captain_base NUMERIC := 0;
  target_base NUMERIC := 0;
  target_two_base NUMERIC := 0;
  target_games INTEGER := 0;
  target_two_games INTEGER := 0;
  target_goals INTEGER := 0;
  target_assists INTEGER := 0;
  target_wins INTEGER := 0;
  target_price NUMERIC := 0;
  target_price_after NUMERIC := 0;
  market_min NUMERIC := 0;
  market_max NUMERIC := 0;
  market_median NUMERIC := 0;
  cheap_cutoff NUMERIC := 0;
  round_average NUMERIC := 0;
  round_median NUMERIC := 0;
  lineup_min NUMERIC := 0;
  lineup_max NUMERIC := 0;
  target_rank INTEGER := 999;
  bonus NUMERIC := 0;
  budget_recovery NUMERIC := 0;
  applied BOOLEAN := false;
  details TEXT := '';
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem processar cartas do Cartola.';
  END IF;

  SELECT * INTO fr FROM public.fantasy_rounds WHERE round_id = p_round_id;
  IF NOT FOUND THEN RETURN true; END IF;

  SELECT
    COALESCE(min(price_before), 0),
    COALESCE(max(price_before), 0),
    COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY price_before), 0),
    COALESCE(percentile_disc(0.5) WITHIN GROUP (ORDER BY price_before), 0),
    COALESCE(avg(round_points) FILTER (WHERE games > 0), 0),
    COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY round_points) FILTER (WHERE games > 0), 0)
  INTO market_min, market_max, market_median, cheap_cutoff, round_average, round_median
  FROM public.fantasy_player_price_history
  WHERE fantasy_round_id = fr.id;

  FOR activation IN
    SELECT a.*, c.slug AS card_slug
    FROM public.fantasy_card_activations a
    JOIN public.fantasy_cards c ON c.id = a.card_id
    WHERE a.round_id = p_round_id AND a.status IN ('RESERVED', 'LOCKED')
    FOR UPDATE OF a
  LOOP
    SELECT * INTO lineup
    FROM public.fantasy_lineups
    WHERE fantasy_round_id = fr.id AND user_id = activation.user_id AND status = 'scored';

    bonus := 0;
    budget_recovery := 0;
    applied := false;
    details := 'Escalação não encontrada para a rodada.';
    slug := activation.card_slug;
    config := COALESCE(activation.effect_snapshot->'effectConfig', '{}'::JSONB);
    target_one := NULLIF(activation.target_snapshot->>'targetPlayerId', '')::UUID;
    target_two := NULLIF(activation.target_snapshot->>'targetPlayer2Id', '')::UUID;
    captain_base := 0;
    target_base := 0;
    target_two_base := 0;
    target_games := 0;
    target_two_games := 0;
    target_goals := 0;
    target_assists := 0;
    target_wins := 0;
    target_price := 0;
    target_price_after := 0;
    target_rank := 999;

    IF FOUND THEN
      SELECT COALESCE(base_points, 0) INTO captain_base
      FROM public.fantasy_lineup_players
      WHERE lineup_id = lineup.id AND player_id = lineup.captain_player_id;
      captain_base := COALESCE(captain_base, 0);

      SELECT COALESCE(min(base_points), 0), COALESCE(max(base_points), 0)
      INTO lineup_min, lineup_max
      FROM public.fantasy_lineup_players WHERE lineup_id = lineup.id;

      SELECT
        COALESCE(lp.base_points, 0), COALESCE(h.games, 0),
        COALESCE(h.goals, 0), COALESCE(h.assists, 0), COALESCE(h.wins, 0),
        COALESCE(h.price_before, lp.price_locked, 0),
        COALESCE(h.price_after, h.price_before, lp.price_after, lp.price_locked, 0)
      INTO target_base, target_games, target_goals, target_assists, target_wins,
        target_price, target_price_after
      FROM public.fantasy_lineup_players lp
      LEFT JOIN public.fantasy_player_price_history h
        ON h.fantasy_round_id = fr.id AND h.player_id = lp.player_id
      WHERE lp.lineup_id = lineup.id AND lp.player_id = target_one;

      target_base := COALESCE(target_base, 0);
      target_games := COALESCE(target_games, 0);
      target_goals := COALESCE(target_goals, 0);
      target_assists := COALESCE(target_assists, 0);
      target_wins := COALESCE(target_wins, 0);
      target_price := COALESCE(target_price, 0);
      target_price_after := COALESCE(target_price_after, target_price);

      IF target_two IS NOT NULL THEN
        SELECT COALESCE(round_points, 0), COALESCE(games, 0)
        INTO target_two_base, target_two_games
        FROM public.fantasy_player_price_history
        WHERE fantasy_round_id = fr.id AND player_id = target_two;
        target_two_base := COALESCE(target_two_base, 0);
        target_two_games := COALESCE(target_two_games, 0);
      END IF;

      SELECT 1 + count(*) INTO target_rank
      FROM public.fantasy_player_price_history h
      WHERE h.fantasy_round_id = fr.id AND h.round_points > target_base;

      IF slug = 'super_captain' THEN
        bonus := least(COALESCE((config->>'maxBonus')::NUMERIC, 8), greatest(0, captain_base));
        applied := bonus > 0;
        details := CASE WHEN applied THEN 'Super Capitão aplicado.' ELSE 'Capitão não pontuou.' END;
      ELSIF slug = 'vice_captain' THEN
        bonus := least(COALESCE((config->>'maxBonus')::NUMERIC, 8), greatest(0, target_base - captain_base));
        applied := target_one IS NOT NULL AND target_base > captain_base;
        details := CASE WHEN applied THEN 'O Vice superou o Capitão e assumiu o multiplicador.' ELSE 'O Vice não superou o Capitão.' END;
      ELSIF slug = 'golden_goal' THEN
        applied := target_goals >= 1; bonus := CASE WHEN applied THEN 3 ELSE 0 END;
        details := CASE WHEN applied THEN 'Gol de Ouro concluído.' ELSE 'O atleta não marcou.' END;
      ELSIF slug = 'golden_assist' THEN
        applied := target_assists >= 1; bonus := CASE WHEN applied THEN 3 ELSE 0 END;
        details := CASE WHEN applied THEN 'Passe de Ouro concluído.' ELSE 'O atleta não deu assistência.' END;
      ELSIF slug = 'so_vim_pela_resenha' THEN
        applied := target_one IS NOT NULL AND target_goals = 0 AND target_assists = 0 AND target_wins >= 2;
        bonus := CASE WHEN applied THEN 3 ELSE 0 END;
        details := CASE WHEN applied THEN 'Só Vim Pela Resenha concluída.' ELSE 'A condição da resenha não foi cumprida.' END;
      ELSIF slug = 'tava_em_campo' THEN
        applied := target_one IS NOT NULL AND target_base = lineup_min;
        bonus := CASE WHEN applied THEN 2 ELSE 0 END;
        details := CASE WHEN applied THEN 'O escolhido foi o menor pontuador da escalação.' ELSE 'O escolhido não foi o menor pontuador.' END;
      ELSIF slug = 'my_mvp' THEN
        applied := target_one IS NOT NULL AND target_base = lineup_max;
        bonus := CASE WHEN applied THEN 4 ELSE 0 END;
        details := CASE WHEN applied THEN 'O escolhido foi o craque da escalação.' ELSE 'O escolhido não foi o maior pontuador.' END;
      ELSIF slug = 'triple_crown' THEN
        applied := target_goals >= 1 AND target_assists >= 1 AND target_wins >= 1;
        bonus := CASE WHEN applied THEN 6 ELSE 0 END;
        details := CASE WHEN applied THEN 'Tríplice Coroa concluída.' ELSE 'Faltou gol, assistência ou vitória.' END;
      ELSIF slug = 'samu_do_cartola' THEN
        applied := target_one IS NOT NULL AND target_base < 0;
        bonus := CASE WHEN applied THEN -target_base ELSE 0 END;
        details := CASE WHEN applied THEN 'Pontuação negativa ajustada para zero.' ELSE 'O jogador não ficou negativo.' END;
      ELSIF slug = 'bagre_insurance' THEN
        IF target_base < 0 THEN applied := true; bonus := -target_base;
        ELSIF target_games > 0 AND target_base > 0 AND target_base < round_median THEN applied := true; bonus := 2;
        END IF;
        details := CASE WHEN applied THEN 'Seguro contra Bagres acionado.' ELSE 'O seguro não foi acionado.' END;
      ELSIF slug = 'bagre_or_craque' THEN
        IF target_base < 0 THEN applied := true; bonus := -target_base;
        ELSIF target_games > 0 AND target_rank <= 5 THEN applied := true; bonus := 5;
        END IF;
        details := CASE WHEN applied THEN 'Bagre ou Craque? acionada.' ELSE 'A carta não atingiu suas condições.' END;
      ELSIF slug = 'bagre_value_shield' THEN
        budget_recovery := least(COALESCE((config->>'maxRecovery')::NUMERIC, 2), greatest(0, target_price - target_price_after));
        applied := budget_recovery > 0;
        details := CASE WHEN applied THEN 'Desvalorização recuperada no patrimônio.' ELSE 'O jogador não desvalorizou.' END;
      ELSIF slug = 'scout' THEN
        applied := target_one IS NOT NULL AND (market_min = market_max OR target_price < market_median);
        bonus := CASE WHEN applied THEN least(6, greatest(0, target_base * .5)) ELSE 0 END;
        details := CASE WHEN applied THEN 'Caça-Talentos processado.' ELSE 'Atleta fora da faixa de preço.' END;
      ELSIF slug = 'all_in' THEN
        applied := target_one IS NOT NULL AND target_games > 0 AND target_price <= cheap_cutoff AND target_rank <= 5;
        bonus := CASE WHEN applied THEN 6 ELSE 0 END;
        details := CASE WHEN applied THEN 'All-In concluído.' ELSE 'Preço ou posição não cumpridos.' END;
      ELSIF slug = 'duo' THEN
        SELECT COALESCE(base_points, 0) INTO target_two_base
        FROM public.fantasy_lineup_players WHERE lineup_id = lineup.id AND player_id = target_two;
        applied := target_one IS NOT NULL AND target_two IS NOT NULL AND target_one <> target_two
          AND target_games > 0 AND target_base > round_average AND COALESCE(target_two_base, 0) > round_average;
        bonus := CASE WHEN applied THEN 5 ELSE 0 END;
        details := CASE WHEN applied THEN 'Dobradinha concluída.' ELSE 'A dupla não ficou acima da média.' END;
      ELSIF slug = 'head_to_head' THEN
        applied := target_one IS NOT NULL AND target_two IS NOT NULL AND target_games > 0
          AND target_two_games > 0 AND target_base > target_two_base;
        bonus := CASE WHEN applied THEN 5 ELSE 0 END;
        details := CASE WHEN applied THEN 'Duelo Direto vencido.' ELSE 'Duelo empatado ou perdido.' END;
      ELSIF slug = 'dream_team' THEN
        SELECT count(*) = 5 AND bool_and(COALESCE(h.games, 0) > 0 AND
          (SELECT 1 + count(*) FROM public.fantasy_player_price_history h2
           WHERE h2.fantasy_round_id = fr.id AND h2.round_points > lp.base_points) <= 8)
        INTO applied
        FROM public.fantasy_lineup_players lp
        LEFT JOIN public.fantasy_player_price_history h
          ON h.fantasy_round_id = fr.id AND h.player_id = lp.player_id
        WHERE lp.lineup_id = lineup.id;
        bonus := CASE WHEN applied THEN 8 ELSE 0 END;
        details := CASE WHEN applied THEN 'Seleção dos Sonhos completa.' ELSE 'Nem todos os cinco ficaram no TOP 8.' END;
      ELSIF slug = 'double_prediction' THEN
        applied := EXISTS (SELECT 1 FROM public.player_round_stats s WHERE s.round_id = p_round_id AND s.player_id = lineup.top_scorer_player_id AND s.goals >= 1)
          AND EXISTS (SELECT 1 FROM public.player_round_stats s WHERE s.round_id = p_round_id AND s.player_id = lineup.top_assist_player_id AND s.assists >= 1);
        bonus := CASE WHEN applied THEN 6 ELSE 0 END;
        details := CASE WHEN applied THEN 'Palpite Duplo concluído.' ELSE 'Um dos palpites não aconteceu.' END;
      ELSE
        details := 'Carta consumida; efeito econômico aplicado na montagem ou sem bônus final.';
      END IF;

      UPDATE public.fantasy_lineups
      SET total_points = total_points + bonus,
          budget_after = CASE WHEN budget_after IS NULL THEN NULL ELSE budget_after + budget_recovery END,
          score_breakdown = COALESCE(score_breakdown, '{}'::JSONB) || jsonb_build_object(
            'cardBonus', bonus, 'cardBudgetRecovery', budget_recovery,
            'cardSlug', slug, 'cardDescription', details),
          updated_at = now()
      WHERE id = lineup.id;

      IF budget_recovery > 0 THEN
        UPDATE public.fantasy_accounts
        SET current_budget = current_budget + budget_recovery, updated_at = now()
        WHERE fantasy_season_id = fr.fantasy_season_id AND user_id = activation.user_id;
      END IF;
    END IF;

    UPDATE public.fantasy_card_activations
    SET status = 'RESOLVED', result_bonus = bonus,
        result_details = jsonb_build_object('applied', applied, 'description', details, 'budgetRecovery', budget_recovery),
        locked_at = COALESCE(locked_at, now()), resolved_at = now()
    WHERE id = activation.id;

    UPDATE public.fantasy_user_cards SET status = 'CONSUMED', consumed_at = now()
    WHERE id = activation.user_card_id;
  END LOOP;

  UPDATE public.fantasy_accounts account
  SET total_points = totals.total_points, rounds_played = totals.rounds_played,
      best_round_points = totals.best_round, updated_at = now()
  FROM (
    SELECT l.user_id, sum(l.total_points) total_points, count(*)::INTEGER rounds_played,
      max(l.total_points) best_round
    FROM public.fantasy_lineups l
    JOIN public.fantasy_rounds r ON r.id = l.fantasy_round_id
    WHERE r.fantasy_season_id = fr.fantasy_season_id AND l.status = 'scored'
    GROUP BY l.user_id
  ) totals
  WHERE account.fantasy_season_id = fr.fantasy_season_id AND account.user_id = totals.user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_fantasy_card_activations(UUID) FROM PUBLIC, anon;
