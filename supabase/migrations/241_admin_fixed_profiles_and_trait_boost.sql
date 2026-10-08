-- V19: tag fixa escolhida pelo ADM e características como aceleração do OVR.
-- A Ranked ativa é reconstruída; o histórico encerrado do Cartola permanece intacto.

BEGIN;

INSERT INTO public.overall_formula_versions(key,label,config)
SELECT
  'adaptive-v19-admin-fixed-profile',
  'OVR adaptativo v19 — tag fixa e bônus 100% ou 60/40',
  config || jsonb_build_object(
    'fluidProfileEnabled',false,
    'adminFixedProfileEnabled',true,
    'initialProfileAcceleration',1,
    'oppositeRoleAcceleration',1,
    'traitsAsProgressionBonus',true,
    'traitProgressionBonusBudget',0.30,
    'prioritizedTraitProgression',false,
    'prioritizedTraitsAsEvidenceOnly',false,
    'unselectedTraitEvidence',1,
    'unselectedTraitEvidenceEnabled',false,
    'traitInfluenceFadeEnabled',false
  )
FROM public.overall_formula_versions
WHERE key='adaptive-v18-fluid-profile'
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label,config=EXCLUDED.config;

-- Recupera a escolha administrativa existente antes de a v18 passar a
-- sobrescrever player_profile com o maior OVR.
SELECT set_config('app.allow_fluid_profile_update','on',true);
UPDATE public.players SET
  player_profile=COALESCE(initial_player_profile,player_profile),
  profile_decision_source='initial',
  profile_source_round_id=NULL
WHERE member_category IN ('player','guest');

CREATE OR REPLACE FUNCTION public.protect_fluid_player_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.initial_player_profile:=NEW.player_profile;
    NEW.profile_decision_source:='initial';
    NEW.profile_source_round_id:=NULL;
    RETURN NEW;
  END IF;

  IF NEW.player_profile IS DISTINCT FROM OLD.player_profile THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_app_admin() THEN
      RAISE EXCEPTION 'Somente administradores podem alterar a tag fixa do jogador.';
    END IF;
    NEW.initial_player_profile:=NEW.player_profile;
    NEW.profile_decision_source:='initial';
    NEW.profile_source_round_id:=NULL;
  END IF;
  RETURN NEW;
END $$;

-- Agora que a trava fluida foi substituída, mantém os dois campos legados
-- alinhados para que telas antigas também leiam a tag fixa correta.
UPDATE public.players SET initial_player_profile=player_profile
WHERE member_category IN ('player','guest');

CREATE OR REPLACE FUNCTION public.protect_fantasy_player_positions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_app_admin() THEN
    IF NEW.is_goalkeeper IS DISTINCT FROM OLD.is_goalkeeper THEN
      RAISE EXCEPTION 'GOL não é uma tag de perfil e não pode ser alterada aqui.';
    END IF;
    IF NEW.player_profile IS DISTINCT FROM OLD.player_profile THEN
      RAISE EXCEPTION 'A tag fixa é definida somente pelo administrador.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Toda nova convocação congela a tag fixa vigente naquele momento.
CREATE OR REPLACE FUNCTION public.lock_round_player_fluid_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE target_round public.rounds%ROWTYPE;
DECLARE prior_appearances INTEGER:=0;
DECLARE fixed_profile TEXT;
DECLARE latest_def NUMERIC;
DECLARE latest_ata NUMERIC;
BEGIN
  SELECT * INTO target_round FROM public.rounds WHERE id=NEW.round_id;
  SELECT player.player_profile INTO fixed_profile
  FROM public.players player WHERE player.id=NEW.player_id;

  SELECT count(DISTINCT round_item.id)::INTEGER INTO prior_appearances
  FROM public.rounds round_item
  JOIN public.matches match_item ON match_item.round_id=round_item.id AND match_item.status='finished'
  JOIN public.match_players participant ON participant.match_id=match_item.id
  WHERE participant.player_id=NEW.player_id
    AND round_item.round_type='official' AND round_item.status='finished'
    AND (round_item.date,round_item.created_at,round_item.number,round_item.id)
      < (target_round.date,target_round.created_at,target_round.number,target_round.id);

  SELECT snapshot.def_overall,snapshot.ata_overall INTO latest_def,latest_ata
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id=snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
  WHERE snapshot.player_id=NEW.player_id AND run.status='published'
    AND formula.key IN ('adaptive-v19-admin-fixed-profile','adaptive-v18-fluid-profile')
  ORDER BY CASE formula.key WHEN 'adaptive-v19-admin-fixed-profile' THEN 0 ELSE 1 END,
    run.published_at DESC NULLS LAST,run.created_at DESC
  LIMIT 1;

  NEW.player_profile_locked:=fixed_profile;
  NEW.profile_decision_source:='initial';
  NEW.profile_appearance_number:=CASE WHEN target_round.round_type='official' THEN prior_appearances+1 ELSE NULL END;
  NEW.profile_def_overall:=latest_def;
  NEW.profile_ata_overall:=latest_ata;
  RETURN NEW;
