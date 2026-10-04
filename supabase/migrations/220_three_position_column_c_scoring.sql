-- Coluna C v11: DEF/VOL, ATA/ALA e GOL, com -0,5 por gol sofrido.
-- A Ranked ativa é recalculada desde a rodada 1; fechamentos antigos do
-- Cartola permanecem congelados e somente mercados abertos recebem a v11.

BEGIN;

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS defender_goal_points NUMERIC NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS defender_assist_points NUMERIC NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS defender_clean_sheet_points NUMERIC NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS attacker_assist_points NUMERIC NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS line_goal_conceded_points NUMERIC NOT NULL DEFAULT -0.5;

UPDATE public.fantasy_settings SET
  goal_points = 4,
  attacker_goal_points = 4,
  attacker_assist_points = 2.5,
  defender_goal_points = 5,
  defender_assist_points = 3,
  defender_clean_sheet_points = 2,
  win_points = 0,
  draw_points = 0,
  loss_points = 0,
  goalkeeper_appearance_points = 1,
  goal_conceded_points = -0.5,
  team_goal_conceded_points = -0.5,
  line_goal_conceded_points = -0.5,
  own_goal_points = -3;

UPDATE public.ranking_rules
SET points = CASE event_type
  WHEN 'goal' THEN 4
  WHEN 'assist' THEN 2.5
  WHEN 'win' THEN 0
  WHEN 'draw' THEN 0
  WHEN 'loss' THEN 0
  WHEN 'own_goal' THEN -3
  WHEN 'goalkeeper_appearance' THEN 1
  WHEN 'goal_conceded' THEN -0.5
  ELSE points
END
WHERE event_type IN (
  'goal','assist','win','draw','loss','own_goal',
  'goalkeeper_appearance','goal_conceded'
);

-- A antiga posição ALA/MEI passa a ser ATA/ALA. Mantemos valores legados
-- apenas nas tabelas históricas para continuar lendo rodadas encerradas.
UPDATE public.players SET player_profile = 'offensive' WHERE player_profile = 'midfield';
UPDATE public.player_round_stats SET player_profile_locked = 'offensive' WHERE player_profile_locked = 'midfield';
UPDATE public.players player SET overall_traits = COALESCE((
  SELECT array_agg(value ORDER BY first_position)
  FROM (
    SELECT CASE WHEN trait = 'midfield' THEN 'offensive' ELSE trait END value,
           min(ordinality) first_position
    FROM unnest(player.overall_traits) WITH ORDINALITY source(trait, ordinality)
    GROUP BY CASE WHEN trait = 'midfield' THEN 'offensive' ELSE trait END
  ) normalized
), '{}'::TEXT[])
WHERE 'midfield' = ANY(player.overall_traits);

ALTER TABLE public.players ALTER COLUMN player_profile SET DEFAULT 'offensive';

-- Os cadastros e mesclagens antigas ainda usavam ALA/MEI como fallback.
-- Reescrevemos somente esses literais para que novos perfis já nasçam ATA/ALA.
DO $$
DECLARE definition TEXT;
BEGIN
  IF to_regprocedure('public.normalize_player_category()') IS NOT NULL THEN
    definition := pg_get_functiondef('public.normalize_player_category()'::regprocedure);
    definition := replace(definition, 'COALESCE(NEW.player_profile, ''midfield'')', 'COALESCE(NEW.player_profile, ''offensive'')');
    EXECUTE definition;
  END IF;

  IF to_regprocedure('public.ensure_player_account_for_user(uuid)') IS NOT NULL THEN
    definition := pg_get_functiondef('public.ensure_player_account_for_user(uuid)'::regprocedure);
    definition := replace(definition, '''midfield'', ''observed''', '''offensive'', ''observed''');
    EXECUTE definition;
  END IF;

  IF to_regprocedure('public.merge_selectable_player_profiles(uuid,uuid)') IS NOT NULL THEN
    definition := pg_get_functiondef('public.merge_selectable_player_profiles(uuid,uuid)'::regprocedure);
    definition := replace(definition, ',''midfield'')', ',''offensive'')');
    definition := replace(definition, ', ''midfield'')', ', ''offensive'')');
    EXECUTE definition;
  END IF;
END;
$$;

ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_player_profile_check;
ALTER TABLE public.players ADD CONSTRAINT players_player_profile_check
  CHECK (player_profile IN ('offensive', 'defensive'));
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_overall_traits_values_check;
ALTER TABLE public.players ADD CONSTRAINT players_overall_traits_values_check CHECK (
  cardinality(overall_traits) <= 2
  AND overall_traits <@ ARRAY['defensive', 'offensive']::TEXT[]
);

