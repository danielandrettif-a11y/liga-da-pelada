-- Cinturoes pertencem apenas a jogadores oficiais da pelada.
BEGIN;

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
  WITH official_holder AS (
    SELECT member.player_id
    FROM public.league_members member
    JOIN public.players player ON player.id = member.player_id
    WHERE member.league_id = p_league_id
      AND member.player_id = p_player_id
      AND member.is_active = true
      AND player.is_selectable = true
      AND player.member_category = 'player'
  ),
  official_rounds AS (
    SELECT round_item.id, round_item.number, round_item.date
    FROM public.rounds round_item
    WHERE round_item.league_id = p_league_id
      AND round_item.round_type = 'official'
      AND round_item.status = 'finished'
  ),
  round_metrics AS (
    SELECT 'top_scorer'::TEXT AS slug, stats.player_id,
      stats.goals::INTEGER AS record_value, round_item.id AS round_id,
      round_item.number AS round_number, round_item.date AS round_date
    FROM public.player_round_stats stats
    JOIN official_rounds round_item ON round_item.id = stats.round_id
    JOIN public.players player ON player.id = stats.player_id
    JOIN public.league_members member ON member.player_id = stats.player_id
      AND member.league_id = p_league_id AND member.is_active = true
    WHERE stats.goals > 0 AND player.is_selectable = true
      AND player.member_category = 'player'

    UNION ALL

    SELECT 'top_assister'::TEXT, stats.player_id,
      stats.assists::INTEGER, round_item.id, round_item.number, round_item.date
    FROM public.player_round_stats stats
    JOIN official_rounds round_item ON round_item.id = stats.round_id
    JOIN public.players player ON player.id = stats.player_id
    JOIN public.league_members member ON member.player_id = stats.player_id
      AND member.league_id = p_league_id AND member.is_active = true
    WHERE stats.assists > 0 AND player.is_selectable = true
      AND player.member_category = 'player'
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
      'name', CASE metric.slug WHEN 'top_scorer' THEN 'Cinturão do Artilheiro' ELSE 'Cinturão do Garçom' END,
      'description', CASE metric.slug
        WHEN 'top_scorer' THEN 'Recorde de gols marcados por um jogador em uma única rodada oficial.'
        ELSE 'Recorde de assistências feitas por um jogador em uma única rodada oficial.' END,
      'recordValue', metric.record_value,
      'unit', CASE metric.slug WHEN 'top_scorer' THEN 'gols na rodada' ELSE 'assistências na rodada' END,
      'scope', 'player', 'roundId', metric.round_id,
      'roundNumber', metric.round_number, 'roundDate', metric.round_date, 'team', NULL
    ) AS belt
    FROM ranked_round_metrics metric
    WHERE metric.belt_position = 1 AND metric.player_id = p_player_id
  ),
  legacy_team_belts AS (
    SELECT legacy.belt
    FROM jsonb_array_elements(COALESCE(
      public.get_player_achievement_belts_v1(p_player_id, p_league_id), '[]'::jsonb
    )) AS legacy(belt)
    WHERE legacy.belt->>'scope' = 'team'
  ),
  all_belts AS (
    SELECT belt FROM personal_belts
    UNION ALL
    SELECT belt FROM legacy_team_belts
  )
  SELECT CASE WHEN EXISTS (SELECT 1 FROM official_holder)
    THEN COALESCE(jsonb_agg(all_belts.belt ORDER BY all_belts.belt->>'slug'), '[]'::jsonb)
    ELSE '[]'::jsonb END
  FROM all_belts;
$$;

REVOKE ALL ON FUNCTION public.get_player_achievement_belts(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_achievement_belts(UUID, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
