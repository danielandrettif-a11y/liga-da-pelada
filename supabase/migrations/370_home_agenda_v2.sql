BEGIN;

CREATE OR REPLACE FUNCTION public.get_home_agenda_v2(p_league_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH league AS (
    SELECT id, match_duration, stadium_name, stadium_map_url, event_duration_minutes
    FROM public.leagues
    WHERE id = p_league_id AND is_active AND public.is_league_member(id)
  ), season AS (
    SELECT s.id FROM public.seasons s JOIN league l ON l.id = s.league_id
    WHERE s.status = 'active' ORDER BY s.id LIMIT 1
  ), upcoming AS (
    SELECT DISTINCT ON (r.round_type)
      r.id, r.round_type, r.number, r.date, r.start_time, r.status, r.preparation_stage,
      r.stadium_id, r.stadium_name, r.stadium_map_url
    FROM public.rounds r JOIN season s ON s.id = r.season_id JOIN league l ON l.id = r.league_id
    WHERE r.status IN ('draft', 'active') AND r.round_type IN ('official', 'friendly')
    ORDER BY r.round_type, r.date, r.start_time, r.id
  ), own_profile AS (
    SELECT player_id FROM public.account_profiles WHERE user_id = auth.uid()
  ), visible_callups AS (
    SELECT c.id, c.date, c.start_time, c.stadium_id, c.stadium_name, c.stadium_map_url,
      c.round_type, c.capacity, c.waitlist_capacity, r.id AS round_id
    FROM public.callups c JOIN league l ON l.id = c.league_id
    LEFT JOIN public.rounds r ON r.id = c.round_id AND r.league_id = l.id
    WHERE c.status IN ('open', 'locked', 'converted')
      AND r.status IS DISTINCT FROM 'finished'
      AND NOT EXISTS (
        SELECT 1 FROM public.matches m WHERE m.round_id = r.id
          AND (m.started_at IS NOT NULL OR m.status IN ('in_progress', 'live', 'finished'))
      )
  )
  SELECT jsonb_build_object(
    'league', (SELECT to_jsonb(l) FROM league l),
    'rounds', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) || jsonb_build_object('participant_count',
        (SELECT count(*) FROM public.round_players rp WHERE rp.round_id = r.id)))
      FROM upcoming r
    ), '[]'::jsonb),
    'callups', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) || to_jsonb(entries) ORDER BY c.date, c.start_time, c.id)
      FROM visible_callups c
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE e.status = 'confirmed') AS confirmed,
          count(*) FILTER (WHERE e.status = 'waitlist') AS waiting,
          (jsonb_agg(jsonb_build_object('playerId', e.player_id, 'status', e.status, 'position', e.position)
            ORDER BY e.position, e.player_id)
            FILTER (WHERE e.player_id = (SELECT player_id FROM own_profile)))->0 AS "userEntry"
        FROM public.callup_entries e WHERE e.callup_id = c.id AND e.status IN ('confirmed', 'waitlist')
      ) entries
    ), '[]'::jsonb),
    'liveMatch', (
      SELECT jsonb_build_object(
        'id', m.id, 'score_a', m.score_a, 'score_b', m.score_b, 'status', m.status,
        'timer_started_at', m.timer_started_at, 'timer_accumulated_seconds', m.timer_accumulated_seconds,
        'round', jsonb_build_object('id', r.id, 'number', r.number),
        'teamA', CASE WHEN a.id IS NOT NULL THEN jsonb_build_object('id', a.id, 'name', a.name, 'color', a.color, 'position', a.position, 'crest_url', a.crest_url) END,
        'teamB', CASE WHEN b.id IS NOT NULL THEN jsonb_build_object('id', b.id, 'name', b.name, 'color', b.color, 'position', b.position, 'crest_url', b.crest_url) END
      )
      FROM public.matches m JOIN public.rounds r ON r.id = m.round_id
      JOIN season s ON s.id = r.season_id JOIN league l ON l.id = r.league_id
      LEFT JOIN public.teams a ON a.id = m.team_a_id AND a.round_id = r.id
      LEFT JOIN public.teams b ON b.id = m.team_b_id AND b.round_id = r.id
      WHERE m.status = 'live' ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    )
  ) WHERE EXISTS (SELECT 1 FROM league);
$$;

REVOKE ALL ON FUNCTION public.get_home_agenda_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_home_agenda_v2(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
