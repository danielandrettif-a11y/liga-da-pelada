-- BQ v6: ALA independente, quatro formações e bônus posicionais balanceados.
-- A vigência começa na Rodada 04; snapshots das Rodadas 01–03 não são tocados.

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS def_clean_sheet_bonus NUMERIC NOT NULL DEFAULT 1.25,
  ADD COLUMN IF NOT EXISTS def_one_goal_bonus NUMERIC NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS def_muralha_threshold INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS def_muralha_bonus NUMERIC NOT NULL DEFAULT 2.50,
  ADD COLUMN IF NOT EXISTS def_bonus_cap NUMERIC NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS mei_assist_bonus NUMERIC NOT NULL DEFAULT 0.75,
  ADD COLUMN IF NOT EXISTS mei_maestro_threshold INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS mei_maestro_bonus NUMERIC NOT NULL DEFAULT 2.50,
  ADD COLUMN IF NOT EXISTS mei_bonus_cap NUMERIC NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS ala_goal_bonus NUMERIC NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS ala_assist_bonus NUMERIC NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS ala_clean_sheet_bonus NUMERIC NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS ala_one_goal_bonus NUMERIC NOT NULL DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS ala_attack_threshold INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ala_defense_threshold INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ala_vai_e_volta_bonus NUMERIC NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ala_bonus_cap NUMERIC NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS ata_goal_bonus NUMERIC NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS ata_artilheiro_threshold INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ata_artilheiro_bonus NUMERIC NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ata_bonus_cap NUMERIC NOT NULL DEFAULT 4;

UPDATE public.fantasy_settings SET
  def_clean_sheet_bonus=1.25,def_one_goal_bonus=.5,def_muralha_threshold=3,
  def_muralha_bonus=2.5,def_bonus_cap=8,
  mei_assist_bonus=.75,mei_maestro_threshold=2,mei_maestro_bonus=2.5,mei_bonus_cap=6,
  ala_goal_bonus=.5,ala_assist_bonus=.5,ala_clean_sheet_bonus=.5,ala_one_goal_bonus=.25,
  ala_attack_threshold=2,ala_defense_threshold=2,ala_vai_e_volta_bonus=2,ala_bonus_cap=6,
  ata_goal_bonus=.5,ata_artilheiro_threshold=2,ata_artilheiro_bonus=2,ata_bonus_cap=4,
  updated_at=now();

-- Substitui apenas os CHECKs de posição; demais constraints permanecem intactos.
DO $$
DECLARE item RECORD;
BEGIN
  FOR item IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype='c'
      AND conrelid IN (
        'public.players'::regclass,
        'public.fantasy_lineup_players'::regclass,
        'public.fantasy_test_lineup_players'::regclass,
        'public.fantasy_portfolio_players'::regclass
      )
      AND (pg_get_constraintdef(oid) ILIKE '%player_profile%' OR pg_get_constraintdef(oid) ILIKE '%slot_role%')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', item.table_name, item.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.players ADD CONSTRAINT players_player_profile_bq_v6_check
  CHECK (player_profile IS NULL OR player_profile IN ('defensive','midfield','wing','offensive'));
ALTER TABLE public.fantasy_lineup_players ADD CONSTRAINT fantasy_lineup_players_slot_role_bq_v6_check
  CHECK (slot_role IS NULL OR slot_role IN ('GOL','DEF','MEI','ALA','ATA'));
ALTER TABLE public.fantasy_lineup_players ADD CONSTRAINT fantasy_lineup_players_profile_bq_v6_check
  CHECK (player_profile_locked IS NULL OR player_profile_locked IN ('defensive','midfield','wing','offensive'));
ALTER TABLE public.fantasy_test_lineup_players ADD CONSTRAINT fantasy_test_lineup_players_slot_role_bq_v6_check
  CHECK (slot_role IS NULL OR slot_role IN ('GOL','DEF','MEI','ALA','ATA'));
ALTER TABLE public.fantasy_test_lineup_players ADD CONSTRAINT fantasy_test_lineup_players_profile_bq_v6_check
  CHECK (player_profile_locked IS NULL OR player_profile_locked IN ('defensive','midfield','wing','offensive'));
ALTER TABLE public.fantasy_portfolio_players ADD CONSTRAINT fantasy_portfolio_players_slot_role_bq_v6_check
  CHECK (slot_role IS NULL OR slot_role IN ('GOL','DEF','MEI','ALA','ATA'));
ALTER TABLE public.fantasy_portfolio_players ADD CONSTRAINT fantasy_portfolio_players_profile_bq_v6_check
  CHECK (player_profile_locked IS NULL OR player_profile_locked IN ('defensive','midfield','wing','offensive'));

