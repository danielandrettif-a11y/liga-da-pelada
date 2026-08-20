-- Cartola V3.1: resolução real das cartas e pacotes administrativos individuais.

ALTER TABLE public.fantasy_round_packs
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'round_reward',
  ADD COLUMN IF NOT EXISTS granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.fantasy_round_packs
  DROP CONSTRAINT IF EXISTS uq_fantasy_round_packs_user_round;

ALTER TABLE public.fantasy_round_packs
  DROP CONSTRAINT IF EXISTS fantasy_round_packs_source_check;

ALTER TABLE public.fantasy_round_packs
  ADD CONSTRAINT fantasy_round_packs_source_check
  CHECK (source IN ('round_reward', 'admin_gift', 'admin_bulk', 'test'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_fantasy_round_reward_user_round
  ON public.fantasy_round_packs (user_id, round_id)
  WHERE source = 'round_reward';

CREATE INDEX IF NOT EXISTS idx_fantasy_round_packs_granted_by
  ON public.fantasy_round_packs (granted_by, created_at DESC);

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
  captain_base NUMERIC := 0;
  target_base NUMERIC := 0;
  target_two_base NUMERIC := 0;
  target_games INTEGER := 0;
  target_goals INTEGER := 0;
  target_assists INTEGER := 0;
  target_price NUMERIC := 0;
  market_min NUMERIC := 0;
  market_max NUMERIC := 0;
  market_median NUMERIC := 0;
  cheap_cutoff NUMERIC := 0;
  round_average NUMERIC := 0;
  target_rank INTEGER := 999;
  bonus NUMERIC := 0;
  applied BOOLEAN := false;
  details TEXT := '';
  config JSONB;
  slug TEXT;
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
    COALESCE(avg(round_points) FILTER (WHERE games > 0), 0)
  INTO market_min, market_max, market_median, cheap_cutoff, round_average
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
    target_goals := 0;
    target_assists := 0;
    target_price := 0;

    IF FOUND THEN
      SELECT COALESCE(base_points, 0) INTO captain_base
      FROM public.fantasy_lineup_players
      WHERE lineup_id = lineup.id AND player_id = lineup.captain_player_id;
      captain_base := COALESCE(captain_base, 0);

      SELECT
        COALESCE(lp.base_points, 0),
        COALESCE(h.games, 0), COALESCE(h.goals, 0), COALESCE(h.assists, 0),
        COALESCE(h.price_before, lp.price_locked, 0)
      INTO target_base, target_games, target_goals, target_assists, target_price
      FROM public.fantasy_lineup_players lp
      LEFT JOIN public.fantasy_player_price_history h
        ON h.fantasy_round_id = fr.id AND h.player_id = lp.player_id
      WHERE lp.lineup_id = lineup.id AND lp.player_id = target_one;

      target_base := COALESCE(target_base, 0);
      target_games := COALESCE(target_games, 0);
      target_goals := COALESCE(target_goals, 0);
      target_assists := COALESCE(target_assists, 0);
      target_price := COALESCE(target_price, 0);

      IF slug = 'super_captain' THEN
        bonus := least(COALESCE((config->>'maxBonus')::NUMERIC, 8), greatest(0, captain_base));
        applied := bonus > 0;
        details := CASE WHEN applied THEN 'Super Capitão aplicado ao capitão da escalação.' ELSE 'Capitão não pontuou.' END;

      ELSIF slug = 'vice_captain' THEN
        bonus := least(COALESCE((config->>'maxBonus')::NUMERIC, 8), greatest(0, target_base - captain_base));
        applied := target_one IS NOT NULL AND target_base > captain_base;
        details := CASE WHEN applied THEN 'Vice superou o capitão; o bônus líquido da troca foi aplicado.' ELSE 'Vice não superou o capitão.' END;

      ELSIF slug = 'golden_goal' THEN
        applied := target_goals >= COALESCE((config->>'threshold')::INTEGER, 1);
        bonus := CASE WHEN applied THEN COALESCE((config->>'bonus')::NUMERIC, 3) ELSE 0 END;
        details := CASE WHEN applied THEN 'Gol de Ouro concluído.' ELSE 'O atleta não marcou gol.' END;

      ELSIF slug = 'golden_assist' THEN
        applied := target_assists >= COALESCE((config->>'threshold')::INTEGER, 1);
        bonus := CASE WHEN applied THEN COALESCE((config->>'bonus')::NUMERIC, 3) ELSE 0 END;
        details := CASE WHEN applied THEN 'Passe de Ouro concluído.' ELSE 'O atleta não deu assistência.' END;

      ELSIF slug = 'scout' THEN
        -- Empate total de preços (primeira rodada): todos os escalados são elegíveis.
        applied := target_one IS NOT NULL
          AND (market_min = market_max OR target_price < market_median);
        bonus := CASE WHEN applied
          THEN least(COALESCE((config->>'maxBonus')::NUMERIC, 6), greatest(0, target_base * COALESCE((config->>'percentage')::NUMERIC, .5)))
          ELSE 0 END;
        details := CASE WHEN applied THEN 'Caça-Talentos elegível e processado.' ELSE 'Atleta fora da faixa de preço do Caça-Talentos.' END;

      ELSIF slug = 'all_in' THEN
        SELECT 1 + count(*) INTO target_rank
        FROM public.fantasy_player_price_history h
        WHERE h.fantasy_round_id = fr.id AND h.round_points > target_base;
        applied := target_one IS NOT NULL AND target_games > 0
          AND target_price <= cheap_cutoff
          AND target_rank <= COALESCE((config->>'topRank')::INTEGER, 5);
        bonus := CASE WHEN applied THEN COALESCE((config->>'bonus')::NUMERIC, 6) ELSE 0 END;
        details := CASE WHEN applied THEN 'All-In concluiu preço e TOP da rodada.' ELSE 'All-In não cumpriu preço e/ou posição.' END;

      ELSIF slug = 'duo' THEN
        SELECT COALESCE(lp.base_points, 0) INTO target_two_base
        FROM public.fantasy_lineup_players lp
        WHERE lp.lineup_id = lineup.id AND lp.player_id = target_two;
        target_two_base := COALESCE(target_two_base, 0);
        applied := target_one IS NOT NULL AND target_two IS NOT NULL AND target_one <> target_two
          AND target_games > 0 AND target_base > round_average AND target_two_base > round_average;
        bonus := CASE WHEN applied THEN COALESCE((config->>'bonus')::NUMERIC, 5) ELSE 0 END;
        details := CASE WHEN applied THEN 'Os dois atletas ficaram acima da média.' ELSE 'A Dobradinha não ficou inteira acima da média.' END;

      ELSIF slug = 'double_prediction' THEN
        applied := EXISTS (
          SELECT 1 FROM public.player_round_stats s
          WHERE s.round_id = p_round_id AND s.player_id = lineup.top_scorer_player_id AND s.goals >= 1
        ) AND EXISTS (
          SELECT 1 FROM public.player_round_stats s
          WHERE s.round_id = p_round_id AND s.player_id = lineup.top_assist_player_id AND s.assists >= 1
        );
        bonus := CASE WHEN applied THEN COALESCE((config->>'bonus')::NUMERIC, 6) ELSE 0 END;
        details := CASE WHEN applied THEN 'Os palpites de gol e assistência aconteceram.' ELSE 'Um dos dois palpites não aconteceu.' END;

      ELSE
        details := 'Carta consumida; este efeito não gera bônus de pontuação no encerramento.';
      END IF;

      UPDATE public.fantasy_lineups
      SET total_points = total_points + bonus,
          score_breakdown = COALESCE(score_breakdown, '{}'::JSONB) || jsonb_build_object(
            'cardBonus', bonus,
            'cardSlug', slug,
            'cardDescription', details
          ),
          updated_at = now()
      WHERE id = lineup.id;
    END IF;

    UPDATE public.fantasy_card_activations
    SET status = 'RESOLVED', result_bonus = bonus,
        result_details = jsonb_build_object('applied', applied, 'description', details),
        locked_at = COALESCE(locked_at, now()), resolved_at = now()
    WHERE id = activation.id;

    UPDATE public.fantasy_user_cards
    SET status = 'CONSUMED', consumed_at = now()
    WHERE id = activation.user_card_id;
  END LOOP;

  UPDATE public.fantasy_accounts account
  SET total_points = totals.total_points,
      rounds_played = totals.rounds_played,
      best_round_points = totals.best_round,
      updated_at = now()
  FROM (
    SELECT lineup.user_id, sum(lineup.total_points) total_points,
      count(*)::INTEGER rounds_played, max(lineup.total_points) best_round
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds r ON r.id = lineup.fantasy_round_id
    WHERE r.fantasy_season_id = fr.fantasy_season_id AND lineup.status = 'scored'
    GROUP BY lineup.user_id
  ) totals
  WHERE account.fantasy_season_id = fr.fantasy_season_id
    AND account.user_id = totals.user_id;

  RETURN true;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.process_fantasy_round_pre_cards(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_round(UUID) RENAME TO process_fantasy_round_pre_cards;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.process_fantasy_round_pre_cards(p_round_id);
  PERFORM public.apply_fantasy_card_activations(p_round_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_fantasy_card_activations(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_fantasy_round_pre_cards(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(UUID) TO authenticated;

-- Crédito Extra e Barganha também precisam ser validados no servidor. O wrapper
-- aplica o benefício apenas durante a gravação e mantém o patrimônio real intacto.
DO $$
BEGIN
  IF to_regprocedure('public.save_fantasy_lineup_pre_cards(uuid,uuid[],uuid,uuid,uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID)
      RENAME TO save_fantasy_lineup_pre_cards;
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
  fr public.fantasy_rounds%ROWTYPE;
  fs public.fantasy_seasons%ROWTYPE;
  active_slug TEXT;
  active_config JSONB := '{}'::JSONB;
  active_target UUID;
  extra_budget NUMERIC := 0;
  discount_percent NUMERIC := 0;
  original_target_price NUMERIC;
  saved_lineup UUID;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para escalar.'; END IF;
  PERFORM public.ensure_fantasy_round(p_round_id);
  SELECT * INTO fr FROM public.fantasy_rounds WHERE round_id = p_round_id;
  SELECT * INTO fs FROM public.fantasy_seasons WHERE id = fr.fantasy_season_id;

  SELECT c.slug, COALESCE(a.effect_snapshot->'effectConfig', c.effect_config, '{}'::JSONB),
    NULLIF(a.target_snapshot->>'targetPlayerId', '')::UUID
  INTO active_slug, active_config, active_target
  FROM public.fantasy_card_activations a
  JOIN public.fantasy_cards c ON c.id = a.card_id
  WHERE a.round_id = p_round_id AND a.user_id = current_user_id AND a.status = 'RESERVED'
  LIMIT 1;

  IF active_slug = 'extra_credit' THEN
    extra_budget := COALESCE((active_config->>'bonus')::NUMERIC, 5);
    INSERT INTO public.fantasy_accounts (fantasy_season_id, user_id, current_budget)
    VALUES (fr.fantasy_season_id, current_user_id, fs.initial_budget)
    ON CONFLICT (fantasy_season_id, user_id) DO NOTHING;
    UPDATE public.fantasy_accounts
    SET current_budget = current_budget + extra_budget
    WHERE fantasy_season_id = fr.fantasy_season_id AND user_id = current_user_id;
  ELSIF active_slug = 'bargain' AND active_target = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])) THEN
    discount_percent := COALESCE((active_config->>'discountPercent')::NUMERIC, 20);
    INSERT INTO public.fantasy_player_prices (fantasy_season_id, player_id, current_price)
    VALUES (fr.fantasy_season_id, active_target, fs.initial_player_price)
    ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;
    SELECT current_price INTO original_target_price
    FROM public.fantasy_player_prices
    WHERE fantasy_season_id = fr.fantasy_season_id AND player_id = active_target
    FOR UPDATE;
    IF original_target_price IS NOT NULL THEN
      UPDATE public.fantasy_player_prices
      SET current_price = round(current_price * (1 - discount_percent / 100), 2)
      WHERE fantasy_season_id = fr.fantasy_season_id AND player_id = active_target;
    END IF;
  END IF;

  saved_lineup := public.save_fantasy_lineup_pre_cards(
    p_round_id, p_player_ids, p_captain_player_id,
    p_top_scorer_player_id, p_top_assist_player_id, p_challenge_player_id
  );

  IF extra_budget > 0 THEN
    UPDATE public.fantasy_accounts
    SET current_budget = current_budget - extra_budget
    WHERE fantasy_season_id = fr.fantasy_season_id AND user_id = current_user_id;
    UPDATE public.fantasy_lineups
    SET budget_before = budget_before - extra_budget,
        cash_remaining = cash_remaining - extra_budget
    WHERE id = saved_lineup;
  END IF;

  IF original_target_price IS NOT NULL THEN
    UPDATE public.fantasy_player_prices
    SET current_price = original_target_price
    WHERE fantasy_season_id = fr.fantasy_season_id AND player_id = active_target;
  END IF;

  RETURN saved_lineup;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup_pre_cards(UUID, UUID[], UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID)
  TO authenticated;
