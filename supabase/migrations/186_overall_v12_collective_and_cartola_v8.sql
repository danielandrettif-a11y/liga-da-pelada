-- OVR v12, Coletiva com leitura exata/respostas e Cartola BQ v8.
-- As novas regras do Cartola entram apenas em rodadas criadas depois desta migration.

BEGIN;

ALTER TABLE public.player_overall_snapshots
  ADD COLUMN IF NOT EXISTS goalkeeper_games INTEGER NOT NULL DEFAULT 0 CHECK (goalkeeper_games >= 0);

ALTER TABLE public.collective_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.collective_messages(id) ON DELETE SET NULL;

ALTER TABLE public.collective_reads
  ADD COLUMN IF NOT EXISTS last_read_message_id UUID REFERENCES public.collective_messages(id) ON DELETE SET NULL;

ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS collective_push_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS collective_messages_reply_idx
  ON public.collective_messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS collective_reads_user_callup_idx
  ON public.collective_reads (user_id, callup_id, last_read_message_id);

INSERT INTO public.overall_formula_versions (key, label, config)
VALUES (
  'adaptive-v12-top-three-progression',
  'OVR adaptativo v12 — três melhores posições',
  jsonb_build_object(
    'base', 70, 'legacyInitialTagBonus', 3, 'legacySeedEnabled', false,
    'seedFadeRounds', 3, 'confidenceRounds', 3,
    'goalkeeperEligibilityRounds', 3, 'goalkeeperEligibilityGames', 8,
    'positionCaps', jsonb_build_object('1', 74, '2', 76, '3', 78),
    'staleAfterRounds', 4, 'halfLifeRounds', 3, 'recentRoundWindow', 8,
    'maxChangePerRound', 1.5, 'weeklyEvidenceCap', true,
    'traitWeightedChange', false, 'traitBasedOverall', false,
    'overallConfidenceShrink', false, 'rankedTraitOverall', false,
    'traitsAsProgressionBonus', true, 'traitProgressionBonusBudget', 0.30,
    'topThreeOverall', true, 'performanceChangeBonus', 0.03,
    'hardPositionCapsEnabled', false, 'provisionalAtConfidenceThreshold', false,
    'defensiveWeights', jsonb_build_object('concededRate', 0.50, 'survival', 0.35, 'exposure', 0.10, 'discipline', 0.05),
    'legacyTimingConfidence', 0.75, 'assistValue', 0.65,
    'attackCurve', 0.32, 'separateAttackScores', true,
    'goalCurve', 0.32, 'assistCurve', 0.28,
    'positionWeights', jsonb_build_object(
      'DEF', jsonb_build_object('defense', 0.70, 'goals', 0.05, 'assists', 0.20, 'result', 0.05),
      'ALA_MEI', jsonb_build_object('defense', 0.30, 'goals', 0.30, 'assists', 0.35, 'result', 0.05),
      'ATA', jsonb_build_object('defense', 0.10, 'goals', 0.60, 'assists', 0.25, 'result', 0.05)
    ),
    'roleEvidence', jsonb_build_object(
      'DEF', jsonb_build_object('DEF', 1, 'ALA_MEI', 0.45, 'ATA', 0.15),
      'ALA_MEI', jsonb_build_object('DEF', 0.50, 'ALA_MEI', 1, 'ATA', 0.50),
      'ATA', jsonb_build_object('DEF', 0.15, 'ALA_MEI', 0.45, 'ATA', 1)
    ),
    'unassignedRoleEvidence', jsonb_build_object('DEF', 0.40, 'ALA_MEI', 0.55, 'ATA', 0.40),
    'unselectedTraitEvidence', 1,
    'trendEnabled', true, 'trendWindowRounds', 3, 'trendMinimumRounds', 3,
    'trendRequiredRounds', 2, 'trendHighScore', 0.56, 'trendLowScore', 0.42,
    'trendUpwardMultiplier', 0.20, 'trendDownwardMultiplier', 0.30
  )
)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, config = EXCLUDED.config;

