-- Calcula os detentores uma vez por pelada, sem chamar a função individual
-- para cada membro. Mantém o formato e os desempates das migrations 246/322.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_league_achievement_belt_holders(
  p_league_id UUID
)
RETURNS TABLE(player_id UUID, belts JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH official_members AS MATERIALIZED (
    SELECT member.player_id
    FROM public.league_members member
    JOIN public.players player ON player.id = member.player_id
    WHERE member.league_id = p_league_id
      AND member.is_active = true
      AND player.is_selectable = true
      AND player.member_category = 'player'
  ),
  official_rounds AS MATERIALIZED (
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
    JOIN official_members member ON member.player_id = stats.player_id
    WHERE stats.goals > 0

    UNION ALL

    SELECT 'top_assister'::TEXT, stats.player_id,
      stats.assists::INTEGER, round_item.id, round_item.number, round_item.date
    FROM public.player_round_stats stats
    JOIN official_rounds round_item ON round_item.id = stats.round_id
    JOIN official_members member ON member.player_id = stats.player_id
    WHERE stats.assists > 0
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
    SELECT metric.player_id, jsonb_build_object(
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
    WHERE metric.belt_position = 1
  ),
  team_results AS (
    SELECT match_item.round_id, round_item.number AS round_number,
      round_item.date AS round_date, match_item.id AS match_id,
      match_item.match_order, match_item.created_at,
      match_item.team_a_id AS team_id,
      match_item.score_a > match_item.score_b AS won
    FROM public.matches match_item
    JOIN official_rounds round_item ON round_item.id = match_item.round_id
    WHERE match_item.status = 'finished'

    UNION ALL

    SELECT match_item.round_id, round_item.number, round_item.date,
      match_item.id, match_item.match_order, match_item.created_at,
      match_item.team_b_id, match_item.score_b > match_item.score_a
    FROM public.matches match_item
    JOIN official_rounds round_item ON round_item.id = match_item.round_id
    WHERE match_item.status = 'finished'
  ),
  marked_results AS (
    SELECT result_item.*,
      sum(CASE WHEN result_item.won THEN 0 ELSE 1 END) OVER (
        PARTITION BY result_item.round_id, result_item.team_id
        ORDER BY COALESCE(result_item.match_order, 2147483647),
          result_item.created_at, result_item.match_id
      ) AS streak_group
    FROM team_results result_item
  ),
  streaks AS (
    SELECT result_item.round_id, result_item.round_number,
      result_item.round_date, result_item.team_id,
      count(*)::INTEGER AS record_value,
      (array_agg(result_item.match_id ORDER BY
        COALESCE(result_item.match_order, 2147483647) DESC,
        result_item.created_at DESC, result_item.match_id DESC))[1] AS achieved_match_id,
      max(COALESCE(result_item.match_order, 2147483647)) AS achieved_order
    FROM marked_results result_item
    WHERE result_item.won = true
    GROUP BY result_item.round_id, result_item.round_number,
      result_item.round_date, result_item.team_id, result_item.streak_group
  ),
  ranked_streaks AS (
    SELECT streak.*,
      row_number() OVER (
        ORDER BY streak.record_value DESC, streak.round_date ASC,
          streak.achieved_order ASC, streak.team_id
      ) AS belt_position
    FROM streaks streak
  ),
  team_holder AS (
    SELECT streak.*, team.name, team.color, team.crest_url
    FROM ranked_streaks streak
    JOIN public.teams team ON team.id = streak.team_id
    WHERE streak.belt_position = 1
  ),
  team_holder_roster AS (
    SELECT DISTINCT match_player.player_id
    FROM team_holder holder
    JOIN public.match_players match_player
      ON match_player.match_id = holder.achieved_match_id
     AND match_player.team_id = holder.team_id

    UNION

    SELECT team_player.player_id
    FROM team_holder holder
    JOIN public.team_players team_player ON team_player.team_id = holder.team_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.match_players match_player
      WHERE match_player.match_id = holder.achieved_match_id
        AND match_player.team_id = holder.team_id
    )
  ),
  team_belts AS (
    SELECT member.player_id, jsonb_build_object(
      'slug', 'team_win_streak',
      'name', 'Cinturão da Sequência',
      'description', 'Escalação com a maior sequência de vitórias em uma rodada oficial.',
      'recordValue', holder.record_value,
      'unit', 'vitórias seguidas',
      'scope', 'team',
      'roundId', holder.round_id,
      'roundNumber', holder.round_number,
      'roundDate', holder.round_date,
      'team', jsonb_build_object(
        'id', holder.team_id,
        'name', holder.name,
        'color', holder.color,
        'crestUrl', holder.crest_url,
        'members', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', player.id, 'name', player.name, 'avatarUrl', player.avatar_url
          ) ORDER BY player.name)
          FROM team_holder_roster roster
          JOIN public.players player ON player.id = roster.player_id
        ), '[]'::jsonb)
      )
    ) AS belt
    FROM team_holder holder
    JOIN team_holder_roster roster ON true
    JOIN official_members member ON member.player_id = roster.player_id
  ),
  all_belts AS (
    SELECT personal.player_id, personal.belt FROM personal_belts personal
    UNION ALL
    SELECT team.player_id, team.belt FROM team_belts team
  )
  SELECT item.player_id, jsonb_agg(item.belt ORDER BY item.belt->>'slug') AS belts
  FROM all_belts item
  GROUP BY item.player_id
  ORDER BY item.player_id;
$$;

REVOKE ALL ON FUNCTION public.get_league_achievement_belt_holders(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_league_achievement_belt_holders(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
