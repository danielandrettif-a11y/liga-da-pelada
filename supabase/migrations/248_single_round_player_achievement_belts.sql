-- Os cinturões individuais representam recordes obtidos em uma única rodada.
-- Empates preservam o primeiro detentor; somente uma marca maior troca o dono.

DO $$
BEGIN
  IF to_regprocedure('public.get_player_achievement_belts_v1(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.get_player_achievement_belts(UUID, UUID)
      RENAME TO get_player_achievement_belts_v1;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_player_achievement_belts(
  p_player_id UUID,
  p_league_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH official_rounds AS (
    SELECT round_item.id, round_item.number, round_item.date
    FROM public.rounds round_item
    WHERE round_item.league_id = p_league_id
      AND round_item.round_type = 'official'
      AND round_item.status = 'finished'
  ),
  round_metrics AS (
    SELECT
      'top_scorer'::TEXT AS slug,
      stats.player_id,
      stats.goals::INTEGER AS record_value,
      round_item.id AS round_id,
      round_item.number AS round_number,
      round_item.date AS round_date
    FROM public.player_round_stats stats
    JOIN official_rounds round_item ON round_item.id = stats.round_id
    JOIN public.players player ON player.id = stats.player_id
    WHERE stats.goals > 0
      AND player.is_selectable = true
      AND player.member_category IN ('player', 'guest')

    UNION ALL

    SELECT
      'top_assister'::TEXT AS slug,
      stats.player_id,
      stats.assists::INTEGER AS record_value,
      round_item.id AS round_id,
      round_item.number AS round_number,
      round_item.date AS round_date
    FROM public.player_round_stats stats
    JOIN official_rounds round_item ON round_item.id = stats.round_id
    JOIN public.players player ON player.id = stats.player_id
    WHERE stats.assists > 0
      AND player.is_selectable = true
      AND player.member_category IN ('player', 'guest')
  ),
  ranked_round_metrics AS (
    SELECT metric.*,
      row_number() OVER (
        PARTITION BY metric.slug
        ORDER BY metric.record_value DESC, metric.round_date ASC,
          metric.round_number ASC, metric.player_id
      ) AS belt_position
    FROM round_metrics metric
  ),
  personal_belts AS (
    SELECT jsonb_build_object(
      'slug', metric.slug,
      'name', CASE metric.slug
        WHEN 'top_scorer' THEN 'Cinturão do Artilheiro'
        ELSE 'Cinturão do Garçom'
      END,
      'description', CASE metric.slug
        WHEN 'top_scorer' THEN 'Recorde de gols marcados por um jogador em uma única rodada oficial.'
        ELSE 'Recorde de assistências feitas por um jogador em uma única rodada oficial.'
      END,
      'recordValue', metric.record_value,
      'unit', CASE metric.slug
        WHEN 'top_scorer' THEN 'gols na rodada'
        ELSE 'assistências na rodada'
      END,
      'scope', 'player',
      'roundId', metric.round_id,
      'roundNumber', metric.round_number,
      'roundDate', metric.round_date,
      'team', NULL
    ) AS belt
    FROM ranked_round_metrics metric
    WHERE metric.belt_position = 1
      AND metric.player_id = p_player_id
  ),
  previous_belts AS (
    SELECT legacy.belt
    FROM jsonb_array_elements(
      COALESCE(
        public.get_player_achievement_belts_v1(p_player_id, p_league_id),
        '[]'::jsonb
      )
    ) AS legacy(belt)
  ),
  team_belts AS (
    SELECT previous.belt
    FROM previous_belts previous
    WHERE previous.belt->>'scope' = 'team'
  ),
  all_belts AS (
    SELECT belt FROM personal_belts
    UNION ALL
    SELECT belt FROM team_belts
  )
  SELECT COALESCE(
    jsonb_agg(all_belts.belt ORDER BY all_belts.belt->>'slug'),
    '[]'::jsonb
  )
  FROM all_belts;
$$;

REVOKE ALL
ON FUNCTION public.get_player_achievement_belts_v1(UUID, UUID)
FROM PUBLIC, anon, authenticated;

REVOKE ALL
ON FUNCTION public.get_player_achievement_belts(UUID, UUID)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.get_player_achievement_belts(UUID, UUID)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