CREATE OR REPLACE FUNCTION public.fantasy_position_rules_v6(p_league_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'scoring_version',6,
    'def_clean_sheet_bonus',COALESCE(s.def_clean_sheet_bonus,1.25),
    'def_one_goal_bonus',COALESCE(s.def_one_goal_bonus,.5),
    'def_muralha_threshold',COALESCE(s.def_muralha_threshold,3),
    'def_muralha_bonus',COALESCE(s.def_muralha_bonus,2.5),
    'def_bonus_cap',COALESCE(s.def_bonus_cap,8),
    'mei_assist_bonus',COALESCE(s.mei_assist_bonus,.75),
    'mei_maestro_threshold',COALESCE(s.mei_maestro_threshold,2),
    'mei_maestro_bonus',COALESCE(s.mei_maestro_bonus,2.5),
    'mei_bonus_cap',COALESCE(s.mei_bonus_cap,6),
    'ala_goal_bonus',COALESCE(s.ala_goal_bonus,.5),
    'ala_assist_bonus',COALESCE(s.ala_assist_bonus,.5),
    'ala_clean_sheet_bonus',COALESCE(s.ala_clean_sheet_bonus,.5),
    'ala_one_goal_bonus',COALESCE(s.ala_one_goal_bonus,.25),
    'ala_attack_threshold',COALESCE(s.ala_attack_threshold,2),
    'ala_defense_threshold',COALESCE(s.ala_defense_threshold,2),
    'ala_vai_e_volta_bonus',COALESCE(s.ala_vai_e_volta_bonus,2),
    'ala_bonus_cap',COALESCE(s.ala_bonus_cap,6),
    'ata_goal_bonus',COALESCE(s.ata_goal_bonus,.5),
    'ata_artilheiro_threshold',COALESCE(s.ata_artilheiro_threshold,2),
    'ata_artilheiro_bonus',COALESCE(s.ata_artilheiro_bonus,2),
    'ata_bonus_cap',COALESCE(s.ata_bonus_cap,4)
  )
  FROM (SELECT 1) seed
  LEFT JOIN public.fantasy_settings s ON s.league_id=p_league_id;
$$;

-- Snapshot v6 apenas nas rodadas elegíveis já existentes.
SELECT set_config('app.allow_bq_snapshot_rewrite','on',true);
UPDATE public.rounds r SET
  scoring_snapshot=COALESCE(r.scoring_snapshot,'{}') || public.fantasy_position_rules_v6(r.league_id) || jsonb_build_object('version',6),
  scoring_version=6
WHERE r.number>=4 AND r.round_type='official';

UPDATE public.fantasy_rounds fr SET
  settings_snapshot=COALESCE(fr.settings_snapshot,'{}') || public.fantasy_position_rules_v6(s.league_id),
  scoring_version=6
FROM public.fantasy_seasons fs
JOIN public.seasons s ON s.id=fs.season_id
JOIN public.rounds r ON r.season_id=s.id
WHERE fr.fantasy_season_id=fs.id AND fr.round_id=r.id AND r.number>=4;

UPDATE public.fantasy_test_sessions ts SET
  settings_snapshot=COALESCE(ts.settings_snapshot,'{}') || public.fantasy_position_rules_v6(r.league_id),
  scoring_version=6
FROM public.rounds r WHERE ts.round_id=r.id AND r.number>=4;

CREATE OR REPLACE FUNCTION public.set_bq_scoring_snapshot_on_round_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.scoring_snapshot IS NULL THEN
    NEW.scoring_snapshot:=public.snapshot_bq_scoring(NEW.league_id);
    IF NEW.round_type='official' AND NEW.number>=4 THEN
      NEW.scoring_snapshot:=NEW.scoring_snapshot||public.fantasy_position_rules_v6(NEW.league_id)||jsonb_build_object('version',6);
      NEW.scoring_version:=6;
    ELSE
      NEW.scoring_version:=COALESCE((NEW.scoring_snapshot->>'version')::INTEGER,5);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_role_scoring_activation_from_round_two()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_number INTEGER; v_suppress BOOLEAN; v_league_id UUID;
