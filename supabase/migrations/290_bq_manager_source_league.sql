-- O BQ Manager e uma carreira propria em outro banco. Ela continua ligada
-- exclusivamente a pelada BQ original, sem herdar jogadores de novas ligas.
BEGIN;

CREATE TABLE IF NOT EXISTS public.manager_source_league (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE
);
INSERT INTO public.manager_source_league (singleton, league_id)
SELECT true, league.id FROM public.leagues league
ORDER BY league.created_at, league.id LIMIT 1
ON CONFLICT (singleton) DO NOTHING;
ALTER TABLE public.manager_source_league ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manager_source_league FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_bq_manager_source_league()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT source.league_id
  FROM public.manager_source_league source
  JOIN public.leagues league ON league.id = source.league_id
  WHERE source.singleton = true AND league.is_active
    AND league.feature_tier = 'complete'
    AND public.is_league_member(source.league_id);
$$;
REVOKE ALL ON FUNCTION public.get_bq_manager_source_league()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bq_manager_source_league()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_manager_player_catalog_for_league(p_league_id uuid)
RETURNS TABLE (
  player_id uuid, name text, avatar_url text, snapshot_id uuid,
  formula text, captured_at timestamptz, overall numeric,
  def_overall numeric, ala_mei_overall numeric, ata_overall numeric,
  gol_overall numeric, traits text[], goalkeeper_eligible boolean,
  trend text, rounds integer, goals integer, assists integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT ON (player.id)
    player.id, COALESCE(NULLIF(player.nickname,''),player.name)::text,
    player.avatar_url::text, snapshot.id, formula.key, run.created_at,
    snapshot.overall, snapshot.def_overall,
    CASE WHEN formula.key IN (
      'adaptive-v20-statistical-confidence','adaptive-v19-admin-fixed-profile',
      'adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c'
    ) THEN snapshot.ata_overall ELSE snapshot.ala_mei_overall END,
    snapshot.ata_overall, snapshot.gol_overall, player.overall_traits::text[],
    (snapshot.goalkeeper_games >= COALESCE(
      (formula.config->>'goalkeeperEligibilityGames')::integer,8)
      AND snapshot.goalkeeper_rounds >= COALESCE(
        (formula.config->>'goalkeeperEligibilityRounds')::integer,3)),
    COALESCE(snapshot.data_quality->>'overall_trend','steady'),
    snapshot.rounds_played,
    COALESCE((snapshot.data_quality->'scout_totals'->>'goals')::integer,0),
    COALESCE((snapshot.data_quality->'scout_totals'->>'assists')::integer,0)
  FROM public.players player
  JOIN public.player_overall_snapshots snapshot ON snapshot.player_id = player.id
  JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  JOIN public.league_members member
    ON member.league_id = p_league_id AND member.player_id = player.id
  WHERE p_league_id = public.get_bq_manager_source_league()
    AND run.league_id = p_league_id AND run.status = 'published'
    AND player.is_competitive_profile_complete = true
    AND formula.key IN (
      'adaptive-v20-statistical-confidence','adaptive-v19-admin-fixed-profile',
      'adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c',
      'adaptive-v16-distributed-trait-bonus','adaptive-v15-goalkeeper-outcomes',
      'adaptive-v14-role-adjusted-rates','adaptive-v13-admin-style-evidence',
      'adaptive-v12-top-three-progression','adaptive-v11-balanced-characteristics'
    )
  ORDER BY player.id, CASE formula.key
    WHEN 'adaptive-v20-statistical-confidence' THEN 0
    WHEN 'adaptive-v19-admin-fixed-profile' THEN 1
    WHEN 'adaptive-v18-fluid-profile' THEN 2
    WHEN 'adaptive-v17-three-positions-column-c' THEN 3
    WHEN 'adaptive-v16-distributed-trait-bonus' THEN 4
    WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 5
    WHEN 'adaptive-v14-role-adjusted-rates' THEN 6
    WHEN 'adaptive-v13-admin-style-evidence' THEN 7
    WHEN 'adaptive-v12-top-three-progression' THEN 8 ELSE 9 END,
    run.created_at DESC, run.id DESC;
$$;
REVOKE ALL ON FUNCTION public.get_manager_player_catalog_for_league(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_player_catalog_for_league(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_manager_player_catalog()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
