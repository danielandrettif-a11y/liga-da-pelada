-- OVR v16: o bônus de progressão é repartido entre até três características.

BEGIN;

DROP INDEX IF EXISTS public.players_competitive_profile_idx;
ALTER TABLE public.players DROP COLUMN IF EXISTS is_competitive_profile_complete;
ALTER TABLE public.players ADD COLUMN is_competitive_profile_complete BOOLEAN
  GENERATED ALWAYS AS (
    member_category = 'player'
    AND is_selectable = true
    AND NULLIF(btrim(name), '') IS NOT NULL
    AND NULLIF(btrim(avatar_url), '') IS NOT NULL
    AND player_profile IN ('defensive', 'midfield', 'offensive')
    AND COALESCE(cardinality(overall_traits), 0) BETWEEN 1 AND 3
  ) STORED;

CREATE INDEX players_competitive_profile_idx
  ON public.players (name)
  WHERE is_competitive_profile_complete = true;

CREATE OR REPLACE FUNCTION public.enforce_overall_trait_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(cardinality(NEW.overall_traits), 0) > 3 THEN
    RAISE EXCEPTION 'Escolha no máximo três características: principal, secundária e terciária.';
  END IF;
  RETURN NEW;
END;
$$;

INSERT INTO public.overall_formula_versions (key, label, config)
SELECT
  'adaptive-v16-distributed-trait-bonus',
  'OVR adaptativo v16 — bônus distribuído por características',
  config || jsonb_build_object(
    'traitsAsProgressionBonus', true,
    'traitProgressionBonusBudget', 0.30,
    'prioritizedTraitProgression', false,
    'prioritizedTraitsAsEvidenceOnly', false
  )
FROM public.overall_formula_versions
WHERE key = 'adaptive-v15-goalkeeper-outcomes'
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, config = EXCLUDED.config;