BEGIN
  SELECT r.number,r.suppress_goalkeeper_rewards,r.league_id INTO v_number,v_suppress,v_league_id
  FROM public.rounds r WHERE r.id=NEW.round_id;
  NEW.settings_snapshot:=COALESCE(NEW.settings_snapshot,'{}')||jsonb_build_object(
    'role_scoring_active',COALESCE(v_number,1)>=2,
    'role_scoring_start_round',2,
    'goalkeeper_appearance_points',CASE WHEN v_suppress THEN 0 ELSE COALESCE((NEW.settings_snapshot->>'goalkeeper_appearance_points')::NUMERIC,2) END,
    'goal_conceded_points',COALESCE((NEW.settings_snapshot->>'goal_conceded_points')::NUMERIC,-1),
    'goalkeeper_slot_clean_sheet_points',CASE WHEN v_suppress THEN 0 ELSE 4 END,
    'scoring_version',CASE WHEN COALESCE(v_number,1)>=4 THEN 6 ELSE 5 END);
  IF COALESCE(v_number,1)>=4 THEN
    NEW.settings_snapshot:=NEW.settings_snapshot||public.fantasy_position_rules_v6(v_league_id);
    NEW.scoring_version:=6;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_fantasy_position_bonus_v6(
  p_settings JSONB,p_slot_role TEXT,p_is_position_correct BOOLEAN,
  p_goals INTEGER,p_assists INTEGER,p_goalkeeper_games INTEGER,
  p_clean_sheets INTEGER,p_defensive_clean_games INTEGER,p_defensive_one_goal_games INTEGER
) RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE
    WHEN COALESCE((p_settings->>'scoring_version')::INTEGER,5)<6
      THEN public.calculate_fantasy_position_bonus_v5(p_settings,p_slot_role,p_is_position_correct,
        p_goals,p_assists,p_goalkeeper_games,p_clean_sheets,p_defensive_clean_games,p_defensive_one_goal_games)
    ELSE round(CASE
      WHEN p_slot_role='GOL' AND COALESCE(p_goalkeeper_games,0)>0 THEN
        COALESCE(p_clean_sheets,0)*COALESCE((p_settings->>'goalkeeper_slot_clean_sheet_points')::NUMERIC,4)
      WHEN p_is_position_correct AND p_slot_role='DEF' THEN least(
        COALESCE((p_settings->>'def_bonus_cap')::NUMERIC,8),
        COALESCE(p_defensive_clean_games,0)*COALESCE((p_settings->>'def_clean_sheet_bonus')::NUMERIC,1.25)
        +COALESCE(p_defensive_one_goal_games,0)*COALESCE((p_settings->>'def_one_goal_bonus')::NUMERIC,.5)
        +CASE WHEN COALESCE(p_defensive_clean_games,0)>=COALESCE((p_settings->>'def_muralha_threshold')::INTEGER,3)
          THEN COALESCE((p_settings->>'def_muralha_bonus')::NUMERIC,2.5) ELSE 0 END)
      WHEN p_is_position_correct AND p_slot_role='MEI' THEN least(
        COALESCE((p_settings->>'mei_bonus_cap')::NUMERIC,6),
        COALESCE(p_assists,0)*COALESCE((p_settings->>'mei_assist_bonus')::NUMERIC,.75)
        +CASE WHEN COALESCE(p_assists,0)>=COALESCE((p_settings->>'mei_maestro_threshold')::INTEGER,2)
          THEN COALESCE((p_settings->>'mei_maestro_bonus')::NUMERIC,2.5) ELSE 0 END)
      WHEN p_is_position_correct AND p_slot_role='ALA' THEN least(
        COALESCE((p_settings->>'ala_bonus_cap')::NUMERIC,6),
        COALESCE(p_goals,0)*COALESCE((p_settings->>'ala_goal_bonus')::NUMERIC,.5)
        +COALESCE(p_assists,0)*COALESCE((p_settings->>'ala_assist_bonus')::NUMERIC,.5)
        +COALESCE(p_defensive_clean_games,0)*COALESCE((p_settings->>'ala_clean_sheet_bonus')::NUMERIC,.5)
        +COALESCE(p_defensive_one_goal_games,0)*COALESCE((p_settings->>'ala_one_goal_bonus')::NUMERIC,.25)
        +CASE WHEN COALESCE(p_goals,0)+COALESCE(p_assists,0)>=COALESCE((p_settings->>'ala_attack_threshold')::INTEGER,2)
          AND COALESCE(p_defensive_clean_games,0)+COALESCE(p_defensive_one_goal_games,0)>=COALESCE((p_settings->>'ala_defense_threshold')::INTEGER,2)
          THEN COALESCE((p_settings->>'ala_vai_e_volta_bonus')::NUMERIC,2) ELSE 0 END)
      WHEN p_is_position_correct AND p_slot_role='ATA' THEN least(
        COALESCE((p_settings->>'ata_bonus_cap')::NUMERIC,4),
        COALESCE(p_goals,0)*COALESCE((p_settings->>'ata_goal_bonus')::NUMERIC,.5)
        +CASE WHEN COALESCE(p_goals,0)>=COALESCE((p_settings->>'ata_artilheiro_threshold')::INTEGER,2)
          THEN COALESCE((p_settings->>'ata_artilheiro_bonus')::NUMERIC,2) ELSE 0 END)
      ELSE 0 END,2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.apply_fantasy_slot_position_bonus(p_round_id UUID,p_is_test BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_snapshot JSONB; target_container UUID;
BEGIN
  IF p_is_test THEN
    SELECT id,settings_snapshot INTO target_container,target_snapshot FROM public.fantasy_test_sessions WHERE round_id=p_round_id;
  ELSE
    SELECT id,settings_snapshot INTO target_container,target_snapshot FROM public.fantasy_rounds WHERE round_id=p_round_id;
  END IF;
  IF target_container IS NULL THEN RETURN true; END IF;
  IF p_is_test THEN
    WITH calculated AS (
      SELECT item.id,item.player_id,lineup.captain_player_id,
        public.calculate_fantasy_role_base_points_v5(target_snapshot,stat.goals,stat.assists,stat.wins,stat.draws,stat.losses,stat.goalkeeper_games,stat.goals_conceded,stat.own_goals) base_points,
        public.calculate_fantasy_position_bonus_v6(target_snapshot,item.slot_role,item.is_position_correct,stat.goals,stat.assists,stat.goalkeeper_games,stat.clean_sheets,stat.defensive_clean_games,stat.defensive_one_goal_games) position_bonus
      FROM public.fantasy_test_lineup_players item
      JOIN public.fantasy_test_lineups lineup ON lineup.id=item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id=p_round_id AND stat.player_id=item.player_id
      WHERE lineup.test_session_id=target_container AND lineup.status='scored'
    ) UPDATE public.fantasy_test_lineup_players item SET
      base_points=calculated.base_points+calculated.position_bonus,position_bonus=calculated.position_bonus,
      captain_bonus=CASE WHEN calculated.player_id=calculated.captain_player_id THEN round((calculated.base_points+calculated.position_bonus)*(COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC,1.5)-1),2) ELSE 0 END,
      total_points=CASE WHEN calculated.player_id=calculated.captain_player_id THEN round((calculated.base_points+calculated.position_bonus)*COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC,1.5),2) ELSE calculated.base_points+calculated.position_bonus END
    FROM calculated WHERE item.id=calculated.id;
    UPDATE public.fantasy_test_lineups lineup SET
      player_points=COALESCE((SELECT sum(i.total_points) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id=lineup.id),0),
      total_points=COALESCE((SELECT sum(i.total_points) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id=lineup.id),0)+COALESCE(lineup.prediction_points,0),
      score_breakdown=COALESCE(lineup.score_breakdown,'{}')||jsonb_build_object(
        'playersBase',COALESCE((SELECT sum(i.base_points-i.position_bonus) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id=lineup.id),0),
        'positionBonus',COALESCE((SELECT sum(i.position_bonus) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id=lineup.id),0),
        'captainBonus',COALESCE((SELECT sum(i.captain_bonus) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id=lineup.id),0))
    WHERE lineup.test_session_id=target_container AND lineup.status='scored';
  ELSE
    WITH calculated AS (
      SELECT item.id,item.player_id,lineup.captain_player_id,
        public.calculate_fantasy_role_base_points_v5(target_snapshot,stat.goals,stat.assists,stat.wins,stat.draws,stat.losses,stat.goalkeeper_games,stat.goals_conceded,stat.own_goals) base_points,
        public.calculate_fantasy_position_bonus_v6(target_snapshot,item.slot_role,item.is_position_correct,stat.goals,stat.assists,stat.goalkeeper_games,stat.clean_sheets,stat.defensive_clean_games,stat.defensive_one_goal_games) position_bonus
      FROM public.fantasy_lineup_players item
      JOIN public.fantasy_lineups lineup ON lineup.id=item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id=p_round_id AND stat.player_id=item.player_id
      WHERE lineup.fantasy_round_id=target_container AND lineup.status='scored'
    ) UPDATE public.fantasy_lineup_players item SET
      base_points=calculated.base_points+calculated.position_bonus,position_bonus=calculated.position_bonus,
      captain_bonus=CASE WHEN calculated.player_id=calculated.captain_player_id THEN round((calculated.base_points+calculated.position_bonus)*(COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC,1.5)-1),2) ELSE 0 END,
      total_points=CASE WHEN calculated.player_id=calculated.captain_player_id THEN round((calculated.base_points+calculated.position_bonus)*COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC,1.5),2) ELSE calculated.base_points+calculated.position_bonus END
    FROM calculated WHERE item.id=calculated.id;
    UPDATE public.fantasy_lineups lineup SET
      player_points=COALESCE((SELECT sum(i.total_points) FROM public.fantasy_lineup_players i WHERE i.lineup_id=lineup.id),0),
      total_points=COALESCE((SELECT sum(i.total_points) FROM public.fantasy_lineup_players i WHERE i.lineup_id=lineup.id),0)+COALESCE(lineup.prediction_points,0)+COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC,0),
      score_breakdown=COALESCE(lineup.score_breakdown,'{}')||jsonb_build_object(
        'playersBase',COALESCE((SELECT sum(i.base_points-i.position_bonus) FROM public.fantasy_lineup_players i WHERE i.lineup_id=lineup.id),0),
        'positionBonus',COALESCE((SELECT sum(i.position_bonus) FROM public.fantasy_lineup_players i WHERE i.lineup_id=lineup.id),0),
        'captainBonus',COALESCE((SELECT sum(i.captain_bonus) FROM public.fantasy_lineup_players i WHERE i.lineup_id=lineup.id),0))
    WHERE lineup.fantasy_round_id=target_container AND lineup.status='scored';
  END IF;
  RETURN true;
