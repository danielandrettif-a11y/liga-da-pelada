-- Corrige instalações legadas que ainda não possuem todos os campos da Coluna C
-- e torna o clean sheet regressivo do DEF configurável.

BEGIN;

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS attacker_goal_points NUMERIC NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS attacker_assist_points NUMERIC NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS line_goal_conceded_points NUMERIC NOT NULL DEFAULT -0.5,
  ADD COLUMN IF NOT EXISTS defender_goal_points NUMERIC NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS defender_assist_points NUMERIC NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS defender_clean_sheet_points NUMERIC NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS defender_one_goal_points NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS defender_one_goal_conceded_points NUMERIC NOT NULL DEFAULT -0.75,
  ADD COLUMN IF NOT EXISTS defender_two_goals_conceded_points NUMERIC NOT NULL DEFAULT -1.75,
  ADD COLUMN IF NOT EXISTS goalkeeper_slot_appearance_points NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS goalkeeper_slot_goal_conceded_points NUMERIC NOT NULL DEFAULT -0.5,
  ADD COLUMN IF NOT EXISTS goalkeeper_slot_clean_sheet_points NUMERIC NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS goalkeeper_slot_one_goal_points NUMERIC NOT NULL DEFAULT 2;

-- Padrão inicial do clean sheet regressivo: +3 sem sofrer gol e +1 quando
-- sofre exatamente um gol. O segundo valor ainda recebe a penalidade -0,75.
UPDATE public.fantasy_settings
SET defender_clean_sheet_points=3,
    defender_one_goal_points=1,
    updated_at=now();

CREATE OR REPLACE FUNCTION public.update_column_c_scoring_settings(
  p_league_id UUID,
  p_attacker_goal_points NUMERIC,
  p_attacker_assist_points NUMERIC,
  p_line_goal_conceded_points NUMERIC,
  p_defender_goal_points NUMERIC,
  p_defender_assist_points NUMERIC,
  p_defender_clean_sheet_points NUMERIC,
  p_defender_one_goal_points NUMERIC,
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
    defender_one_goal_points=p_defender_one_goal_points,
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
    p_league_id,auth.uid(),'column_c_scoring_settings_updated',
    jsonb_build_object(
      'attackerGoal',p_attacker_goal_points,
      'attackerAssist',p_attacker_assist_points,
      'lineGoalConceded',p_line_goal_conceded_points,
      'defenderGoal',p_defender_goal_points,
      'defenderAssist',p_defender_assist_points,
      'defenderCleanSheet',p_defender_clean_sheet_points,
      'defenderOneGoal',p_defender_one_goal_points,
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
  NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC
) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.update_column_c_scoring_settings(
  UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,
  NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC
) TO authenticated,service_role;

-- A regra v13 soma o bônus reduzido de um gol sofrido à penalidade daquele gol.
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
      +GREATEST(LEAST(COALESCE(p_goalkeeper_games,0)-COALESCE(p_clean_sheets,0),2*(COALESCE(p_goalkeeper_games,0)-COALESCE(p_clean_sheets,0))-COALESCE(p_goals_conceded,0)),0)*COALESCE((p_snapshot->>'goalkeeper_slot_one_goal_points')::NUMERIC,2)
      +COALESCE(p_goalkeeper_own_goals,0)*COALESCE((p_snapshot->>'own_goal_points')::NUMERIC,-3)
    WHEN 'DEF' THEN
      GREATEST(COALESCE(p_goals,0)-COALESCE(p_goalkeeper_goals,0),0)*COALESCE((p_snapshot->>'defender_goal_points')::NUMERIC,5)
      +GREATEST(COALESCE(p_assists,0)-COALESCE(p_goalkeeper_assists,0),0)*COALESCE((p_snapshot->>'defender_assist_points')::NUMERIC,3)
      +COALESCE(p_defensive_clean_games,0)*COALESCE((p_snapshot->>'defender_clean_sheet_points')::NUMERIC,3)
      +CASE WHEN COALESCE((p_snapshot->>'scoring_version')::INTEGER,12)>=13 THEN
          COALESCE(p_defensive_one_goal_games,0)*COALESCE((p_snapshot->>'defender_one_goal_points')::NUMERIC,1)
          +COALESCE(p_defensive_one_goal_games,0)*COALESCE((p_snapshot->>'defender_one_goal_conceded_points')::NUMERIC,-0.75)
          +GREATEST((GREATEST(COALESCE(p_team_goals_conceded,0)-COALESCE(p_goals_conceded,0),0)-COALESCE(p_defensive_one_goal_games,0))/2.0,0)*COALESCE((p_snapshot->>'defender_two_goals_conceded_points')::NUMERIC,-1.75)
        ELSE
          GREATEST(COALESCE(p_team_goals_conceded,0)-COALESCE(p_goals_conceded,0),0)*COALESCE((p_snapshot->>'line_goal_conceded_points')::NUMERIC,-0.5)
          +COALESCE(p_defensive_one_goal_games,0)*COALESCE((p_snapshot->>'defender_one_goal_points')::NUMERIC,1)
        END
      +GREATEST(COALESCE(p_own_goals,0)-COALESCE(p_goalkeeper_own_goals,0),0)*COALESCE((p_snapshot->>'own_goal_points')::NUMERIC,-3)
    ELSE
      GREATEST(COALESCE(p_goals,0)-COALESCE(p_goalkeeper_goals,0),0)*COALESCE((p_snapshot->>'attacker_goal_points')::NUMERIC,4)
      +GREATEST(COALESCE(p_assists,0)-COALESCE(p_goalkeeper_assists,0),0)*COALESCE((p_snapshot->>'attacker_assist_points')::NUMERIC,2.5)
      +GREATEST(COALESCE(p_team_goals_conceded,0)-COALESCE(p_goals_conceded,0),0)*COALESCE((p_snapshot->>'line_goal_conceded_points')::NUMERIC,-0.5)
      +GREATEST(COALESCE(p_own_goals,0)-COALESCE(p_goalkeeper_own_goals,0),0)*COALESCE((p_snapshot->>'own_goal_points')::NUMERIC,-3)
  END,2);
$$;

NOTIFY pgrst,'reload schema';

COMMIT;
