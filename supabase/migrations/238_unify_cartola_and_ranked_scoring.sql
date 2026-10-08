-- Faz o Cartola usar exatamente a pontuação oficial consolidada da Ranked.
-- A vaga escolhida continua organizando a formação, mas não recorta mais
-- os scouts do atleta: atuações no gol e na linha valem em qualquer vaga.

BEGIN;

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS scoring_version INTEGER NOT NULL DEFAULT 14;

ALTER TABLE public.fantasy_settings
  ALTER COLUMN scoring_version SET DEFAULT 14;

UPDATE public.fantasy_settings
SET scoring_version = 14,
    updated_at = now()
WHERE scoring_version IS DISTINCT FROM 14;

-- Os dois gatilhos abaixo tinham a versão 13 fixa. Sem atualizá-los, a
-- rodada seguinte voltaria silenciosamente ao motor antigo.
CREATE OR REPLACE FUNCTION public.set_bq_scoring_snapshot_on_round_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE settings public.fantasy_settings%ROWTYPE;
BEGIN
  SELECT fantasy_settings.* INTO settings
  FROM public.fantasy_settings
  JOIN public.seasons season ON season.league_id=fantasy_settings.league_id
  WHERE season.id=NEW.season_id LIMIT 1;

  IF NEW.scoring_snapshot IS NULL THEN
    NEW.scoring_snapshot:=jsonb_build_object(
      'version',14,
      'goal',COALESCE(settings.attacker_goal_points,4),
      'assist',COALESCE(settings.attacker_assist_points,2.5),
      'win',0,'draw',0,'loss',0,
      'ownGoal',COALESCE(settings.own_goal_points,-3),
      'goalkeeperAppearance',COALESCE(settings.goalkeeper_slot_appearance_points,1),
      'goalkeeperGoalConceded',COALESCE(settings.goalkeeper_slot_goal_conceded_points,-0.5),
      'defenderGoal',COALESCE(settings.defender_goal_points,5),
      'defenderAssist',COALESCE(settings.defender_assist_points,3),
      'defenderCleanSheet',COALESCE(settings.defender_clean_sheet_points,3),
      'defenderOneGoal',COALESCE(settings.defender_one_goal_points,1),
      'defenderOneGoalConceded',COALESCE(settings.defender_one_goal_conceded_points,-0.75),
      'defenderTwoGoalsConceded',COALESCE(settings.defender_two_goals_conceded_points,-1.75),
      'goalkeeperCleanSheet',COALESCE(settings.goalkeeper_slot_clean_sheet_points,4),
      'goalkeeperOneGoal',COALESCE(settings.goalkeeper_slot_one_goal_points,2),
      'teamGoalConceded',COALESCE(settings.line_goal_conceded_points,-0.5));
    NEW.scoring_version:=14;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_role_scoring_activation_from_round_two()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE settings public.fantasy_settings%ROWTYPE;
