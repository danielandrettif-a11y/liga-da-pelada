-- Coluna C v13: a penalidade do DEF passa a ser total por partida:
-- 1 gol sofrido = -0,75; 2 gols sofridos = -1,75.
-- Os valores ficam configuráveis pelo admin e congelados no snapshot.

BEGIN;

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS defender_one_goal_conceded_points NUMERIC NOT NULL DEFAULT -0.75,
  ADD COLUMN IF NOT EXISTS defender_two_goals_conceded_points NUMERIC NOT NULL DEFAULT -1.75;

UPDATE public.fantasy_settings SET
  defender_one_goal_conceded_points = -0.75,
  defender_two_goals_conceded_points = -1.75;

CREATE OR REPLACE FUNCTION public.update_fantasy_defender_conceded_points(
  p_one_goal_points NUMERIC,
  p_two_goal_points NUMERIC
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE active_league_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar configurações do Cartola.';
  END IF;
  IF p_one_goal_points > 0 OR p_two_goal_points > 0 THEN
    RAISE EXCEPTION 'As faixas de gols sofridos do DEF devem ser zero ou negativas.';
  END IF;
  SELECT id INTO active_league_id FROM public.leagues LIMIT 1;
  IF active_league_id IS NULL THEN RAISE EXCEPTION 'Liga não encontrada.'; END IF;
  INSERT INTO public.fantasy_settings (league_id) VALUES (active_league_id)
  ON CONFLICT (league_id) DO NOTHING;
  UPDATE public.fantasy_settings SET
    defender_one_goal_conceded_points=p_one_goal_points,
    defender_two_goals_conceded_points=p_two_goal_points,
    updated_at=now()
  WHERE league_id=active_league_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.update_fantasy_defender_conceded_points(NUMERIC,NUMERIC) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_fantasy_defender_conceded_points(NUMERIC,NUMERIC) TO authenticated,service_role;

UPDATE public.overall_formula_versions
SET config=config || jsonb_build_object(
      'columnCScoring',jsonb_build_object(
        'ATA',jsonb_build_object('goal',4,'assist',2.5,'conceded',-0.5,'cleanSheet',0,'ownGoal',-3),
        'DEF',jsonb_build_object('goal',5,'assist',3,'cleanSheet',2,'oneGoalConceded',-0.75,'twoGoalsConceded',-1.75,'ownGoal',-3),
        'GOL',jsonb_build_object('appearance',1,'goal',5,'assist',3,'conceded',-0.5,'cleanSheet',4,'oneGoal',2,'ownGoal',-3)
      )
    )
WHERE key IN ('adaptive-v17-three-positions-column-c','adaptive-v18-fluid-profile');

-- A Ranked ativa usa a regra nova desde a primeira rodada, como nas versões
-- anteriores da Coluna C. Cada rodada recebe os valores atuais da liga.
SELECT set_config('app.allow_bq_snapshot_rewrite','on',true);
UPDATE public.rounds round_item SET
  scoring_version=13,
  scoring_snapshot=jsonb_build_object(
    'version',13,'goal',4,'assist',2.5,'win',0,'draw',0,'loss',0,
    'ownGoal',-3,'goalkeeperAppearance',1,'goalkeeperGoalConceded',-0.5,
    'defenderGoal',5,'defenderAssist',3,'defenderCleanSheet',2,'defenderOneGoal',1,
    'defenderOneGoalConceded',settings.defender_one_goal_conceded_points,
    'defenderTwoGoalsConceded',settings.defender_two_goals_conceded_points,
    'goalkeeperCleanSheet',4,'goalkeeperOneGoal',2,'teamGoalConceded',-0.5)
FROM public.seasons season
JOIN public.fantasy_settings settings ON settings.league_id=season.league_id
WHERE season.id=round_item.season_id AND season.status='active'
  AND round_item.round_type='official';

UPDATE public.player_round_stats stats SET
  points=CASE WHEN EXISTS (
    SELECT 1 FROM public.player_round_stat_overrides override_item
    WHERE override_item.round_id=stats.round_id AND override_item.player_id=stats.player_id
      AND override_item.override_type='zero_points'
  ) THEN 0 ELSE round(
    GREATEST(stats.goals-COALESCE(stats.goalkeeper_goals,0),0)
      * CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive' THEN 5 ELSE 4 END
    + GREATEST(stats.assists-COALESCE(stats.goalkeeper_assists,0),0)
      * CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive' THEN 3 ELSE 2.5 END
    + CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive' THEN
        COALESCE(stats.ranking_defensive_clean_games,0)*2
        + COALESCE(stats.ranking_defensive_one_goal_games,0)*settings.defender_one_goal_conceded_points
        + GREATEST((
            GREATEST(stats.team_goals_conceded-COALESCE(stats.goals_conceded,0),0)
            - COALESCE(stats.ranking_defensive_one_goal_games,0)
          )/2.0,0)*settings.defender_two_goals_conceded_points
      ELSE GREATEST(stats.team_goals_conceded-COALESCE(stats.goals_conceded,0),0)*-0.5 END
    + GREATEST(stats.own_goals-COALESCE(stats.goalkeeper_own_goals,0),0)*-3
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
  ranking_position_bonus=0
FROM public.players player, public.rounds round_item, public.seasons season,
  public.fantasy_settings settings
WHERE player.id=stats.player_id AND round_item.id=stats.round_id
  AND season.id=round_item.season_id AND settings.league_id=season.league_id
  AND season.status='active'
  AND round_item.round_type='official';

-- Novas rodadas Ranked congelam também as duas faixas configuráveis.
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
      'version',13,'goal',4,'assist',2.5,'win',0,'draw',0,'loss',0,
      'ownGoal',-3,'goalkeeperAppearance',1,'goalkeeperGoalConceded',-0.5,
      'defenderGoal',5,'defenderAssist',3,'defenderCleanSheet',2,'defenderOneGoal',1,
      'defenderOneGoalConceded',COALESCE(settings.defender_one_goal_conceded_points,-0.75),
      'defenderTwoGoalsConceded',COALESCE(settings.defender_two_goals_conceded_points,-1.75),
      'goalkeeperCleanSheet',4,'goalkeeperOneGoal',2,'teamGoalConceded',-0.5);
    NEW.scoring_version:=13;
  END IF;
  RETURN NEW;
END $$;

-- Novas rodadas do Cartola congelam os valores configurados pelo admin.
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
    'goal_points',4,'attacker_goal_points',4,'attacker_assist_points',2.5,
    'defender_goal_points',5,'defender_assist_points',3,
    'defender_clean_sheet_points',2,'defender_one_goal_points',1,
    'defender_one_goal_conceded_points',COALESCE(settings.defender_one_goal_conceded_points,-0.75),
    'defender_two_goals_conceded_points',COALESCE(settings.defender_two_goals_conceded_points,-1.75),
    'win_points',0,'draw_points',0,'loss_points',0,'own_goal_points',-3,
    'line_goal_conceded_points',-0.5,'goalkeeper_appearance_points',1,
    'goal_conceded_points',-0.5,'team_goal_conceded_points',-0.5,
    'goalkeeper_slot_appearance_points',1,'goalkeeper_slot_goal_conceded_points',-0.5,
    'goalkeeper_slot_clean_sheet_points',4,'goalkeeper_slot_one_goal_points',2);
  NEW.scoring_version:=13;
  RETURN NEW;