DROP FUNCTION IF EXISTS public.get_latest_player_card_overalls();
CREATE FUNCTION public.get_latest_player_card_overalls()
RETURNS TABLE (
  player_id UUID, overall NUMERIC, trend TEXT, def_overall NUMERIC,
  ala_mei_overall NUMERIC, ata_overall NUMERIC, gol_overall NUMERIC,
  goalkeeper_games INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  WITH compatible_snapshots AS (
    SELECT snapshot.player_id, snapshot.overall,
      COALESCE(snapshot.data_quality ->> 'overall_trend', 'steady') AS trend,
      snapshot.def_overall, snapshot.ala_mei_overall, snapshot.ata_overall,
      snapshot.gol_overall, snapshot.goalkeeper_games,
      row_number() OVER (PARTITION BY snapshot.player_id ORDER BY
        CASE formula.key
          WHEN 'adaptive-v12-top-three-progression' THEN 0
          WHEN 'adaptive-v11-balanced-characteristics' THEN 1
          WHEN 'adaptive-v10-role-reframe' THEN 2
          WHEN 'adaptive-v9-player-form-trend-shadow' THEN 3 ELSE 4 END,
        run.created_at DESC, run.id DESC) AS snapshot_rank
    FROM public.player_overall_snapshots snapshot
    JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
    JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
    JOIN public.players player ON player.id = snapshot.player_id
    WHERE formula.key IN (
      'adaptive-v12-top-three-progression', 'adaptive-v11-balanced-characteristics',
      'adaptive-v10-role-reframe', 'adaptive-v9-player-form-trend-shadow',
      'adaptive-v8-soft-progression-shadow')
      AND (
        (formula.key = 'adaptive-v12-top-three-progression' AND run.status = 'published')
        OR (formula.key <> 'adaptive-v12-top-three-progression' AND run.status IN ('succeeded', 'published'))
      )
      AND player.member_category = 'player' AND player.is_selectable = true
  )
  SELECT player_id, overall, trend, def_overall, ala_mei_overall,
    ata_overall, gol_overall, goalkeeper_games
  FROM compatible_snapshots WHERE snapshot_rank = 1;
$function$;
REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_player_card_overalls() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.snapshot_bq_scoring(p_league_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_snapshot JSONB;
BEGIN
  SELECT jsonb_build_object(
    'version', 8,
    'goal', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='goal'),4.0),
    'assist', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='assist'),2.5),
    'win', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='win'),3.0),
    'draw', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='draw'),1.0),
    'loss', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='loss'),-2.5),
    'ownGoal', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='own_goal'),-3.0),
    'goalkeeperAppearance', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='goalkeeper_appearance'),2.0),
    'goalkeeperGoalConceded', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='goal_conceded'),-1.0),
    'def_clean_sheet_bonus',1.25,'def_one_goal_bonus',.50,
    'def_assist_bonus',.50,'def_assist_bonus_cap',1.50,
    'def_muralha_threshold',3,'def_muralha_bonus',2.50,'def_bonus_cap',8.0,
    'ala_goal_bonus',.50,'ala_assist_bonus',.75,'ala_clean_sheet_bonus',.50,
    'ala_one_goal_bonus',.25,'ala_attack_threshold',1,'ala_defense_threshold',2,
    'ala_vai_e_volta_bonus',1.50,'ala_bonus_cap',6.0,
    'ata_artilheiro_threshold',2,'ata_artilheiro_bonus',2.0
  ) INTO v_snapshot;
  RETURN v_snapshot;
END; $$;