BEGIN
  SELECT fantasy_settings.* INTO settings
  FROM public.fantasy_settings
  JOIN public.fantasy_seasons season ON season.league_id=fantasy_settings.league_id
  WHERE season.id=NEW.fantasy_season_id LIMIT 1;

  NEW.settings_snapshot:=COALESCE(NEW.settings_snapshot,'{}') || jsonb_build_object(
    'scoring_version',14,'role_scoring_active',true,
    'goal_points',COALESCE(settings.attacker_goal_points,4),
    'attacker_goal_points',COALESCE(settings.attacker_goal_points,4),
    'attacker_assist_points',COALESCE(settings.attacker_assist_points,2.5),
    'defender_goal_points',COALESCE(settings.defender_goal_points,5),
    'defender_assist_points',COALESCE(settings.defender_assist_points,3),
    'defender_clean_sheet_points',COALESCE(settings.defender_clean_sheet_points,3),
    'defender_one_goal_points',COALESCE(settings.defender_one_goal_points,1),
    'defender_one_goal_conceded_points',COALESCE(settings.defender_one_goal_conceded_points,-0.75),
    'defender_two_goals_conceded_points',COALESCE(settings.defender_two_goals_conceded_points,-1.75),
    'win_points',0,'draw_points',0,'loss_points',0,
    'own_goal_points',COALESCE(settings.own_goal_points,-3),
    'line_goal_conceded_points',COALESCE(settings.line_goal_conceded_points,-0.5),
    'goalkeeper_appearance_points',COALESCE(settings.goalkeeper_slot_appearance_points,1),
    'goal_conceded_points',COALESCE(settings.goalkeeper_slot_goal_conceded_points,-0.5),
    'team_goal_conceded_points',COALESCE(settings.line_goal_conceded_points,-0.5),
    'goalkeeper_slot_appearance_points',COALESCE(settings.goalkeeper_slot_appearance_points,1),
    'goalkeeper_slot_goal_conceded_points',COALESCE(settings.goalkeeper_slot_goal_conceded_points,-0.5),
    'goalkeeper_slot_clean_sheet_points',COALESCE(settings.goalkeeper_slot_clean_sheet_points,4),
    'goalkeeper_slot_one_goal_points',COALESCE(settings.goalkeeper_slot_one_goal_points,2));
  NEW.scoring_version:=14;
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.apply_fantasy_slot_position_bonus_pre_ranked_v14_238(uuid,boolean)') IS NULL THEN
    ALTER FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN)
      RENAME TO apply_fantasy_slot_position_bonus_pre_ranked_v14_238;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_slot_position_bonus_pre_ranked_v14_238(UUID,BOOLEAN)
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
  IF p_is_test THEN
    SELECT id,settings_snapshot INTO container,snapshot
    FROM public.fantasy_test_sessions WHERE round_id=p_round_id;
  ELSE
    SELECT id,settings_snapshot INTO container,snapshot
    FROM public.fantasy_rounds WHERE round_id=p_round_id;
  END IF;

  IF COALESCE((snapshot->>'scoring_version')::INTEGER,5)<14 THEN
    RETURN public.apply_fantasy_slot_position_bonus_pre_ranked_v14_238(p_round_id,p_is_test);
  END IF;

  IF p_is_test THEN
    WITH score AS (
      SELECT item.id,item.player_id,lineup.captain_player_id,
        round(COALESCE(stat.ranking_points,stat.points,0),2) AS base
      FROM public.fantasy_test_lineup_players item
      JOIN public.fantasy_test_lineups lineup ON lineup.id=item.lineup_id
      LEFT JOIN public.player_round_stats stat
        ON stat.round_id=p_round_id AND stat.player_id=item.player_id
      WHERE lineup.test_session_id=container AND lineup.status='scored'
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
    FROM score WHERE item.id=score.id;

    UPDATE public.fantasy_test_lineups lineup SET
      player_points=COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id=lineup.id),0),
      total_points=COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id=lineup.id),0)+COALESCE(lineup.prediction_points,0),
      score_breakdown=COALESCE(lineup.score_breakdown,'{}') || jsonb_build_object(
        'playersBase',COALESCE((SELECT sum(item.base_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id=lineup.id),0),
        'positionBonus',0,
        'captainBonus',COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id=lineup.id),0),
        'scoringSource','ranked'
      )
    WHERE lineup.test_session_id=container AND lineup.status='scored';
  ELSE
    WITH score AS (
      SELECT item.id,item.player_id,lineup.captain_player_id,
        round(COALESCE(stat.ranking_points,stat.points,0),2) AS base
      FROM public.fantasy_lineup_players item
      JOIN public.fantasy_lineups lineup ON lineup.id=item.lineup_id
      LEFT JOIN public.player_round_stats stat
        ON stat.round_id=p_round_id AND stat.player_id=item.player_id
      WHERE lineup.fantasy_round_id=container AND lineup.status='scored'
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
    FROM score WHERE item.id=score.id;

    UPDATE public.fantasy_lineups lineup SET
      player_points=COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0),
      total_points=COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0)
        +COALESCE(lineup.prediction_points,0)
        +COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC,0),
      score_breakdown=COALESCE(lineup.score_breakdown,'{}') || jsonb_build_object(
        'playersBase',COALESCE((SELECT sum(item.base_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0),
        'positionBonus',0,
        'captainBonus',COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0),
        'scoringSource','ranked'
      )
    WHERE lineup.fantasy_round_id=container AND lineup.status='scored';
  END IF;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN)
  TO authenticated,service_role;

