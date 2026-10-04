-- Coluna C v12: proteção regressiva por partida.
-- GOL: +4/+2/0 e DEF: +2/+1/0 para 0/1/2 gols sofridos.
-- A penalidade de -0,5 por gol sofrido e +1 por atuação no gol permanecem.

BEGIN;

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS defender_one_goal_points NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS goalkeeper_slot_clean_sheet_points NUMERIC NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS goalkeeper_slot_one_goal_points NUMERIC NOT NULL DEFAULT 2;

UPDATE public.fantasy_settings SET
  defender_clean_sheet_points = 2,
  defender_one_goal_points = 1,
  goalkeeper_slot_clean_sheet_points = 4,
  goalkeeper_slot_one_goal_points = 2;

UPDATE public.overall_formula_versions
SET label = 'OVR adaptativo v17 — três posições e Coluna C regressiva',
    config = config || jsonb_build_object(
      'columnCScoring', jsonb_build_object(
        'ATA', jsonb_build_object('goal',4,'assist',2.5,'conceded',-0.5,'cleanSheet',0,'oneGoal',0,'ownGoal',-3),
        'DEF', jsonb_build_object('goal',5,'assist',3,'conceded',-0.5,'cleanSheet',2,'oneGoal',1,'ownGoal',-3),
        'GOL', jsonb_build_object('appearance',1,'goal',5,'assist',3,'conceded',-0.5,'cleanSheet',4,'oneGoal',2,'ownGoal',-3)
      )
    )
WHERE key = 'adaptive-v17-three-positions-column-c';

-- A Ranked da temporada ativa adota a V12 desde a primeira rodada.
SELECT set_config('app.allow_bq_snapshot_rewrite', 'on', true);
UPDATE public.rounds round_item SET
  scoring_version = 12,
  scoring_snapshot = jsonb_build_object(
    'version',12,'goal',4,'assist',2.5,'win',0,'draw',0,'loss',0,
    'ownGoal',-3,'goalkeeperAppearance',1,'goalkeeperGoalConceded',-0.5,
    'defenderGoal',5,'defenderAssist',3,'defenderCleanSheet',2,'defenderOneGoal',1,
    'goalkeeperCleanSheet',4,'goalkeeperOneGoal',2,'teamGoalConceded',-0.5
  )
FROM public.seasons season
WHERE season.id=round_item.season_id AND season.status='active'
  AND round_item.round_type='official';

UPDATE public.player_round_stats stats SET
  points = CASE WHEN EXISTS (
    SELECT 1 FROM public.player_round_stat_overrides override_item
    WHERE override_item.round_id=stats.round_id AND override_item.player_id=stats.player_id
      AND override_item.override_type='zero_points'
  ) THEN 0 ELSE round(
    GREATEST(stats.goals-COALESCE(stats.goalkeeper_goals,0),0)
      * CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive' THEN 5 ELSE 4 END
    + GREATEST(stats.assists-COALESCE(stats.goalkeeper_assists,0),0)
      * CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive' THEN 3 ELSE 2.5 END
    + GREATEST(stats.team_goals_conceded-COALESCE(stats.goals_conceded,0),0) * -0.5
    + CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive'
        THEN COALESCE(stats.ranking_defensive_clean_games,0)*2
          + COALESCE(stats.ranking_defensive_one_goal_games,0)*1 ELSE 0 END
    + GREATEST(stats.own_goals-COALESCE(stats.goalkeeper_own_goals,0),0) * -3
    + COALESCE(stats.goalkeeper_games,0)*1
    + COALESCE(stats.goalkeeper_goals,0)*5
    + COALESCE(stats.goalkeeper_assists,0)*3
    + COALESCE(stats.goals_conceded,0)*-0.5
    + COALESCE(stats.clean_sheets,0)*4
    + GREATEST(LEAST(
        COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0),
        2*(COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0))-COALESCE(stats.goals_conceded,0)
      ),0)*2
    + COALESCE(stats.goalkeeper_own_goals,0)*-3
  ,2) END,
  ranking_position_bonus = 0
