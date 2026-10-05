-- Expõe os valores da Coluna C para edição na tela Pontuação BQ.
-- As regras são usadas apenas em novas rodadas, onde ficam congeladas no snapshot.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_column_c_scoring_settings(
  p_attacker_goal_points NUMERIC,
  p_attacker_assist_points NUMERIC,
  p_line_goal_conceded_points NUMERIC,
  p_defender_goal_points NUMERIC,
  p_defender_assist_points NUMERIC,
  p_defender_clean_sheet_points NUMERIC,
  p_defender_one_goal_conceded_points NUMERIC,
  p_defender_two_goals_conceded_points NUMERIC,
  p_goalkeeper_appearance_points NUMERIC,
  p_goalkeeper_goal_conceded_points NUMERIC,
  p_goalkeeper_clean_sheet_points NUMERIC,
  p_goalkeeper_one_goal_points NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE active_league_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar as regras por posição.';
  END IF;

  IF p_line_goal_conceded_points > 0
    OR p_defender_one_goal_conceded_points > 0
    OR p_defender_two_goals_conceded_points > 0
    OR p_goalkeeper_goal_conceded_points > 0 THEN
    RAISE EXCEPTION 'Pontos por gol sofrido devem ser zero ou negativos.';
  END IF;

  SELECT id INTO active_league_id
  FROM public.leagues
  WHERE is_active=true
  ORDER BY created_at
  LIMIT 1;

  IF active_league_id IS NULL THEN
    RAISE EXCEPTION 'Liga não encontrada.';
  END IF;

  INSERT INTO public.fantasy_settings (league_id)
  VALUES (active_league_id)
  ON CONFLICT (league_id) DO NOTHING;

  UPDATE public.fantasy_settings SET
    attacker_goal_points=p_attacker_goal_points,
    attacker_assist_points=p_attacker_assist_points,
    line_goal_conceded_points=p_line_goal_conceded_points,
    defender_goal_points=p_defender_goal_points,
    defender_assist_points=p_defender_assist_points,
    defender_clean_sheet_points=p_defender_clean_sheet_points,
    defender_one_goal_conceded_points=p_defender_one_goal_conceded_points,
    defender_two_goals_conceded_points=p_defender_two_goals_conceded_points,
    goalkeeper_slot_appearance_points=p_goalkeeper_appearance_points,
    goalkeeper_slot_goal_conceded_points=p_goalkeeper_goal_conceded_points,
    goalkeeper_slot_clean_sheet_points=p_goalkeeper_clean_sheet_points,
    goalkeeper_slot_one_goal_points=p_goalkeeper_one_goal_points,
    updated_at=now()
  WHERE league_id=active_league_id;

  INSERT INTO public.fantasy_audit_log (league_id,user_id,action,payload)
  VALUES (
    active_league_id,
    auth.uid(),
    'column_c_scoring_settings_updated',
    jsonb_build_object(
      'attackerGoal',p_attacker_goal_points,
      'attackerAssist',p_attacker_assist_points,
      'lineGoalConceded',p_line_goal_conceded_points,
      'defenderGoal',p_defender_goal_points,
      'defenderAssist',p_defender_assist_points,
      'defenderCleanSheet',p_defender_clean_sheet_points,
      'defenderOneGoalConceded',p_defender_one_goal_conceded_points,
      'defenderTwoGoalsConceded',p_defender_two_goal_conceded_points,
      'goalkeeperAppearance',p_goalkeeper_appearance_points,
      'goalkeeperGoalConceded',p_goalkeeper_goal_conceded_points,
      'goalkeeperCleanSheet',p_goalkeeper_clean_sheet_points,
      'goalkeeperOneGoal',p_goalkeeper_one_goal_points
    )
  );

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.update_column_c_scoring_settings(
  NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,
  NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC
) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.update_column_c_scoring_settings(
  NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,
  NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC
) TO authenticated,service_role;

-- Cada rodada recebe uma cópia das configurações vigentes. Assim, alterações
-- futuras não reescrevem a pontuação ou o histórico de rodadas já iniciadas.
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
      'version',13,
      'goal',COALESCE(settings.attacker_goal_points,4),
      'assist',COALESCE(settings.attacker_assist_points,2.5),
      'win',0,'draw',0,'loss',0,
      'ownGoal',COALESCE(settings.own_goal_points,-3),
      'goalkeeperAppearance',COALESCE(settings.goalkeeper_slot_appearance_points,1),
      'goalkeeperGoalConceded',COALESCE(settings.goalkeeper_slot_goal_conceded_points,-0.5),
      'defenderGoal',COALESCE(settings.defender_goal_points,5),
      'defenderAssist',COALESCE(settings.defender_assist_points,3),
      'defenderCleanSheet',COALESCE(settings.defender_clean_sheet_points,2),
      'defenderOneGoal',COALESCE(settings.defender_one_goal_points,1),
      'defenderOneGoalConceded',COALESCE(settings.defender_one_goal_conceded_points,-0.75),
      'defenderTwoGoalsConceded',COALESCE(settings.defender_two_goals_conceded_points,-1.75),
      'goalkeeperCleanSheet',COALESCE(settings.goalkeeper_slot_clean_sheet_points,4),
      'goalkeeperOneGoal',COALESCE(settings.goalkeeper_slot_one_goal_points,2),
      'teamGoalConceded',COALESCE(settings.line_goal_conceded_points,-0.5));
    NEW.scoring_version:=13;
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
    'scoring_version',13,'role_scoring_active',true,
    'goal_points',COALESCE(settings.attacker_goal_points,4),
    'attacker_goal_points',COALESCE(settings.attacker_goal_points,4),
    'attacker_assist_points',COALESCE(settings.attacker_assist_points,2.5),
    'defender_goal_points',COALESCE(settings.defender_goal_points,5),
    'defender_assist_points',COALESCE(settings.defender_assist_points,3),
    'defender_clean_sheet_points',COALESCE(settings.defender_clean_sheet_points,2),
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
  NEW.scoring_version:=13;
  RETURN NEW;
END $$;

NOTIFY pgrst,'reload schema';

COMMIT;
