-- OVR v13 e uma única definição de cadastro competitivo para Cartola/ranking.
-- Perfis legados com três características são preservados, mas ficam pendentes
-- até o ADM escolher uma principal e, opcionalmente, uma secundária.

BEGIN;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_competitive_profile_complete BOOLEAN
  GENERATED ALWAYS AS (
    member_category = 'player'
    AND is_selectable = true
    AND NULLIF(btrim(name), '') IS NOT NULL
    AND NULLIF(btrim(avatar_url), '') IS NOT NULL
    AND player_profile IN ('defensive', 'midfield', 'offensive')
    AND COALESCE(cardinality(overall_traits), 0) BETWEEN 1 AND 2
  ) STORED;

CREATE INDEX IF NOT EXISTS players_competitive_profile_idx
  ON public.players (name)
  WHERE is_competitive_profile_complete = true;

CREATE OR REPLACE FUNCTION public.enforce_overall_trait_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(cardinality(NEW.overall_traits), 0) > 2 THEN
    RAISE EXCEPTION 'Escolha no máximo duas características: principal e secundária.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_overall_trait_limit ON public.players;
CREATE TRIGGER players_overall_trait_limit
BEFORE INSERT OR UPDATE OF overall_traits ON public.players
FOR EACH ROW EXECUTE FUNCTION public.enforce_overall_trait_limit();

INSERT INTO public.overall_formula_versions (key, label, config)
VALUES (
  'adaptive-v13-admin-style-evidence',
  'OVR adaptativo v13 — estilo principal e secundário',
  jsonb_build_object(
    'base', 70, 'legacyInitialTagBonus', 3, 'legacySeedEnabled', false,
    'seedFadeRounds', 3, 'confidenceRounds', 3,
    'goalkeeperEligibilityRounds', 3, 'goalkeeperEligibilityGames', 8,
    'positionCaps', jsonb_build_object('1', 74, '2', 76, '3', 78),
    'staleAfterRounds', 4, 'halfLifeRounds', 3, 'recentRoundWindow', 8,
    'maxChangePerRound', 1.5, 'weeklyEvidenceCap', true,
    'traitWeightedChange', false, 'traitBasedOverall', false,
    'overallConfidenceShrink', false, 'rankedTraitOverall', false,
    'traitsAsProgressionBonus', false, 'traitProgressionBonusBudget', 0.30,
    'prioritizedTraitProgression', true,
    'traitProgressionWeights', jsonb_build_object('primary', 1, 'secondary', 0.6, 'unselected', 0.2),
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
    'unselectedTraitEvidence', 0.2,
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
          WHEN 'adaptive-v13-admin-style-evidence' THEN 0
          WHEN 'adaptive-v12-top-three-progression' THEN 1
          WHEN 'adaptive-v11-balanced-characteristics' THEN 2
          WHEN 'adaptive-v10-role-reframe' THEN 3
          WHEN 'adaptive-v9-player-form-trend-shadow' THEN 4 ELSE 5 END,
        run.created_at DESC, run.id DESC) AS snapshot_rank
    FROM public.player_overall_snapshots snapshot
    JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
    JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
    JOIN public.players player ON player.id = snapshot.player_id
    WHERE formula.key IN (
      'adaptive-v13-admin-style-evidence', 'adaptive-v12-top-three-progression',
      'adaptive-v11-balanced-characteristics', 'adaptive-v10-role-reframe',
      'adaptive-v9-player-form-trend-shadow', 'adaptive-v8-soft-progression-shadow')
      AND (
        (formula.key = 'adaptive-v13-admin-style-evidence' AND run.status = 'published')
        OR (formula.key <> 'adaptive-v13-admin-style-evidence' AND run.status IN ('succeeded', 'published'))
      )
      AND player.is_competitive_profile_complete = true
  )
  SELECT player_id, overall, trend, def_overall, ala_mei_overall,
    ata_overall, gol_overall, goalkeeper_games
  FROM compatible_snapshots WHERE snapshot_rank = 1;
$function$;

REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_player_card_overalls() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_fantasy_market_read_model(p_fantasy_season_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'prices', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.fantasy_player_prices p WHERE p.fantasy_season_id = p_fantasy_season_id), '[]'::jsonb),
    'stats', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'round_id', s.round_id, 'player_id', s.player_id, 'goals', s.goals, 'assists', s.assists,
        'wins', s.wins, 'draws', s.draws, 'losses', s.losses, 'own_goals', s.own_goals,
        'games', s.games, 'goalkeeper_games', s.goalkeeper_games, 'goals_conceded', s.goals_conceded,
        'clean_sheets', s.clean_sheets, 'defensive_clean_games', s.defensive_clean_games,
        'defensive_one_goal_games', s.defensive_one_goal_games, 'team_goals_conceded', s.team_goals_conceded
      ))
      FROM public.player_round_stats s
      JOIN public.rounds r ON r.id = s.round_id AND r.round_type = 'official'
      JOIN public.fantasy_seasons fs ON fs.season_id = r.season_id
      WHERE fs.id = p_fantasy_season_id
    ), '[]'::jsonb),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'avatar_url', p.avatar_url, 'player_profile', p.player_profile,
        'overall_traits', p.overall_traits, 'member_category', p.member_category,
        'is_selectable', p.is_selectable,
        'is_competitive_profile_complete', p.is_competitive_profile_complete
      ) ORDER BY p.name)
      FROM public.players p WHERE p.is_competitive_profile_complete = true
    ), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC)
      FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = p_fantasy_season_id
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_fantasy_market_read_model(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fantasy_market_read_model(UUID) TO authenticated;

-- A interface filtra o mercado, mas o banco também bloqueia escalações feitas
-- por cliente antigo ou RPC direto. Linhas históricas existentes não mudam.
CREATE OR REPLACE FUNCTION public.validate_fantasy_competitive_player()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.players player
    WHERE player.id = NEW.player_id
      AND player.is_competitive_profile_complete = true
  ) THEN
    RAISE EXCEPTION 'Jogador com cadastro competitivo incompleto. Escolha outro atleta.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fantasy_lineup_player_profile_complete ON public.fantasy_lineup_players;
CREATE TRIGGER fantasy_lineup_player_profile_complete
BEFORE INSERT ON public.fantasy_lineup_players
FOR EACH ROW EXECUTE FUNCTION public.validate_fantasy_competitive_player();

DROP TRIGGER IF EXISTS fantasy_test_lineup_player_profile_complete ON public.fantasy_test_lineup_players;
CREATE TRIGGER fantasy_test_lineup_player_profile_complete
BEFORE INSERT ON public.fantasy_test_lineup_players
FOR EACH ROW EXECUTE FUNCTION public.validate_fantasy_competitive_player();

DROP TRIGGER IF EXISTS fantasy_portfolio_player_profile_complete ON public.fantasy_portfolio_players;
CREATE TRIGGER fantasy_portfolio_player_profile_complete
BEFORE INSERT ON public.fantasy_portfolio_players
FOR EACH ROW EXECUTE FUNCTION public.validate_fantasy_competitive_player();

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
    (snapshot.goalkeeper_games >= COALESCE((formula.config->>'goalkeeperEligibilityGames')::INTEGER, 8)),
    COALESCE(snapshot.data_quality->>'overall_trend', 'steady'), snapshot.rounds_played,
    COALESCE((snapshot.data_quality->'scout_totals'->>'goals')::INTEGER, 0),
    COALESCE((snapshot.data_quality->'scout_totals'->>'assists')::INTEGER, 0)
  FROM public.players player
  JOIN public.player_overall_snapshots snapshot ON snapshot.player_id = player.id
  JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  WHERE player.is_competitive_profile_complete = true
    AND formula.key IN (
      'adaptive-v13-admin-style-evidence',
      'adaptive-v12-top-three-progression',
      'adaptive-v11-balanced-characteristics'
    )
    AND (
      (formula.key = 'adaptive-v13-admin-style-evidence' AND run.status = 'published')
      OR (formula.key <> 'adaptive-v13-admin-style-evidence' AND run.status IN ('succeeded', 'published'))
    )
  ORDER BY player.id,
    CASE formula.key
      WHEN 'adaptive-v13-admin-style-evidence' THEN 0
      WHEN 'adaptive-v12-top-three-progression' THEN 1
      ELSE 2
    END,
    run.created_at DESC, run.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_manager_player_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_player_catalog() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
