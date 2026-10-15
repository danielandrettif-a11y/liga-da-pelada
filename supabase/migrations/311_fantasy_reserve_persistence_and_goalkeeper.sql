-- Mantém o reserva visível após salvar e amplia o banco para GOL, DEF ou ATA.
-- Esta migration depende apenas das migrations já publicadas até a 252.

BEGIN;

ALTER TABLE public.fantasy_lineup_reserves
  DROP CONSTRAINT IF EXISTS fantasy_lineup_reserves_slot_role_check;

ALTER TABLE public.fantasy_lineup_reserves
  ADD CONSTRAINT fantasy_lineup_reserves_slot_role_check
  CHECK (slot_role IN ('GOL', 'DEF', 'ATA'));

-- A wrapper de atividade criada na 251 continua sendo a entrada pública. Esta
-- é a rotina transacional interna que grava titulares e reserva em conjunto.
CREATE OR REPLACE FUNCTION public.save_fantasy_lineup_with_reserve_pre_activity_251(
  p_round_id uuid,
  p_player_ids uuid[],
  p_captain_player_id uuid,
  p_top_scorer_player_id uuid,
  p_top_assist_player_id uuid,
  p_challenge_player_id uuid,
  p_lineup_slots jsonb,
  p_reserve_player_id uuid DEFAULT NULL,
  p_reserve_slot_role text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_lineup_id uuid;
  target_fantasy_season_id uuid;
  target_league_id uuid;
  reserve_profile text;
  reserve_name text;
  reserve_avatar text;
  reserve_market_price numeric(10,2);
  reserve_price_limit numeric(10,2);
  reserve_cost numeric(10,2);
  cheapest_starter_price numeric(10,2);
  available_cash numeric(10,2);
BEGIN
  IF (p_reserve_player_id IS NULL) <> (p_reserve_slot_role IS NULL) THEN
    RAISE EXCEPTION 'Escolha o jogador e a posição do banco de reserva.';
  END IF;

  IF p_reserve_slot_role IS NOT NULL
    AND p_reserve_slot_role NOT IN ('GOL', 'DEF', 'ATA') THEN
    RAISE EXCEPTION 'O banco aceita somente GOL, DEF/VOL ou ATA/ALA.';
  END IF;

  IF p_reserve_player_id IS NOT NULL
    AND p_reserve_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::uuid[])) THEN
    RAISE EXCEPTION 'O jogador do banco não pode estar entre os titulares.';
  END IF;

  SELECT fantasy_round.fantasy_season_id, season.league_id
  INTO target_fantasy_season_id, target_league_id
  FROM public.fantasy_rounds fantasy_round
  JOIN public.fantasy_seasons season ON season.id = fantasy_round.fantasy_season_id
  WHERE fantasy_round.round_id = p_round_id;

  IF target_fantasy_season_id IS NULL THEN
    RAISE EXCEPTION 'Rodada do Cartola não encontrada.';
  END IF;

  -- Em bancos com o módulo multi-pelada, mantém a validação de isolamento da
  -- migration 293. Em bancos ainda na 252, segue usando o cadastro original.
  IF to_regprocedure('public.assert_fantasy_selection_in_league(uuid,uuid[],uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.assert_fantasy_selection_in_league($1,$2,$3)'
      INTO target_league_id
      USING p_round_id, p_player_ids, p_reserve_player_id;
  END IF;

  saved_lineup_id := public.save_fantasy_lineup(
    p_round_id,
    p_player_ids,
    p_captain_player_id,
    p_top_scorer_player_id,
    p_top_assist_player_id,
    p_challenge_player_id,
    p_lineup_slots
  );

  DELETE FROM public.fantasy_lineup_reserves
  WHERE lineup_id = saved_lineup_id;

  IF p_reserve_player_id IS NULL THEN
    RETURN saved_lineup_id;
  END IF;

  IF to_regclass('public.league_members') IS NOT NULL THEN
    EXECUTE $query$
      SELECT member.player_profile, player.name, player.avatar_url
      FROM public.league_members member
      JOIN public.players player ON player.id = member.player_id
      WHERE member.league_id = $1
        AND member.player_id = $2
        AND member.is_active
        AND player.member_category = 'player'
        AND player.is_selectable
    $query$
    INTO reserve_profile, reserve_name, reserve_avatar
    USING target_league_id, p_reserve_player_id;
  ELSE
    SELECT player.player_profile, player.name, player.avatar_url
    INTO reserve_profile, reserve_name, reserve_avatar
    FROM public.players player
    WHERE player.id = p_reserve_player_id
      AND player.member_category = 'player'
      AND player.is_selectable;
  END IF;

  IF reserve_name IS NULL THEN
    RAISE EXCEPTION 'O reserva precisa ser um jogador oficial ativo desta pelada.';
  END IF;

  IF p_reserve_slot_role = 'DEF'
    AND COALESCE(reserve_profile, '') <> 'defensive' THEN
    RAISE EXCEPTION 'Escolha um jogador DEF/VOL para este banco.';
  END IF;

  IF p_reserve_slot_role = 'ATA'
    AND COALESCE(reserve_profile, '') NOT IN ('offensive', 'midfield') THEN
    RAISE EXCEPTION 'Escolha um jogador ATA/ALA para este banco.';
  END IF;

  -- A vaga GOL é aberta a qualquer atleta, seguindo a regra de rodízio no gol.
  SELECT min(lineup_player.price_locked)
  INTO cheapest_starter_price
  FROM public.fantasy_lineup_players lineup_player
  WHERE lineup_player.lineup_id = saved_lineup_id
    AND lineup_player.slot_role = p_reserve_slot_role;

  IF cheapest_starter_price IS NULL THEN
    RAISE EXCEPTION 'Escolha um titular da mesma posição antes de adicionar o reserva.';
  END IF;

  reserve_price_limit := round(GREATEST(0, cheapest_starter_price - .10), 2);

  SELECT round(COALESCE(price.current_price, season.initial_player_price), 2)
  INTO reserve_market_price
  FROM public.fantasy_seasons season
  LEFT JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = season.id
   AND price.player_id = p_reserve_player_id
  WHERE season.id = target_fantasy_season_id;

  IF reserve_market_price IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar o preço atual do reserva.';
  END IF;

  IF reserve_market_price > reserve_price_limit THEN
    RAISE EXCEPTION 'Reserva caro demais: custa C$ %, mas o limite desta posição é C$ %.',
      reserve_market_price, reserve_price_limit;
  END IF;

  reserve_cost := round(reserve_market_price * .5, 2);

  SELECT cash_remaining
  INTO available_cash
  FROM public.fantasy_lineups
  WHERE id = saved_lineup_id
  FOR UPDATE;

  IF reserve_cost > COALESCE(available_cash, 0) THEN
    RAISE EXCEPTION 'Patrimônio insuficiente para comprar o reserva.';
  END IF;

  INSERT INTO public.fantasy_lineup_reserves(
    lineup_id,
    player_id,
    slot_role,
    price_locked,
    player_name_locked,
    avatar_url_locked
  ) VALUES (
    saved_lineup_id,
    p_reserve_player_id,
    p_reserve_slot_role,
    reserve_cost,
    reserve_name,
    reserve_avatar
  );

  UPDATE public.fantasy_lineups
  SET lineup_cost = round(budget_before - cash_remaining + reserve_cost, 2),
      cash_remaining = round(cash_remaining - reserve_cost, 2),
      updated_at = now()
  WHERE id = saved_lineup_id;

  RETURN saved_lineup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup_with_reserve_pre_activity_251(
  uuid,uuid[],uuid,uuid,uuid,uuid,jsonb,uuid,text
) FROM PUBLIC, anon, authenticated;

-- O fechamento usa a pontuação específica da vaga GOL para o goleiro reserva.
CREATE OR REPLACE FUNCTION public.apply_fantasy_reserve_substitutions(p_round_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_fantasy_round_id uuid;
BEGIN
  SELECT id INTO target_fantasy_round_id
  FROM public.fantasy_rounds
  WHERE round_id = p_round_id;

  IF target_fantasy_round_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.fantasy_lineup_reserves reserve
  SET base_points = round(COALESCE(
        CASE
          WHEN reserve.slot_role = 'GOL' THEN
            public.calculate_fantasy_goalkeeper_slot_points_v14(
              p_round_id,
              reserve.player_id,
              fantasy_round.settings_snapshot
            )
          ELSE (
            SELECT COALESCE(stat.ranking_points, stat.points)
            FROM public.player_round_stats stat
            WHERE stat.round_id = p_round_id
              AND stat.player_id = reserve.player_id
          )
        END,
        0
      ), 2),
      updated_at = now()
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  WHERE lineup.id = reserve.lineup_id
    AND lineup.fantasy_round_id = target_fantasy_round_id;

  WITH decisions AS (
    SELECT reserve.id,
      reserve.base_points,
      candidate.player_id,
      candidate.base_points AS starter_base,
      candidate.total_points AS starter_total,
      lineup.captain_player_id,
      COALESCE((fantasy_round.settings_snapshot->>'captain_multiplier')::numeric, 1.5) AS captain_multiplier,
      candidate.player_id IS NOT NULL
        AND reserve.base_points > candidate.base_points AS should_apply
    FROM public.fantasy_lineup_reserves reserve
    JOIN public.fantasy_lineups lineup ON lineup.id = reserve.lineup_id
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
    LEFT JOIN LATERAL (
      SELECT item.player_id, item.base_points, item.total_points
      FROM public.fantasy_lineup_players item
      WHERE item.lineup_id = lineup.id
        AND item.slot_role = reserve.slot_role
        AND item.base_points <= 0
      ORDER BY item.base_points, item.slot_index NULLS LAST, item.player_id
      LIMIT 1
    ) candidate ON true
    WHERE lineup.fantasy_round_id = target_fantasy_round_id
      AND lineup.status IN ('locked', 'scored')
  )
  UPDATE public.fantasy_lineup_reserves reserve
  SET applied = decision.should_apply,
      replaced_player_id = CASE WHEN decision.should_apply THEN decision.player_id ELSE NULL END,
      replaced_player_points = CASE WHEN decision.should_apply THEN decision.starter_total ELSE NULL END,
      captain_inherited = decision.should_apply AND decision.player_id = decision.captain_player_id,
      captain_bonus = CASE
        WHEN decision.should_apply AND decision.player_id = decision.captain_player_id
          THEN round(decision.base_points * (decision.captain_multiplier - 1), 2)
        ELSE 0
      END,
      points_gain = CASE
        WHEN decision.should_apply THEN round(
          decision.base_points
          + CASE
              WHEN decision.player_id = decision.captain_player_id
                THEN decision.base_points * (decision.captain_multiplier - 1)
              ELSE 0
            END
          - decision.starter_total,
          2
        )
        ELSE 0
      END,
      updated_at = now()
  FROM decisions decision
  WHERE reserve.id = decision.id;

  UPDATE public.fantasy_lineups lineup
  SET player_points = calculated.player_points,
      total_points = calculated.player_points
        + COALESCE(lineup.prediction_points, 0)
        + COALESCE((lineup.score_breakdown->>'cardBonus')::numeric, 0),
      score_breakdown = COALESCE(lineup.score_breakdown, '{}'::jsonb) || jsonb_build_object(
        'reserveApplied', calculated.applied,
        'reservePlayerId', calculated.reserve_player_id,
        'reserveRole', calculated.reserve_role,
        'reserveBasePoints', calculated.reserve_base,
        'reserveReplacedPlayerId', calculated.replaced_player_id,
        'reserveReplacedPlayerPoints', calculated.replaced_points,
        'reservePointsGain', calculated.points_gain,
        'reserveCaptainInherited', calculated.captain_inherited,
        'reserveCaptainBonus', calculated.captain_bonus
      ),
      updated_at = now()
  FROM (
    SELECT lineup_item.id,
      round(COALESCE(sum(starter.total_points), 0) + COALESCE(reserve.points_gain, 0), 2) AS player_points,
      COALESCE(reserve.applied, false) AS applied,
      reserve.player_id AS reserve_player_id,
      reserve.slot_role AS reserve_role,
      reserve.base_points AS reserve_base,
      reserve.replaced_player_id,
      reserve.replaced_player_points AS replaced_points,
      COALESCE(reserve.points_gain, 0) AS points_gain,
      COALESCE(reserve.captain_inherited, false) AS captain_inherited,
      COALESCE(reserve.captain_bonus, 0) AS captain_bonus
    FROM public.fantasy_lineups lineup_item
    LEFT JOIN public.fantasy_lineup_players starter ON starter.lineup_id = lineup_item.id
    LEFT JOIN public.fantasy_lineup_reserves reserve ON reserve.lineup_id = lineup_item.id
    WHERE lineup_item.fantasy_round_id = target_fantasy_round_id
      AND lineup_item.status IN ('locked', 'scored')
    GROUP BY lineup_item.id,
      reserve.applied,
      reserve.player_id,
      reserve.slot_role,
      reserve.base_points,
      reserve.replaced_player_id,
      reserve.replaced_player_points,
      reserve.points_gain,
      reserve.captain_inherited,
      reserve.captain_bonus
  ) calculated
  WHERE lineup.id = calculated.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_fantasy_reserve_substitutions(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_fantasy_reserve_substitutions(uuid)
TO service_role;

COMMENT ON FUNCTION public.save_fantasy_lineup_with_reserve_pre_activity_251(
  uuid,uuid[],uuid,uuid,uuid,uuid,jsonb,uuid,text
) IS 'Salva titulares e um reserva GOL, DEF ou ATA de forma transacional.';

NOTIFY pgrst, 'reload schema';

COMMIT;
