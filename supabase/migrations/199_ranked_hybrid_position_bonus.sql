-- Ranking oficial híbrido: maior OVR posicional recebe 100% do bônus atual
-- do Cartola e o segundo maior recebe 50%. `points` permanece como Legado.

BEGIN;

ALTER TABLE public.player_round_stats
  ADD COLUMN IF NOT EXISTS ranking_defensive_clean_games INTEGER NOT NULL DEFAULT 0 CHECK (ranking_defensive_clean_games >= 0),
  ADD COLUMN IF NOT EXISTS ranking_defensive_one_goal_games INTEGER NOT NULL DEFAULT 0 CHECK (ranking_defensive_one_goal_games >= 0),
  ADD COLUMN IF NOT EXISTS ranking_role_weights JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(ranking_role_weights) = 'array'),
  ADD COLUMN IF NOT EXISTS ranking_position_bonus NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.player_round_stats
  ADD COLUMN IF NOT EXISTS ranking_points NUMERIC(12,2)
  GENERATED ALWAYS AS (points + ranking_position_bonus) STORED;

CREATE OR REPLACE FUNCTION public.calculate_ranked_position_bonus_v1(
  p_league_id UUID,
  p_role_weights JSONB,
  p_goals INTEGER,
  p_assists INTEGER,
  p_draws INTEGER,
  p_defensive_clean_games INTEGER,
  p_defensive_one_goal_games INTEGER
) RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(COALESCE(sum(
    public.calculate_fantasy_position_bonus_v9(
      public.snapshot_bq_scoring(p_league_id),
      weight_item ->> 'role', true,
      COALESCE(p_goals, 0), COALESCE(p_assists, 0), COALESCE(p_draws, 0),
      0, 0, COALESCE(p_defensive_clean_games, 0), COALESCE(p_defensive_one_goal_games, 0)
    ) * COALESCE((weight_item ->> 'weight')::NUMERIC, 0)
  ), 0), 2)
  FROM jsonb_array_elements(COALESCE(p_role_weights, '[]'::JSONB)) weight_item
  WHERE weight_item ->> 'role' IN ('DEF', 'MEI', 'ATA')
    AND COALESCE((weight_item ->> 'weight')::NUMERIC, 0) IN (1, .5);
$$;

REVOKE ALL ON FUNCTION public.calculate_ranked_position_bonus_v1(UUID,JSONB,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER)
  FROM PUBLIC, anon, authenticated;

-- O Cartola antigo só guardava proteção para defensores. O ranking novo
-- recompõe esses dois scouts para todo jogador de linha sem alterar os scouts
-- autoritativos do Cartola.
WITH active_stats AS (
  SELECT stats.id, stats.player_id, stats.round_id
  FROM public.player_round_stats stats
  JOIN public.rounds round_item ON round_item.id = stats.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  WHERE season.status = 'active'
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished'
    AND NOT EXISTS (
      SELECT 1 FROM public.player_round_stat_overrides override_item
      WHERE override_item.round_id = stats.round_id
        AND override_item.player_id = stats.player_id
        AND override_item.override_type = 'zero_points'
    )
), defense AS (
  SELECT active_stats.id,
    count(*) FILTER (WHERE
      CASE WHEN match_item.team_a_id = participant.team_id THEN match_item.score_b ELSE match_item.score_a END = 0
    )::INTEGER AS clean_games,
    count(*) FILTER (WHERE
      CASE WHEN match_item.team_a_id = participant.team_id THEN match_item.score_b ELSE match_item.score_a END = 1
    )::INTEGER AS one_goal_games
  FROM active_stats
  JOIN public.matches match_item
    ON match_item.round_id = active_stats.round_id AND match_item.status = 'finished'
  JOIN public.match_players participant
    ON participant.match_id = match_item.id
    AND participant.player_id = active_stats.player_id
    AND participant.result_eligible = true
  LEFT JOIN public.match_goalkeepers goalkeeper
    ON goalkeeper.match_id = match_item.id AND goalkeeper.player_id = active_stats.player_id
  WHERE goalkeeper.player_id IS NULL
  GROUP BY active_stats.id
)
UPDATE public.player_round_stats stats SET
  ranking_defensive_clean_games = defense.clean_games,
  ranking_defensive_one_goal_games = defense.one_goal_games
FROM defense WHERE defense.id = stats.id;

