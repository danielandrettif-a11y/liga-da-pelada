-- A publicação v19/v20 do OVR só pode reconstruir a Ranked da pelada da execução.
-- Fórmulas anteriores continuam bloqueadas em ambiente com múltiplas peladas.
BEGIN;

CREATE OR REPLACE FUNCTION public.reprocess_ranked_fixed_profiles_for_league(
  p_league_id uuid,
  p_player_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected_stats integer := 0;
BEGIN
  IF p_league_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.leagues WHERE id = p_league_id
  ) THEN
    RAISE EXCEPTION 'Pelada inexistente para reprocessar a Ranked.';
  END IF;

  UPDATE public.player_round_stats stats SET
    player_profile_locked = player.player_profile,
    profile_decision_source = 'initial',
    points = CASE WHEN EXISTS (
      SELECT 1 FROM public.player_round_stat_overrides override_item
      WHERE override_item.round_id = stats.round_id
        AND override_item.player_id = stats.player_id
        AND override_item.override_type = 'zero_points'
    ) THEN 0 ELSE round(
      GREATEST(COALESCE(stats.goals,0)-COALESCE(stats.goalkeeper_goals,0),0)
        * CASE WHEN player.player_profile = 'defensive'
          THEN COALESCE((round_item.scoring_snapshot->>'defenderGoal')::numeric,5)
          ELSE COALESCE((round_item.scoring_snapshot->>'goal')::numeric,4) END
      + GREATEST(COALESCE(stats.assists,0)-COALESCE(stats.goalkeeper_assists,0),0)
        * CASE WHEN player.player_profile = 'defensive'
          THEN COALESCE((round_item.scoring_snapshot->>'defenderAssist')::numeric,3)
          ELSE COALESCE((round_item.scoring_snapshot->>'assist')::numeric,2.5) END
      + CASE WHEN player.player_profile = 'defensive' THEN
          COALESCE(stats.ranking_defensive_clean_games,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderCleanSheet')::numeric,3)
          + COALESCE(stats.ranking_defensive_one_goal_games,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderOneGoal')::numeric,1)
          + COALESCE(stats.ranking_defensive_one_goal_games,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderOneGoalConceded')::numeric,-0.75)
          + GREATEST((
              GREATEST(COALESCE(stats.team_goals_conceded,0)-COALESCE(stats.goals_conceded,0),0)
                - COALESCE(stats.ranking_defensive_one_goal_games,0)
            )/2.0,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderTwoGoalsConceded')::numeric,-1.75)
        ELSE GREATEST(COALESCE(stats.team_goals_conceded,0)-COALESCE(stats.goals_conceded,0),0)
          * COALESCE((round_item.scoring_snapshot->>'teamGoalConceded')::numeric,-0.5) END
      + GREATEST(COALESCE(stats.own_goals,0)-COALESCE(stats.goalkeeper_own_goals,0),0)
        * COALESCE((round_item.scoring_snapshot->>'ownGoal')::numeric,-3)
      + COALESCE(stats.goalkeeper_games,0)
        * COALESCE((round_item.scoring_snapshot->>'goalkeeperAppearance')::numeric,1)
      + COALESCE(stats.goalkeeper_goals,0)
        * COALESCE((round_item.scoring_snapshot->>'defenderGoal')::numeric,5)
      + COALESCE(stats.goalkeeper_assists,0)
        * COALESCE((round_item.scoring_snapshot->>'defenderAssist')::numeric,3)
      + COALESCE(stats.goals_conceded,0)
        * COALESCE((round_item.scoring_snapshot->>'goalkeeperGoalConceded')::numeric,-0.5)
      + COALESCE(stats.clean_sheets,0)
        * COALESCE((round_item.scoring_snapshot->>'goalkeeperCleanSheet')::numeric,4)
      + GREATEST(LEAST(
          COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0),
          2*(COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0))
            -COALESCE(stats.goals_conceded,0)
        ),0)*COALESCE((round_item.scoring_snapshot->>'goalkeeperOneGoal')::numeric,2)
      + COALESCE(stats.goalkeeper_own_goals,0)
        * COALESCE((round_item.scoring_snapshot->>'ownGoal')::numeric,-3)
    ,2) END,
    ranking_role_weights = CASE WHEN stats.games > 0 THEN jsonb_build_array(jsonb_build_object(
      'role',CASE WHEN player.player_profile = 'defensive' THEN 'DEF' ELSE 'ATA' END,
      'overall',0,'weight',1
    )) ELSE '[]'::jsonb END,
    ranking_position_bonus = 0
  FROM public.players player, public.rounds round_item, public.seasons season
  WHERE player.id = stats.player_id
    AND round_item.id = stats.round_id
    AND round_item.league_id = p_league_id
    AND season.id = round_item.season_id
    AND season.league_id = p_league_id
    AND season.status = 'active'
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished'
    AND player.player_profile IN ('defensive','offensive')
    AND (p_player_id IS NULL OR stats.player_id = p_player_id);
  GET DIAGNOSTICS affected_stats = ROW_COUNT;

  UPDATE public.round_players round_player SET
    player_profile_locked = player.player_profile,
    profile_decision_source = 'initial'
  FROM public.players player, public.rounds round_item, public.seasons season
  WHERE player.id = round_player.player_id
    AND round_item.id = round_player.round_id
    AND round_item.league_id = p_league_id
    AND season.id = round_item.season_id
    AND season.league_id = p_league_id
    AND season.status = 'active'
    AND round_item.round_type = 'official'
    AND player.player_profile IN ('defensive','offensive')
    AND (p_player_id IS NULL OR round_player.player_id = p_player_id);

  RETURN jsonb_build_object('success',true,'player_rounds_reprocessed',affected_stats);
END;
$$;
REVOKE ALL ON FUNCTION public.reprocess_ranked_fixed_profiles_for_league(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprocess_ranked_fixed_profiles_for_league(uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.apply_admin_fixed_profiles_from_overall_run(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league_id uuid;
BEGIN
  SELECT run.league_id INTO target_league_id
  FROM public.overall_calculation_runs run
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  WHERE run.id = p_run_id AND run.status = 'published'
    AND formula.key IN (
      'adaptive-v20-statistical-confidence',
      'adaptive-v19-admin-fixed-profile'
    );
  IF target_league_id IS NULL THEN
    RAISE EXCEPTION 'A execução v19 ou v20 precisa estar publicada.';
  END IF;

  UPDATE public.player_round_stats stats SET
    player_profile_locked = breakdown.played_profile,
    profile_decision_source = 'initial',
    profile_appearance_number = breakdown.profile_appearance_number,
    profile_def_overall = breakdown.profile_def_overall,
    profile_ata_overall = breakdown.profile_ata_overall
  FROM public.player_overall_round_breakdowns breakdown, public.rounds round_item
  WHERE breakdown.calculation_run_id = p_run_id
    AND breakdown.player_id = stats.player_id
    AND breakdown.round_id = stats.round_id
    AND round_item.id = stats.round_id
    AND round_item.league_id = target_league_id;

  UPDATE public.round_players round_player SET
    player_profile_locked = player.player_profile,
    profile_decision_source = 'initial',
    profile_def_overall = stats.profile_def_overall,
    profile_ata_overall = stats.profile_ata_overall
  FROM public.players player, public.player_round_stats stats, public.rounds round_item
  WHERE player.id = round_player.player_id
    AND stats.player_id = round_player.player_id
    AND stats.round_id = round_player.round_id
    AND round_item.id = round_player.round_id
    AND round_item.league_id = target_league_id;

  PERFORM public.reprocess_ranked_fixed_profiles_for_league(target_league_id);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_admin_fixed_profiles_from_overall_run(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_admin_fixed_profiles_from_overall_run(uuid)
  TO service_role;

-- Somente v19/v20 usam a cadeia acima. A v14 e a v18 ainda possuem efeitos
-- globais quando publicadas e permanecem protegidas pelo bloqueio da 287.
CREATE OR REPLACE FUNCTION public.block_cross_league_overall_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM NEW.status
    AND EXISTS (
      SELECT 1 FROM public.leagues league
      WHERE league.id <> NEW.league_id AND league.is_active
    ) AND NOT EXISTS (
      SELECT 1 FROM public.overall_formula_versions formula
      WHERE formula.id = NEW.formula_version_id
        AND formula.key IN (
          'adaptive-v20-statistical-confidence',
          'adaptive-v19-admin-fixed-profile'
        )
    ) THEN
    RAISE EXCEPTION 'Esta formula do OVR nao pode ser publicada com mais de uma pelada ativa.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_cross_league_overall_publish()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
