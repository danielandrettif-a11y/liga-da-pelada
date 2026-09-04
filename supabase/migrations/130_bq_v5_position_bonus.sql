-- ============================================================================
-- Migration 130: Bônus Posicionais BQ v5
-- ============================================================================
-- 1. calculate_fantasy_role_base_points: base uniforme sem bônus DEF na base
-- 2. apply_fantasy_slot_position_bonus:
--    DEF: +1.5 CS, +0.5 (1 gol), Muralha +3 (>=3 CS), teto 10
--    MEI: +1.0 por assistência, Maestro +3 (>=2 assistências)
--    ATA: Artilheiro +3 (>=2 gols)
--    GOL: +4 CS no gol
--    Capitão: exato 1.5x arredondado a 2 casas

CREATE OR REPLACE FUNCTION public.calculate_fantasy_role_base_points(
  p_settings JSONB,
  p_goals INTEGER,
  p_assists INTEGER,
  p_wins INTEGER,
  p_losses INTEGER,
  p_goalkeeper_games INTEGER,
  p_goals_conceded INTEGER,
  p_own_goals INTEGER,
  p_player_profile TEXT,
  p_defensive_clean_games INTEGER,
  p_defensive_one_goal_games INTEGER
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(p_goals, 0) * COALESCE((p_settings->>'goal_points')::NUMERIC, 4.0)
    + COALESCE(p_assists, 0) * COALESCE((p_settings->>'assist_points')::NUMERIC, 2.5)
    + COALESCE(p_wins, 0) * COALESCE((p_settings->>'win_points')::NUMERIC, 3.0)
    + COALESCE(p_losses, 0) * COALESCE((p_settings->>'loss_points')::NUMERIC, -2.5)
    + COALESCE(p_goalkeeper_games, 0) * COALESCE((p_settings->>'goalkeeper_appearance_points')::NUMERIC, 2.0)
    + COALESCE(p_goals_conceded, 0) * COALESCE((p_settings->>'goal_conceded_points')::NUMERIC, -1.0)
    + COALESCE(p_own_goals, 0) * COALESCE((p_settings->>'own_goal_points')::NUMERIC, -3.0);
$$;

CREATE OR REPLACE FUNCTION public.apply_fantasy_slot_position_bonus(
  p_round_id UUID,
  p_is_test BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_snapshot JSONB;
  target_container UUID;
BEGIN
  IF p_is_test THEN
    SELECT id, settings_snapshot INTO target_container, target_snapshot
    FROM public.fantasy_test_sessions WHERE round_id = p_round_id;
  ELSE
    SELECT id, settings_snapshot INTO target_container, target_snapshot
    FROM public.fantasy_rounds WHERE round_id = p_round_id;
  END IF;
  IF target_container IS NULL THEN RETURN true; END IF;

  IF p_is_test THEN
    WITH calculated AS (
      SELECT
        item.id,
        item.player_id,
        lineup.captain_player_id,
        public.calculate_fantasy_role_base_points(
          target_snapshot, stat.goals, stat.assists, stat.wins, stat.losses,
          stat.goalkeeper_games, stat.goals_conceded, stat.own_goals,
          item.player_profile_locked, stat.defensive_clean_games, stat.defensive_one_goal_games
        ) AS base_points,
        CASE
          WHEN item.slot_role = 'GOL' AND COALESCE(stat.goalkeeper_games, 0) > 0
            THEN COALESCE(stat.clean_sheets, 0) * 4.0
          WHEN item.is_position_correct AND item.slot_role = 'DEF'
            THEN LEAST(
              10.0,
              COALESCE(stat.defensive_clean_games, 0) * 1.5
              + COALESCE(stat.defensive_one_goal_games, 0) * 0.5
              + CASE WHEN COALESCE(stat.defensive_clean_games, 0) >= 3 THEN 3.0 ELSE 0.0 END
            )
          WHEN item.is_position_correct AND item.slot_role = 'MEI'
            THEN COALESCE(stat.assists, 0) * 1.0
              + CASE WHEN COALESCE(stat.assists, 0) >= 2 THEN 3.0 ELSE 0.0 END
          WHEN item.is_position_correct AND item.slot_role = 'ATA'
            THEN CASE WHEN COALESCE(stat.goals, 0) >= 2 THEN 3.0 ELSE 0.0 END
          ELSE 0.0
        END AS position_bonus
      FROM public.fantasy_test_lineup_players item
      JOIN public.fantasy_test_lineups lineup ON lineup.id = item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.test_session_id = target_container AND lineup.status = 'scored'
    )
    UPDATE public.fantasy_test_lineup_players item SET
      base_points = calculated.base_points + calculated.position_bonus,
      position_bonus = calculated.position_bonus,
      captain_bonus = CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN ROUND((calculated.base_points + calculated.position_bonus) * (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1.0), 2)
        ELSE 0.0 END,
      total_points = CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN ROUND((calculated.base_points + calculated.position_bonus) * COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5), 2)
        ELSE calculated.base_points + calculated.position_bonus END
    FROM calculated WHERE item.id = calculated.id;

    UPDATE public.fantasy_test_lineups lineup SET
      player_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      total_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0) + COALESCE(lineup.prediction_points, 0),
      score_breakdown = COALESCE(lineup.score_breakdown, '{}'::JSONB) || jsonb_build_object(
        'playersBase', COALESCE((SELECT sum(item.base_points - item.position_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'positionBonus', COALESCE((SELECT sum(item.position_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0)
      )
    WHERE lineup.test_session_id = target_container AND lineup.status = 'scored';
  ELSE
    WITH calculated AS (
      SELECT
        item.id,
        item.player_id,
        lineup.captain_player_id,
        public.calculate_fantasy_role_base_points(
          target_snapshot, stat.goals, stat.assists, stat.wins, stat.losses,
          stat.goalkeeper_games, stat.goals_conceded, stat.own_goals,
          item.player_profile_locked, stat.defensive_clean_games, stat.defensive_one_goal_games
        ) AS base_points,
        CASE
          WHEN item.slot_role = 'GOL' AND COALESCE(stat.goalkeeper_games, 0) > 0
            THEN COALESCE(stat.clean_sheets, 0) * 4.0
          WHEN item.is_position_correct AND item.slot_role = 'DEF'
            THEN LEAST(
              10.0,
              COALESCE(stat.defensive_clean_games, 0) * 1.5
              + COALESCE(stat.defensive_one_goal_games, 0) * 0.5
              + CASE WHEN COALESCE(stat.defensive_clean_games, 0) >= 3 THEN 3.0 ELSE 0.0 END
            )
          WHEN item.is_position_correct AND item.slot_role = 'MEI'
            THEN COALESCE(stat.assists, 0) * 1.0
              + CASE WHEN COALESCE(stat.assists, 0) >= 2 THEN 3.0 ELSE 0.0 END
          WHEN item.is_position_correct AND item.slot_role = 'ATA'
            THEN CASE WHEN COALESCE(stat.goals, 0) >= 2 THEN 3.0 ELSE 0.0 END
          ELSE 0.0
        END AS position_bonus
      FROM public.fantasy_lineup_players item
      JOIN public.fantasy_lineups lineup ON lineup.id = item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.fantasy_round_id = target_container AND lineup.status = 'scored'
    )
    UPDATE public.fantasy_lineup_players item SET
      base_points = calculated.base_points + calculated.position_bonus,
      position_bonus = calculated.position_bonus,
      captain_bonus = CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN ROUND((calculated.base_points + calculated.position_bonus) * (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1.0), 2)
        ELSE 0.0 END,
      total_points = CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN ROUND((calculated.base_points + calculated.position_bonus) * COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5), 2)
        ELSE calculated.base_points + calculated.position_bonus END
    FROM calculated WHERE item.id = calculated.id;

    UPDATE public.fantasy_lineups lineup SET
      player_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      total_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0)
        + COALESCE(lineup.prediction_points, 0)
        + COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0),
      score_breakdown = COALESCE(lineup.score_breakdown, '{}'::JSONB) || jsonb_build_object(
        'playersBase', COALESCE((SELECT sum(item.base_points - item.position_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'positionBonus', COALESCE((SELECT sum(item.position_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0)
      )
    WHERE lineup.fantasy_round_id = target_container AND lineup.status = 'scored';
  END IF;

  RETURN true;
END;
$$;