END;
$$;

-- Formação completa válida: 2 DEF fixos e uma das quatro frentes aprovadas.
CREATE OR REPLACE FUNCTION public.is_valid_fantasy_formation_v6(p_slots JSONB,p_team_size INTEGER)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  WITH roles AS (
    SELECT COALESCE(slot->>'slot_role',slot->>'slotRole') role FROM jsonb_array_elements(COALESCE(p_slots,'[]')) slot
  ), counts AS (
    SELECT count(*) total,count(*) FILTER(WHERE role='GOL') gol,count(*) FILTER(WHERE role='DEF') def,
      count(*) FILTER(WHERE role='MEI') mei,count(*) FILTER(WHERE role='ALA') ala,count(*) FILTER(WHERE role='ATA') ata,
      count(*) FILTER(WHERE role NOT IN('GOL','DEF','MEI','ALA','ATA') OR role IS NULL) invalid
    FROM roles
  ) SELECT total=p_team_size AND invalid=0 AND def=2 AND gol=CASE WHEN p_team_size=6 THEN 1 ELSE 0 END
    AND ((mei=1 AND ala=1 AND ata=1) OR (mei=2 AND ala=0 AND ata=1)
      OR (mei=0 AND ala=2 AND ata=1) OR (mei=1 AND ala=0 AND ata=2)) FROM counts;
