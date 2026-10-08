-- Banco de reserva do Cartola: um atleta ATA/ALA ou DEF/VOL comprado por
-- metade do preço pode substituir a pior nota <= 0 da mesma posição.

BEGIN;

CREATE TABLE IF NOT EXISTS public.fantasy_lineup_reserves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id UUID NOT NULL UNIQUE REFERENCES public.fantasy_lineups(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  slot_role TEXT NOT NULL CHECK (slot_role IN ('ATA','DEF')),
  price_locked NUMERIC(10,2) NOT NULL CHECK (price_locked >= 0),
  price_after NUMERIC(10,2),
  base_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  applied BOOLEAN NOT NULL DEFAULT false,
  replaced_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  replaced_player_points NUMERIC(10,2),
  points_gain NUMERIC(10,2) NOT NULL DEFAULT 0,
  captain_inherited BOOLEAN NOT NULL DEFAULT false,
  captain_bonus NUMERIC(10,2) NOT NULL DEFAULT 0,
  player_name_locked TEXT,
  avatar_url_locked TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fantasy_lineup_reserves_player_idx
  ON public.fantasy_lineup_reserves(player_id);

ALTER TABLE public.fantasy_lineup_reserves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fantasy_lineup_reserves_read ON public.fantasy_lineup_reserves;
CREATE POLICY fantasy_lineup_reserves_read ON public.fantasy_lineup_reserves
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
    WHERE lineup.id=lineup_id
      AND (lineup.user_id=auth.uid() OR public.is_app_admin() OR fantasy_round.market_status<>'open')
  )
);

