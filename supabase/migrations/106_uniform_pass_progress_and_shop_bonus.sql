-- A trilha principal do Passe passa a ter uma unica regra: escalação válida
-- avança quatro casas para qualquer categoria. Presença vira apenas moeda extra.

ALTER TABLE public.fantasy_season_passes
  ADD COLUMN IF NOT EXISTS shop_bonus_points INTEGER NOT NULL DEFAULT 0
  CHECK (shop_bonus_points >= 0);

CREATE OR REPLACE FUNCTION public.recalculate_fantasy_season_pass(p_fantasy_season_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row RECORD;
  round_row RECORD;
  mode_value TEXT;
  participation_total INTEGER;
  lineup_total INTEGER;
  active_weeks_total INTEGER;
  progress_total INTEGER;
  shop_bonus_total INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_seasons WHERE id = p_fantasy_season_id) THEN
    RETURN false;
  END IF;

  -- Recalcular e idempotente: nenhuma casa ou moeda extra e duplicada.
  DELETE FROM public.fantasy_season_pass_events
  WHERE fantasy_season_id = p_fantasy_season_id;
  DELETE FROM public.fantasy_season_passes
  WHERE fantasy_season_id = p_fantasy_season_id;

  FOR profile_row IN
    SELECT account.user_id, account.player_id, player.member_category
    FROM public.account_profiles account
    JOIN public.players player ON player.id = account.player_id
  LOOP
    mode_value := CASE WHEN profile_row.member_category IN ('wag', 'supporter') THEN 'community' ELSE 'athlete' END;
    participation_total := 0;
    lineup_total := 0;
    active_weeks_total := 0;

    FOR round_row IN
      SELECT
        round_item.id AS round_id,
        round_item.number AS round_number,
        round_item.date AS round_date,
        COALESCE(stat.games, 0) AS games,
        EXISTS (
          SELECT 1
          FROM public.fantasy_lineups lineup
          WHERE lineup.fantasy_round_id = fantasy_round.id
            AND lineup.user_id = profile_row.user_id
            AND lineup.status IN ('locked', 'scored')
            AND (SELECT count(*) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id) = 5
        ) AS has_valid_lineup
      FROM public.fantasy_rounds fantasy_round
      JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
      LEFT JOIN public.player_round_stats stat
        ON stat.round_id = round_item.id AND stat.player_id = profile_row.player_id
      WHERE fantasy_round.fantasy_season_id = p_fantasy_season_id
        AND fantasy_round.market_status = 'finished'
        AND round_item.status = 'finished'
        AND round_item.round_type = 'official'
      ORDER BY round_item.date, round_item.number
    LOOP
      -- A única fonte de casas: todos avançam exatamente igual pelo Cartola.
      IF round_row.has_valid_lineup THEN
        lineup_total := lineup_total + 1;
        active_weeks_total := active_weeks_total + 1;
        INSERT INTO public.fantasy_season_pass_events (
          fantasy_season_id, user_id, source_round_id, event_type, houses, metadata
        ) VALUES (
          p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'valid_lineup', 4,
          jsonb_build_object('roundNumber', round_row.round_number, 'roundDate', round_row.round_date)
        );
      END IF;

      -- Para atleta, presença e apenas o ciclo de moeda da loja.
      IF mode_value = 'athlete' AND round_row.games > 0 THEN
        participation_total := participation_total + 1;
      END IF;
    END LOOP;

    progress_total := lineup_total * 4;
    -- Atleta: 1 moeda por 5 presenças. Comunidade: 1 moeda por 5 escalações.
    shop_bonus_total := CASE
      WHEN mode_value = 'athlete' THEN floor(participation_total / 5.0)::INTEGER
      ELSE floor(lineup_total / 5.0)::INTEGER
    END;

    INSERT INTO public.fantasy_season_passes (
      fantasy_season_id, user_id, progression_mode, progress, total_progress_points,
      shop_bonus_points, participations, valid_lineups, active_weeks,
      goals_assists_remainder, calculated_at, updated_at
    ) VALUES (
      p_fantasy_season_id, profile_row.user_id, mode_value, LEAST(progress_total, 40), progress_total,
      shop_bonus_total, participation_total, lineup_total, active_weeks_total,
      0, now(), now()
    );
  END LOOP;

  RETURN true;
END;
$$;

-- A loja passa a somar tanto casas posteriores a 40 quanto a moeda de ciclo.
CREATE OR REPLACE FUNCTION public.purchase_fantasy_pass_shop_item(p_shop_item_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_row public.fantasy_season_pass_shop_items%ROWTYPE;
  pass_total INTEGER;
  pass_progress INTEGER;
  bonus_points INTEGER;
  spent_points INTEGER;
  available_points INTEGER;
BEGIN
  SELECT * INTO item_row
  FROM public.fantasy_season_pass_shop_items
  WHERE id = p_shop_item_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item da loja não encontrado.'; END IF;
  IF item_row.purchased_at IS NOT NULL THEN RAISE EXCEPTION 'Este item já foi comprado.'; END IF;

  SELECT progress, total_progress_points, shop_bonus_points
  INTO pass_progress, pass_total, bonus_points
  FROM public.fantasy_season_passes
  WHERE fantasy_season_id = item_row.fantasy_season_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND OR pass_progress < 40 THEN
    RAISE EXCEPTION 'Conclua a trilha principal para liberar a loja.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics owned WHERE owned.user_id = auth.uid() AND owned.cosmetic_id = item_row.cosmetic_id) THEN
    UPDATE public.fantasy_season_pass_shop_items SET purchased_at = now() WHERE id = item_row.id;
    RETURN true;
  END IF;

  SELECT COALESCE(sum(price_points), 0)::INTEGER INTO spent_points
  FROM public.fantasy_season_pass_shop_items
  WHERE user_id = auth.uid() AND fantasy_season_id = item_row.fantasy_season_id AND purchased_at IS NOT NULL;

  available_points := GREATEST(COALESCE(pass_total, 0) - 40, 0) + COALESCE(bonus_points, 0) - spent_points;
  IF available_points < item_row.price_points THEN RAISE EXCEPTION 'Pontos extras insuficientes.'; END IF;

  INSERT INTO public.fantasy_user_cosmetics (user_id, cosmetic_id, source_reward_id)
  VALUES (auth.uid(), item_row.cosmetic_id, item_row.source_reward_id)
  ON CONFLICT DO NOTHING;
  UPDATE public.fantasy_season_pass_shop_items SET purchased_at = now() WHERE id = item_row.id;
  RETURN true;
END;
$$;

SELECT public.recalculate_fantasy_season_pass(id) FROM public.fantasy_seasons;

GRANT EXECUTE ON FUNCTION public.recalculate_fantasy_season_pass(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_fantasy_pass_shop_item(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
