-- OVR v15: goleiro evolui somente no gol e por resultado defensivo absoluto.

BEGIN;

INSERT INTO public.overall_formula_versions (key, label, config)
VALUES (
  'adaptive-v15-goalkeeper-outcomes',
  'OVR adaptativo v15 — resultados de goleiro',
  $config${
    "base": 70,
    "legacyInitialTagBonus": 3,
    "legacySeedEnabled": false,
    "seedFadeRounds": 3,
    "confidenceRounds": 3,
    "goalkeeperEligibilityRounds": 3,
    "goalkeeperEligibilityGames": 8,
    "goalkeeperConfidenceRounds": 6,
    "goalkeeperMaxChangePerRound": 0.8,
    "goalkeeperOutcomeScoring": true,
    "goalkeeperWeights": { "conceded": 0.60, "cleanSheet": 0.25, "survival": 0.10, "discipline": 0.05 },
    "positionCaps": { "1": 74, "2": 76, "3": 78 },
    "staleAfterRounds": 4,
    "halfLifeRounds": 3,
    "recentRoundWindow": 8,
    "maxChangePerRound": 1.5,
    "weeklyEvidenceCap": true,
    "traitWeightedChange": false,
    "traitBasedOverall": false,
    "overallConfidenceShrink": false,
    "rankedTraitOverall": false,
    "traitsAsProgressionBonus": false,
    "traitProgressionBonusBudget": 0.30,
    "prioritizedTraitProgression": true,
    "prioritizedTraitsAsEvidenceOnly": true,
    "traitProgressionWeights": { "primary": 1, "secondary": 0.6, "unselected": 0.2 },
    "playedRoleEvidenceEnabled": true,
    "topThreeOverall": true,
    "performanceChangeBonus": 0.03,
    "hardPositionCapsEnabled": false,
    "provisionalAtConfidenceThreshold": false,
    "defensiveWeights": { "concededRate": 0.50, "survival": 0.35, "exposure": 0.10, "discipline": 0.05 },
    "legacyTimingConfidence": 0.75,
    "assistValue": 0.65,
    "attackRatesByPlayingTime": true,
    "attackCurve": 2.7,
    "separateAttackScores": true,
    "goalCurve": 3,
    "assistCurve": 2.4,
    "positionWeights": {
      "DEF": { "defense": 0.70, "goals": 0.05, "assists": 0.15, "result": 0.10 },
      "ALA_MEI": { "defense": 0.30, "goals": 0.25, "assists": 0.35, "result": 0.10 },
      "ATA": { "defense": 0.05, "goals": 0.55, "assists": 0.30, "result": 0.10 }
    },
    "roleEvidence": {
      "DEF": { "DEF": 1, "ALA_MEI": 0.5, "ATA": 0.2 },
      "ALA_MEI": { "DEF": 0.5, "ALA_MEI": 1, "ATA": 0.5 },
      "ATA": { "DEF": 0.2, "ALA_MEI": 0.5, "ATA": 1 }
    },
    "unassignedRoleEvidence": { "DEF": 0.4, "ALA_MEI": 0.55, "ATA": 0.4 },
    "unselectedTraitEvidence": 0.2,
    "trendEnabled": true,
    "trendWindowRounds": 3,
    "trendMinimumRounds": 3,
    "trendRequiredRounds": 2,
    "trendHighScore": 0.56,
    "trendLowScore": 0.42,
    "trendUpwardMultiplier": 0.20,
    "trendDownwardMultiplier": 0.30
  }$config$::jsonb
)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, config = EXCLUDED.config;

DROP FUNCTION IF EXISTS public.get_latest_player_card_overalls();
CREATE FUNCTION public.get_latest_player_card_overalls()
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
          WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 0
          WHEN 'adaptive-v14-role-adjusted-rates' THEN 1
          WHEN 'adaptive-v13-admin-style-evidence' THEN 2
          WHEN 'adaptive-v12-top-three-progression' THEN 3
          WHEN 'adaptive-v11-balanced-characteristics' THEN 4
          WHEN 'adaptive-v10-role-reframe' THEN 5
          WHEN 'adaptive-v9-player-form-trend-shadow' THEN 6 ELSE 7 END,
        run.created_at DESC, run.id DESC) AS snapshot_rank
    FROM public.player_overall_snapshots snapshot
    JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
    JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
    JOIN public.players player ON player.id = snapshot.player_id
    WHERE formula.key IN (
      'adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates',
      'adaptive-v13-admin-style-evidence', 'adaptive-v12-top-three-progression',
      'adaptive-v11-balanced-characteristics', 'adaptive-v10-role-reframe',
      'adaptive-v9-player-form-trend-shadow', 'adaptive-v8-soft-progression-shadow')
      AND (
        (formula.key IN ('adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status = 'published')
        OR (formula.key NOT IN ('adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status IN ('succeeded', 'published'))
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
      'adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates',
      'adaptive-v13-admin-style-evidence', 'adaptive-v12-top-three-progression',
      'adaptive-v11-balanced-characteristics')
    AND (
      (formula.key IN ('adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status = 'published')
      OR (formula.key NOT IN ('adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status IN ('succeeded', 'published'))
    )
  ORDER BY player.id,
    CASE formula.key
      WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 0
      WHEN 'adaptive-v14-role-adjusted-rates' THEN 1
      WHEN 'adaptive-v13-admin-style-evidence' THEN 2
      WHEN 'adaptive-v12-top-three-progression' THEN 3
      ELSE 4
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
          WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 0
          WHEN 'adaptive-v14-role-adjusted-rates' THEN 1
          WHEN 'adaptive-v13-admin-style-evidence' THEN 2
          WHEN 'adaptive-v12-top-three-progression' THEN 3
          WHEN 'adaptive-v11-balanced-characteristics' THEN 4
          WHEN 'adaptive-v10-role-reframe' THEN 5
          WHEN 'adaptive-v9-player-form-trend-shadow' THEN 6 ELSE 7 END,
        run.created_at DESC, run.id DESC) AS snapshot_rank
    FROM public.player_overall_snapshots snapshot
    JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
    JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
    WHERE formula.key IN (
      'adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates',
      'adaptive-v13-admin-style-evidence', 'adaptive-v12-top-three-progression',
      'adaptive-v11-balanced-characteristics', 'adaptive-v10-role-reframe',
      'adaptive-v9-player-form-trend-shadow', 'adaptive-v8-soft-progression-shadow')
      AND (
        (formula.key IN ('adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status = 'published')
        OR (formula.key NOT IN ('adaptive-v15-goalkeeper-outcomes', 'adaptive-v14-role-adjusted-rates', 'adaptive-v13-admin-style-evidence') AND run.status IN ('succeeded', 'published'))
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
        AND formula.key IN ('adaptive-v14-role-adjusted-rates', 'adaptive-v15-goalkeeper-outcomes')
    ) THEN
    PERFORM public.refresh_active_ranked_position_bonuses_v2();
  END IF;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
