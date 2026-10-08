-- V20: confiança estatística por atuações oficiais e regressão à média da liga.
-- 1-5: provisório; 6-9: em formação; 10-14: oficial; 15+: alta confiança.

BEGIN;

INSERT INTO public.overall_formula_versions(key,label,config)
SELECT
  'adaptive-v20-statistical-confidence',
  'OVR adaptativo v20 — confiança oficial em 10 atuações',
  config || jsonb_build_object(
    'statisticalConfidenceEnabled',true,
    'officialConfidenceRounds',10,
    'overallConfidenceShrink',true,
    'provisionalAtConfidenceThreshold',false
  )
FROM public.overall_formula_versions
WHERE key='adaptive-v19-admin-fixed-profile'
ON CONFLICT (key) DO UPDATE SET
  label=EXCLUDED.label,
  config=EXCLUDED.config;

CREATE OR REPLACE FUNCTION public.apply_admin_fixed_profiles_from_overall_run(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.overall_calculation_runs run
    JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
    WHERE run.id=p_run_id
      AND run.status='published'
      AND formula.key IN (
        'adaptive-v20-statistical-confidence',
        'adaptive-v19-admin-fixed-profile'
      )
  ) THEN
    RAISE EXCEPTION 'A execução v19 ou v20 precisa estar publicada.';
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
      SELECT 1
      FROM public.overall_formula_versions formula
      WHERE formula.id=NEW.formula_version_id
        AND formula.key IN (
          'adaptive-v20-statistical-confidence',
          'adaptive-v19-admin-fixed-profile'
        )
    ) THEN
    PERFORM public.apply_admin_fixed_profiles_from_overall_run(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP FUNCTION IF EXISTS public.get_latest_player_card_overalls();
CREATE FUNCTION public.get_latest_player_card_overalls()
RETURNS TABLE (
  player_id UUID,overall NUMERIC,trend TEXT,def_overall NUMERIC,
  ala_mei_overall NUMERIC,ata_overall NUMERIC,gol_overall NUMERIC,
  goalkeeper_rounds INTEGER,goalkeeper_games INTEGER,rounds_played INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT DISTINCT ON (snapshot.player_id)
    snapshot.player_id,snapshot.overall,
    COALESCE(snapshot.data_quality->>'overall_trend','steady'),
    snapshot.def_overall,snapshot.ata_overall,snapshot.ata_overall,
    snapshot.gol_overall,snapshot.goalkeeper_rounds,
    snapshot.goalkeeper_games,snapshot.rounds_played
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id=snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
  JOIN public.players player ON player.id=snapshot.player_id
  WHERE run.status='published'
    AND player.is_competitive_profile_complete=true
  ORDER BY snapshot.player_id,
    CASE formula.key
      WHEN 'adaptive-v20-statistical-confidence' THEN 0
      WHEN 'adaptive-v19-admin-fixed-profile' THEN 1
      WHEN 'adaptive-v18-fluid-profile' THEN 2
      WHEN 'adaptive-v17-three-positions-column-c' THEN 3
      ELSE 4
    END,
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
    player.id,COALESCE(NULLIF(player.nickname,''),player.name)::TEXT,
    player.avatar_url::TEXT,snapshot.id,formula.key,run.created_at,
    snapshot.overall,snapshot.def_overall,
    CASE WHEN formula.key IN (
      'adaptive-v20-statistical-confidence','adaptive-v19-admin-fixed-profile',
      'adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c'
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
      'adaptive-v20-statistical-confidence','adaptive-v19-admin-fixed-profile',
      'adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c',
      'adaptive-v16-distributed-trait-bonus','adaptive-v15-goalkeeper-outcomes',
      'adaptive-v14-role-adjusted-rates','adaptive-v13-admin-style-evidence',
      'adaptive-v12-top-three-progression','adaptive-v11-balanced-characteristics'
    )
    AND run.status='published'
  ORDER BY player.id,CASE formula.key
    WHEN 'adaptive-v20-statistical-confidence' THEN 0
    WHEN 'adaptive-v19-admin-fixed-profile' THEN 1
    WHEN 'adaptive-v18-fluid-profile' THEN 2
    WHEN 'adaptive-v17-three-positions-column-c' THEN 3
    WHEN 'adaptive-v16-distributed-trait-bonus' THEN 4
    WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 5
    WHEN 'adaptive-v14-role-adjusted-rates' THEN 6
    WHEN 'adaptive-v13-admin-style-evidence' THEN 7
    WHEN 'adaptive-v12-top-three-progression' THEN 8 ELSE 9 END,
    run.created_at DESC,run.id DESC;
$$;
REVOKE ALL ON FUNCTION public.get_manager_player_catalog() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_manager_player_catalog() TO authenticated;

NOTIFY pgrst,'reload schema';

COMMIT;
