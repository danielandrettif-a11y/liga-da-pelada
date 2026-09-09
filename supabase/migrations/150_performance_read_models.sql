-- Read models públicos para reduzir round-trips da home e do mercado do Cartola.
-- SECURITY INVOKER preserva as políticas RLS das tabelas consultadas.

CREATE OR REPLACE FUNCTION public.get_home_read_model(p_season_id UUID, p_league_id UUID)
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
    'lastRound', (
      SELECT to_jsonb(r) || jsonb_build_object(
        'teams', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.position) FROM public.teams t WHERE t.round_id = r.id), '[]'::jsonb),
        'matches', COALESCE((
          SELECT jsonb_agg(to_jsonb(m) || jsonb_build_object(
            'match_events', COALESCE((
              SELECT jsonb_agg(to_jsonb(e) || jsonb_build_object(
                'player', CASE WHEN scorer.id IS NULL THEN NULL ELSE jsonb_build_object('id', scorer.id, 'name', scorer.name, 'avatar_url', scorer.avatar_url) END,
                'assist_player', CASE WHEN assister.id IS NULL THEN NULL ELSE jsonb_build_object('id', assister.id, 'name', assister.name, 'avatar_url', assister.avatar_url) END
              ) ORDER BY e.created_at)
              FROM public.match_events e
              LEFT JOIN public.players scorer ON scorer.id = e.player_id
              LEFT JOIN public.players assister ON assister.id = e.assist_player_id
              WHERE e.match_id = m.id
            ), '[]'::jsonb)
          ) ORDER BY COALESCE(m.match_order, 0))
          FROM public.matches m WHERE m.round_id = r.id
        ), '[]'::jsonb)
      )
      FROM public.rounds r
      WHERE r.season_id = p_season_id AND r.round_type = 'official' AND r.status = 'finished'
      ORDER BY r.date DESC, r.number DESC LIMIT 1
    ),
    'liveMatch', (
      SELECT to_jsonb(m) || jsonb_build_object(
        'round', jsonb_build_object('id', r.id, 'number', r.number, 'season_id', r.season_id),
        'teamA', CASE WHEN ta.id IS NULL THEN NULL ELSE jsonb_build_object('id', ta.id, 'name', ta.name, 'color', ta.color, 'crest_url', ta.crest_url) END,
        'teamB', CASE WHEN tb.id IS NULL THEN NULL ELSE jsonb_build_object('id', tb.id, 'name', tb.name, 'color', tb.color, 'crest_url', tb.crest_url) END
      )
      FROM public.matches m
      JOIN public.rounds r ON r.id = m.round_id
      LEFT JOIN public.teams ta ON ta.id = m.team_a_id
      LEFT JOIN public.teams tb ON tb.id = m.team_b_id
      WHERE r.season_id = p_season_id AND m.status = 'live'
      ORDER BY m.created_at DESC LIMIT 1
    ),
    'activeCallups', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object(
        'callup_entries', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('player_id', ce.player_id, 'status', ce.status, 'position', ce.position) ORDER BY ce.position)
          FROM public.callup_entries ce WHERE ce.callup_id = c.id
        ), '[]'::jsonb),
        'round', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', r.id,
          'status', r.status,
          'matches', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', m.status)) FROM public.matches m WHERE m.round_id = r.id), '[]'::jsonb)
        ) END
      ) ORDER BY c.date, c.start_time)
      FROM public.callups c
      LEFT JOIN public.rounds r ON r.id = c.round_id
      WHERE c.league_id = p_league_id AND c.status IN ('open', 'locked')
    ), '[]'::jsonb)
  );
$$;

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
        'member_category', p.member_category, 'is_selectable', p.is_selectable
      ) ORDER BY p.name)
      FROM public.players p WHERE p.is_selectable = true AND p.member_category = 'player'
    ), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC)
      FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = p_fantasy_season_id
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_home_read_model(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_fantasy_market_read_model(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_home_read_model(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fantasy_market_read_model(UUID) TO authenticated;