$$;

-- Mantém a lógica madura dos RPCs anteriores, traduzindo ALA apenas durante a
-- chamada legada e restaurando a vaga independente antes do commit.
DO $$ BEGIN
  IF to_regprocedure('public.save_fantasy_lineup_pre_bq_v6_144(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.save_fantasy_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB) RENAME TO save_fantasy_lineup_pre_bq_v6_144;
  END IF;
  IF to_regprocedure('public.save_fantasy_test_lineup_pre_bq_v6_144(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.save_fantasy_test_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB) RENAME TO save_fantasy_test_lineup_pre_bq_v6_144;
  END IF;
  IF to_regprocedure('public.save_fantasy_portfolio_pre_bq_v6_144(uuid,uuid[],uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.save_fantasy_portfolio(UUID,UUID[],UUID,JSONB) RENAME TO save_fantasy_portfolio_pre_bq_v6_144;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup(p_round_id UUID,p_player_ids UUID[],p_captain_player_id UUID,p_top_scorer_player_id UUID,p_top_assist_player_id UUID,p_challenge_player_id UUID,p_lineup_slots JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved_id UUID; max_players INTEGER; legacy_slots JSONB;
BEGIN
  SELECT COALESCE(l.players_per_team,5) INTO max_players FROM public.rounds r JOIN public.leagues l ON l.id=r.league_id WHERE r.id=p_round_id;
  IF NOT public.is_valid_fantasy_formation_v6(p_lineup_slots,max_players) THEN RAISE EXCEPTION 'Escolha uma das quatro formações válidas.'; END IF;
  SELECT jsonb_agg(CASE WHEN COALESCE(s->>'slot_role',s->>'slotRole')='ALA' THEN s||jsonb_build_object('slot_role','MEI','slotRole','MEI') ELSE s END) INTO legacy_slots FROM jsonb_array_elements(p_lineup_slots) s;
  saved_id:=public.save_fantasy_lineup_pre_bq_v6_144(p_round_id,p_player_ids,p_captain_player_id,p_top_scorer_player_id,p_top_assist_player_id,p_challenge_player_id,legacy_slots);
  UPDATE public.fantasy_lineup_players item SET slot_role=slot.role,player_profile_locked=p.player_profile,
    is_position_correct=CASE slot.role WHEN 'GOL' THEN true WHEN 'DEF' THEN p.player_profile='defensive' WHEN 'MEI' THEN p.player_profile='midfield' WHEN 'ALA' THEN p.player_profile='wing' WHEN 'ATA' THEN p.player_profile='offensive' ELSE false END
  FROM (SELECT COALESCE(s->>'player_id',s->>'playerId')::UUID player_id,COALESCE(s->>'slot_role',s->>'slotRole') role FROM jsonb_array_elements(p_lineup_slots) s) slot
  JOIN public.players p ON p.id=slot.player_id WHERE item.lineup_id=saved_id AND item.player_id=slot.player_id;
  RETURN saved_id;
END $$;

CREATE OR REPLACE FUNCTION public.save_fantasy_test_lineup(p_round_id UUID,p_player_ids UUID[],p_captain_player_id UUID,p_top_scorer_player_id UUID,p_top_assist_player_id UUID,p_challenge_player_id UUID,p_lineup_slots JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved_id UUID; max_players INTEGER;
BEGIN
  SELECT COALESCE(l.players_per_team,5) INTO max_players FROM public.rounds r JOIN public.leagues l ON l.id=r.league_id WHERE r.id=p_round_id;
  IF NOT public.is_valid_fantasy_formation_v6(p_lineup_slots,max_players) THEN RAISE EXCEPTION 'Escolha uma das quatro formações válidas.'; END IF;
  saved_id:=public.save_fantasy_test_lineup(p_round_id,p_player_ids,p_captain_player_id,p_top_scorer_player_id,p_top_assist_player_id,p_challenge_player_id);
  UPDATE public.fantasy_test_lineup_players item SET slot_index=slot.slot_index,slot_role=slot.role,player_profile_locked=p.player_profile,
    is_position_correct=CASE slot.role WHEN 'GOL' THEN true WHEN 'DEF' THEN p.player_profile='defensive' WHEN 'MEI' THEN p.player_profile='midfield' WHEN 'ALA' THEN p.player_profile='wing' WHEN 'ATA' THEN p.player_profile='offensive' ELSE false END
  FROM (SELECT COALESCE(s->>'player_id',s->>'playerId')::UUID player_id,COALESCE(s->>'slot_index',s->>'slotIndex')::INTEGER slot_index,COALESCE(s->>'slot_role',s->>'slotRole') role FROM jsonb_array_elements(p_lineup_slots) s) slot
  JOIN public.players p ON p.id=slot.player_id WHERE item.lineup_id=saved_id AND item.player_id=slot.player_id;
  RETURN saved_id;
END $$;

CREATE OR REPLACE FUNCTION public.save_fantasy_portfolio(p_fantasy_season_id UUID,p_player_ids UUID[],p_captain_player_id UUID,p_lineup_slots JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved_id UUID; max_players INTEGER; legacy_slots JSONB;
BEGIN
  SELECT COALESCE(l.players_per_team,5) INTO max_players FROM public.fantasy_seasons fs JOIN public.seasons s ON s.id=fs.season_id JOIN public.leagues l ON l.id=s.league_id WHERE fs.id=p_fantasy_season_id;
  IF jsonb_array_length(COALESCE(p_lineup_slots,'[]'))=max_players AND NOT public.is_valid_fantasy_formation_v6(p_lineup_slots,max_players) THEN RAISE EXCEPTION 'Escolha uma das quatro formações válidas.'; END IF;
  SELECT COALESCE(jsonb_agg(CASE WHEN COALESCE(s->>'slot_role',s->>'slotRole')='ALA' THEN s||jsonb_build_object('slot_role','MEI','slotRole','MEI') ELSE s END),'[]') INTO legacy_slots FROM jsonb_array_elements(COALESCE(p_lineup_slots,'[]')) s;
  saved_id:=public.save_fantasy_portfolio_pre_bq_v6_144(p_fantasy_season_id,p_player_ids,p_captain_player_id,legacy_slots);
  UPDATE public.fantasy_portfolio_players item SET slot_role=slot.role,player_profile_locked=p.player_profile,
    is_position_correct=CASE slot.role WHEN 'GOL' THEN true WHEN 'DEF' THEN p.player_profile='defensive' WHEN 'MEI' THEN p.player_profile='midfield' WHEN 'ALA' THEN p.player_profile='wing' WHEN 'ATA' THEN p.player_profile='offensive' ELSE false END
  FROM (SELECT COALESCE(s->>'player_id',s->>'playerId')::UUID player_id,COALESCE(s->>'slot_role',s->>'slotRole') role FROM jsonb_array_elements(COALESCE(p_lineup_slots,'[]')) s) slot
  JOIN public.players p ON p.id=slot.player_id WHERE item.portfolio_id=saved_id AND item.player_id=slot.player_id;
  RETURN saved_id;
END $$;

CREATE TABLE IF NOT EXISTS public.fantasy_player_profile_locks (
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  player_profile TEXT NOT NULL CHECK(player_profile IN('defensive','midfield','wing','offensive')),
  locked_by_round_id UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(fantasy_season_id,player_id)
);
ALTER TABLE public.fantasy_player_profile_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fantasy_player_profile_locks_read ON public.fantasy_player_profile_locks;
CREATE POLICY fantasy_player_profile_locks_read ON public.fantasy_player_profile_locks FOR SELECT TO authenticated USING(true);
REVOKE INSERT,UPDATE,DELETE ON public.fantasy_player_profile_locks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fantasy_player_profile_locks TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_fantasy_player_positions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_app_admin() THEN
    IF NEW.is_goalkeeper IS DISTINCT FROM OLD.is_goalkeeper THEN RAISE EXCEPTION 'GOL não é uma tag de perfil e não pode ser alterada aqui.'; END IF;
    IF NEW.player_profile IS DISTINCT FROM OLD.player_profile THEN
      IF NOT EXISTS(SELECT 1 FROM public.account_profiles a WHERE a.user_id=auth.uid() AND a.player_id=OLD.id) THEN
        RAISE EXCEPTION 'Você só pode alterar a posição do seu próprio perfil.';
      END IF;
      IF EXISTS(SELECT 1 FROM public.fantasy_player_profile_locks l JOIN public.fantasy_seasons fs ON fs.id=l.fantasy_season_id JOIN public.seasons s ON s.id=fs.season_id WHERE l.player_id=OLD.id AND s.status='active') THEN
        RAISE EXCEPTION 'Sua posição está travada nesta temporada desde o fechamento da Rodada 4.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_fantasy_player_profile_lock_v6()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.player_profile IS DISTINCT FROM OLD.player_profile THEN
    INSERT INTO public.fantasy_player_profile_locks(fantasy_season_id,player_id,player_profile,locked_by_round_id)
    SELECT fs.id,NEW.id,NEW.player_profile,r.id FROM public.fantasy_seasons fs
    JOIN public.seasons s ON s.id=fs.season_id
    JOIN public.rounds r ON r.season_id=s.id AND r.number=4 AND r.round_type='official'
    JOIN public.fantasy_rounds fr ON fr.fantasy_season_id=fs.id AND fr.round_id=r.id
    WHERE s.status='active' AND fr.market_status<>'open' AND NEW.player_profile IS NOT NULL
    ON CONFLICT(fantasy_season_id,player_id) DO UPDATE SET
      player_profile=CASE WHEN auth.uid() IS NULL OR public.is_app_admin() THEN EXCLUDED.player_profile ELSE public.fantasy_player_profile_locks.player_profile END,
      locked_by_round_id=COALESCE(public.fantasy_player_profile_locks.locked_by_round_id,EXCLUDED.locked_by_round_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS players_sync_fantasy_profile_lock_v6 ON public.players;
CREATE TRIGGER players_sync_fantasy_profile_lock_v6 AFTER UPDATE OF player_profile ON public.players
FOR EACH ROW EXECUTE FUNCTION public.sync_fantasy_player_profile_lock_v6();

CREATE OR REPLACE FUNCTION public.lock_fantasy_profiles_on_round_four_close_v6()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.market_status<>'open' AND OLD.market_status='open' AND EXISTS(SELECT 1 FROM public.rounds r WHERE r.id=NEW.round_id AND r.number=4 AND r.round_type='official') THEN
    INSERT INTO public.fantasy_player_profile_locks(fantasy_season_id,player_id,player_profile,locked_by_round_id)
    SELECT NEW.fantasy_season_id,p.id,p.player_profile,NEW.round_id FROM public.players p
    WHERE p.is_selectable=true AND p.member_category='player' AND p.player_profile IS NOT NULL
    ON CONFLICT(fantasy_season_id,player_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fantasy_round_four_profile_lock_v6 ON public.fantasy_rounds;
CREATE TRIGGER fantasy_round_four_profile_lock_v6 AFTER UPDATE OF market_status ON public.fantasy_rounds
FOR EACH ROW EXECUTE FUNCTION public.lock_fantasy_profiles_on_round_four_close_v6();

-- Backfill seguro caso a Rodada 4 já esteja fechada na aplicação da migration.
INSERT INTO public.fantasy_player_profile_locks(fantasy_season_id,player_id,player_profile,locked_by_round_id)
SELECT fr.fantasy_season_id,p.id,p.player_profile,fr.round_id FROM public.fantasy_rounds fr
JOIN public.rounds r ON r.id=fr.round_id AND r.number=4 AND r.round_type='official'
JOIN public.fantasy_seasons fs ON fs.id=fr.fantasy_season_id
JOIN public.seasons s ON s.id=fs.season_id AND s.status='active'
CROSS JOIN public.players p
WHERE fr.market_status<>'open' AND p.is_selectable=true AND p.member_category='player' AND p.player_profile IS NOT NULL
ON CONFLICT(fantasy_season_id,player_id) DO NOTHING;

-- O Mercado V11 compara ALA com ALA quando há pelo menos três atletas; abaixo
-- disso, mantém automaticamente o percentil geral já previsto pelo motor.
DO $$
DECLARE definition TEXT;
BEGIN
  definition:=pg_get_functiondef('public.apply_fantasy_role_market_v074(uuid)'::regprocedure);
  definition:=replace(definition,
    'player_profile IN(''defensive'',''midfield'',''offensive'')',
    'player_profile IN(''defensive'',''midfield'',''wing'',''offensive'')');
  EXECUTE definition;
END $$;

CREATE OR REPLACE FUNCTION public.fantasy_market_v11_lineup_cost(
  p_fantasy_season_id UUID,p_formation TEXT,p_mode TEXT
) RETURNS NUMERIC LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  team_size INTEGER; goalkeeper_slots INTEGER; selected_ids UUID[]:=ARRAY[]::UUID[];
  picked_ids UUID[]; picked_cost NUMERIC; result_cost NUMERIC:=0; wanted_percentile NUMERIC:=.60;
  position_item RECORD;
BEGIN
  IF p_mode NOT IN('economy','competitive','elite') THEN RAISE EXCEPTION 'Modo de escalação V11 inválido: %',p_mode; END IF;
  p_formation:=CASE p_formation WHEN '2-1-2' THEN 'offensive' WHEN '2-2-1' THEN 'classic' ELSE p_formation END;
  IF p_formation NOT IN('balanced','classic','wide','offensive') THEN RAISE EXCEPTION 'Formação V11 inválida: %',p_formation; END IF;
  SELECT l.players_per_team INTO team_size FROM public.fantasy_seasons fs JOIN public.leagues l ON l.id=fs.league_id WHERE fs.id=p_fantasy_season_id;
  IF team_size NOT IN(5,6) THEN RETURN NULL; END IF;
  goalkeeper_slots:=CASE WHEN team_size=6 THEN 1 ELSE 0 END;

  FOR position_item IN
    SELECT * FROM (VALUES
      ('offensive',CASE WHEN p_formation='offensive' THEN 2 ELSE 1 END),
      ('midfield',CASE p_formation WHEN 'classic' THEN 2 WHEN 'wide' THEN 0 ELSE 1 END),
      ('wing',CASE p_formation WHEN 'balanced' THEN 1 WHEN 'wide' THEN 2 ELSE 0 END),
      ('defensive',2)
    ) AS positions(profile,slots) WHERE slots>0
  LOOP
    WITH candidates AS (
      SELECT price.player_id,price.current_price,percent_rank() OVER(ORDER BY price.current_price) price_percentile
      FROM public.fantasy_player_prices price JOIN public.players player ON player.id=price.player_id
      WHERE price.fantasy_season_id=p_fantasy_season_id AND player.player_profile=position_item.profile
        AND NOT(price.player_id=ANY(selected_ids))
    ), chosen AS (
      SELECT * FROM candidates ORDER BY
        CASE WHEN p_mode='economy' THEN current_price END ASC,
        CASE WHEN p_mode='elite' THEN current_price END DESC,
        CASE WHEN p_mode='competitive' THEN abs(price_percentile-wanted_percentile) END ASC,
        player_id LIMIT position_item.slots
    ) SELECT array_agg(player_id),sum(current_price) INTO picked_ids,picked_cost FROM chosen;
    IF cardinality(COALESCE(picked_ids,ARRAY[]::UUID[]))<>position_item.slots THEN RETURN NULL; END IF;
    selected_ids:=selected_ids||picked_ids; result_cost:=result_cost+picked_cost;
  END LOOP;

  IF goalkeeper_slots=1 THEN
    WITH candidates AS (
      SELECT price.player_id,price.current_price,percent_rank() OVER(ORDER BY price.current_price) price_percentile
      FROM public.fantasy_player_prices price WHERE price.fantasy_season_id=p_fantasy_season_id AND NOT(price.player_id=ANY(selected_ids))
    ) SELECT current_price INTO picked_cost FROM candidates ORDER BY
      CASE WHEN p_mode='economy' THEN current_price END ASC,
      CASE WHEN p_mode='elite' THEN current_price END DESC,
      CASE WHEN p_mode='competitive' THEN abs(price_percentile-wanted_percentile) END ASC,
      player_id LIMIT 1;
    IF picked_cost IS NULL THEN RETURN NULL; END IF;
    result_cost:=result_cost+picked_cost;
  END IF;
  RETURN round(result_cost,2);
END $$;

DO $$
DECLARE definition TEXT;
BEGIN
  definition:=pg_get_functiondef('public.fantasy_market_v11_metrics(uuid)'::regprocedure);
  definition:=replace(definition,
    'ARRAY[''2-1-2'',''2-2-1'']',
    'ARRAY[''balanced'',''classic'',''wide'',''offensive'']');
  definition:=replace(definition,
    'ARRAY[''2-1-2'', ''2-2-1'']',
    'ARRAY[''balanced'', ''classic'', ''wide'', ''offensive'']');
  EXECUTE definition;
END $$;

REVOKE ALL ON FUNCTION public.fantasy_position_rules_v6(UUID),public.calculate_fantasy_position_bonus_v6(JSONB,TEXT,BOOLEAN,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER),public.is_valid_fantasy_formation_v6(JSONB,INTEGER) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB),public.save_fantasy_test_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB),public.save_fantasy_portfolio(UUID,UUID[],UUID,JSONB) TO authenticated;

NOTIFY pgrst,'reload schema';