FROM public.players player, public.rounds round_item, public.seasons season
WHERE player.id=stats.player_id AND round_item.id=stats.round_id
  AND season.id=round_item.season_id AND season.status='active'
  AND round_item.round_type='official';

CREATE OR REPLACE FUNCTION public.set_bq_scoring_snapshot_on_round_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.scoring_snapshot IS NULL THEN
    NEW.scoring_snapshot:=jsonb_build_object(
      'version',12,'goal',4,'assist',2.5,'win',0,'draw',0,'loss',0,
      'ownGoal',-3,'goalkeeperAppearance',1,'goalkeeperGoalConceded',-0.5,
      'defenderGoal',5,'defenderAssist',3,'defenderCleanSheet',2,'defenderOneGoal',1,
      'goalkeeperCleanSheet',4,'goalkeeperOneGoal',2,'teamGoalConceded',-0.5);
    NEW.scoring_version:=12;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_role_scoring_activation_from_round_two()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  NEW.settings_snapshot:=COALESCE(NEW.settings_snapshot,'{}') || jsonb_build_object(
    'scoring_version',12,'role_scoring_active',true,
    'goal_points',4,'attacker_goal_points',4,'attacker_assist_points',2.5,
    'defender_goal_points',5,'defender_assist_points',3,
    'defender_clean_sheet_points',2,'defender_one_goal_points',1,
    'win_points',0,'draw_points',0,'loss_points',0,'own_goal_points',-3,
    'line_goal_conceded_points',-0.5,'goalkeeper_appearance_points',1,
    'goal_conceded_points',-0.5,'team_goal_conceded_points',-0.5,
    'goalkeeper_slot_appearance_points',1,'goalkeeper_slot_goal_conceded_points',-0.5,
    'goalkeeper_slot_clean_sheet_points',4,'goalkeeper_slot_one_goal_points',2);
  NEW.scoring_version:=12;
  RETURN NEW;
END $$;

-- Cartolas encerrados mantêm a V11; somente janelas abertas recebem a V12.
UPDATE public.fantasy_rounds fantasy_round SET
  scoring_version=12,
  settings_snapshot=COALESCE(fantasy_round.settings_snapshot,'{}') || jsonb_build_object(
    'scoring_version',12,'role_scoring_active',true,
    'defender_clean_sheet_points',2,'defender_one_goal_points',1,
    'goalkeeper_slot_clean_sheet_points',4,'goalkeeper_slot_one_goal_points',2,
    'line_goal_conceded_points',-0.5,'goalkeeper_slot_appearance_points',1,
    'goalkeeper_slot_goal_conceded_points',-0.5)
FROM public.rounds round_item
WHERE round_item.id=fantasy_round.round_id AND fantasy_round.market_status='open'
  AND round_item.status<>'finished';

UPDATE public.fantasy_test_sessions test_session SET
  scoring_version=12,
  settings_snapshot=COALESCE(test_session.settings_snapshot,'{}') || jsonb_build_object(
    'scoring_version',12,'role_scoring_active',true,
    'defender_clean_sheet_points',2,'defender_one_goal_points',1,
    'goalkeeper_slot_clean_sheet_points',4,'goalkeeper_slot_one_goal_points',2,
    'line_goal_conceded_points',-0.5,'goalkeeper_slot_appearance_points',1,
    'goalkeeper_slot_goal_conceded_points',-0.5)
FROM public.rounds round_item
WHERE round_item.id=test_session.round_id AND test_session.status='open'
  AND round_item.status<>'finished';

