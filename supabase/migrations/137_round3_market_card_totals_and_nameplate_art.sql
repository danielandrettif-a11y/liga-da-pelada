-- Mercado V7, reconciliação das cartas/pontos e Duelo Direto no primeiro apito.
-- A rodada 3 oficial já encerrada é a base da primeira valorização V7.

BEGIN;

ALTER TABLE public.fantasy_settings
  ALTER COLUMN max_price_increase SET DEFAULT .25,
  ALTER COLUMN max_price_decrease SET DEFAULT .10,
  ALTER COLUMN market_up_share SET DEFAULT .35,
  ALTER COLUMN market_stable_share SET DEFAULT .30,
  ALTER COLUMN market_min_increase SET DEFAULT .05,
  ALTER COLUMN market_min_decrease SET DEFAULT .02;

UPDATE public.fantasy_settings SET
  max_price_increase = .25,
  max_price_decrease = .10,
  market_up_share = .35,
  market_stable_share = .30,
  market_min_increase = .05,
  market_min_decrease = .02,
  updated_at = now();

UPDATE public.fantasy_rounds fantasy_round SET
  settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::JSONB)
    || jsonb_build_object(
      'max_price_increase', .25,
      'max_price_decrease', .10,
      'market_up_share', .35,
      'market_stable_share', .30,
      'market_min_increase', .05,
      'market_min_decrease', .02,
      'marketVersion', 7
    )
FROM public.rounds round_item
WHERE round_item.id = fantasy_round.round_id
  AND (
    (round_item.number = 3 AND fantasy_round.market_status = 'finished')
    OR (round_item.number >= 4 AND fantasy_round.market_status = 'open')
  );

-- Reaplica o mercado oficial sobre o histórico persistido da rodada 3. A
-- função v074 usa 65% do percentil da posição e 35% do percentil geral.
DO $$
DECLARE target_round RECORD;
BEGIN
  FOR target_round IN
    SELECT fantasy_round.round_id
    FROM public.fantasy_rounds fantasy_round
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    WHERE round_item.number = 3
      AND round_item.round_type = 'official'
      AND fantasy_round.market_status = 'finished'
      AND EXISTS (
        SELECT 1 FROM public.fantasy_player_price_history history
        WHERE history.fantasy_round_id = fantasy_round.id
      )
  LOOP
    PERFORM public.apply_fantasy_role_market_v074(target_round.round_id);
  END LOOP;
END;
$$;

UPDATE public.fantasy_player_price_history history SET
  metrics = COALESCE(history.metrics, '{}'::JSONB) || jsonb_build_object(
    'marketVersion', 7,
    'marketDistribution', '35% alta / 30% estavel / 35% baixa',
    'variationRange', '+5% a +25% / -2% a -10%'
  )
FROM public.fantasy_rounds fantasy_round
JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
WHERE history.fantasy_round_id = fantasy_round.id
  AND round_item.number = 3
  AND fantasy_round.market_status = 'finished';

-- Cartas econômicas não dão pontos, mas o benefício passa a ficar explícito
-- para o histórico, ranking e detalhe da escalação.
UPDATE public.fantasy_card_activations activation SET
  result_details = COALESCE(activation.result_details, '{}'::JSONB)
    || jsonb_build_object(
      'applied', true,
      'budgetBonus', COALESCE(
        (activation.effect_snapshot->'effectConfig'->>'bonus')::NUMERIC,
        (card.effect_config->>'bonus')::NUMERIC,
        5
      ),
      'description', 'Crédito Extra: C$5,00 temporários usados para montar a escalação.'
    )
FROM public.fantasy_cards card, public.fantasy_rounds fantasy_round
WHERE card.id = activation.card_id
  AND fantasy_round.round_id = activation.round_id
  AND card.slug = 'extra_credit'
  AND fantasy_round.market_status = 'finished';

WITH bargain_values AS (
  SELECT activation.id,
    COALESCE(
      (activation.effect_snapshot->'effectConfig'->>'discountPercent')::NUMERIC,
      (card.effect_config->>'discountPercent')::NUMERIC,
      20
    ) discount_percent,
    greatest(0, COALESCE(history.price_before, item.price_locked, 0) - COALESCE(item.price_locked, 0)) discount_amount
  FROM public.fantasy_card_activations activation
  JOIN public.fantasy_cards card ON card.id = activation.card_id AND card.slug = 'bargain'
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = activation.round_id
  LEFT JOIN public.fantasy_lineups lineup
    ON lineup.fantasy_round_id = fantasy_round.id AND lineup.user_id = activation.user_id
  LEFT JOIN public.fantasy_lineup_players item
    ON item.lineup_id = lineup.id
    AND item.player_id = NULLIF(activation.target_snapshot->>'targetPlayerId', '')::UUID
  LEFT JOIN public.fantasy_player_price_history history
    ON history.fantasy_round_id = fantasy_round.id AND history.player_id = item.player_id
  WHERE fantasy_round.market_status = 'finished'
)
UPDATE public.fantasy_card_activations activation SET
  result_details = COALESCE(activation.result_details, '{}'::JSONB)
    || jsonb_build_object(
      'applied', true,
      'discountPercent', bargain.discount_percent,
      'discountAmount', bargain.discount_amount,
      'description', format(
        'Barganha: %s%% de desconto na contratação (C$%s economizados).',
        bargain.discount_percent,
        to_char(bargain.discount_amount, 'FM999999990.00')
      )
    )
