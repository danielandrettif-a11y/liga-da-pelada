-- Iguala em 7 pontos o teto de todos os pacotes posicionais do ranking.
-- O desempenho bruto continua proporcional ao teto original de cada pacote.

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
  WITH items AS (
    SELECT
      weight_item ->> 'role' AS role,
      COALESCE((weight_item ->> 'weight')::NUMERIC, 0) AS weight
    FROM jsonb_array_elements(COALESCE(p_role_weights, '[]'::JSONB)) weight_item
    WHERE weight_item ->> 'role' IN ('DEF', 'MEI', 'ATA')
      AND COALESCE((weight_item ->> 'weight')::NUMERIC, 0) IN (1, .5)
  ), totals AS (
    SELECT
      COALESCE(sum(
        public.calculate_fantasy_position_bonus_v9(
          public.snapshot_bq_scoring(p_league_id),
          role, true,
          COALESCE(p_goals, 0), COALESCE(p_assists, 0), COALESCE(p_draws, 0),
          0, 0, COALESCE(p_defensive_clean_games, 0), COALESCE(p_defensive_one_goal_games, 0)
        ) * weight
      ), 0) AS raw_bonus,
      COALESCE(sum((CASE role WHEN 'DEF' THEN 10 WHEN 'MEI' THEN 6 ELSE 2 END) * weight), 0) AS package_cap
    FROM items
  )
  SELECT CASE WHEN package_cap > 0 THEN round(raw_bonus * 7 / package_cap, 2) ELSE 0 END
  FROM totals;
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
