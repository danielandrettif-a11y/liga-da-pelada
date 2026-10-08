-- A vaga GOL usa somente os scouts registrados enquanto o atleta estava no gol.
-- Gols sofridos pelo time durante atuações na linha continuam na Ranked, mas
-- não entram no total do jogador quando ele foi escalado na vaga GOL do Cartola.

BEGIN;

CREATE OR REPLACE FUNCTION public.calculate_fantasy_goalkeeper_slot_points_v14(
  p_round_id UUID,
  p_player_id UUID,
  p_snapshot JSONB
) RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public AS $$
  SELECT round((
    COALESCE(stat.goalkeeper_games,0) * COALESCE((p_snapshot->>'goalkeeper_slot_appearance_points')::NUMERIC,1)
    + COALESCE(stat.goalkeeper_goals,0) * COALESCE((p_snapshot->>'defender_goal_points')::NUMERIC,5)
    + COALESCE(stat.goalkeeper_assists,0) * COALESCE((p_snapshot->>'defender_assist_points')::NUMERIC,3)
    + COALESCE(stat.goals_conceded,0) * COALESCE((p_snapshot->>'goalkeeper_slot_goal_conceded_points')::NUMERIC,-0.5)
    + COALESCE(stat.clean_sheets,0) * COALESCE((p_snapshot->>'goalkeeper_slot_clean_sheet_points')::NUMERIC,4)
    + GREATEST(
        0,
        LEAST(
          GREATEST(0,COALESCE(stat.goalkeeper_games,0)-COALESCE(stat.clean_sheets,0)),
          GREATEST(0,COALESCE(stat.goalkeeper_games,0)-COALESCE(stat.clean_sheets,0))*2
            - COALESCE(stat.goals_conceded,0)
        )
      ) * COALESCE((p_snapshot->>'goalkeeper_slot_one_goal_points')::NUMERIC,2)
    + COALESCE(stat.goalkeeper_own_goals,0) * COALESCE((p_snapshot->>'own_goal_points')::NUMERIC,-3)
  )::NUMERIC,2)
  FROM public.player_round_stats stat
  WHERE stat.round_id=p_round_id
    AND stat.player_id=p_player_id
$$;

REVOKE ALL ON FUNCTION public.calculate_fantasy_goalkeeper_slot_points_v14(UUID,UUID,JSONB)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.calculate_fantasy_goalkeeper_slot_points_v14(UUID,UUID,JSONB)
  TO authenticated,service_role;

DO $$ BEGIN
  IF to_regprocedure('public.apply_fantasy_slot_position_bonus_pre_goalkeeper_240(uuid,boolean)') IS NULL THEN
    ALTER FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN)
      RENAME TO apply_fantasy_slot_position_bonus_pre_goalkeeper_240;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_slot_position_bonus_pre_goalkeeper_240(UUID,BOOLEAN)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_fantasy_slot_position_bonus(
  p_round_id UUID,
  p_is_test BOOLEAN DEFAULT false
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE
  snapshot JSONB;
  container UUID;
BEGIN
  PERFORM public.apply_fantasy_slot_position_bonus_pre_goalkeeper_240(p_round_id,p_is_test);

  IF p_is_test THEN
    SELECT id,settings_snapshot INTO container,snapshot
    FROM public.fantasy_test_sessions
    WHERE round_id=p_round_id;

    WITH score AS (
      SELECT item.id,item.player_id,lineup.captain_player_id,
        COALESCE(public.calculate_fantasy_goalkeeper_slot_points_v14(
          p_round_id,item.player_id,snapshot
        ),0) AS base
      FROM public.fantasy_test_lineup_players item
      JOIN public.fantasy_test_lineups lineup ON lineup.id=item.lineup_id
      WHERE lineup.test_session_id=container
        AND lineup.status='scored'
        AND item.slot_role='GOL'
    )
    UPDATE public.fantasy_test_lineup_players item SET
      base_points=score.base,
      position_bonus=0,
      captain_bonus=CASE WHEN score.player_id=score.captain_player_id THEN round(
        score.base*(COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5)-1),2
      ) ELSE 0 END,
      total_points=CASE WHEN score.player_id=score.captain_player_id THEN round(
        score.base*COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5),2
      ) ELSE score.base END
    FROM score
    WHERE item.id=score.id;

    UPDATE public.fantasy_test_lineups lineup SET
      player_points=COALESCE((
        SELECT sum(item.total_points)
        FROM public.fantasy_test_lineup_players item
        WHERE item.lineup_id=lineup.id
      ),0),
      total_points=COALESCE((
        SELECT sum(item.total_points)
        FROM public.fantasy_test_lineup_players item
        WHERE item.lineup_id=lineup.id
      ),0)+COALESCE(lineup.prediction_points,0),
      score_breakdown=COALESCE(lineup.score_breakdown,'{}'::JSONB)
        || jsonb_build_object(
          'goalkeeperSlotExclusive',true,
          'goalkeeperSlotExcludesTeamConceded',true
        )
    WHERE lineup.test_session_id=container
      AND lineup.status='scored';
  ELSE
    SELECT id,settings_snapshot INTO container,snapshot
    FROM public.fantasy_rounds
    WHERE round_id=p_round_id;

    WITH score AS (
      SELECT item.id,item.player_id,lineup.captain_player_id,
        COALESCE(public.calculate_fantasy_goalkeeper_slot_points_v14(
          p_round_id,item.player_id,snapshot
        ),0) AS base
      FROM public.fantasy_lineup_players item
      JOIN public.fantasy_lineups lineup ON lineup.id=item.lineup_id
      WHERE lineup.fantasy_round_id=container
        AND lineup.status='scored'
        AND item.slot_role='GOL'
    )
    UPDATE public.fantasy_lineup_players item SET
      base_points=score.base,
      position_bonus=0,
      captain_bonus=CASE WHEN score.player_id=score.captain_player_id THEN round(
        score.base*(COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5)-1),2
      ) ELSE 0 END,
      total_points=CASE WHEN score.player_id=score.captain_player_id THEN round(
        score.base*COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5),2
      ) ELSE score.base END
    FROM score
    WHERE item.id=score.id;

    PERFORM public.apply_fantasy_reserve_substitutions(p_round_id);

    UPDATE public.fantasy_lineups lineup SET
      score_breakdown=COALESCE(lineup.score_breakdown,'{}'::JSONB)
        || jsonb_build_object(
          'goalkeeperSlotExclusive',true,
          'goalkeeperSlotExcludesTeamConceded',true
        ),
      updated_at=now()
    WHERE lineup.fantasy_round_id=container
      AND lineup.status='scored';
  END IF;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN)
  TO authenticated,service_role;

-- Reprocessa apenas as rodadas oficiais da 7 em diante.
DO $$
DECLARE item RECORD;
BEGIN
  FOR item IN
    SELECT round_item.id
    FROM public.rounds round_item
    JOIN public.seasons season ON season.id=round_item.season_id
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id=round_item.id
    WHERE season.status='active'
      AND round_item.round_type='official'
      AND round_item.status='finished'
      AND round_item.number>=7
    ORDER BY round_item.date,round_item.number
  LOOP
    PERFORM public.reconcile_fantasy_round_totals(item.id);
  END LOOP;
END $$;

NOTIFY pgrst,'reload schema';

COMMIT;