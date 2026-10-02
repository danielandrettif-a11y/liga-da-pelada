-- Após oito atuações, as características deixam de influenciar o OVR aos poucos.
-- O bônus posicional da Ranked usa a maior nota existente antes da rodada e não
-- é reclassificado quando um novo OVR é publicado.

BEGIN;

UPDATE public.overall_formula_versions
SET
  label = 'OVR adaptativo v16 — transição gradual para evolução orgânica',
  config = config || jsonb_build_object(
    'traitInfluenceFadeEnabled', true,
    'traitFullInfluenceRounds', 8,
    'traitFadeRounds', 8
  )
WHERE key = 'adaptive-v16-distributed-trait-bonus';

WITH played_rounds AS (
  SELECT
    stats.id,
    stats.player_id,
    round_item.id AS round_id,
    round_item.league_id,
    round_item.date,
    round_item.created_at,
    round_item.number,
    season.status AS season_status,
    row_number() OVER (
      PARTITION BY stats.player_id, round_item.league_id
      ORDER BY round_item.date, round_item.created_at, round_item.number, round_item.id
    ) AS played_rank
  FROM public.player_round_stats stats
  JOIN public.rounds round_item ON round_item.id = stats.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  WHERE round_item.round_type = 'official'
    AND round_item.status = 'finished'
    AND stats.games > 0
), resolved_roles AS (
  SELECT
    played.id,
    CASE
      WHEN played.played_rank = 1 THEN primary_role.role
      ELSE COALESCE(previous_role.role, primary_role.role)
    END AS role,
    CASE
      WHEN played.played_rank = 1 THEN 70
      ELSE COALESCE(previous_role.overall, 70)
    END AS overall
  FROM played_rounds played
  JOIN public.players player ON player.id = played.player_id
  CROSS JOIN LATERAL (
    SELECT CASE player.overall_traits[1]
      WHEN 'defensive' THEN 'DEF'
      WHEN 'midfield' THEN 'MEI'
      ELSE 'ATA'
    END AS role
  ) primary_role
  LEFT JOIN LATERAL (
    SELECT candidate.role, candidate.overall
    FROM (
      SELECT
        breakdown.positions,
        run.created_at AS run_created_at,
        source_round.date AS source_date,
        source_round.created_at AS source_created_at,
        source_round.number AS source_number,
        source_round.id AS source_id
      FROM public.player_overall_round_breakdowns breakdown
      JOIN public.overall_calculation_runs run ON run.id = breakdown.calculation_run_id
      JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
      JOIN public.rounds source_round ON source_round.id = breakdown.round_id
      WHERE breakdown.player_id = played.player_id
        AND run.status = 'published'
        AND formula.key LIKE 'adaptive-%'
        AND source_round.league_id = played.league_id
        AND (source_round.date, source_round.created_at, source_round.number, source_round.id)
          < (played.date, played.created_at, played.number, played.round_id)
      ORDER BY run.created_at DESC, source_round.date DESC, source_round.created_at DESC,
        source_round.number DESC, source_round.id DESC
      LIMIT 1
    ) previous
    CROSS JOIN LATERAL (VALUES
      ('DEF'::TEXT, (previous.positions ->> 'DEF')::NUMERIC, 1),
      ('MEI'::TEXT, (previous.positions ->> 'ALA_MEI')::NUMERIC, 2),
      ('ATA'::TEXT, (previous.positions ->> 'ATA')::NUMERIC, 3)
    ) candidate(role, overall, role_order)
    WHERE candidate.overall IS NOT NULL
    ORDER BY candidate.overall DESC,
      CASE WHEN candidate.role = primary_role.role THEN 0 ELSE 1 END,
      candidate.role_order
    LIMIT 1
  ) previous_role ON true
  WHERE played.season_status = 'active'
)
UPDATE public.player_round_stats stats
SET ranking_role_weights = jsonb_build_array(jsonb_build_object(
  'role', resolved.role,
  'overall', resolved.overall,
  'weight', 1
))
FROM resolved_roles resolved
WHERE resolved.id = stats.id;

CREATE OR REPLACE FUNCTION public.refresh_active_ranked_position_bonuses_v2()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
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

SELECT public.refresh_active_ranked_position_bonuses_v2();

NOTIFY pgrst, 'reload schema';

COMMIT;
