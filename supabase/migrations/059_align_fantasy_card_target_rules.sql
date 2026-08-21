-- Alinha as cartas com as regras publicadas na interface.
-- Palpite Duplo: 2 gols de um atleta + 2 assistências de outro.
-- Barganha: escolhida antes da escalação. All-In: qualquer atleta do mercado.

UPDATE public.fantasy_cards
SET description = 'Escolha 2 jogadores do mercado: um para marcar 2 gols e outro para dar 2 assistências. Se os dois conseguirem, ganhe +6 pontos.',
    effect_config = '{"bonus":6}'::jsonb
WHERE slug = 'double_prediction';

UPDATE public.fantasy_cards
SET description = 'Antes de montar a escalação, escolha 1 atleta do mercado: ele terá 20% de desconto no orçamento desta rodada.',
    effect_config = '{"discountPercent":20}'::jsonb
WHERE slug = 'bargain';

UPDATE public.fantasy_cards
SET description = 'Escolha qualquer atleta do mercado. Se ele terminar no TOP 5 da rodada, ganhe +6 pontos.',
    effect_config = '{"bonus":6,"topRank":5}'::jsonb
WHERE slug = 'all_in';

-- A implementação anterior já processa todas as cartas. Este invólucro ajusta
-- somente as duas cartas cuja regra mudou, preservando rodadas já resolvidas.
DO $$
BEGIN
  IF to_regprocedure('public.apply_fantasy_card_activations_pre_059(uuid)') IS NULL THEN
    ALTER FUNCTION public.apply_fantasy_card_activations(UUID)
      RENAME TO apply_fantasy_card_activations_pre_059;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_fantasy_card_activations(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fantasy_round public.fantasy_rounds%ROWTYPE;
  activation RECORD;
  lineup public.fantasy_lineups%ROWTYPE;
  target_one UUID;
  target_two UUID;
  target_points NUMERIC := 0;
  target_games INTEGER := 0;
  target_rank INTEGER := 999;
  new_bonus NUMERIC := 0;
  old_bonus NUMERIC := 0;
  applies BOOLEAN := false;
  details TEXT;
  top_rank INTEGER := 5;
BEGIN
  PERFORM public.apply_fantasy_card_activations_pre_059(p_round_id);

  SELECT * INTO fantasy_round FROM public.fantasy_rounds WHERE round_id = p_round_id;
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  FOR activation IN
    SELECT a.*, c.slug AS card_slug
    FROM public.fantasy_card_activations a
    JOIN public.fantasy_cards c ON c.id = a.card_id
    WHERE a.round_id = p_round_id
      AND a.status = 'RESOLVED'
      AND c.slug IN ('double_prediction', 'all_in')
      AND COALESCE(a.effect_snapshot->>'cardRulesVersion', '1') = '2'
    FOR UPDATE OF a
  LOOP
    SELECT * INTO lineup
    FROM public.fantasy_lineups
    WHERE fantasy_round_id = fantasy_round.id
      AND user_id = activation.user_id
      AND status = 'scored';

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    target_one := NULLIF(activation.target_snapshot->>'targetPlayerId', '')::UUID;
    target_two := NULLIF(activation.target_snapshot->>'targetPlayer2Id', '')::UUID;
    old_bonus := COALESCE(activation.result_bonus, 0);
    new_bonus := 0;
    applies := false;

    IF activation.card_slug = 'double_prediction' THEN
      applies := target_one IS NOT NULL
        AND target_two IS NOT NULL
        AND target_one <> target_two
        AND EXISTS (
          SELECT 1 FROM public.player_round_stats stat
          WHERE stat.round_id = p_round_id
            AND stat.player_id = target_one
            AND stat.goals >= 2
        )
        AND EXISTS (
          SELECT 1 FROM public.player_round_stats stat
          WHERE stat.round_id = p_round_id
            AND stat.player_id = target_two
            AND stat.assists >= 2
        );
      new_bonus := CASE WHEN applies
        THEN COALESCE((activation.effect_snapshot->'effectConfig'->>'bonus')::NUMERIC, 6)
        ELSE 0
      END;
      details := CASE WHEN applies
        THEN 'Palpite Duplo concluído: 2 gols do primeiro atleta e 2 assistências do segundo.'
        ELSE 'Palpite Duplo não concluído: eram necessários 2 gols do primeiro atleta e 2 assistências do segundo.'
      END;
    ELSE
      SELECT COALESCE(history.round_points, 0), COALESCE(history.games, 0)
      INTO target_points, target_games
      FROM public.fantasy_player_price_history history
      WHERE history.fantasy_round_id = fantasy_round.id
        AND history.player_id = target_one;
      target_points := COALESCE(target_points, 0);
      target_games := COALESCE(target_games, 0);

      SELECT 1 + count(*) INTO target_rank
      FROM public.fantasy_player_price_history history
      WHERE history.fantasy_round_id = fantasy_round.id
        AND history.round_points > target_points;
      top_rank := COALESCE((activation.effect_snapshot->'effectConfig'->>'topRank')::INTEGER, 5);
      applies := target_one IS NOT NULL AND target_games > 0 AND target_rank <= top_rank;
      new_bonus := CASE WHEN applies
        THEN COALESCE((activation.effect_snapshot->'effectConfig'->>'bonus')::NUMERIC, 6)
        ELSE 0
      END;
      details := CASE WHEN applies
        THEN format('All-In concluído: atleta escolhido terminou em %sº lugar.', target_rank)
        ELSE format('All-In não atingiu TOP %s.', top_rank)
      END;
    END IF;

    UPDATE public.fantasy_lineups
    SET total_points = COALESCE(total_points, 0) + new_bonus - old_bonus,
        score_breakdown = COALESCE(score_breakdown, '{}'::jsonb) || jsonb_build_object(
          'cardBonus', new_bonus,
          'cardSlug', activation.card_slug,
          'cardDescription', details
        ),
        updated_at = now()
    WHERE id = lineup.id;

    UPDATE public.fantasy_card_activations
    SET result_bonus = new_bonus,
        result_details = jsonb_build_object('applied', applies, 'description', details),
        resolved_at = COALESCE(resolved_at, now())
    WHERE id = activation.id;
  END LOOP;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_fantasy_card_activations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_fantasy_card_activations(UUID) TO authenticated;

-- Impede salvar uma Barganha sem o atleta escolhido. O momento da ativação
-- é validado pela Server Action antes de qualquer jogador entrar na escalação.
DO $$
BEGIN
  IF to_regprocedure('public.save_fantasy_lineup_pre_059(uuid,uuid[],uuid,uuid,uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID)
      RENAME TO save_fantasy_lineup_pre_059;
  END IF;
END $$;

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
  current_user_id UUID := auth.uid();
  active_slug TEXT;
  active_target UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para escalar.';
  END IF;

  SELECT card.slug, NULLIF(activation.target_snapshot->>'targetPlayerId', '')::UUID
  INTO active_slug, active_target
  FROM public.fantasy_card_activations activation
  JOIN public.fantasy_cards card ON card.id = activation.card_id
  WHERE activation.round_id = p_round_id
    AND activation.user_id = current_user_id
    AND activation.status = 'RESERVED'
  LIMIT 1;

  IF active_slug = 'bargain'
    AND (active_target IS NULL OR NOT (active_target = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])))) THEN
    RAISE EXCEPTION 'A Barganha exige que o atleta escolhido entre na sua escalação.';
  END IF;

  RETURN public.save_fantasy_lineup_pre_059(
    p_round_id, p_player_ids, p_captain_player_id,
    p_top_scorer_player_id, p_top_assist_player_id, p_challenge_player_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup_pre_059(UUID, UUID[], UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID)
  TO authenticated;