CREATE OR REPLACE FUNCTION public.calculate_column_c_slot_base_v12(
  p_snapshot JSONB,p_slot_role TEXT,
  p_goals INTEGER,p_assists INTEGER,p_own_goals INTEGER,p_team_goals_conceded INTEGER,
  p_defensive_clean_games INTEGER,p_defensive_one_goal_games INTEGER,
  p_goalkeeper_games INTEGER,p_goalkeeper_goals INTEGER,p_goalkeeper_assists INTEGER,
  p_goalkeeper_own_goals INTEGER,p_goals_conceded INTEGER,p_clean_sheets INTEGER
) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT round(CASE p_slot_role
    WHEN 'GOL' THEN
      COALESCE(p_goalkeeper_games,0)*COALESCE((p_snapshot->>'goalkeeper_slot_appearance_points')::NUMERIC,1)
      +COALESCE(p_goalkeeper_goals,0)*COALESCE((p_snapshot->>'defender_goal_points')::NUMERIC,5)
      +COALESCE(p_goalkeeper_assists,0)*COALESCE((p_snapshot->>'defender_assist_points')::NUMERIC,3)
      +COALESCE(p_goals_conceded,0)*COALESCE((p_snapshot->>'goalkeeper_slot_goal_conceded_points')::NUMERIC,-0.5)
      +COALESCE(p_clean_sheets,0)*COALESCE((p_snapshot->>'goalkeeper_slot_clean_sheet_points')::NUMERIC,4)
      +GREATEST(LEAST(
          COALESCE(p_goalkeeper_games,0)-COALESCE(p_clean_sheets,0),
          2*(COALESCE(p_goalkeeper_games,0)-COALESCE(p_clean_sheets,0))-COALESCE(p_goals_conceded,0)
        ),0)*COALESCE((p_snapshot->>'goalkeeper_slot_one_goal_points')::NUMERIC,2)
      +COALESCE(p_goalkeeper_own_goals,0)*COALESCE((p_snapshot->>'own_goal_points')::NUMERIC,-3)
    WHEN 'DEF' THEN
      GREATEST(COALESCE(p_goals,0)-COALESCE(p_goalkeeper_goals,0),0)*COALESCE((p_snapshot->>'defender_goal_points')::NUMERIC,5)
      +GREATEST(COALESCE(p_assists,0)-COALESCE(p_goalkeeper_assists,0),0)*COALESCE((p_snapshot->>'defender_assist_points')::NUMERIC,3)
      +GREATEST(COALESCE(p_team_goals_conceded,0)-COALESCE(p_goals_conceded,0),0)*COALESCE((p_snapshot->>'line_goal_conceded_points')::NUMERIC,-0.5)
      +COALESCE(p_defensive_clean_games,0)*COALESCE((p_snapshot->>'defender_clean_sheet_points')::NUMERIC,2)
      +COALESCE(p_defensive_one_goal_games,0)*COALESCE((p_snapshot->>'defender_one_goal_points')::NUMERIC,1)
      +GREATEST(COALESCE(p_own_goals,0)-COALESCE(p_goalkeeper_own_goals,0),0)*COALESCE((p_snapshot->>'own_goal_points')::NUMERIC,-3)
    ELSE
      GREATEST(COALESCE(p_goals,0)-COALESCE(p_goalkeeper_goals,0),0)*COALESCE((p_snapshot->>'attacker_goal_points')::NUMERIC,4)
      +GREATEST(COALESCE(p_assists,0)-COALESCE(p_goalkeeper_assists,0),0)*COALESCE((p_snapshot->>'attacker_assist_points')::NUMERIC,2.5)
      +GREATEST(COALESCE(p_team_goals_conceded,0)-COALESCE(p_goals_conceded,0),0)*COALESCE((p_snapshot->>'line_goal_conceded_points')::NUMERIC,-0.5)
      +GREATEST(COALESCE(p_own_goals,0)-COALESCE(p_goalkeeper_own_goals,0),0)*COALESCE((p_snapshot->>'own_goal_points')::NUMERIC,-3)
  END,2);
$$;