-- O recálculo inicial é atômico: não publica uma classificação parcialmente
-- bonificada quando um atleta elegível ainda não possui OVR publicado.
DO $$
DECLARE missing_names TEXT;
BEGIN
  WITH eligible_players AS (
    SELECT DISTINCT player.id, player.name
    FROM public.player_round_stats stats
    JOIN public.rounds round_item ON round_item.id = stats.round_id
    JOIN public.seasons season ON season.id = round_item.season_id
    JOIN public.players player ON player.id = stats.player_id
    WHERE season.status = 'active'
      AND round_item.round_type = 'official'
      AND round_item.status = 'finished'
      AND stats.games > 0
      AND player.is_competitive_profile_complete = true
  )
  SELECT string_agg(eligible.name, ', ' ORDER BY eligible.name) INTO missing_names
  FROM eligible_players eligible
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.player_overall_snapshots snapshot
    JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
    JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
    WHERE snapshot.player_id = eligible.id
      AND formula.key IN (
        'adaptive-v13-admin-style-evidence', 'adaptive-v12-top-three-progression',
        'adaptive-v11-balanced-characteristics', 'adaptive-v10-role-reframe',
        'adaptive-v9-player-form-trend-shadow', 'adaptive-v8-soft-progression-shadow'
      )
      AND ((formula.key = 'adaptive-v13-admin-style-evidence' AND run.status = 'published')
        OR (formula.key <> 'adaptive-v13-admin-style-evidence' AND run.status IN ('succeeded', 'published')))
  );
  IF missing_names IS NOT NULL THEN
    RAISE EXCEPTION 'Ranking híbrido exige OVR publicado para: %', missing_names;
  END IF;
END;
$$;

WITH compatible_snapshots AS (
  SELECT snapshot.player_id, snapshot.def_overall, snapshot.ala_mei_overall, snapshot.ata_overall,
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
  WHERE formula.key IN (
    'adaptive-v13-admin-style-evidence', 'adaptive-v12-top-three-progression',
    'adaptive-v11-balanced-characteristics', 'adaptive-v10-role-reframe',
    'adaptive-v9-player-form-trend-shadow', 'adaptive-v8-soft-progression-shadow'
  )
    AND ((formula.key = 'adaptive-v13-admin-style-evidence' AND run.status = 'published')
      OR (formula.key <> 'adaptive-v13-admin-style-evidence' AND run.status IN ('succeeded', 'published')))
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

CREATE OR REPLACE VIEW public.player_season_stats AS
SELECT
  prs.player_id, r.season_id, r.round_type,
  p.name AS player_name, p.nickname AS player_nickname, p.avatar_url AS player_avatar_url,
  p.player_profile, p.is_goalkeeper AS player_is_goalkeeper,
  p.member_category AS player_member_category, p.is_selectable AS player_is_selectable,
  COUNT(DISTINCT prs.round_id)::INTEGER AS rounds_count,
  COALESCE(SUM(prs.games), 0)::INTEGER AS games,
  COALESCE(SUM(prs.wins), 0)::INTEGER AS wins,
  COALESCE(SUM(prs.draws), 0)::INTEGER AS draws,
  COALESCE(SUM(prs.losses), 0)::INTEGER AS losses,
  COALESCE(SUM(prs.goals), 0)::INTEGER AS goals,
  COALESCE(SUM(prs.assists), 0)::INTEGER AS assists,
  COALESCE(SUM(prs.points), 0)::NUMERIC(12,2) AS points,
  CASE WHEN COALESCE(SUM(prs.games), 0) = 0 THEN 0
    ELSE ROUND(((COALESCE(SUM(prs.wins), 0) * 3 + COALESCE(SUM(prs.draws), 0))::NUMERIC /
      (COALESCE(SUM(prs.games), 0) * 3)::NUMERIC) * 100)::INTEGER END AS win_rate,
  COALESCE(SUM(prs.goalkeeper_games), 0)::INTEGER AS goalkeeper_games,
  COALESCE(SUM(prs.clean_sheets), 0)::INTEGER AS clean_sheets,
  COALESCE(SUM(prs.goals_conceded), 0)::INTEGER AS goals_conceded,
  COALESCE(SUM(prs.ranking_position_bonus), 0)::NUMERIC(12,2) AS ranking_position_bonus,
  COALESCE(SUM(prs.ranking_points), 0)::NUMERIC(12,2) AS ranking_points
FROM public.player_round_stats prs
JOIN public.rounds r ON r.id = prs.round_id
JOIN public.players p ON p.id = prs.player_id
WHERE r.status = 'finished'
GROUP BY prs.player_id, r.season_id, r.round_type, p.name, p.nickname, p.avatar_url,
  p.player_profile, p.is_goalkeeper, p.member_category, p.is_selectable;

GRANT SELECT ON public.player_season_stats TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