FROM bargain_values bargain
WHERE activation.id = bargain.id;

-- Corrige Super Capitão antigo que aparece com zero apesar de o capitão ter
-- pontuado. base_points já inclui o bônus da vaga e não inclui o multiplicador.
WITH super_captain_values AS (
  SELECT activation.id,
    least(
      COALESCE(
        (activation.effect_snapshot->'effectConfig'->>'maxBonus')::NUMERIC,
        (card.effect_config->>'maxBonus')::NUMERIC,
        8
      ),
      greatest(0, COALESCE(captain.base_points, 0))
    ) bonus
  FROM public.fantasy_card_activations activation
  JOIN public.fantasy_cards card ON card.id = activation.card_id AND card.slug = 'super_captain'
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = activation.round_id
  JOIN public.fantasy_lineups lineup
    ON lineup.fantasy_round_id = fantasy_round.id AND lineup.user_id = activation.user_id
  LEFT JOIN public.fantasy_lineup_players captain
    ON captain.lineup_id = lineup.id AND captain.player_id = lineup.captain_player_id
  WHERE fantasy_round.market_status = 'finished'
)
UPDATE public.fantasy_card_activations activation SET
  status = 'RESOLVED',
  result_bonus = calculated.bonus,
  result_details = COALESCE(activation.result_details, '{}'::JSONB)
    || jsonb_build_object(
      'applied', calculated.bonus > 0,
      'description', CASE WHEN calculated.bonus > 0
        THEN format('Super Capitão: +%s pontos aplicados.', to_char(calculated.bonus, 'FM999999990.0'))
        ELSE 'O capitão não gerou bônus adicional.' END
    ),
  resolved_at = COALESCE(activation.resolved_at, now())
FROM super_captain_values calculated
WHERE activation.id = calculated.id;

-- Em versões anteriores o placar podia ter o bônus correto, enquanto a
-- ativação continuava zerada. Preserva o valor oficial já registrado.
UPDATE public.fantasy_card_activations activation SET
  result_bonus = COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0),
  result_details = COALESCE(activation.result_details, '{}'::JSONB)
    || jsonb_build_object('applied', COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0) <> 0)
FROM public.fantasy_rounds fantasy_round
JOIN public.fantasy_lineups lineup ON lineup.fantasy_round_id = fantasy_round.id
WHERE activation.round_id = fantasy_round.round_id
  AND activation.user_id = lineup.user_id
  AND fantasy_round.market_status = 'finished'
  AND COALESCE(activation.result_bonus, 0) = 0
  AND COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0) <> 0;

