-- A configuração deve ser salva na mesma liga carregada pela página admin,
-- sem depender de qual liga foi marcada como ativa no banco.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_column_c_scoring_settings(
  p_league_id UUID,
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
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar as regras por posição.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.leagues WHERE id=p_league_id) THEN
    RAISE EXCEPTION 'Liga não encontrada.';
  END IF;

  IF p_line_goal_conceded_points > 0
    OR p_defender_one_goal_conceded_points > 0
    OR p_defender_two_goals_conceded_points > 0
    OR p_goalkeeper_goal_conceded_points > 0 THEN
    RAISE EXCEPTION 'Pontos por gol sofrido devem ser zero ou negativos.';
  END IF;

  INSERT INTO public.fantasy_settings (league_id)
  VALUES (p_league_id)
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
  WHERE league_id=p_league_id;

  INSERT INTO public.fantasy_audit_log (league_id,user_id,action,payload)
  VALUES (
    p_league_id,
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
      'defenderTwoGoalsConceded',p_defender_two_goals_conceded_points,
      'goalkeeperAppearance',p_goalkeeper_appearance_points,
      'goalkeeperGoalConceded',p_goalkeeper_goal_conceded_points,
      'goalkeeperCleanSheet',p_goalkeeper_clean_sheet_points,
      'goalkeeperOneGoal',p_goalkeeper_one_goal_points
    )
  );

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.update_column_c_scoring_settings(
  UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,
  NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC
) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.update_column_c_scoring_settings(
  UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,
  NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC
) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';

COMMIT;