CREATE OR REPLACE FUNCTION public.get_latest_player_card_overalls()
RETURNS TABLE (
  player_id UUID, overall NUMERIC, trend TEXT, def_overall NUMERIC,
  ala_mei_overall NUMERIC, ata_overall NUMERIC, gol_overall NUMERIC,
  goalkeeper_rounds INTEGER, goalkeeper_games INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  WITH compatible_snapshots AS (
    SELECT snapshot.player_id, snapshot.overall,
      COALESCE(snapshot.data_quality ->> 'overall_trend', 'steady') AS trend,
      snapshot.def_overall, snapshot.ala_mei_overall, snapshot.ata_overall,
      snapshot.gol_overall, snapshot.goalkeeper_rounds, snapshot.goalkeeper_games,
      row_number() OVER (PARTITION BY snapshot.player_id ORDER BY
        CASE formula.key
          WHEN 'adaptive-v16-distributed-trait-bonus' THEN 0
          WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 1
          WHEN 'adaptive-v14-role-adjusted-rates' THEN 2
          WHEN 'adaptive-v13-admin-style-evidence' THEN 3
          WHEN 'adaptive-v12-top-three-progression' THEN 4
          WHEN 'adaptive-v11-balanced-characteristics' THEN 5
          WHEN 'adaptive-v10-role-reframe' THEN 6
          WHEN 'adaptive-v9-player-form-trend-shadow' THEN 7 ELSE 8 END,
        run.created_at DESC, run.id DESC) AS snapshot_rank
    FROM public.player_overall_snapshots snapshot
    JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
    JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
    JOIN public.players player ON player.id = snapshot.player_id
    WHERE formula.key IN (
      'adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes',
      'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence',
      'adaptive-v12-top-three-progression', 'adaptive-v11-balanced-characteristics',
      'adaptive-v10-role-reframe', 'adaptive-v9-player-form-trend-shadow',
      'adaptive-v8-soft-progression-shadow')
      AND (
        (formula.key IN ('adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status = 'published')
        OR (formula.key NOT IN ('adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status IN ('succeeded', 'published'))
      )
      AND player.is_competitive_profile_complete = true
  )
  SELECT player_id, overall, trend, def_overall, ala_mei_overall,
    ata_overall, gol_overall, goalkeeper_rounds, goalkeeper_games
  FROM compatible_snapshots WHERE snapshot_rank = 1;
$function$;

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
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT DISTINCT ON (player.id)
    player.id, COALESCE(NULLIF(player.nickname, ''), player.name)::TEXT, player.avatar_url::TEXT,
    snapshot.id, formula.key, run.created_at, snapshot.overall,
    snapshot.def_overall, snapshot.ala_mei_overall, snapshot.ata_overall, snapshot.gol_overall,
    player.overall_traits::TEXT[],
    (snapshot.goalkeeper_games >= COALESCE((formula.config->>'goalkeeperEligibilityGames')::INTEGER, 8)
      AND snapshot.goalkeeper_rounds >= COALESCE((formula.config->>'goalkeeperEligibilityRounds')::INTEGER, 3)),
    COALESCE(snapshot.data_quality->>'overall_trend', 'steady'), snapshot.rounds_played,
    COALESCE((snapshot.data_quality->'scout_totals'->>'goals')::INTEGER, 0),
    COALESCE((snapshot.data_quality->'scout_totals'->>'assists')::INTEGER, 0)
  FROM public.players player
  JOIN public.player_overall_snapshots snapshot ON snapshot.player_id = player.id
  JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  WHERE player.is_competitive_profile_complete = true
    AND formula.key IN (
      'adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes',
      'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence',
      'adaptive-v12-top-three-progression', 'adaptive-v11-balanced-characteristics')
    AND (
      (formula.key IN ('adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status = 'published')
      OR (formula.key NOT IN ('adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status IN ('succeeded', 'published'))
    )
  ORDER BY player.id,
    CASE formula.key
      WHEN 'adaptive-v16-distributed-trait-bonus' THEN 0
      WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 1
      WHEN 'adaptive-v14-role-adjusted-rates' THEN 2
      WHEN 'adaptive-v13-admin-style-evidence' THEN 3
      WHEN 'adaptive-v12-top-three-progression' THEN 4
      ELSE 5
    END,
    run.created_at DESC, run.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_manager_player_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_player_catalog() TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_active_ranked_position_bonuses_v2()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  WITH compatible_snapshots AS (
    SELECT snapshot.player_id, snapshot.def_overall, snapshot.ala_mei_overall, snapshot.ata_overall,
      row_number() OVER (PARTITION BY snapshot.player_id ORDER BY
        CASE formula.key
          WHEN 'adaptive-v16-distributed-trait-bonus' THEN 0
          WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 1
          WHEN 'adaptive-v14-role-adjusted-rates' THEN 2
          WHEN 'adaptive-v13-admin-style-evidence' THEN 3
          WHEN 'adaptive-v12-top-three-progression' THEN 4
          WHEN 'adaptive-v11-balanced-characteristics' THEN 5
          WHEN 'adaptive-v10-role-reframe' THEN 6
          WHEN 'adaptive-v9-player-form-trend-shadow' THEN 7 ELSE 8 END,
        run.created_at DESC, run.id DESC) AS snapshot_rank
    FROM public.player_overall_snapshots snapshot
    JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
    JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
    WHERE formula.key IN (
      'adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes',
      'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence',
      'adaptive-v12-top-three-progression', 'adaptive-v11-balanced-characteristics',
      'adaptive-v10-role-reframe', 'adaptive-v9-player-form-trend-shadow',
      'adaptive-v8-soft-progression-shadow')
      AND (
        (formula.key IN ('adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status = 'published')
        OR (formula.key NOT IN ('adaptive-v16-distributed-trait-bonus', 'adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status IN ('succeeded', 'published'))
      )
  ), candidates AS (
    SELECT stats.id, role_item.role, role_item.overall,
      row_number() OVER (PARTITION BY stats.id ORDER BY role_item.overall DESC,
        CASE WHEN role_item.role = CASE COALESCE(stats.player_profile_locked, player.player_profile)
          WHEN 'defensive' THEN 'DEF' WHEN 'midfield' THEN 'MEI' ELSE 'ATA' END THEN 0 ELSE 1 END,
        role_item.role_order) AS role_rank
    FROM public.player_round_stats stats
    JOIN public.rounds round_item ON round_item.id = stats.round_id
    JOIN public.seasons season ON season.id = round_item.season_id
    JOIN public.players player ON player.id = stats.player_id
    JOIN compatible_snapshots snapshot ON snapshot.player_id = stats.player_id AND snapshot.snapshot_rank = 1
    CROSS JOIN LATERAL (VALUES
      ('DEF'::TEXT, snapshot.def_overall, 1),
      ('MEI'::TEXT, snapshot.ala_mei_overall, 2),
      ('ATA'::TEXT, snapshot.ata_overall, 3)
    ) role_item(role, overall, role_order)
    WHERE season.status = 'active'
      AND round_item.round_type = 'official'
      AND round_item.status = 'finished'
      AND stats.games > 0
      AND player.is_competitive_profile_complete = true
  ), weights AS (
    SELECT id, jsonb_agg(jsonb_build_object(
      'role', role, 'overall', overall, 'weight', CASE role_rank WHEN 1 THEN 1 ELSE .5 END
    ) ORDER BY role_rank) AS role_weights
    FROM candidates WHERE role_rank <= 2 GROUP BY id
  )
  UPDATE public.player_round_stats stats
  SET ranking_role_weights = weights.role_weights
  FROM weights WHERE weights.id = stats.id;

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
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_active_ranked_position_bonuses_v2() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_ranking_after_v14_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM NEW.status
    AND EXISTS (
      SELECT 1 FROM public.overall_formula_versions formula
      WHERE formula.id = NEW.formula_version_id
        AND formula.key IN ('adaptive-v14-role-adjusted-rates', 'adaptive-v15-goalkeeper-outcomes', 'adaptive-v16-distributed-trait-bonus')
    ) THEN
    PERFORM public.refresh_active_ranked_position_bonuses_v2();
  END IF;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