GRANT SELECT ON public.fantasy_lineup_reserves TO authenticated;

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup_with_reserve(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID,
  p_top_scorer_player_id UUID,
  p_top_assist_player_id UUID,
  p_challenge_player_id UUID,
  p_lineup_slots JSONB,
  p_reserve_player_id UUID DEFAULT NULL,
  p_reserve_slot_role TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  saved_lineup_id UUID;
  target_fantasy_season_id UUID;
  reserve_profile TEXT;
  reserve_name TEXT;
  reserve_avatar TEXT;
  reserve_cost NUMERIC(10,2);
  available_cash NUMERIC(10,2);
BEGIN
  IF (p_reserve_player_id IS NULL) <> (p_reserve_slot_role IS NULL) THEN
    RAISE EXCEPTION 'Escolha o jogador e a posição do banco de reserva.';
  END IF;
  IF p_reserve_slot_role IS NOT NULL AND p_reserve_slot_role NOT IN ('ATA','DEF') THEN
    RAISE EXCEPTION 'O banco aceita somente ATA/ALA ou DEF/VOL.';
  END IF;
  IF p_reserve_player_id IS NOT NULL AND p_reserve_player_id=ANY(COALESCE(p_player_ids,ARRAY[]::UUID[])) THEN
    RAISE EXCEPTION 'O jogador do banco não pode estar entre os titulares.';
  END IF;

  saved_lineup_id:=public.save_fantasy_lineup(
    p_round_id,p_player_ids,p_captain_player_id,p_top_scorer_player_id,
    p_top_assist_player_id,p_challenge_player_id,p_lineup_slots
  );

  DELETE FROM public.fantasy_lineup_reserves WHERE lineup_id=saved_lineup_id;
  IF p_reserve_player_id IS NULL THEN RETURN saved_lineup_id; END IF;

  SELECT fantasy_round.fantasy_season_id
  INTO target_fantasy_season_id
  FROM public.fantasy_rounds fantasy_round
  WHERE fantasy_round.round_id=p_round_id;

  SELECT player.player_profile,player.name,player.avatar_url
  INTO reserve_profile,reserve_name,reserve_avatar
  FROM public.players player
  WHERE player.id=p_reserve_player_id
    AND player.member_category='player' AND player.is_selectable=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'O reserva precisa ser um jogador oficial ativo.'; END IF;
  IF p_reserve_slot_role='DEF' AND COALESCE(reserve_profile,'')<>'defensive' THEN
    RAISE EXCEPTION 'Escolha um jogador DEF/VOL para este banco.';
  END IF;
  IF p_reserve_slot_role='ATA' AND COALESCE(reserve_profile,'') NOT IN ('offensive','midfield') THEN
    RAISE EXCEPTION 'Escolha um jogador ATA/ALA para este banco.';
  END IF;

  SELECT round(COALESCE(price.current_price,season.initial_player_price)*.5,2)
  INTO reserve_cost
  FROM public.fantasy_seasons season
  LEFT JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id=season.id AND price.player_id=p_reserve_player_id
  WHERE season.id=target_fantasy_season_id;

  SELECT cash_remaining INTO available_cash
  FROM public.fantasy_lineups WHERE id=saved_lineup_id FOR UPDATE;
  IF reserve_cost>COALESCE(available_cash,0) THEN
    RAISE EXCEPTION 'Patrimônio insuficiente para comprar o reserva.';
  END IF;

  INSERT INTO public.fantasy_lineup_reserves(
    lineup_id,player_id,slot_role,price_locked,player_name_locked,avatar_url_locked
  ) VALUES (
    saved_lineup_id,p_reserve_player_id,p_reserve_slot_role,reserve_cost,reserve_name,reserve_avatar
  );

  UPDATE public.fantasy_lineups SET
    lineup_cost=round(budget_before-cash_remaining+reserve_cost,2),
    cash_remaining=round(cash_remaining-reserve_cost,2),
    updated_at=now()
  WHERE id=saved_lineup_id;

  RETURN saved_lineup_id;
END $$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup_with_reserve(
  UUID,UUID[],UUID,UUID,UUID,UUID,JSONB,UUID,TEXT
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup_with_reserve(
  UUID,UUID[],UUID,UUID,UUID,UUID,JSONB,UUID,TEXT
) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.apply_fantasy_reserve_substitutions(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_fantasy_round_id UUID;
BEGIN
  SELECT id INTO target_fantasy_round_id
  FROM public.fantasy_rounds WHERE round_id=p_round_id;
  IF target_fantasy_round_id IS NULL THEN RETURN false; END IF;

  UPDATE public.fantasy_lineup_reserves reserve SET
    base_points=round(COALESCE((
      SELECT COALESCE(stat.ranking_points,stat.points)
      FROM public.player_round_stats stat
      WHERE stat.round_id=p_round_id AND stat.player_id=reserve.player_id
    ),0),2),
    updated_at=now()
  FROM public.fantasy_lineups lineup
  WHERE lineup.id=reserve.lineup_id
    AND lineup.fantasy_round_id=target_fantasy_round_id;

  WITH decisions AS (
    SELECT reserve.id,reserve.base_points,candidate.player_id,candidate.base_points AS starter_base,
      candidate.total_points AS starter_total,lineup.captain_player_id,
      COALESCE((fantasy_round.settings_snapshot->>'captain_multiplier')::NUMERIC,1.5) AS captain_multiplier,
      candidate.player_id IS NOT NULL AND reserve.base_points>candidate.base_points AS should_apply
    FROM public.fantasy_lineup_reserves reserve
    JOIN public.fantasy_lineups lineup ON lineup.id=reserve.lineup_id
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
    LEFT JOIN LATERAL (
      SELECT item.player_id,item.base_points,item.total_points
      FROM public.fantasy_lineup_players item
      WHERE item.lineup_id=lineup.id AND item.slot_role=reserve.slot_role
        AND item.base_points<=0
      ORDER BY item.base_points,item.slot_index NULLS LAST,item.player_id
      LIMIT 1
    ) candidate ON true
    WHERE lineup.fantasy_round_id=target_fantasy_round_id
      AND lineup.status IN ('locked','scored')
  )
  UPDATE public.fantasy_lineup_reserves reserve SET
    applied=decision.should_apply,
    replaced_player_id=CASE WHEN decision.should_apply THEN decision.player_id ELSE NULL END,
    replaced_player_points=CASE WHEN decision.should_apply THEN decision.starter_total ELSE NULL END,
    captain_inherited=decision.should_apply AND decision.player_id=decision.captain_player_id,
    captain_bonus=CASE WHEN decision.should_apply AND decision.player_id=decision.captain_player_id THEN round(decision.base_points*(decision.captain_multiplier-1),2) ELSE 0 END,
    points_gain=CASE WHEN decision.should_apply THEN round(decision.base_points + CASE WHEN decision.player_id=decision.captain_player_id THEN decision.base_points*(decision.captain_multiplier-1) ELSE 0 END - decision.starter_total,2) ELSE 0 END,
    updated_at=now()
  FROM decisions decision WHERE reserve.id=decision.id;

  UPDATE public.fantasy_lineups lineup SET
    player_points=calculated.player_points,
    total_points=calculated.player_points+COALESCE(lineup.prediction_points,0)
      +COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC,0),
    score_breakdown=COALESCE(lineup.score_breakdown,'{}'::JSONB)||jsonb_build_object(
      'reserveApplied',calculated.applied,
      'reservePlayerId',calculated.reserve_player_id,
      'reserveRole',calculated.reserve_role,
      'reserveBasePoints',calculated.reserve_base,
      'reserveReplacedPlayerId',calculated.replaced_player_id,
      'reserveReplacedPlayerPoints',calculated.replaced_points,
      'reservePointsGain',calculated.points_gain,
      'reserveCaptainInherited',calculated.captain_inherited,
      'reserveCaptainBonus',calculated.captain_bonus
    ),
    updated_at=now()
  FROM (
    SELECT lineup_item.id,
      round(COALESCE(sum(starter.total_points),0)+COALESCE(reserve.points_gain,0),2) player_points,
      COALESCE(reserve.applied,false) applied,reserve.player_id reserve_player_id,
      reserve.slot_role reserve_role,reserve.base_points reserve_base,
      reserve.replaced_player_id,reserve.replaced_player_points replaced_points,
      COALESCE(reserve.points_gain,0) points_gain,
      COALESCE(reserve.captain_inherited,false) captain_inherited,
      COALESCE(reserve.captain_bonus,0) captain_bonus
    FROM public.fantasy_lineups lineup_item
    LEFT JOIN public.fantasy_lineup_players starter ON starter.lineup_id=lineup_item.id
    LEFT JOIN public.fantasy_lineup_reserves reserve ON reserve.lineup_id=lineup_item.id
    WHERE lineup_item.fantasy_round_id=target_fantasy_round_id
      AND lineup_item.status IN ('locked','scored')
    GROUP BY lineup_item.id,reserve.applied,reserve.player_id,reserve.slot_role,reserve.base_points,
      reserve.replaced_player_id,reserve.replaced_player_points,reserve.points_gain,
      reserve.captain_inherited,reserve.captain_bonus
  ) calculated
  WHERE lineup.id=calculated.id;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_reserve_substitutions(UUID)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_fantasy_reserve_substitutions(UUID)
  TO service_role;

-- Encaixa o banco em qualquer fechamento ou reconciliação que já use a fonte
-- única de pontuação dos titulares.
DO $$ BEGIN
  IF to_regprocedure('public.apply_fantasy_slot_position_bonus_pre_reserve_239(uuid,boolean)') IS NULL THEN
    ALTER FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN)
      RENAME TO apply_fantasy_slot_position_bonus_pre_reserve_239;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_slot_position_bonus_pre_reserve_239(UUID,BOOLEAN)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_fantasy_slot_position_bonus(
  p_round_id UUID,p_is_test BOOLEAN DEFAULT false
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.apply_fantasy_slot_position_bonus_pre_reserve_239(p_round_id,p_is_test);
  IF NOT p_is_test THEN PERFORM public.apply_fantasy_reserve_substitutions(p_round_id); END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN)
  TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.reconcile_fantasy_reserve_budget(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target public.fantasy_rounds%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.fantasy_rounds WHERE round_id=p_round_id;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.fantasy_lineup_reserves reserve SET
    price_after=round(COALESCE((
      SELECT history.price_after
      FROM public.fantasy_player_price_history history
      WHERE history.fantasy_round_id=target.id AND history.player_id=reserve.player_id
    ),reserve.price_locked*2)*.5,2),
    updated_at=now()
  FROM public.fantasy_lineups lineup
  WHERE lineup.id=reserve.lineup_id AND lineup.fantasy_round_id=target.id;

  UPDATE public.fantasy_lineups lineup SET
    budget_after=round(
      lineup.cash_remaining
      +COALESCE((SELECT sum(item.price_after) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0)
      +COALESCE((SELECT reserve.price_after FROM public.fantasy_lineup_reserves reserve WHERE reserve.lineup_id=lineup.id),0)
      +COALESCE((lineup.score_breakdown->>'cardBudgetRecovery')::NUMERIC,0),2
    )
  WHERE lineup.fantasy_round_id=target.id AND lineup.status='scored';

  WITH ranked AS (
    SELECT id,rank() OVER(ORDER BY total_points DESC,updated_at,id)::INTEGER position
    FROM public.fantasy_lineups WHERE fantasy_round_id=target.id AND status='scored'
  )
  UPDATE public.fantasy_lineups lineup SET round_position=ranked.position
  FROM ranked WHERE lineup.id=ranked.id;

  UPDATE public.fantasy_accounts account SET
    current_budget=latest.budget_after,total_points=totals.total_points,
    rounds_played=totals.rounds_played,best_round_points=totals.best_round,updated_at=now()
  FROM (
    SELECT DISTINCT ON (lineup.user_id) lineup.user_id,lineup.budget_after
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
    WHERE fantasy_round.fantasy_season_id=target.fantasy_season_id
      AND lineup.status='scored' AND lineup.budget_after IS NOT NULL
    ORDER BY lineup.user_id,round_item.date DESC,round_item.number DESC
  ) latest
  JOIN (
    SELECT lineup.user_id,sum(lineup.total_points) total_points,count(*)::INTEGER rounds_played,
      max(lineup.total_points) best_round
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
    WHERE fantasy_round.fantasy_season_id=target.fantasy_season_id AND lineup.status='scored'
    GROUP BY lineup.user_id
  ) totals ON totals.user_id=latest.user_id
  WHERE account.fantasy_season_id=target.fantasy_season_id
    AND account.user_id=latest.user_id;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.reconcile_fantasy_reserve_budget(UUID)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_fantasy_reserve_budget(UUID) TO service_role;

DO $$ BEGIN
  IF to_regprocedure('public.process_fantasy_round_pre_reserve_239(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_round(UUID)
      RENAME TO process_fantasy_round_pre_reserve_239;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.process_fantasy_round_pre_reserve_239(UUID)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_season UUID;
BEGIN
  PERFORM public.process_fantasy_round_pre_reserve_239(p_round_id);
  PERFORM public.apply_fantasy_reserve_substitutions(p_round_id);
  PERFORM public.reconcile_fantasy_reserve_budget(p_round_id);
  SELECT fantasy_season_id INTO target_season FROM public.fantasy_rounds WHERE round_id=p_round_id;
  IF target_season IS NOT NULL THEN
    PERFORM public.recalculate_fantasy_season_pass(target_season);
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.process_fantasy_round(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(UUID) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';

COMMIT;
