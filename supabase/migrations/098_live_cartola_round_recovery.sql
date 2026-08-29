-- Corrige o processamento do Cartola e permite desconsiderar os scouts de
-- goleiro da rodada atual sem apagar o histórico operacional das partidas.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS ignore_goalkeeper_stats BOOLEAN NOT NULL DEFAULT false;

-- Pedido administrativo pontual: os registros de goleiro da rodada oficial
-- atualmente em andamento ficaram inconsistentes. Mantemos quem foi marcado
-- no gol para auditoria, mas essa rodada não pontua aparição/clean sheet/gols
-- sofridos no ranking nem no Cartola.
WITH current_round AS (
  SELECT id
  FROM public.rounds
  WHERE status = 'active'
    AND round_type = 'official'
  ORDER BY date DESC, created_at DESC
  LIMIT 1
)
UPDATE public.rounds round_item
SET ignore_goalkeeper_stats = true
FROM current_round
WHERE round_item.id = current_round.id;

-- A versão 074 recalculava corretamente os itens, mas seus dois UPDATEs de
-- totais não possuíam WHERE. Além de tocar escalações de outras rodadas, isso
-- é bloqueado pelo modo seguro do Supabase. O filtro abaixo limita cada
-- atualização ao contêiner que está sendo processado.
CREATE OR REPLACE FUNCTION public.apply_fantasy_slot_position_bonus(
  p_round_id UUID,
  p_is_test BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_snapshot JSONB; target_container UUID;
BEGIN
  IF p_is_test THEN
    SELECT id, settings_snapshot INTO target_container, target_snapshot
    FROM public.fantasy_test_sessions
    WHERE round_id = p_round_id;
  ELSE
    SELECT id, settings_snapshot INTO target_container, target_snapshot
    FROM public.fantasy_rounds
    WHERE round_id = p_round_id;
  END IF;

  IF target_container IS NULL THEN RETURN true; END IF;

  IF p_is_test THEN
    WITH calculated AS (
      SELECT item.id, item.player_id, lineup.captain_player_id,
        public.calculate_fantasy_role_base_points(
          target_snapshot, stat.goals, stat.assists, stat.wins, stat.losses,
          stat.goalkeeper_games, stat.goals_conceded, stat.own_goals,
          item.player_profile_locked, stat.defensive_clean_games,
          stat.defensive_one_goal_games
        ) AS base_points,
        CASE
          WHEN item.slot_role = 'GOL' AND COALESCE(stat.goalkeeper_games, 0) > 0
            THEN COALESCE(stat.clean_sheets, 0) * 4
          WHEN item.is_position_correct AND item.slot_role = 'DEF'
            THEN COALESCE(stat.defensive_clean_games, 0) * 2 + COALESCE(stat.defensive_one_goal_games, 0)
          WHEN item.is_position_correct AND item.slot_role = 'MEI'
            THEN COALESCE(stat.assists, 0) * (4 - COALESCE((target_snapshot->>'assist_points')::NUMERIC, 3))
              + CASE WHEN COALESCE(stat.assists, 0) >= 2 THEN 3 ELSE 0 END
          WHEN item.is_position_correct AND item.slot_role = 'ATA'
            THEN CASE WHEN COALESCE(stat.goals, 0) >= 2 THEN 3 ELSE 0 END
          ELSE 0
        END AS position_bonus
      FROM public.fantasy_test_lineup_players item
      JOIN public.fantasy_test_lineups lineup ON lineup.id = item.lineup_id
      LEFT JOIN public.player_round_stats stat
        ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.test_session_id = target_container
        AND lineup.status = 'scored'
    )
    UPDATE public.fantasy_test_lineup_players item
    SET base_points = calculated.base_points + calculated.position_bonus,
        position_bonus = calculated.position_bonus,
        captain_bonus = CASE
          WHEN calculated.player_id = calculated.captain_player_id
            THEN (calculated.base_points + calculated.position_bonus)
              * (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1)
          ELSE 0
        END,
        total_points = (calculated.base_points + calculated.position_bonus)
          * CASE WHEN calculated.player_id = calculated.captain_player_id
              THEN COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5)
            ELSE 1 END
    FROM calculated
    WHERE item.id = calculated.id;

    UPDATE public.fantasy_test_lineups lineup
    SET player_points = COALESCE((
          SELECT sum(item.total_points)
          FROM public.fantasy_test_lineup_players item
          WHERE item.lineup_id = lineup.id
        ), 0),
        total_points = COALESCE((
          SELECT sum(item.total_points)
          FROM public.fantasy_test_lineup_players item
          WHERE item.lineup_id = lineup.id
        ), 0) + COALESCE(lineup.prediction_points, 0),
        score_breakdown = COALESCE(lineup.score_breakdown, '{}'::JSONB)
          || jsonb_build_object(
            'playersBase', COALESCE((SELECT sum(item.base_points - item.position_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
            'positionBonus', COALESCE((SELECT sum(item.position_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
            'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0)
          )
    WHERE lineup.test_session_id = target_container
      AND lineup.status = 'scored';
  ELSE
    WITH calculated AS (
      SELECT item.id, item.player_id, lineup.captain_player_id,
        public.calculate_fantasy_role_base_points(
          target_snapshot, stat.goals, stat.assists, stat.wins, stat.losses,
          stat.goalkeeper_games, stat.goals_conceded, stat.own_goals,
          item.player_profile_locked, stat.defensive_clean_games,
          stat.defensive_one_goal_games
        ) AS base_points,
        CASE
          WHEN item.slot_role = 'GOL' AND COALESCE(stat.goalkeeper_games, 0) > 0
            THEN COALESCE(stat.clean_sheets, 0) * 4
          WHEN item.is_position_correct AND item.slot_role = 'DEF'
            THEN COALESCE(stat.defensive_clean_games, 0) * 2 + COALESCE(stat.defensive_one_goal_games, 0)
          WHEN item.is_position_correct AND item.slot_role = 'MEI'
            THEN COALESCE(stat.assists, 0) * (4 - COALESCE((target_snapshot->>'assist_points')::NUMERIC, 3))
              + CASE WHEN COALESCE(stat.assists, 0) >= 2 THEN 3 ELSE 0 END
          WHEN item.is_position_correct AND item.slot_role = 'ATA'
            THEN CASE WHEN COALESCE(stat.goals, 0) >= 2 THEN 3 ELSE 0 END
          ELSE 0
        END AS position_bonus
      FROM public.fantasy_lineup_players item
      JOIN public.fantasy_lineups lineup ON lineup.id = item.lineup_id
      LEFT JOIN public.player_round_stats stat
        ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.fantasy_round_id = target_container
        AND lineup.status = 'scored'
    )
    UPDATE public.fantasy_lineup_players item
    SET base_points = calculated.base_points + calculated.position_bonus,
        position_bonus = calculated.position_bonus,
        captain_bonus = CASE
          WHEN calculated.player_id = calculated.captain_player_id
            THEN (calculated.base_points + calculated.position_bonus)
              * (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1)
          ELSE 0
        END,
        total_points = (calculated.base_points + calculated.position_bonus)
          * CASE WHEN calculated.player_id = calculated.captain_player_id
              THEN COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5)
            ELSE 1 END
    FROM calculated
    WHERE item.id = calculated.id;

    UPDATE public.fantasy_lineups lineup
    SET player_points = COALESCE((
          SELECT sum(item.total_points)
          FROM public.fantasy_lineup_players item
          WHERE item.lineup_id = lineup.id
        ), 0),
        total_points = COALESCE((
          SELECT sum(item.total_points)
          FROM public.fantasy_lineup_players item
          WHERE item.lineup_id = lineup.id
        ), 0) + COALESCE(lineup.prediction_points, 0)
          + COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0),
        score_breakdown = COALESCE(lineup.score_breakdown, '{}'::JSONB)
          || jsonb_build_object(
            'playersBase', COALESCE((SELECT sum(item.base_points - item.position_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
            'positionBonus', COALESCE((SELECT sum(item.position_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
            'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0)
          )
    WHERE lineup.fantasy_round_id = target_container
      AND lineup.status = 'scored';
  END IF;

  RETURN true;
END;
$$;

NOTIFY pgrst, 'reload schema';