DROP INDEX IF EXISTS public.players_competitive_profile_idx;
ALTER TABLE public.players DROP COLUMN IF EXISTS is_competitive_profile_complete;
ALTER TABLE public.players ADD COLUMN is_competitive_profile_complete BOOLEAN
  GENERATED ALWAYS AS (
    member_category = 'player' AND is_selectable = true
    AND NULLIF(btrim(name), '') IS NOT NULL
    AND NULLIF(btrim(avatar_url), '') IS NOT NULL
    AND player_profile IN ('defensive', 'offensive')
    AND COALESCE(cardinality(overall_traits), 0) BETWEEN 1 AND 2
  ) STORED;
CREATE INDEX players_competitive_profile_idx ON public.players(name)
  WHERE is_competitive_profile_complete = true;

-- Fórmula de OVR com três posições. A coluna ala_mei_overall permanece como
-- alias físico de ATA nos novos snapshots por compatibilidade de schema.
INSERT INTO public.overall_formula_versions(key, label, config)
SELECT 'adaptive-v17-three-positions-column-c',
       'OVR adaptativo v17 — três posições e Coluna C',
       config || jsonb_build_object(
         'threePositionModel', true,
         'columnCScoring', jsonb_build_object(
           'ATA', jsonb_build_object('goal',4,'assist',2.5,'conceded',-0.5,'cleanSheet',0,'ownGoal',-3),
           'DEF', jsonb_build_object('goal',5,'assist',3,'conceded',-0.5,'cleanSheet',2,'ownGoal',-3),
           'GOL', jsonb_build_object('appearance',1,'goal',5,'assist',3,'conceded',-0.5,'cleanSheet',2,'ownGoal',-3)
         ),
         'positionWeights', jsonb_build_object(
           'DEF', jsonb_build_object('defense',0.55,'goals',0.28,'assists',0.17,'result',0),
           'ALA_MEI', jsonb_build_object('defense',0.15,'goals',0.55,'assists',0.30,'result',0),
           'ATA', jsonb_build_object('defense',0.15,'goals',0.55,'assists',0.30,'result',0)
         )
       )
FROM public.overall_formula_versions WHERE key = 'adaptive-v16-distributed-trait-bonus'
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, config = EXCLUDED.config;