END $$;

-- Fonte única para reconstruir a Ranked usando a tag fixa atual. Nenhuma
-- tabela fantasy_* é alterada por esta função.
CREATE OR REPLACE FUNCTION public.reprocess_active_ranked_fixed_profiles(
  p_player_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE affected_stats INTEGER:=0;
BEGIN
  UPDATE public.player_round_stats stats SET
    player_profile_locked=player.player_profile,
    profile_decision_source='initial',
    points=CASE WHEN EXISTS (
      SELECT 1 FROM public.player_round_stat_overrides override_item
      WHERE override_item.round_id=stats.round_id
        AND override_item.player_id=stats.player_id
        AND override_item.override_type='zero_points'
    ) THEN 0 ELSE round(
      GREATEST(COALESCE(stats.goals,0)-COALESCE(stats.goalkeeper_goals,0),0)
        * CASE WHEN player.player_profile='defensive'
          THEN COALESCE((round_item.scoring_snapshot->>'defenderGoal')::NUMERIC,5)
          ELSE COALESCE((round_item.scoring_snapshot->>'goal')::NUMERIC,4) END
      + GREATEST(COALESCE(stats.assists,0)-COALESCE(stats.goalkeeper_assists,0),0)
        * CASE WHEN player.player_profile='defensive'
          THEN COALESCE((round_item.scoring_snapshot->>'defenderAssist')::NUMERIC,3)
          ELSE COALESCE((round_item.scoring_snapshot->>'assist')::NUMERIC,2.5) END
      + CASE WHEN player.player_profile='defensive' THEN
          COALESCE(stats.ranking_defensive_clean_games,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderCleanSheet')::NUMERIC,3)
          + COALESCE(stats.ranking_defensive_one_goal_games,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderOneGoal')::NUMERIC,1)
          + COALESCE(stats.ranking_defensive_one_goal_games,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderOneGoalConceded')::NUMERIC,-0.75)
          + GREATEST((
              GREATEST(COALESCE(stats.team_goals_conceded,0)-COALESCE(stats.goals_conceded,0),0)
                - COALESCE(stats.ranking_defensive_one_goal_games,0)
            )/2.0,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderTwoGoalsConceded')::NUMERIC,-1.75)
        ELSE GREATEST(COALESCE(stats.team_goals_conceded,0)-COALESCE(stats.goals_conceded,0),0)
          * COALESCE((round_item.scoring_snapshot->>'teamGoalConceded')::NUMERIC,-0.5) END
      + GREATEST(COALESCE(stats.own_goals,0)-COALESCE(stats.goalkeeper_own_goals,0),0)
        * COALESCE((round_item.scoring_snapshot->>'ownGoal')::NUMERIC,-3)
      + COALESCE(stats.goalkeeper_games,0)
        * COALESCE((round_item.scoring_snapshot->>'goalkeeperAppearance')::NUMERIC,1)
      + COALESCE(stats.goalkeeper_goals,0)
        * COALESCE((round_item.scoring_snapshot->>'defenderGoal')::NUMERIC,5)
      + COALESCE(stats.goalkeeper_assists,0)
        * COALESCE((round_item.scoring_snapshot->>'defenderAssist')::NUMERIC,3)
      + COALESCE(stats.goals_conceded,0)
        * COALESCE((round_item.scoring_snapshot->>'goalkeeperGoalConceded')::NUMERIC,-0.5)
      + COALESCE(stats.clean_sheets,0)
        * COALESCE((round_item.scoring_snapshot->>'goalkeeperCleanSheet')::NUMERIC,4)
      + GREATEST(LEAST(
          COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0),
          2*(COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0))
            -COALESCE(stats.goals_conceded,0)
        ),0)*COALESCE((round_item.scoring_snapshot->>'goalkeeperOneGoal')::NUMERIC,2)
      + COALESCE(stats.goalkeeper_own_goals,0)
        * COALESCE((round_item.scoring_snapshot->>'ownGoal')::NUMERIC,-3)
    ,2) END,
    ranking_role_weights=CASE WHEN stats.games>0 THEN jsonb_build_array(jsonb_build_object(
      'role',CASE WHEN player.player_profile='defensive' THEN 'DEF' ELSE 'ATA' END,
      'overall',0,'weight',1
    )) ELSE '[]'::JSONB END,
    ranking_position_bonus=0
  FROM public.players player,public.rounds round_item,public.seasons season
  WHERE player.id=stats.player_id
    AND round_item.id=stats.round_id
    AND season.id=round_item.season_id
    AND season.status='active'
    AND round_item.round_type='official'
    AND round_item.status='finished'
    AND player.player_profile IN ('defensive','offensive')
    AND (p_player_id IS NULL OR stats.player_id=p_player_id);
  GET DIAGNOSTICS affected_stats=ROW_COUNT;

  UPDATE public.round_players round_player SET
    player_profile_locked=player.player_profile,
    profile_decision_source='initial'
  FROM public.players player,public.rounds round_item,public.seasons season
  WHERE player.id=round_player.player_id
    AND round_item.id=round_player.round_id
    AND season.id=round_item.season_id
    AND season.status='active'
    AND round_item.round_type='official'
    AND player.player_profile IN ('defensive','offensive')
    AND (p_player_id IS NULL OR round_player.player_id=p_player_id);

  RETURN jsonb_build_object('success',true,'player_rounds_reprocessed',affected_stats);
END $$;

REVOKE ALL ON FUNCTION public.reprocess_active_ranked_fixed_profiles(UUID)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reprocess_active_ranked_fixed_profiles(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sync_ranked_points_after_player_profile_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
BEGIN
  PERFORM public.reprocess_active_ranked_fixed_profiles(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_ranked_points_after_player_profile_change ON public.players;
CREATE TRIGGER sync_ranked_points_after_player_profile_change
AFTER UPDATE OF player_profile ON public.players
FOR EACH ROW WHEN (OLD.player_profile IS DISTINCT FROM NEW.player_profile)
EXECUTE FUNCTION public.sync_ranked_points_after_player_profile_change();

CREATE OR REPLACE FUNCTION public.apply_admin_fixed_profiles_from_overall_run(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.overall_calculation_runs run
    JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
    WHERE run.id=p_run_id AND run.status='published'
      AND formula.key='adaptive-v19-admin-fixed-profile'
  ) THEN
    RAISE EXCEPTION 'A execução v19 precisa estar publicada.';
  END IF;

  UPDATE public.player_round_stats stats SET
    player_profile_locked=breakdown.played_profile,
    profile_decision_source='initial',
    profile_appearance_number=breakdown.profile_appearance_number,
    profile_def_overall=breakdown.profile_def_overall,
    profile_ata_overall=breakdown.profile_ata_overall
  FROM public.player_overall_round_breakdowns breakdown
  WHERE breakdown.calculation_run_id=p_run_id
    AND breakdown.player_id=stats.player_id
    AND breakdown.round_id=stats.round_id;

  UPDATE public.round_players round_player SET
    player_profile_locked=player.player_profile,
    profile_decision_source='initial',
    profile_def_overall=stats.profile_def_overall,
    profile_ata_overall=stats.profile_ata_overall
  FROM public.players player,public.player_round_stats stats
  WHERE player.id=round_player.player_id
    AND stats.player_id=round_player.player_id
    AND stats.round_id=round_player.round_id;

  PERFORM public.reprocess_active_ranked_fixed_profiles(NULL);
END $$;

REVOKE ALL ON FUNCTION public.apply_admin_fixed_profiles_from_overall_run(UUID)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_admin_fixed_profiles_from_overall_run(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.apply_admin_fixed_profiles_after_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
BEGIN
  IF NEW.status='published' AND OLD.status IS DISTINCT FROM NEW.status
    AND EXISTS (
      SELECT 1 FROM public.overall_formula_versions formula
      WHERE formula.id=NEW.formula_version_id
        AND formula.key='adaptive-v19-admin-fixed-profile'
    ) THEN
    PERFORM public.apply_admin_fixed_profiles_from_overall_run(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS apply_admin_fixed_profiles_after_publish ON public.overall_calculation_runs;
CREATE TRIGGER apply_admin_fixed_profiles_after_publish
AFTER UPDATE OF status ON public.overall_calculation_runs
FOR EACH ROW EXECUTE FUNCTION public.apply_admin_fixed_profiles_after_publish();

DROP FUNCTION IF EXISTS public.get_latest_player_card_overalls();
CREATE FUNCTION public.get_latest_player_card_overalls()
RETURNS TABLE (
  player_id UUID,overall NUMERIC,trend TEXT,def_overall NUMERIC,
  ala_mei_overall NUMERIC,ata_overall NUMERIC,gol_overall NUMERIC,
  goalkeeper_rounds INTEGER,goalkeeper_games INTEGER,rounds_played INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT DISTINCT ON (snapshot.player_id)
    snapshot.player_id,snapshot.overall,COALESCE(snapshot.data_quality->>'overall_trend','steady'),
    snapshot.def_overall,snapshot.ata_overall,snapshot.ata_overall,snapshot.gol_overall,
    snapshot.goalkeeper_rounds,snapshot.goalkeeper_games,snapshot.rounds_played
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id=snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
  JOIN public.players player ON player.id=snapshot.player_id
  WHERE run.status='published' AND player.is_competitive_profile_complete=true
  ORDER BY snapshot.player_id,
    CASE formula.key WHEN 'adaptive-v19-admin-fixed-profile' THEN 0
      WHEN 'adaptive-v18-fluid-profile' THEN 1
      WHEN 'adaptive-v17-three-positions-column-c' THEN 2 ELSE 3 END,
    run.published_at DESC NULLS LAST,run.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_player_card_overalls() TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_manager_player_catalog()
RETURNS TABLE (
  player_id UUID,name TEXT,avatar_url TEXT,snapshot_id UUID,
  formula TEXT,captured_at TIMESTAMPTZ,overall NUMERIC,
  def_overall NUMERIC,ala_mei_overall NUMERIC,ata_overall NUMERIC,gol_overall NUMERIC,
  traits TEXT[],goalkeeper_eligible BOOLEAN,trend TEXT,
  rounds INTEGER,goals INTEGER,assists INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT DISTINCT ON (player.id)
    player.id,COALESCE(NULLIF(player.nickname,''),player.name)::TEXT,player.avatar_url::TEXT,
    snapshot.id,formula.key,run.created_at,snapshot.overall,snapshot.def_overall,
    CASE WHEN formula.key IN (
      'adaptive-v19-admin-fixed-profile','adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c'
    ) THEN snapshot.ata_overall ELSE snapshot.ala_mei_overall END,
    snapshot.ata_overall,snapshot.gol_overall,player.overall_traits::TEXT[],
    (snapshot.goalkeeper_games>=COALESCE((formula.config->>'goalkeeperEligibilityGames')::INTEGER,8)
      AND snapshot.goalkeeper_rounds>=COALESCE((formula.config->>'goalkeeperEligibilityRounds')::INTEGER,3)),
    COALESCE(snapshot.data_quality->>'overall_trend','steady'),snapshot.rounds_played,
    COALESCE((snapshot.data_quality->'scout_totals'->>'goals')::INTEGER,0),
    COALESCE((snapshot.data_quality->'scout_totals'->>'assists')::INTEGER,0)
  FROM public.players player
  JOIN public.player_overall_snapshots snapshot ON snapshot.player_id=player.id
  JOIN public.overall_calculation_runs run ON run.id=snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
  WHERE player.is_competitive_profile_complete=true
    AND formula.key IN (
      'adaptive-v19-admin-fixed-profile','adaptive-v18-fluid-profile',
      'adaptive-v17-three-positions-column-c','adaptive-v16-distributed-trait-bonus',
      'adaptive-v15-goalkeeper-outcomes','adaptive-v14-role-adjusted-rates',
      'adaptive-v13-admin-style-evidence','adaptive-v12-top-three-progression',
      'adaptive-v11-balanced-characteristics'
    )
    AND run.status='published'
  ORDER BY player.id,CASE formula.key
    WHEN 'adaptive-v19-admin-fixed-profile' THEN 0
    WHEN 'adaptive-v18-fluid-profile' THEN 1
    WHEN 'adaptive-v17-three-positions-column-c' THEN 2
    WHEN 'adaptive-v16-distributed-trait-bonus' THEN 3
    WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 4
    WHEN 'adaptive-v14-role-adjusted-rates' THEN 5
    WHEN 'adaptive-v13-admin-style-evidence' THEN 6
    WHEN 'adaptive-v12-top-three-progression' THEN 7 ELSE 8 END,
    run.created_at DESC,run.id DESC;
$$;
REVOKE ALL ON FUNCTION public.get_manager_player_catalog() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_manager_player_catalog() TO authenticated;

-- A Ranked adota a tag fixa imediatamente. O novo OVR será publicado pelo
-- fluxo de modo sombra, que também chama esta mesma rotina de forma idempotente.
SELECT public.reprocess_active_ranked_fixed_profiles(NULL);

NOTIFY pgrst,'reload schema';

COMMIT;
