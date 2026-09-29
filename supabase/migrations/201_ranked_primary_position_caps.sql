-- O ranking usa somente a posição de linha com maior OVR.
-- DEF, ALA e ATA têm tetos normalizados de 10, 8 e 7 pontos por rodada.

BEGIN;

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
  WITH primary_role AS (
    SELECT weight_item ->> 'role' AS role
    FROM jsonb_array_elements(COALESCE(p_role_weights, '[]'::JSONB)) WITH ORDINALITY AS item(weight_item, position)
    WHERE weight_item ->> 'role' IN ('DEF', 'MEI', 'ATA')
      AND COALESCE((weight_item ->> 'weight')::NUMERIC, 0) = 1
    ORDER BY position
    LIMIT 1
  )
  SELECT COALESCE((
    SELECT round(
      public.calculate_fantasy_position_bonus_v9(
        public.snapshot_bq_scoring(p_league_id),
        role, true,
        COALESCE(p_goals, 0), COALESCE(p_assists, 0), COALESCE(p_draws, 0),
        0, 0, COALESCE(p_defensive_clean_games, 0), COALESCE(p_defensive_one_goal_games, 0)
      ) * CASE role WHEN 'DEF' THEN 10 WHEN 'MEI' THEN 8 ELSE 7 END
        / CASE role WHEN 'DEF' THEN 10 WHEN 'MEI' THEN 6 ELSE 2 END,
      2
    )
    FROM primary_role
  ), 0);
$$;

REVOKE ALL ON FUNCTION public.calculate_ranked_position_bonus_v1(UUID,JSONB,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER)
  FROM PUBLIC, anon, authenticated;

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

NOTIFY pgrst, 'reload schema';

COMMIT;