-- Algumas instalações ainda têm a versão antiga deste RPC, com menos colunas
-- OUT. PostgreSQL não permite alterar o tipo composto usando OR REPLACE.
DROP FUNCTION IF EXISTS public.get_latest_player_card_overalls();
CREATE OR REPLACE FUNCTION public.get_latest_player_card_overalls()
RETURNS TABLE(player_id UUID, overall NUMERIC, trend TEXT, def_overall NUMERIC,
  ala_mei_overall NUMERIC, ata_overall NUMERIC, gol_overall NUMERIC,
  goalkeeper_rounds INTEGER, goalkeeper_games INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT ON (snapshot.player_id)
    snapshot.player_id, snapshot.overall,
    COALESCE(snapshot.data_quality->>'overall_trend','steady'),
    snapshot.def_overall, snapshot.ata_overall, snapshot.ata_overall,
    snapshot.gol_overall, snapshot.goalkeeper_rounds, snapshot.goalkeeper_games
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id=snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
  JOIN public.players player ON player.id=snapshot.player_id
  WHERE run.status='published' AND player.is_competitive_profile_complete=true
  ORDER BY snapshot.player_id,
    CASE WHEN formula.key='adaptive-v17-three-positions-column-c' THEN 0 ELSE 1 END,
    run.published_at DESC NULLS LAST, run.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_player_card_overalls() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_manager_player_catalog()
RETURNS TABLE (
  player_id UUID, name TEXT, avatar_url TEXT, snapshot_id UUID,
  formula TEXT, captured_at TIMESTAMPTZ, overall NUMERIC,
  def_overall NUMERIC, ala_mei_overall NUMERIC, ata_overall NUMERIC, gol_overall NUMERIC,
  traits TEXT[], goalkeeper_eligible BOOLEAN, trend TEXT,
  rounds INTEGER, goals INTEGER, assists INTEGER
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT ON (player.id)
    player.id, COALESCE(NULLIF(player.nickname,''),player.name)::TEXT, player.avatar_url::TEXT,
    snapshot.id, formula.key, run.created_at, snapshot.overall,
    snapshot.def_overall,
    CASE WHEN formula.key='adaptive-v17-three-positions-column-c' THEN snapshot.ata_overall ELSE snapshot.ala_mei_overall END,
    snapshot.ata_overall, snapshot.gol_overall, player.overall_traits::TEXT[],
    (snapshot.goalkeeper_games >= COALESCE((formula.config->>'goalkeeperEligibilityGames')::INTEGER,8)
      AND snapshot.goalkeeper_rounds >= COALESCE((formula.config->>'goalkeeperEligibilityRounds')::INTEGER,3)),
    COALESCE(snapshot.data_quality->>'overall_trend','steady'), snapshot.rounds_played,
    COALESCE((snapshot.data_quality->'scout_totals'->>'goals')::INTEGER,0),
    COALESCE((snapshot.data_quality->'scout_totals'->>'assists')::INTEGER,0)
  FROM public.players player
  JOIN public.player_overall_snapshots snapshot ON snapshot.player_id=player.id
  JOIN public.overall_calculation_runs run ON run.id=snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
  WHERE player.is_competitive_profile_complete=true
    AND formula.key IN (
      'adaptive-v17-three-positions-column-c','adaptive-v16-distributed-trait-bonus',
      'adaptive-v15-goalkeeper-outcomes','adaptive-v14-role-adjusted-rates',
      'adaptive-v13-admin-style-evidence','adaptive-v12-top-three-progression',
      'adaptive-v11-balanced-characteristics')
    AND ((formula.key IN (
        'adaptive-v17-three-positions-column-c','adaptive-v16-distributed-trait-bonus',
        'adaptive-v15-goalkeeper-outcomes','adaptive-v14-role-adjusted-rates',
        'adaptive-v13-admin-style-evidence') AND run.status='published')
      OR (formula.key NOT IN (
        'adaptive-v17-three-positions-column-c','adaptive-v16-distributed-trait-bonus',
        'adaptive-v15-goalkeeper-outcomes','adaptive-v14-role-adjusted-rates',
        'adaptive-v13-admin-style-evidence') AND run.status IN ('succeeded','published')))
  ORDER BY player.id,
    CASE formula.key
      WHEN 'adaptive-v17-three-positions-column-c' THEN 0
      WHEN 'adaptive-v16-distributed-trait-bonus' THEN 1
      WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 2
      WHEN 'adaptive-v14-role-adjusted-rates' THEN 3
      WHEN 'adaptive-v13-admin-style-evidence' THEN 4
      WHEN 'adaptive-v12-top-three-progression' THEN 5 ELSE 6 END,
    run.created_at DESC,run.id DESC;
$$;
REVOKE ALL ON FUNCTION public.get_manager_player_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_player_catalog() TO authenticated;

-- Snapshot Ranked v11 para a temporada ativa e recálculo retroativo.
SELECT set_config('app.allow_bq_snapshot_rewrite', 'on', true);
UPDATE public.rounds round_item SET
  scoring_version = 11,
  scoring_snapshot = jsonb_build_object(
    'version',11,'goal',4,'assist',2.5,'win',0,'draw',0,'loss',0,
    'ownGoal',-3,'goalkeeperAppearance',1,'goalkeeperGoalConceded',-0.5,
    'defenderGoal',5,'defenderAssist',3,'defenderCleanSheet',2,
    'teamGoalConceded',-0.5
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
    -- Parcela de linha: scouts registrados no gol são removidos.
    GREATEST(stats.goals-COALESCE(stats.goalkeeper_goals,0),0)
      * CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive' THEN 5 ELSE 4 END
    + GREATEST(stats.assists-COALESCE(stats.goalkeeper_assists,0),0)
      * CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive' THEN 3 ELSE 2.5 END
    + GREATEST(stats.team_goals_conceded-COALESCE(stats.goals_conceded,0),0) * -0.5
    + CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive'
        THEN COALESCE(stats.ranking_defensive_clean_games,0)*2 ELSE 0 END
    + GREATEST(stats.own_goals-COALESCE(stats.goalkeeper_own_goals,0),0) * -3
    -- Parcela GOL: somente o que aconteceu enquanto estava no gol.
    + COALESCE(stats.goalkeeper_games,0)*1
    + COALESCE(stats.goalkeeper_goals,0)*5
    + COALESCE(stats.goalkeeper_assists,0)*3
    + COALESCE(stats.goals_conceded,0)*-0.5
    + COALESCE(stats.clean_sheets,0)*2
    + COALESCE(stats.goalkeeper_own_goals,0)*-3
  ,2) END,
  ranking_position_bonus = 0,
  ranking_role_weights = jsonb_build_array(jsonb_build_object(
    'role', CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive' THEN 'DEF' ELSE 'ATA' END,
    'overall',0,'weight',1
  ))
FROM public.players player, public.rounds round_item, public.seasons season
WHERE player.id=stats.player_id AND round_item.id=stats.round_id
  AND season.id=round_item.season_id AND season.status='active'
  AND round_item.round_type='official';

-- Novas rodadas sempre congelam a Coluna C.
CREATE OR REPLACE FUNCTION public.set_bq_scoring_snapshot_on_round_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.scoring_snapshot IS NULL THEN
    NEW.scoring_snapshot:=jsonb_build_object(
      'version',11,'goal',4,'assist',2.5,'win',0,'draw',0,'loss',0,
      'ownGoal',-3,'goalkeeperAppearance',1,'goalkeeperGoalConceded',-0.5,
      'defenderGoal',5,'defenderAssist',3,'defenderCleanSheet',2,'teamGoalConceded',-0.5);
    NEW.scoring_version:=11;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_role_scoring_activation_from_round_two()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  NEW.settings_snapshot:=COALESCE(NEW.settings_snapshot,'{}') || jsonb_build_object(
    'scoring_version',11,'role_scoring_active',true,
    'goal_points',4,'attacker_goal_points',4,'attacker_assist_points',2.5,
    'defender_goal_points',5,'defender_assist_points',3,'defender_clean_sheet_points',2,
    'win_points',0,'draw_points',0,'loss_points',0,'own_goal_points',-3,
    'line_goal_conceded_points',-0.5,'goalkeeper_appearance_points',1,
    'goal_conceded_points',-0.5,'team_goal_conceded_points',-0.5,
    'goalkeeper_slot_appearance_points',1,'goalkeeper_slot_goal_conceded_points',-0.5,
    'goalkeeper_slot_clean_sheet_points',2);
  NEW.scoring_version:=11;
  RETURN NEW;
END $$;

-- Somente rodadas do Cartola ainda abertas migram para a regra nova.
UPDATE public.fantasy_rounds fantasy_round SET
  scoring_version=11,
  settings_snapshot=COALESCE(fantasy_round.settings_snapshot,'{}') || jsonb_build_object(
    'scoring_version',11,'role_scoring_active',true,
    'goal_points',4,'attacker_goal_points',4,'attacker_assist_points',2.5,
    'defender_goal_points',5,'defender_assist_points',3,'defender_clean_sheet_points',2,
    'win_points',0,'draw_points',0,'loss_points',0,'own_goal_points',-3,
    'line_goal_conceded_points',-0.5,'goalkeeper_slot_appearance_points',1,
    'goalkeeper_slot_goal_conceded_points',-0.5,'goalkeeper_slot_clean_sheet_points',2,
    'captain_multiplier',COALESCE((fantasy_round.settings_snapshot->>'captain_multiplier')::NUMERIC,1.5)
  )
FROM public.rounds round_item
WHERE round_item.id=fantasy_round.round_id AND fantasy_round.market_status='open'
  AND round_item.status<>'finished';

UPDATE public.fantasy_test_sessions test_session SET
  scoring_version=11,
  settings_snapshot=COALESCE(test_session.settings_snapshot,'{}') || jsonb_build_object(
    'scoring_version',11,'role_scoring_active',true,
    'goal_points',4,'attacker_goal_points',4,'attacker_assist_points',2.5,
    'defender_goal_points',5,'defender_assist_points',3,'defender_clean_sheet_points',2,
    'win_points',0,'draw_points',0,'loss_points',0,'own_goal_points',-3,
    'line_goal_conceded_points',-0.5,'goalkeeper_slot_appearance_points',1,
    'goalkeeper_slot_goal_conceded_points',-0.5,'goalkeeper_slot_clean_sheet_points',2,
    'captain_multiplier',COALESCE((test_session.settings_snapshot->>'captain_multiplier')::NUMERIC,1.5)
  )
FROM public.rounds round_item
WHERE round_item.id=test_session.round_id AND test_session.status='open'
  AND round_item.status<>'finished';

UPDATE public.fantasy_lineup_players item SET
  slot_role=CASE WHEN item.slot_role='MEI' THEN 'ATA' ELSE item.slot_role END,
  player_profile_locked=CASE WHEN item.player_profile_locked='midfield' THEN 'offensive' ELSE item.player_profile_locked END,
  is_position_correct=CASE WHEN item.slot_role='GOL' THEN true
    WHEN item.slot_role='DEF' THEN player.player_profile='defensive'
    ELSE player.player_profile='offensive' END
FROM public.fantasy_lineups lineup, public.fantasy_rounds fantasy_round, public.players player
WHERE item.lineup_id=lineup.id AND fantasy_round.id=lineup.fantasy_round_id
  AND player.id=item.player_id AND fantasy_round.market_status='open';

UPDATE public.fantasy_portfolio_players item SET
  slot_role=CASE WHEN item.slot_role='MEI' THEN 'ATA' ELSE item.slot_role END,
  player_profile_locked=CASE WHEN item.player_profile_locked='midfield' THEN 'offensive' ELSE item.player_profile_locked END,
  is_position_correct=CASE WHEN item.slot_role='GOL' THEN true
    WHEN item.slot_role='DEF' THEN player.player_profile='defensive'
    ELSE player.player_profile='offensive' END
FROM public.players player WHERE player.id=item.player_id;

CREATE OR REPLACE FUNCTION public.is_valid_fantasy_formation_v11(p_slots JSONB,p_team_size INTEGER)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  WITH roles AS (
    SELECT COALESCE(item->>'slot_role',item->>'slotRole') role
    FROM jsonb_array_elements(COALESCE(p_slots,'[]'::JSONB)) item
  ), counts AS (
    SELECT count(*) total, count(*) FILTER(WHERE role='GOL') gol,
      count(*) FILTER(WHERE role='DEF') def, count(*) FILTER(WHERE role='ATA') ata,
      count(*) FILTER(WHERE role NOT IN('GOL','DEF','ATA')) invalid FROM roles
  )
  SELECT p_team_size=6 AND total=6 AND gol=1 AND invalid=0
    AND ((def=3 AND ata=2) OR (def=2 AND ata=3)) FROM counts;
$$;

-- Preserva os RPCs anteriores e adiciona validação estrita às gravações novas.
DO $$ BEGIN
  IF to_regprocedure('public.save_fantasy_lineup_pre_three_positions_220(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.save_fantasy_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB)
      RENAME TO save_fantasy_lineup_pre_three_positions_220;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.save_fantasy_lineup(p_round_id UUID,p_player_ids UUID[],p_captain_player_id UUID,p_top_scorer_player_id UUID,p_top_assist_player_id UUID,p_challenge_player_id UUID,p_lineup_slots JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved UUID; team_size INTEGER;
BEGIN
  SELECT league.players_per_team INTO team_size FROM public.rounds round_item JOIN public.leagues league ON league.id=round_item.league_id WHERE round_item.id=p_round_id;
  IF NOT public.is_valid_fantasy_formation_v11(p_lineup_slots,team_size) THEN RAISE EXCEPTION 'Use 1 GOL e escolha 3 DEF + 2 ATA ou 2 DEF + 3 ATA.'; END IF;
  saved:=public.save_fantasy_lineup_pre_three_positions_220(p_round_id,p_player_ids,p_captain_player_id,p_top_scorer_player_id,p_top_assist_player_id,p_challenge_player_id,p_lineup_slots);
  UPDATE public.fantasy_lineup_players item SET player_profile_locked=player.player_profile,
    is_position_correct=CASE item.slot_role WHEN 'GOL' THEN true WHEN 'DEF' THEN player.player_profile='defensive' WHEN 'ATA' THEN player.player_profile='offensive' ELSE false END
  FROM public.players player WHERE item.lineup_id=saved AND player.id=item.player_id;
  RETURN saved;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.save_fantasy_test_lineup_pre_three_positions_220(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.save_fantasy_test_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB)
      RENAME TO save_fantasy_test_lineup_pre_three_positions_220;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.save_fantasy_test_lineup(p_round_id UUID,p_player_ids UUID[],p_captain_player_id UUID,p_top_scorer_player_id UUID,p_top_assist_player_id UUID,p_challenge_player_id UUID,p_lineup_slots JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved UUID; team_size INTEGER;
BEGIN
  SELECT league.players_per_team INTO team_size FROM public.rounds round_item JOIN public.leagues league ON league.id=round_item.league_id WHERE round_item.id=p_round_id;
  IF NOT public.is_valid_fantasy_formation_v11(p_lineup_slots,team_size) THEN RAISE EXCEPTION 'Use 1 GOL e escolha 3 DEF + 2 ATA ou 2 DEF + 3 ATA.'; END IF;
  saved:=public.save_fantasy_test_lineup_pre_three_positions_220(p_round_id,p_player_ids,p_captain_player_id,p_top_scorer_player_id,p_top_assist_player_id,p_challenge_player_id,p_lineup_slots);
  UPDATE public.fantasy_test_lineup_players item SET player_profile_locked=player.player_profile,
    is_position_correct=CASE item.slot_role WHEN 'GOL' THEN true WHEN 'DEF' THEN player.player_profile='defensive' WHEN 'ATA' THEN player.player_profile='offensive' ELSE false END
  FROM public.players player WHERE item.lineup_id=saved AND player.id=item.player_id;
  RETURN saved;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.save_fantasy_portfolio_pre_three_positions_220(uuid,uuid[],uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.save_fantasy_portfolio(UUID,UUID[],UUID,JSONB)
      RENAME TO save_fantasy_portfolio_pre_three_positions_220;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.save_fantasy_portfolio(p_fantasy_season_id UUID,p_player_ids UUID[],p_captain_player_id UUID,p_lineup_slots JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved UUID; team_size INTEGER;
BEGIN
  SELECT league.players_per_team INTO team_size FROM public.fantasy_seasons fantasy_season JOIN public.leagues league ON league.id=fantasy_season.league_id WHERE fantasy_season.id=p_fantasy_season_id;
  IF jsonb_array_length(COALESCE(p_lineup_slots,'[]'))>0 AND NOT public.is_valid_fantasy_formation_v11(p_lineup_slots,team_size) THEN RAISE EXCEPTION 'Use 1 GOL e escolha 3 DEF + 2 ATA ou 2 DEF + 3 ATA.'; END IF;
  saved:=public.save_fantasy_portfolio_pre_three_positions_220(p_fantasy_season_id,p_player_ids,p_captain_player_id,p_lineup_slots);
  UPDATE public.fantasy_portfolio_players item SET player_profile_locked=player.player_profile,
    is_position_correct=CASE item.slot_role WHEN 'GOL' THEN true WHEN 'DEF' THEN player.player_profile='defensive' WHEN 'ATA' THEN player.player_profile='offensive' ELSE false END
  FROM public.players player WHERE item.portfolio_id=saved AND player.id=item.player_id;
  RETURN saved;
END $$;

-- Guarda a implementação histórica; a wrapper usa v11 só para snapshots v11.
DO $$ BEGIN
  IF to_regprocedure('public.apply_fantasy_slot_position_bonus_pre_v11_220(uuid,boolean)') IS NULL THEN
    ALTER FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN)
      RENAME TO apply_fantasy_slot_position_bonus_pre_v11_220;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.apply_fantasy_slot_position_bonus(p_round_id UUID,p_is_test BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE snapshot JSONB; container UUID;
BEGIN
  IF p_is_test THEN SELECT id,settings_snapshot INTO container,snapshot FROM public.fantasy_test_sessions WHERE round_id=p_round_id;
  ELSE SELECT id,settings_snapshot INTO container,snapshot FROM public.fantasy_rounds WHERE round_id=p_round_id; END IF;
  IF COALESCE((snapshot->>'scoring_version')::INTEGER,5)<11 THEN
    RETURN public.apply_fantasy_slot_position_bonus_pre_v11_220(p_round_id,p_is_test);
  END IF;

  IF p_is_test THEN
    WITH score AS (
      SELECT item.id,item.player_id,lineup.captain_player_id,
        CASE item.slot_role
          WHEN 'GOL' THEN COALESCE(stat.goalkeeper_games,0)+COALESCE(stat.goalkeeper_goals,0)*5+COALESCE(stat.goalkeeper_assists,0)*3+COALESCE(stat.goals_conceded,0)*-.5+COALESCE(stat.clean_sheets,0)*2+COALESCE(stat.goalkeeper_own_goals,0)*-3
          WHEN 'DEF' THEN GREATEST(COALESCE(stat.goals,0)-COALESCE(stat.goalkeeper_goals,0),0)*5+GREATEST(COALESCE(stat.assists,0)-COALESCE(stat.goalkeeper_assists,0),0)*3+GREATEST(COALESCE(stat.team_goals_conceded,0)-COALESCE(stat.goals_conceded,0),0)*-.5+COALESCE(stat.defensive_clean_games,0)*2+GREATEST(COALESCE(stat.own_goals,0)-COALESCE(stat.goalkeeper_own_goals,0),0)*-3
          ELSE GREATEST(COALESCE(stat.goals,0)-COALESCE(stat.goalkeeper_goals,0),0)*4+GREATEST(COALESCE(stat.assists,0)-COALESCE(stat.goalkeeper_assists,0),0)*2.5+GREATEST(COALESCE(stat.team_goals_conceded,0)-COALESCE(stat.goals_conceded,0),0)*-.5+GREATEST(COALESCE(stat.own_goals,0)-COALESCE(stat.goalkeeper_own_goals,0),0)*-3 END base
      FROM public.fantasy_test_lineup_players item JOIN public.fantasy_test_lineups lineup ON lineup.id=item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id=p_round_id AND stat.player_id=item.player_id
      WHERE lineup.test_session_id=container AND lineup.status='scored'
    ) UPDATE public.fantasy_test_lineup_players item SET base_points=round(score.base,2),position_bonus=0,
      captain_bonus=CASE WHEN score.player_id=score.captain_player_id THEN round(score.base*(COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5)-1),2) ELSE 0 END,
      total_points=CASE WHEN score.player_id=score.captain_player_id THEN round(score.base*COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5),2) ELSE round(score.base,2) END
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
        CASE item.slot_role
          WHEN 'GOL' THEN COALESCE(stat.goalkeeper_games,0)+COALESCE(stat.goalkeeper_goals,0)*5+COALESCE(stat.goalkeeper_assists,0)*3+COALESCE(stat.goals_conceded,0)*-.5+COALESCE(stat.clean_sheets,0)*2+COALESCE(stat.goalkeeper_own_goals,0)*-3
          WHEN 'DEF' THEN GREATEST(COALESCE(stat.goals,0)-COALESCE(stat.goalkeeper_goals,0),0)*5+GREATEST(COALESCE(stat.assists,0)-COALESCE(stat.goalkeeper_assists,0),0)*3+GREATEST(COALESCE(stat.team_goals_conceded,0)-COALESCE(stat.goals_conceded,0),0)*-.5+COALESCE(stat.defensive_clean_games,0)*2+GREATEST(COALESCE(stat.own_goals,0)-COALESCE(stat.goalkeeper_own_goals,0),0)*-3
          ELSE GREATEST(COALESCE(stat.goals,0)-COALESCE(stat.goalkeeper_goals,0),0)*4+GREATEST(COALESCE(stat.assists,0)-COALESCE(stat.goalkeeper_assists,0),0)*2.5+GREATEST(COALESCE(stat.team_goals_conceded,0)-COALESCE(stat.goals_conceded,0),0)*-.5+GREATEST(COALESCE(stat.own_goals,0)-COALESCE(stat.goalkeeper_own_goals,0),0)*-3 END base
      FROM public.fantasy_lineup_players item JOIN public.fantasy_lineups lineup ON lineup.id=item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id=p_round_id AND stat.player_id=item.player_id
      WHERE lineup.fantasy_round_id=container AND lineup.status='scored'
    ) UPDATE public.fantasy_lineup_players item SET base_points=round(score.base,2),position_bonus=0,
      captain_bonus=CASE WHEN score.player_id=score.captain_player_id THEN round(score.base*(COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5)-1),2) ELSE 0 END,
      total_points=CASE WHEN score.player_id=score.captain_player_id THEN round(score.base*COALESCE((snapshot->>'captain_multiplier')::NUMERIC,1.5),2) ELSE round(score.base,2) END
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

-- O reconciliador da migration 217 também precisa auditar a v11 com a mesma
-- conta aplicada acima; caso contrário ele continuaria acusando a fórmula
-- antiga como valor esperado depois de cada fechamento.
CREATE OR REPLACE FUNCTION public.audit_fantasy_scoring_integrity(p_round_id UUID DEFAULT NULL)
RETURNS TABLE (
  round_id UUID,user_id UUID,player_id UUID,stored_base NUMERIC,expected_base NUMERIC,
  stored_position_bonus NUMERIC,expected_position_bonus NUMERIC,
  stored_captain_bonus NUMERIC,expected_captain_bonus NUMERIC,
  stored_total NUMERIC,expected_total NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.role()<>'service_role' AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem auditar o Cartola.';
  END IF;

  RETURN QUERY
  WITH source AS (
    SELECT round_item.id round_id,lineup.user_id,lineup.captain_player_id,
      item.player_id,item.slot_role,item.is_position_correct,item.base_points,
      item.position_bonus,item.captain_bonus,item.total_points,
      fantasy_round.settings_snapshot snapshot,
      COALESCE(fantasy_round.scoring_version,
        (fantasy_round.settings_snapshot->>'scoring_version')::INTEGER,
        (fantasy_round.settings_snapshot->>'version')::INTEGER,5) scoring_version,
      stat.goals,stat.assists,stat.wins,stat.draws,stat.losses,
      stat.goalkeeper_games,stat.goalkeeper_goals,stat.goalkeeper_assists,
      stat.goalkeeper_own_goals,stat.goalkeeper_wins,stat.goalkeeper_draws,
      stat.goalkeeper_losses,stat.clean_sheets,stat.goals_conceded,
      stat.team_goals_conceded,stat.own_goals,stat.defensive_clean_games,
      stat.defensive_one_goal_games
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
    JOIN public.fantasy_lineup_players item ON item.lineup_id=lineup.id
    LEFT JOIN public.player_round_stats stat
      ON stat.round_id=round_item.id AND stat.player_id=item.player_id
    WHERE lineup.status='scored' AND round_item.status='finished'
      AND (p_round_id IS NULL OR round_item.id=p_round_id)
  ), calculated AS (
    SELECT source.*,
      CASE
        WHEN source.scoring_version>=11 AND source.slot_role='GOL' THEN round(
          COALESCE(source.goalkeeper_games,0)*COALESCE((source.snapshot->>'goalkeeper_slot_appearance_points')::NUMERIC,1)
          +COALESCE(source.goalkeeper_goals,0)*COALESCE((source.snapshot->>'defender_goal_points')::NUMERIC,5)
          +COALESCE(source.goalkeeper_assists,0)*COALESCE((source.snapshot->>'defender_assist_points')::NUMERIC,3)
          +COALESCE(source.goals_conceded,0)*COALESCE((source.snapshot->>'goalkeeper_slot_goal_conceded_points')::NUMERIC,-0.5)
          +COALESCE(source.clean_sheets,0)*COALESCE((source.snapshot->>'goalkeeper_slot_clean_sheet_points')::NUMERIC,2)
          +COALESCE(source.goalkeeper_own_goals,0)*COALESCE((source.snapshot->>'own_goal_points')::NUMERIC,-3),2)
        WHEN source.scoring_version>=11 AND source.slot_role='DEF' THEN round(
          GREATEST(COALESCE(source.goals,0)-COALESCE(source.goalkeeper_goals,0),0)*COALESCE((source.snapshot->>'defender_goal_points')::NUMERIC,5)
          +GREATEST(COALESCE(source.assists,0)-COALESCE(source.goalkeeper_assists,0),0)*COALESCE((source.snapshot->>'defender_assist_points')::NUMERIC,3)
          +GREATEST(COALESCE(source.team_goals_conceded,0)-COALESCE(source.goals_conceded,0),0)*COALESCE((source.snapshot->>'line_goal_conceded_points')::NUMERIC,-0.5)
          +COALESCE(source.defensive_clean_games,0)*COALESCE((source.snapshot->>'defender_clean_sheet_points')::NUMERIC,2)
          +GREATEST(COALESCE(source.own_goals,0)-COALESCE(source.goalkeeper_own_goals,0),0)*COALESCE((source.snapshot->>'own_goal_points')::NUMERIC,-3),2)
        WHEN source.scoring_version>=11 THEN round(
          GREATEST(COALESCE(source.goals,0)-COALESCE(source.goalkeeper_goals,0),0)*COALESCE((source.snapshot->>'attacker_goal_points')::NUMERIC,4)
          +GREATEST(COALESCE(source.assists,0)-COALESCE(source.goalkeeper_assists,0),0)*COALESCE((source.snapshot->>'attacker_assist_points')::NUMERIC,2.5)
          +GREATEST(COALESCE(source.team_goals_conceded,0)-COALESCE(source.goals_conceded,0),0)*COALESCE((source.snapshot->>'line_goal_conceded_points')::NUMERIC,-0.5)
          +GREATEST(COALESCE(source.own_goals,0)-COALESCE(source.goalkeeper_own_goals,0),0)*COALESCE((source.snapshot->>'own_goal_points')::NUMERIC,-3),2)
        WHEN source.scoring_version>=10 AND source.slot_role='GOL' THEN
          public.calculate_fantasy_goalkeeper_slot_base_v10(
            source.snapshot,source.goalkeeper_goals,source.goalkeeper_assists,
            source.goalkeeper_wins,source.goalkeeper_draws,source.goalkeeper_losses,
            source.goalkeeper_games,source.goals_conceded,source.goalkeeper_own_goals)
        ELSE public.calculate_fantasy_role_base_points_v5(
          source.snapshot,source.goals,source.assists,source.wins,source.draws,
          source.losses,source.goalkeeper_games,source.goals_conceded,source.own_goals)
      END expected_base_value,
      CASE
        WHEN source.scoring_version>=11 THEN 0
        WHEN source.scoring_version>=9 THEN public.calculate_fantasy_position_bonus_v9(
          source.snapshot,source.slot_role,source.is_position_correct,
          source.goals,source.assists,source.draws,source.goalkeeper_games,
          source.clean_sheets,source.defensive_clean_games,source.defensive_one_goal_games)
        WHEN source.scoring_version>=7 THEN public.calculate_fantasy_position_bonus_v7(
          source.snapshot,source.slot_role,source.is_position_correct,
          source.goals,source.assists,source.goalkeeper_games,
          source.clean_sheets,source.defensive_clean_games,source.defensive_one_goal_games)
        ELSE public.calculate_fantasy_position_bonus_v5(
          source.snapshot,source.slot_role,source.is_position_correct,
          source.goals,source.assists,source.goalkeeper_games,
          source.clean_sheets,source.defensive_clean_games,source.defensive_one_goal_games)
      END expected_position_value
    FROM source
  ), expected AS (
    SELECT calculated.*,
      CASE WHEN calculated.player_id=calculated.captain_player_id THEN round(
        (calculated.expected_base_value+calculated.expected_position_value)
          *(COALESCE((calculated.snapshot->>'captain_multiplier')::NUMERIC,1.5)-1),2
      ) ELSE 0 END expected_captain_value,
      CASE WHEN calculated.player_id=calculated.captain_player_id THEN round(
        (calculated.expected_base_value+calculated.expected_position_value)
          *COALESCE((calculated.snapshot->>'captain_multiplier')::NUMERIC,1.5),2
      ) ELSE calculated.expected_base_value+calculated.expected_position_value END expected_total_value
    FROM calculated
  )
  SELECT expected.round_id,expected.user_id,expected.player_id,
    round(COALESCE(expected.base_points,0)-COALESCE(expected.position_bonus,0),2),
    round(COALESCE(expected.expected_base_value,0),2),round(COALESCE(expected.position_bonus,0),2),
    round(COALESCE(expected.expected_position_value,0),2),round(COALESCE(expected.captain_bonus,0),2),
    round(COALESCE(expected.expected_captain_value,0),2),round(COALESCE(expected.total_points,0),2),
    round(COALESCE(expected.expected_total_value,0),2)
  FROM expected
  WHERE abs((COALESCE(expected.base_points,0)-COALESCE(expected.position_bonus,0))-COALESCE(expected.expected_base_value,0))>.001
    OR abs(COALESCE(expected.position_bonus,0)-COALESCE(expected.expected_position_value,0))>.001
    OR abs(COALESCE(expected.captain_bonus,0)-COALESCE(expected.expected_captain_value,0))>.001
    OR abs(COALESCE(expected.total_points,0)-COALESCE(expected.expected_total_value,0))>.001;
END $$;

REVOKE ALL ON FUNCTION public.is_valid_fantasy_formation_v11(JSONB,INTEGER) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_fantasy_test_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB),public.save_fantasy_portfolio(UUID,UUID[],UUID,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_fantasy_slot_position_bonus(UUID,BOOLEAN) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