DO $$ BEGIN
  IF to_regprocedure('public.audit_fantasy_scoring_integrity_pre_ranked_v14_238(uuid)') IS NULL THEN
    ALTER FUNCTION public.audit_fantasy_scoring_integrity(UUID)
      RENAME TO audit_fantasy_scoring_integrity_pre_ranked_v14_238;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.audit_fantasy_scoring_integrity_pre_ranked_v14_238(UUID)
  FROM PUBLIC,anon,authenticated;

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
        (fantasy_round.settings_snapshot->>'scoring_version')::INTEGER,5)<14
      AND (p_round_id IS NULL OR round_item.id=p_round_id)
  LOOP
    RETURN QUERY
      SELECT * FROM public.audit_fantasy_scoring_integrity_pre_ranked_v14_238(old_round_id);
  END LOOP;

  RETURN QUERY
  WITH source AS (
    SELECT round_item.id AS source_round_id,lineup.user_id AS source_user_id,
      lineup.captain_player_id,item.player_id AS source_player_id,
      item.base_points,item.position_bonus,item.captain_bonus,item.total_points,
      fantasy_round.settings_snapshot AS snapshot,
      round(COALESCE(stat.ranking_points,stat.points,0),2) AS expected_base_value
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
    JOIN public.fantasy_lineup_players item ON item.lineup_id=lineup.id
    LEFT JOIN public.player_round_stats stat
      ON stat.round_id=round_item.id AND stat.player_id=item.player_id
    WHERE lineup.status='scored' AND round_item.status='finished'
      AND COALESCE(fantasy_round.scoring_version,
        (fantasy_round.settings_snapshot->>'scoring_version')::INTEGER,5)>=14
      AND (p_round_id IS NULL OR round_item.id=p_round_id)
  ), expected AS (
    SELECT source.*,
      0::NUMERIC AS expected_position_value,
      CASE WHEN source_player_id=captain_player_id THEN round(
        expected_base_value*(COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5)-1),2
      ) ELSE 0 END AS expected_captain_value,
      CASE WHEN source_player_id=captain_player_id THEN round(
        expected_base_value*COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5),2
      ) ELSE expected_base_value END AS expected_total_value
    FROM source
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
GRANT EXECUTE ON FUNCTION public.audit_fantasy_scoring_integrity(UUID)
  TO authenticated,service_role;

-- Somente a Rodada 07 em diante passa a usar a fonte Ranked. As Rodadas 01–06
-- permanecem congeladas com a regra histórica que estava vigente nelas.
UPDATE public.fantasy_rounds fantasy_round SET
  scoring_version=14,
  settings_snapshot=COALESCE(fantasy_round.settings_snapshot,'{}'::jsonb)
    || jsonb_build_object(
      'scoring_version',14,
      'role_scoring_active',true,
      'goal_points',COALESCE((round_item.scoring_snapshot->>'goal')::NUMERIC,4),
      'attacker_goal_points',COALESCE((round_item.scoring_snapshot->>'goal')::NUMERIC,4),
      'attacker_assist_points',COALESCE((round_item.scoring_snapshot->>'assist')::NUMERIC,2.5),
      'defender_goal_points',COALESCE((round_item.scoring_snapshot->>'defenderGoal')::NUMERIC,5),
      'defender_assist_points',COALESCE((round_item.scoring_snapshot->>'defenderAssist')::NUMERIC,3),
      'defender_clean_sheet_points',COALESCE((round_item.scoring_snapshot->>'defenderCleanSheet')::NUMERIC,2),
      'defender_one_goal_points',COALESCE((round_item.scoring_snapshot->>'defenderOneGoal')::NUMERIC,1),
      'defender_one_goal_conceded_points',COALESCE((round_item.scoring_snapshot->>'defenderOneGoalConceded')::NUMERIC,-0.75),
      'defender_two_goals_conceded_points',COALESCE((round_item.scoring_snapshot->>'defenderTwoGoalsConceded')::NUMERIC,-1.75),
      'own_goal_points',COALESCE((round_item.scoring_snapshot->>'ownGoal')::NUMERIC,-3),
      'line_goal_conceded_points',COALESCE((round_item.scoring_snapshot->>'teamGoalConceded')::NUMERIC,-0.5),
      'goalkeeper_appearance_points',COALESCE((round_item.scoring_snapshot->>'goalkeeperAppearance')::NUMERIC,1),
      'goal_conceded_points',COALESCE((round_item.scoring_snapshot->>'goalkeeperGoalConceded')::NUMERIC,-0.5),
      'team_goal_conceded_points',COALESCE((round_item.scoring_snapshot->>'teamGoalConceded')::NUMERIC,-0.5),
      'goalkeeper_slot_appearance_points',COALESCE((round_item.scoring_snapshot->>'goalkeeperAppearance')::NUMERIC,1),
      'goalkeeper_slot_goal_conceded_points',COALESCE((round_item.scoring_snapshot->>'goalkeeperGoalConceded')::NUMERIC,-0.5),
      'goalkeeper_slot_clean_sheet_points',COALESCE((round_item.scoring_snapshot->>'goalkeeperCleanSheet')::NUMERIC,4),
      'goalkeeper_slot_one_goal_points',COALESCE((round_item.scoring_snapshot->>'goalkeeperOneGoal')::NUMERIC,2)
    )
FROM public.fantasy_seasons fantasy_season
JOIN public.seasons season ON season.id=fantasy_season.season_id
JOIN public.rounds round_item ON round_item.season_id=season.id
WHERE fantasy_round.fantasy_season_id=fantasy_season.id
  AND fantasy_round.round_id=round_item.id
  AND season.status='active'
  AND round_item.number>=7;

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
