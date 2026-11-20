-- A agenda é carregada antes do histórico. A leitura de convocações continua
-- separada para preservar convocações convertidas e o filtro de partida iniciada.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_home_agenda_read_model(p_season_id UUID, p_league_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'league', (SELECT to_jsonb(l) FROM (SELECT match_duration, preseason_enabled, stadium_name, stadium_map_url, event_duration_minutes FROM public.leagues WHERE id = p_league_id) l),
    'nextRound', (
      SELECT to_jsonb(r) || jsonb_build_object('round_players', jsonb_build_array(jsonb_build_object('count', (SELECT count(*) FROM public.round_players rp WHERE rp.round_id = r.id))))
      FROM public.rounds r
      WHERE r.season_id = p_season_id AND r.round_type = 'official' AND r.status IN ('draft', 'active')
      ORDER BY r.date, r.start_time LIMIT 1
    ),
    'nextFriendly', (
      SELECT to_jsonb(r) || jsonb_build_object('round_players', jsonb_build_array(jsonb_build_object('count', (SELECT count(*) FROM public.round_players rp WHERE rp.round_id = r.id))))
      FROM public.rounds r
      WHERE r.season_id = p_season_id AND r.round_type = 'friendly' AND r.status IN ('draft', 'active')
      ORDER BY r.date, r.start_time LIMIT 1
    ),
    'liveMatch', (
      SELECT to_jsonb(m) || jsonb_build_object(
        'round', jsonb_build_object('id', r.id, 'number', r.number, 'season_id', r.season_id),
        'teamA', CASE WHEN ta.id IS NULL THEN NULL ELSE jsonb_build_object('id', ta.id, 'name', ta.name, 'color', ta.color, 'position', ta.position, 'crest_url', ta.crest_url) END,
        'teamB', CASE WHEN tb.id IS NULL THEN NULL ELSE jsonb_build_object('id', tb.id, 'name', tb.name, 'color', tb.color, 'position', tb.position, 'crest_url', tb.crest_url) END
      )
      FROM public.matches m
      JOIN public.rounds r ON r.id = m.round_id
      LEFT JOIN public.teams ta ON ta.id = m.team_a_id
      LEFT JOIN public.teams tb ON tb.id = m.team_b_id
      WHERE r.season_id = p_season_id AND m.status = 'live'
      ORDER BY m.created_at DESC LIMIT 1
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_home_agenda_read_model(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_home_agenda_read_model(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