CREATE OR REPLACE FUNCTION public.set_role_scoring_activation_from_round_two()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_number INTEGER; v_suppress BOOLEAN; v_version INTEGER; v_round_snapshot JSONB;
BEGIN
  SELECT number,suppress_goalkeeper_rewards,scoring_version,scoring_snapshot
    INTO v_number,v_suppress,v_version,v_round_snapshot FROM public.rounds WHERE id=NEW.round_id;
  v_version:=COALESCE(v_version,5);
  NEW.settings_snapshot:=COALESCE(NEW.settings_snapshot,'{}') || jsonb_build_object(
    'role_scoring_active',COALESCE(v_number,1)>=2,'role_scoring_start_round',2,
    'goalkeeper_appearance_points',CASE WHEN v_suppress THEN 0 ELSE COALESCE((NEW.settings_snapshot->>'goalkeeper_appearance_points')::NUMERIC,2) END,
    'goal_conceded_points',COALESCE((NEW.settings_snapshot->>'goal_conceded_points')::NUMERIC,-1),
    'goalkeeper_slot_clean_sheet_points',CASE WHEN v_suppress THEN 0 ELSE 4 END,
    'scoring_version',v_version,
    'def_clean_sheet_bonus',COALESCE((v_round_snapshot->>'def_clean_sheet_bonus')::NUMERIC,1.25),
    'def_one_goal_bonus',COALESCE((v_round_snapshot->>'def_one_goal_bonus')::NUMERIC,.50),
    'def_assist_bonus',COALESCE((v_round_snapshot->>'def_assist_bonus')::NUMERIC,.50),
    'def_assist_bonus_cap',COALESCE((v_round_snapshot->>'def_assist_bonus_cap')::NUMERIC,1.50),
    'def_muralha_threshold',COALESCE((v_round_snapshot->>'def_muralha_threshold')::INTEGER,3),
    'def_muralha_bonus',COALESCE((v_round_snapshot->>'def_muralha_bonus')::NUMERIC,2.50),
    'def_bonus_cap',COALESCE((v_round_snapshot->>'def_bonus_cap')::NUMERIC,8),
    'ala_goal_bonus',COALESCE((v_round_snapshot->>'ala_goal_bonus')::NUMERIC,.50),
    'ala_assist_bonus',COALESCE((v_round_snapshot->>'ala_assist_bonus')::NUMERIC,.75),
    'ala_clean_sheet_bonus',COALESCE((v_round_snapshot->>'ala_clean_sheet_bonus')::NUMERIC,.50),
    'ala_one_goal_bonus',COALESCE((v_round_snapshot->>'ala_one_goal_bonus')::NUMERIC,.25),
    'ala_attack_threshold',COALESCE((v_round_snapshot->>'ala_attack_threshold')::INTEGER,1),
    'ala_defense_threshold',COALESCE((v_round_snapshot->>'ala_defense_threshold')::INTEGER,2),
    'ala_vai_e_volta_bonus',COALESCE((v_round_snapshot->>'ala_vai_e_volta_bonus')::NUMERIC,1.50),
    'ala_bonus_cap',COALESCE((v_round_snapshot->>'ala_bonus_cap')::NUMERIC,6),
    'ata_artilheiro_threshold',COALESCE((v_round_snapshot->>'ata_artilheiro_threshold')::INTEGER,2),
    'ata_artilheiro_bonus',COALESCE((v_round_snapshot->>'ata_artilheiro_bonus')::NUMERIC,2));
  NEW.scoring_version:=v_version; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.calculate_fantasy_position_bonus_v7(
  p_settings JSONB,p_slot_role TEXT,p_is_position_correct BOOLEAN,p_goals INTEGER,
  p_assists INTEGER,p_goalkeeper_games INTEGER,p_clean_sheets INTEGER,
  p_defensive_clean_games INTEGER,p_defensive_one_goal_games INTEGER
) RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT round(CASE
    WHEN p_slot_role='GOL' AND COALESCE(p_goalkeeper_games,0)>0 THEN
      COALESCE(p_clean_sheets,0)*COALESCE((p_settings->>'goalkeeper_slot_clean_sheet_points')::NUMERIC,4)
    WHEN p_is_position_correct AND p_slot_role='DEF' THEN least(
      COALESCE((p_settings->>'def_bonus_cap')::NUMERIC,8),
      COALESCE(p_defensive_clean_games,0)*COALESCE((p_settings->>'def_clean_sheet_bonus')::NUMERIC,1.25)
      +COALESCE(p_defensive_one_goal_games,0)*COALESCE((p_settings->>'def_one_goal_bonus')::NUMERIC,.5)
      +CASE WHEN COALESCE((p_settings->>'scoring_version')::INTEGER,7)>=8 THEN least(
        COALESCE(p_assists,0)*COALESCE((p_settings->>'def_assist_bonus')::NUMERIC,.5),
        COALESCE((p_settings->>'def_assist_bonus_cap')::NUMERIC,1.5)) ELSE 0 END
      +CASE WHEN COALESCE(p_defensive_clean_games,0)>=COALESCE((p_settings->>'def_muralha_threshold')::INTEGER,3)
        THEN COALESCE((p_settings->>'def_muralha_bonus')::NUMERIC,2.5) ELSE 0 END)
    WHEN p_is_position_correct AND p_slot_role='MEI' THEN least(
      COALESCE((p_settings->>'ala_bonus_cap')::NUMERIC,6),
      COALESCE(p_goals,0)*COALESCE((p_settings->>'ala_goal_bonus')::NUMERIC,.5)
      +COALESCE(p_assists,0)*COALESCE((p_settings->>'ala_assist_bonus')::NUMERIC,.75)
      +COALESCE(p_defensive_clean_games,0)*COALESCE((p_settings->>'ala_clean_sheet_bonus')::NUMERIC,.5)
      +COALESCE(p_defensive_one_goal_games,0)*COALESCE((p_settings->>'ala_one_goal_bonus')::NUMERIC,.25)
      +CASE WHEN COALESCE(p_goals,0)+COALESCE(p_assists,0)>=COALESCE((p_settings->>'ala_attack_threshold')::INTEGER,1)
        AND COALESCE(p_defensive_clean_games,0)+COALESCE(p_defensive_one_goal_games,0)>=COALESCE((p_settings->>'ala_defense_threshold')::INTEGER,2)
        THEN COALESCE((p_settings->>'ala_vai_e_volta_bonus')::NUMERIC,1.5) ELSE 0 END)
    WHEN p_is_position_correct AND p_slot_role='ATA' THEN CASE WHEN COALESCE(p_goals,0)>=COALESCE((p_settings->>'ata_artilheiro_threshold')::INTEGER,2)
      THEN COALESCE((p_settings->>'ata_artilheiro_bonus')::NUMERIC,2) ELSE 0 END
    ELSE 0 END,2);
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