REVOKE ALL ON FUNCTION public.calculate_column_c_slot_base_v12(JSONB,TEXT,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER) FROM PUBLIC,anon,authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.apply_fantasy_slot_position_bonus_pre_v12_222(uuid,boolean)') IS NULL THEN
    ALTER FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN)
      RENAME TO apply_fantasy_slot_position_bonus_pre_v12_222;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_slot_position_bonus_pre_v12_222(UUID,BOOLEAN) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_fantasy_slot_position_bonus(p_round_id UUID,p_is_test BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot JSONB; container UUID;
BEGIN
  IF p_is_test THEN SELECT id,settings_snapshot INTO container,snapshot FROM public.fantasy_test_sessions WHERE round_id=p_round_id;
  ELSE SELECT id,settings_snapshot INTO container,snapshot FROM public.fantasy_rounds WHERE round_id=p_round_id; END IF;
  IF COALESCE((snapshot->>'scoring_version')::INTEGER,5)<12 THEN
    RETURN public.apply_fantasy_slot_position_bonus_pre_v12_222(p_round_id,p_is_test);
  END IF;

  IF p_is_test THEN
    WITH score AS (
      SELECT item.id,item.player_id,lineup.captain_player_id,
        public.calculate_column_c_slot_base_v12(snapshot,item.slot_role,
          stat.goals,stat.assists,stat.own_goals,stat.team_goals_conceded,
          stat.defensive_clean_games,stat.defensive_one_goal_games,
          stat.goalkeeper_games,stat.goalkeeper_goals,stat.goalkeeper_assists,
          stat.goalkeeper_own_goals,stat.goals_conceded,stat.clean_sheets) base
      FROM public.fantasy_test_lineup_players item JOIN public.fantasy_test_lineups lineup ON lineup.id=item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id=p_round_id AND stat.player_id=item.player_id
      WHERE lineup.test_session_id=container AND lineup.status='scored'
    ) UPDATE public.fantasy_test_lineup_players item SET base_points=score.base,position_bonus=0,
      captain_bonus=CASE WHEN score.player_id=score.captain_player_id THEN round(score.base*(COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5)-1),2) ELSE 0 END,
      total_points=CASE WHEN score.player_id=score.captain_player_id THEN round(score.base*COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5),2) ELSE score.base END
    FROM score WHERE item.id=score.id;
    UPDATE public.fantasy_test_lineups lineup SET
      player_points=COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id=lineup.id),0),
      total_points=COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id=lineup.id),0)+COALESCE(lineup.prediction_points,0),
      score_breakdown=COALESCE(lineup.score_breakdown,'{}') || jsonb_build_object(
        'playersBase',COALESCE((SELECT sum(item.base_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id=lineup.id),0),
        'positionBonus',0,'captainBonus',COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id=lineup.id),0))
    WHERE lineup.test_session_id=container AND lineup.status='scored';
  ELSE
    WITH score AS (
      SELECT item.id,item.player_id,lineup.captain_player_id,
        public.calculate_column_c_slot_base_v12(snapshot,item.slot_role,
          stat.goals,stat.assists,stat.own_goals,stat.team_goals_conceded,
          stat.defensive_clean_games,stat.defensive_one_goal_games,
          stat.goalkeeper_games,stat.goalkeeper_goals,stat.goalkeeper_assists,
          stat.goalkeeper_own_goals,stat.goals_conceded,stat.clean_sheets) base
      FROM public.fantasy_lineup_players item JOIN public.fantasy_lineups lineup ON lineup.id=item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id=p_round_id AND stat.player_id=item.player_id
      WHERE lineup.fantasy_round_id=container AND lineup.status='scored'
    ) UPDATE public.fantasy_lineup_players item SET base_points=score.base,position_bonus=0,
      captain_bonus=CASE WHEN score.player_id=score.captain_player_id THEN round(score.base*(COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5)-1),2) ELSE 0 END,
      total_points=CASE WHEN score.player_id=score.captain_player_id THEN round(score.base*COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5),2) ELSE score.base END
    FROM score WHERE item.id=score.id;
    UPDATE public.fantasy_lineups lineup SET
      player_points=COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0),
      total_points=COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0)+COALESCE(lineup.prediction_points,0)+COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC,0),
      score_breakdown=COALESCE(lineup.score_breakdown,'{}') || jsonb_build_object(
        'playersBase',COALESCE((SELECT sum(item.base_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0),
        'positionBonus',0,'captainBonus',COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0))
    WHERE lineup.fantasy_round_id=container AND lineup.status='scored';
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN) TO authenticated,service_role;

-- Mantém a auditoria antiga para snapshots até V11 e usa a mesma função
-- canônica do fechamento ao validar V12.
DO $$ BEGIN
  IF to_regprocedure('public.audit_fantasy_scoring_integrity_pre_v12_222(uuid)') IS NULL THEN
    ALTER FUNCTION public.audit_fantasy_scoring_integrity(UUID)
      RENAME TO audit_fantasy_scoring_integrity_pre_v12_222;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.audit_fantasy_scoring_integrity_pre_v12_222(UUID) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.audit_fantasy_scoring_integrity(p_round_id UUID DEFAULT NULL)