END $$;

-- Cartolas encerrados preservam o snapshot. Apenas janelas abertas adotam V13.
UPDATE public.fantasy_rounds fantasy_round SET
  scoring_version=13,
  settings_snapshot=COALESCE(fantasy_round.settings_snapshot,'{}') || jsonb_build_object(
    'scoring_version',13,'role_scoring_active',true,
    'defender_one_goal_conceded_points',settings.defender_one_goal_conceded_points,
    'defender_two_goals_conceded_points',settings.defender_two_goals_conceded_points)
FROM public.rounds round_item
JOIN public.fantasy_seasons season ON season.season_id=round_item.season_id
JOIN public.fantasy_settings settings ON settings.league_id=season.league_id
WHERE round_item.id=fantasy_round.round_id AND fantasy_round.fantasy_season_id=season.id
  AND fantasy_round.market_status='open' AND round_item.status<>'finished';

UPDATE public.fantasy_test_sessions test_session SET
  scoring_version=13,
  settings_snapshot=COALESCE(test_session.settings_snapshot,'{}') || jsonb_build_object(
    'scoring_version',13,'role_scoring_active',true,
    'defender_one_goal_conceded_points',settings.defender_one_goal_conceded_points,
    'defender_two_goals_conceded_points',settings.defender_two_goals_conceded_points)
FROM public.fantasy_settings settings, public.rounds round_item
WHERE settings.league_id=test_session.league_id AND round_item.id=test_session.round_id
  AND test_session.status='open' AND round_item.status<>'finished';

-- O nome histórico é preservado porque as wrappers V12 já chamam esta função.
-- O branch pelo snapshot mantém a auditoria das rodadas V12 intacta.
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
      +COALESCE(p_defensive_clean_games,0)*COALESCE((p_snapshot->>'defender_clean_sheet_points')::NUMERIC,2)
      +CASE WHEN COALESCE((p_snapshot->>'scoring_version')::INTEGER,12)>=13 THEN
          COALESCE(p_defensive_one_goal_games,0)*COALESCE((p_snapshot->>'defender_one_goal_conceded_points')::NUMERIC,-0.75)
          +GREATEST((
              GREATEST(COALESCE(p_team_goals_conceded,0)-COALESCE(p_goals_conceded,0),0)
              -COALESCE(p_defensive_one_goal_games,0)
            )/2.0,0)*COALESCE((p_snapshot->>'defender_two_goals_conceded_points')::NUMERIC,-1.75)
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

REVOKE ALL ON FUNCTION public.calculate_column_c_slot_base_v12(JSONB,TEXT,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER) FROM PUBLIC,anon,authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
