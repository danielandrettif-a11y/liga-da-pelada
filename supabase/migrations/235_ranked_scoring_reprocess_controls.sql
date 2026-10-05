-- Salva as regras da Coluna C e, opcionalmente, reaplica somente a Ranked.
-- O Cartola (lineups, patrimônio e pontuações) não é lido nem alterado aqui.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_column_c_scoring_settings(
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
  p_goalkeeper_one_goal_points NUMERIC,
  p_reprocess_ranked BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE
  v_rounds_reprocessed INTEGER := 0;
  v_player_rounds_reprocessed INTEGER := 0;
  v_own_goal_points NUMERIC := -3;
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
  WHERE league_id=p_league_id
  RETURNING COALESCE(own_goal_points,-3) INTO v_own_goal_points;

  IF p_reprocess_ranked THEN
    -- O snapshot é da Ranked. A flag libera somente esta regravação auditável.
    PERFORM set_config('app.allow_bq_snapshot_rewrite','on',true);

    UPDATE public.rounds round_item SET
      scoring_version=13,
      scoring_snapshot=jsonb_build_object(
        'version',13,
        'goal',p_attacker_goal_points,
        'assist',p_attacker_assist_points,
        'win',0,'draw',0,'loss',0,
        'ownGoal',v_own_goal_points,
        'goalkeeperAppearance',p_goalkeeper_appearance_points,
        'goalkeeperGoalConceded',p_goalkeeper_goal_conceded_points,
        'defenderGoal',p_defender_goal_points,
        'defenderAssist',p_defender_assist_points,
        'defenderCleanSheet',p_defender_clean_sheet_points,
        'defenderOneGoal',p_defender_one_goal_points,
        'defenderOneGoalConceded',p_defender_one_goal_conceded_points,
        'defenderTwoGoalsConceded',p_defender_two_goals_conceded_points,
        'goalkeeperCleanSheet',p_goalkeeper_clean_sheet_points,
        'goalkeeperOneGoal',p_goalkeeper_one_goal_points,
        'teamGoalConceded',p_line_goal_conceded_points
      )
    FROM public.seasons season
    WHERE season.id=round_item.season_id
      AND season.league_id=p_league_id
      AND season.status='active'
      AND round_item.round_type='official';
    GET DIAGNOSTICS v_rounds_reprocessed = ROW_COUNT;

    -- Recalcula apenas player_round_stats oficiais da temporada ativa. Não há
    -- qualquer UPDATE em tabelas fantasy_*; o Cartola permanece congelado.
    UPDATE public.player_round_stats stats SET
      points=CASE WHEN EXISTS (
        SELECT 1 FROM public.player_round_stat_overrides override_item
        WHERE override_item.round_id=stats.round_id
          AND override_item.player_id=stats.player_id
          AND override_item.override_type='zero_points'
      ) THEN 0 ELSE round(
        GREATEST(COALESCE(stats.goals,0)-COALESCE(stats.goalkeeper_goals,0),0)
          * CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive'
            THEN p_defender_goal_points ELSE p_attacker_goal_points END
        + GREATEST(COALESCE(stats.assists,0)-COALESCE(stats.goalkeeper_assists,0),0)
          * CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive'
            THEN p_defender_assist_points ELSE p_attacker_assist_points END
        + CASE WHEN COALESCE(stats.player_profile_locked,player.player_profile)='defensive' THEN
            COALESCE(stats.ranking_defensive_clean_games,0)*p_defender_clean_sheet_points
            + COALESCE(stats.ranking_defensive_one_goal_games,0)*p_defender_one_goal_points
            + COALESCE(stats.ranking_defensive_one_goal_games,0)*p_defender_one_goal_conceded_points
            + GREATEST((
                GREATEST(COALESCE(stats.team_goals_conceded,0)-COALESCE(stats.goals_conceded,0),0)
                - COALESCE(stats.ranking_defensive_one_goal_games,0)
              )/2.0,0)*p_defender_two_goals_conceded_points
          ELSE GREATEST(COALESCE(stats.team_goals_conceded,0)-COALESCE(stats.goals_conceded,0),0)
            * p_line_goal_conceded_points END
        + GREATEST(COALESCE(stats.own_goals,0)-COALESCE(stats.goalkeeper_own_goals,0),0)*v_own_goal_points
        + COALESCE(stats.goalkeeper_games,0)*p_goalkeeper_appearance_points
        + COALESCE(stats.goalkeeper_goals,0)*p_defender_goal_points
        + COALESCE(stats.goalkeeper_assists,0)*p_defender_assist_points
        + COALESCE(stats.goals_conceded,0)*p_goalkeeper_goal_conceded_points
        + COALESCE(stats.clean_sheets,0)*p_goalkeeper_clean_sheet_points
        + GREATEST(LEAST(
            COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0),
            2*(COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0))
              -COALESCE(stats.goals_conceded,0)
          ),0)*p_goalkeeper_one_goal_points
        + COALESCE(stats.goalkeeper_own_goals,0)*v_own_goal_points
      ,2) END,
      ranking_position_bonus=0
    FROM public.players player, public.rounds round_item, public.seasons season
    WHERE player.id=stats.player_id
      AND round_item.id=stats.round_id
      AND season.id=round_item.season_id
      AND season.league_id=p_league_id
      AND season.status='active'
      AND round_item.round_type='official'
      AND round_item.status='finished';
    GET DIAGNOSTICS v_player_rounds_reprocessed = ROW_COUNT;
  END IF;

  INSERT INTO public.fantasy_audit_log (league_id,user_id,action,payload)
  VALUES (
    p_league_id,
    auth.uid(),
    CASE WHEN p_reprocess_ranked
      THEN 'column_c_scoring_settings_reprocessed_ranked'
      ELSE 'column_c_scoring_settings_updated' END,
    jsonb_build_object(
      'reprocessedRanked',p_reprocess_ranked,
      'roundsReprocessed',v_rounds_reprocessed,
      'playerRoundsReprocessed',v_player_rounds_reprocessed
    )
  );

  RETURN jsonb_build_object(
    'success',true,
    'rounds_reprocessed',v_rounds_reprocessed,
    'player_rounds_reprocessed',v_player_rounds_reprocessed
  );
END $$;

REVOKE ALL ON FUNCTION public.save_column_c_scoring_settings(
  UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,
  NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,BOOLEAN
) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.save_column_c_scoring_settings(
  UUID,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,
  NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,NUMERIC,BOOLEAN
) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';

COMMIT;