RETURNS TABLE (
  round_id UUID,user_id UUID,player_id UUID,stored_base NUMERIC,expected_base NUMERIC,
  stored_position_bonus NUMERIC,expected_position_bonus NUMERIC,
  stored_captain_bonus NUMERIC,expected_captain_bonus NUMERIC,
  stored_total NUMERIC,expected_total NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_round_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.role()<>'service_role' AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem auditar o Cartola.';
  END IF;

  FOR old_round_id IN
    SELECT round_item.id
    FROM public.rounds round_item
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id=round_item.id
    WHERE round_item.status='finished'
      AND COALESCE(fantasy_round.scoring_version,
        (fantasy_round.settings_snapshot->>'scoring_version')::INTEGER,5)<12
      AND (p_round_id IS NULL OR round_item.id=p_round_id)
  LOOP
    RETURN QUERY SELECT * FROM public.audit_fantasy_scoring_integrity_pre_v12_222(old_round_id);
  END LOOP;

  RETURN QUERY
  WITH source AS (
    SELECT round_item.id source_round_id,lineup.user_id source_user_id,
      lineup.captain_player_id,item.player_id source_player_id,item.slot_role,
      item.base_points,item.position_bonus,item.captain_bonus,item.total_points,
      fantasy_round.settings_snapshot snapshot,
      stat.goals,stat.assists,stat.own_goals,stat.team_goals_conceded,
      stat.defensive_clean_games,stat.defensive_one_goal_games,
      stat.goalkeeper_games,stat.goalkeeper_goals,stat.goalkeeper_assists,
      stat.goalkeeper_own_goals,stat.goals_conceded,stat.clean_sheets
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
    JOIN public.fantasy_lineup_players item ON item.lineup_id=lineup.id
    LEFT JOIN public.player_round_stats stat
      ON stat.round_id=round_item.id AND stat.player_id=item.player_id
    WHERE lineup.status='scored' AND round_item.status='finished'
      AND COALESCE(fantasy_round.scoring_version,
        (fantasy_round.settings_snapshot->>'scoring_version')::INTEGER,5)>=12
      AND (p_round_id IS NULL OR round_item.id=p_round_id)
  ), calculated AS (
    SELECT source.*,
      public.calculate_column_c_slot_base_v12(snapshot,slot_role,
        goals,assists,own_goals,team_goals_conceded,
        defensive_clean_games,defensive_one_goal_games,
        goalkeeper_games,goalkeeper_goals,goalkeeper_assists,
        goalkeeper_own_goals,goals_conceded,clean_sheets) expected_base_value
    FROM source
  ), expected AS (
    SELECT calculated.*,
      0::NUMERIC expected_position_value,
      CASE WHEN source_player_id=captain_player_id THEN round(
        expected_base_value*(COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5)-1),2
      ) ELSE 0 END expected_captain_value,
      CASE WHEN source_player_id=captain_player_id THEN round(
        expected_base_value*COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5),2
      ) ELSE expected_base_value END expected_total_value
    FROM calculated
  )
  SELECT expected.source_round_id,expected.source_user_id,expected.source_player_id,
    expected.base_points,expected.expected_base_value,
    expected.position_bonus,expected.expected_position_value,
    expected.captain_bonus,expected.expected_captain_value,
    expected.total_points,expected.expected_total_value
  FROM expected
  WHERE abs(COALESCE(expected.base_points,0)-COALESCE(expected.expected_base_value,0))>.001
     OR abs(COALESCE(expected.position_bonus,0)-COALESCE(expected.expected_position_value,0))>.001
     OR abs(COALESCE(expected.captain_bonus,0)-COALESCE(expected.expected_captain_value,0))>.001
     OR abs(COALESCE(expected.total_points,0)-COALESCE(expected.expected_total_value,0))>.001;
END $$;

REVOKE ALL ON FUNCTION public.audit_fantasy_scoring_integrity(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.audit_fantasy_scoring_integrity(UUID) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