-- Um único cálculo autoritativo passa a alimentar ranking, perfil e saldo.
WITH card_values AS (
  SELECT lineup.id,
    COALESCE(sum(item.total_points), 0) player_points,
    COALESCE(
      NULLIF(activation.result_bonus, 0),
      (lineup.score_breakdown->>'cardBonus')::NUMERIC,
      0
    ) card_bonus,
    COALESCE((activation.result_details->>'budgetRecovery')::NUMERIC, 0) budget_recovery,
    card.slug card_slug,
    activation.result_details->>'description' card_description
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
  LEFT JOIN public.fantasy_card_activations activation
    ON activation.round_id = fantasy_round.round_id AND activation.user_id = lineup.user_id
  LEFT JOIN public.fantasy_cards card ON card.id = activation.card_id
  WHERE lineup.status = 'scored'
  GROUP BY lineup.id, activation.result_bonus, activation.result_details, card.slug
)
UPDATE public.fantasy_lineups lineup SET
  player_points = calculated.player_points,
  total_points = calculated.player_points + COALESCE(lineup.prediction_points, 0) + calculated.card_bonus,
  budget_after = COALESCE(lineup.cash_remaining, 0)
    + COALESCE((SELECT sum(COALESCE(item.price_after, item.price_locked)) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0)
    + calculated.budget_recovery,
  score_breakdown = COALESCE(lineup.score_breakdown, '{}'::JSONB) || jsonb_build_object(
    'cardBonus', calculated.card_bonus,
    'cardBudgetRecovery', calculated.budget_recovery,
    'cardSlug', calculated.card_slug,
    'cardDescription', calculated.card_description
  ),
  updated_at = now()
FROM card_values calculated
WHERE lineup.id = calculated.id;

WITH ranked AS (
  SELECT lineup.id,
    rank() OVER (PARTITION BY lineup.fantasy_round_id ORDER BY lineup.total_points DESC) position
  FROM public.fantasy_lineups lineup
  WHERE lineup.status = 'scored'
)
UPDATE public.fantasy_lineups lineup SET round_position = ranked.position
FROM ranked WHERE lineup.id = ranked.id;

UPDATE public.fantasy_accounts account SET
  current_budget = latest.budget_after,
  total_points = totals.total_points,
  rounds_played = totals.rounds_played,
  best_round_points = totals.best_round,
  updated_at = now()
FROM (
  SELECT DISTINCT ON (lineup.user_id, fantasy_round.fantasy_season_id)
    lineup.user_id, fantasy_round.fantasy_season_id, lineup.budget_after
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  WHERE lineup.status = 'scored' AND lineup.budget_after IS NOT NULL
  ORDER BY lineup.user_id, fantasy_round.fantasy_season_id, round_item.date DESC, round_item.number DESC
) latest
JOIN (
  SELECT lineup.user_id, fantasy_round.fantasy_season_id,
    sum(lineup.total_points) total_points,
    count(*)::INTEGER rounds_played,
    max(lineup.total_points) best_round
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  WHERE lineup.status = 'scored'
  GROUP BY lineup.user_id, fantasy_round.fantasy_season_id
) totals ON totals.user_id = latest.user_id
  AND totals.fantasy_season_id = latest.fantasy_season_id
WHERE account.user_id = latest.user_id
  AND account.fantasy_season_id = latest.fantasy_season_id;

-- O adversário do Duelo Direto é sorteado apenas quando uma partida da rodada
-- começa e entre todos os atletas convocados em round_players.
CREATE OR REPLACE FUNCTION public.draw_head_to_head_opponents(p_round_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE activation RECORD; chosen_player_id UUID; opponent_player_id UUID; target_round_number INTEGER;
BEGIN
  SELECT number INTO target_round_number FROM public.rounds WHERE id = p_round_id;
  IF COALESCE(target_round_number, 0) < 4 THEN RETURN true; END IF;
  FOR activation IN
    SELECT item.id, item.target_snapshot
    FROM public.fantasy_card_activations item
    JOIN public.fantasy_cards card ON card.id = item.card_id
    WHERE item.round_id = p_round_id AND item.status IN ('RESERVED', 'LOCKED')
      AND card.slug = 'head_to_head'
      AND NULLIF(item.target_snapshot->>'targetPlayer2Id', '') IS NULL
    FOR UPDATE OF item
  LOOP
    chosen_player_id := NULLIF(activation.target_snapshot->>'targetPlayerId', '')::UUID;
    SELECT participant.player_id INTO opponent_player_id
    FROM public.round_players participant
    WHERE participant.round_id = p_round_id
      AND participant.player_id IS NOT NULL
      AND participant.player_id IS DISTINCT FROM chosen_player_id
    ORDER BY md5(activation.id::TEXT || ':' || participant.player_id::TEXT)
    LIMIT 1;
    IF opponent_player_id IS NOT NULL THEN
      UPDATE public.fantasy_card_activations SET
        target_snapshot = jsonb_set(COALESCE(target_snapshot, '{}'::JSONB), '{targetPlayer2Id}', to_jsonb(opponent_player_id::TEXT), true)
      WHERE id = activation.id;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.draw_head_to_head_on_match_start()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.started_at IS NOT NULL OR NEW.status = 'live')
    AND (TG_OP = 'INSERT' OR OLD.started_at IS NULL OR OLD.status IS DISTINCT FROM 'live') THEN
    PERFORM public.draw_head_to_head_opponents(NEW.round_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_draw_head_to_head_opponents ON public.matches;
CREATE TRIGGER matches_draw_head_to_head_opponents
AFTER INSERT OR UPDATE OF status, started_at ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.draw_head_to_head_on_match_start();

UPDATE public.fantasy_cards SET
  description = 'Escolha um escalado. No primeiro apito, o BQ sorteia um adversário entre todos os convocados; se o seu jogador fizer mais pontos-base, ganhe +5 pontos.'
WHERE slug = 'head_to_head';

-- Consulta administrativa para conferir qualquer divergência restante.
CREATE OR REPLACE FUNCTION public.audit_fantasy_round_totals(p_round_id UUID DEFAULT NULL)
RETURNS TABLE (
  round_id UUID,
  user_id UUID,
  stored_total NUMERIC,
  calculated_total NUMERIC,
  difference NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem auditar o Cartola.'; END IF;
  RETURN QUERY
  SELECT fantasy_round.round_id, lineup.user_id, lineup.total_points,
    COALESCE(sum(item.total_points), 0) + COALESCE(lineup.prediction_points, 0)
      + COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0) calculated,
    lineup.total_points - (
      COALESCE(sum(item.total_points), 0) + COALESCE(lineup.prediction_points, 0)
        + COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0)
    ) difference
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
  WHERE lineup.status = 'scored'
    AND (p_round_id IS NULL OR fantasy_round.round_id = p_round_id)
  GROUP BY fantasy_round.round_id, lineup.id
  HAVING abs(lineup.total_points - (
    COALESCE(sum(item.total_points), 0) + COALESCE(lineup.prediction_points, 0)
      + COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0)
  )) > .001;
END;
$$;

REVOKE ALL ON FUNCTION public.draw_head_to_head_opponents(UUID), public.draw_head_to_head_on_match_start(), public.audit_fantasy_round_totals(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.draw_head_to_head_opponents(UUID), public.draw_head_to_head_on_match_start() TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_fantasy_round_totals(UUID) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
