-- BQ v11: o bônus do ATA passa a ser progressivo sem alterar o teto.
-- Cartola: +1 com um gol e +2 com dois ou mais.
-- Ranking: a normalização existente converte esses valores em +3,5 e +7.

BEGIN;

CREATE OR REPLACE FUNCTION public.snapshot_bq_scoring(p_league_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_snapshot JSONB;
BEGIN
  SELECT jsonb_build_object(
    'version',11,
    'goal',COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='goal'),4.0),
    'assist',COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='assist'),2.5),
    'win',COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='win'),3.0),
    'draw',COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='draw'),1.0),
    'loss',COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='loss'),-2.5),
    'ownGoal',COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='own_goal'),-3.0),
    'goalkeeperAppearance',COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='goalkeeper_appearance'),2.0),
    'goalkeeperGoalConceded',COALESCE((SELECT points FROM public.ranking_rules WHERE league_id=p_league_id AND event_type='goal_conceded'),-1.0),
    'goalkeeper_slot_appearance_points',4.0,
    'goalkeeper_slot_goal_conceded_points',-2.5,
    'goalkeeper_slot_clean_sheet_points',4.0,
    'def_clean_sheet_bonus',1.25,'def_one_goal_bonus',.50,
    'def_assist_bonus',.50,'def_assist_bonus_cap',1.50,
    'def_draw_bonus',1.0,'def_draw_bonus_cap',2.0,
    'def_muralha_threshold',3,'def_muralha_bonus',2.50,'def_bonus_cap',10.0,
    'ala_goal_bonus',.50,'ala_assist_bonus',.75,'ala_clean_sheet_bonus',.50,
    'ala_one_goal_bonus',.25,'ala_attack_threshold',1,'ala_defense_threshold',2,
    'ala_vai_e_volta_bonus',1.50,'ala_bonus_cap',6.0,
    'ata_artilheiro_threshold',2,'ata_artilheiro_bonus',2.0
  ) INTO v_snapshot;
  RETURN v_snapshot;
END; $$;

CREATE OR REPLACE FUNCTION public.calculate_fantasy_position_bonus_v9(
  p_settings JSONB,p_slot_role TEXT,p_is_position_correct BOOLEAN,p_goals INTEGER,
  p_assists INTEGER,p_draws INTEGER,p_goalkeeper_games INTEGER,p_clean_sheets INTEGER,
  p_defensive_clean_games INTEGER,p_defensive_one_goal_games INTEGER
) RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT round(CASE
    WHEN p_slot_role='GOL' AND COALESCE(p_goalkeeper_games,0)>0 THEN
      COALESCE(p_clean_sheets,0)*COALESCE((p_settings->>'goalkeeper_slot_clean_sheet_points')::NUMERIC,4)
    WHEN p_is_position_correct AND p_slot_role='DEF' THEN least(
      COALESCE((p_settings->>'def_bonus_cap')::NUMERIC,10),
      COALESCE(p_defensive_clean_games,0)*COALESCE((p_settings->>'def_clean_sheet_bonus')::NUMERIC,1.25)
      +COALESCE(p_defensive_one_goal_games,0)*COALESCE((p_settings->>'def_one_goal_bonus')::NUMERIC,.5)
      +least(COALESCE(p_assists,0)*COALESCE((p_settings->>'def_assist_bonus')::NUMERIC,.5),COALESCE((p_settings->>'def_assist_bonus_cap')::NUMERIC,1.5))
      +least(COALESCE(p_draws,0)*COALESCE((p_settings->>'def_draw_bonus')::NUMERIC,.5),COALESCE((p_settings->>'def_draw_bonus_cap')::NUMERIC,2))
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
    WHEN p_is_position_correct AND p_slot_role='ATA' THEN
      CASE WHEN COALESCE((p_settings->>'scoring_version')::INTEGER,(p_settings->>'version')::INTEGER,5)>=11
        THEN least(COALESCE(p_goals,0),2)
        WHEN COALESCE(p_goals,0)>=COALESCE((p_settings->>'ata_artilheiro_threshold')::INTEGER,2)
        THEN COALESCE((p_settings->>'ata_artilheiro_bonus')::NUMERIC,2)
        ELSE 0 END
    ELSE 0 END,2);
$$;

-- Só mercados ainda abertos e sem partida iniciada migram para o Cartola v11.
ALTER TABLE public.rounds DISABLE TRIGGER zz_round_bq_scoring_snapshot_immutable;
UPDATE public.rounds round_item
SET scoring_snapshot=public.snapshot_bq_scoring(round_item.league_id),scoring_version=11
WHERE round_item.round_type='official'
  AND round_item.status<>'finished'
  AND NOT EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id=round_item.id
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live','finished'))
  );
ALTER TABLE public.rounds ENABLE TRIGGER zz_round_bq_scoring_snapshot_immutable;

UPDATE public.fantasy_rounds fantasy_round SET
  scoring_version=11,
  settings_snapshot=COALESCE(fantasy_round.settings_snapshot,'{}')||jsonb_build_object('scoring_version',11)
FROM public.rounds round_item
WHERE fantasy_round.round_id=round_item.id
  AND fantasy_round.market_status='open'
  AND round_item.scoring_version=11;

UPDATE public.fantasy_test_sessions test_session SET
  scoring_version=11,
  settings_snapshot=COALESCE(test_session.settings_snapshot,'{}')||jsonb_build_object('scoring_version',11)
FROM public.rounds round_item
WHERE test_session.round_id=round_item.id
  AND test_session.status='open'
  AND round_item.scoring_version=11;

-- O Ranking é cumulativo e usa a regra atual; recalcula as rodadas oficiais da temporada ativa.
UPDATE public.player_round_stats stats
SET ranking_position_bonus = public.calculate_ranked_position_bonus_v1(
  stats.league_id, stats.ranking_role_weights, stats.goals, stats.assists, stats.draws,
  stats.ranking_defensive_clean_games, stats.ranking_defensive_one_goal_games
)
FROM public.rounds round_item, public.seasons season
WHERE round_item.id = stats.round_id
  AND season.id = round_item.season_id
  AND season.status = 'active'
  AND round_item.round_type = 'official'
  AND round_item.status = 'finished'
  AND stats.games > 0;

NOTIFY pgrst, 'reload schema';

COMMIT;
