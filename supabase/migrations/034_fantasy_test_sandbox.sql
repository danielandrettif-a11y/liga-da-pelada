-- Sandbox do Cartola para amistosos.
-- Mantem escalacoes e resultados de teste fisicamente separados da economia,
-- do ranking e do historico oficial do Fantasy.

CREATE TABLE IF NOT EXISTS public.fantasy_test_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL UNIQUE REFERENCES public.leagues(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  round_id UUID NOT NULL UNIQUE REFERENCES public.rounds(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'finished')),
  settings_snapshot JSONB NOT NULL,
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fantasy_test_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_session_id UUID NOT NULL REFERENCES public.fantasy_test_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked', 'missed', 'scored')),
  captain_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  top_scorer_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  top_assist_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  top_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  budget_before NUMERIC(10,2) NOT NULL,
  lineup_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  cash_remaining NUMERIC(10,2) NOT NULL DEFAULT 0,
  budget_after NUMERIC(10,2),
  player_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  prediction_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  round_position INTEGER,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_session_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_test_lineup_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id UUID NOT NULL REFERENCES public.fantasy_test_lineups(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  price_locked NUMERIC(10,2) NOT NULL,
  base_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  captain_bonus NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_after NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lineup_id, player_id)
);

CREATE INDEX IF NOT EXISTS fantasy_test_lineups_ranking_idx
ON public.fantasy_test_lineups (test_session_id, total_points DESC);

CREATE OR REPLACE FUNCTION public.create_fantasy_test_session(p_round_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_round public.rounds%ROWTYPE;
  current_settings public.fantasy_settings%ROWTYPE;
  session_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem iniciar o teste.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));
  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;

  IF NOT FOUND OR selected_round.round_type <> 'friendly' THEN
    RAISE EXCEPTION 'Escolha uma rodada amistosa para o teste.';
  END IF;
  IF selected_round.status = 'active' AND EXISTS (
    SELECT 1 FROM public.matches match
    WHERE match.round_id = p_round_id AND match.started_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Este amistoso ja foi iniciado. Use um amistoso futuro ou ja finalizado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fantasy_test_sessions WHERE league_id = selected_round.league_id) THEN
    RAISE EXCEPTION 'Ja existe um teste ativo. Resete-o antes de iniciar outro.';
  END IF;

  INSERT INTO public.fantasy_settings (league_id)
  VALUES (selected_round.league_id)
  ON CONFLICT (league_id) DO NOTHING;

  SELECT * INTO current_settings
  FROM public.fantasy_settings
  WHERE league_id = selected_round.league_id;

  INSERT INTO public.fantasy_test_sessions (
    league_id, season_id, round_id, settings_snapshot, created_by
  ) VALUES (
    selected_round.league_id,
    selected_round.season_id,
    selected_round.id,
    to_jsonb(current_settings) - 'league_id' - 'updated_at',
    auth.uid()
  )
  RETURNING id INTO session_id;

  INSERT INTO public.fantasy_audit_log (league_id, user_id, action, payload)
  VALUES (
    selected_round.league_id,
    auth.uid(),
    'test_session_created',
    jsonb_build_object('test_session_id', session_id, 'round_id', selected_round.id)
  );

  RETURN session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_fantasy_test_lineup(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID DEFAULT NULL,
  p_top_scorer_player_id UUID DEFAULT NULL,
  p_top_assist_player_id UUID DEFAULT NULL,
  p_top_team_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user UUID := auth.uid();
  test_session public.fantasy_test_sessions%ROWTYPE;
  saved_lineup_id UUID;
  unique_count INTEGER;
  valid_count INTEGER;
  player_price NUMERIC(10,2);
  available_budget NUMERIC(10,2);
  lineup_cost NUMERIC(10,2);
BEGIN
  IF current_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para escalar.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));
  SELECT * INTO test_session
  FROM public.fantasy_test_sessions
  WHERE round_id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Teste do Cartola nao encontrado.'; END IF;
  IF test_session.status <> 'open' THEN
    RAISE EXCEPTION 'O mercado de teste esta fechado.';
  END IF;

  SELECT count(DISTINCT id), count(*) INTO unique_count, valid_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) AS selected(id);
  IF unique_count <> valid_count THEN RAISE EXCEPTION 'Um jogador nao pode aparecer duas vezes.'; END IF;
  IF unique_count > 5 THEN RAISE EXCEPTION 'A escalacao aceita no maximo 5 jogadores.'; END IF;

  SELECT count(*) INTO valid_count
  FROM public.round_players participant
  JOIN public.players player ON player.id = participant.player_id
  WHERE participant.round_id = p_round_id
    AND participant.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]));
  IF valid_count <> unique_count THEN RAISE EXCEPTION 'No teste, use apenas jogadores convocados para o amistoso.'; END IF;

  IF p_captain_player_id IS NOT NULL AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))) THEN
    RAISE EXCEPTION 'O capitao precisa estar entre os escalados.';
  END IF;
  IF p_top_team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.teams WHERE id = p_top_team_id AND round_id = p_round_id
  ) THEN
    RAISE EXCEPTION 'O time escolhido nao pertence a este amistoso.';
  END IF;
  IF p_top_scorer_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.round_players WHERE round_id = p_round_id AND player_id = p_top_scorer_player_id
  ) THEN
    RAISE EXCEPTION 'Palpite de artilheiro invalido.';
  END IF;
  IF p_top_assist_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.round_players WHERE round_id = p_round_id AND player_id = p_top_assist_player_id
  ) THEN
    RAISE EXCEPTION 'Palpite de garcom invalido.';
  END IF;

  player_price := (test_session.settings_snapshot->>'initial_player_price')::NUMERIC;
  available_budget := (test_session.settings_snapshot->>'initial_budget')::NUMERIC;
  lineup_cost := unique_count * player_price;
  IF lineup_cost > available_budget THEN RAISE EXCEPTION 'A escalacao ultrapassa o patrimonio de teste.'; END IF;

  INSERT INTO public.fantasy_test_lineups (
    test_session_id, user_id, status, captain_player_id, top_scorer_player_id,
    top_assist_player_id, top_team_id, budget_before, lineup_cost, cash_remaining, updated_at
  ) VALUES (
    test_session.id, current_user, 'draft', p_captain_player_id, p_top_scorer_player_id,
    p_top_assist_player_id, p_top_team_id, available_budget, lineup_cost,
    available_budget - lineup_cost, now()
  ) ON CONFLICT (test_session_id, user_id) DO UPDATE SET
    status = 'draft', captain_player_id = EXCLUDED.captain_player_id,
    top_scorer_player_id = EXCLUDED.top_scorer_player_id,
    top_assist_player_id = EXCLUDED.top_assist_player_id,
    top_team_id = EXCLUDED.top_team_id, budget_before = EXCLUDED.budget_before,
    lineup_cost = EXCLUDED.lineup_cost, cash_remaining = EXCLUDED.cash_remaining,
    budget_after = NULL, player_points = 0, prediction_points = 0,
    total_points = 0, round_position = NULL, locked_at = NULL, updated_at = now()
  RETURNING id INTO saved_lineup_id;

  DELETE FROM public.fantasy_test_lineup_players WHERE lineup_id = saved_lineup_id;
  INSERT INTO public.fantasy_test_lineup_players (lineup_id, player_id, price_locked)
  SELECT saved_lineup_id, selected.id, player_price
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id);

  INSERT INTO public.fantasy_audit_log (league_id, user_id, action, payload)
  VALUES (
    test_session.league_id,
    current_user,
    'test_lineup_saved',
    jsonb_build_object('test_session_id', test_session.id, 'players', unique_count, 'cost', lineup_cost)
  );

  RETURN saved_lineup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_fantasy_test_market(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  test_session public.fantasy_test_sessions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));
  SELECT * INTO test_session
  FROM public.fantasy_test_sessions
  WHERE round_id = p_round_id
  FOR UPDATE;

  IF NOT FOUND OR test_session.status <> 'open' THEN RETURN true; END IF;

  UPDATE public.fantasy_test_lineups lineup SET
    status = CASE WHEN (
      SELECT count(*) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id
    ) = 5 AND lineup.captain_player_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.fantasy_test_lineup_players item
      WHERE item.lineup_id = lineup.id AND item.player_id = lineup.captain_player_id
    ) AND (
      SELECT count(*)
      FROM public.fantasy_test_lineup_players item
      JOIN public.round_players participant
        ON participant.round_id = p_round_id AND participant.player_id = item.player_id
      WHERE item.lineup_id = lineup.id
    ) = 5 THEN 'locked' ELSE 'missed' END,
    locked_at = now(), updated_at = now()
  WHERE lineup.test_session_id = test_session.id;

  UPDATE public.fantasy_test_sessions
  SET status = 'in_progress', locked_at = now()
  WHERE id = test_session.id;

  INSERT INTO public.fantasy_audit_log (league_id, user_id, action, payload)
  VALUES (
    test_session.league_id,
    auth.uid(),
    'test_market_locked',
    jsonb_build_object('test_session_id', test_session.id, 'round_id', p_round_id)
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_fantasy_test_market_on_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.started_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.started_at IS NULL) THEN
    PERFORM public.lock_fantasy_test_market(NEW.round_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_lock_fantasy_test_market ON public.matches;
CREATE TRIGGER matches_lock_fantasy_test_market
AFTER INSERT OR UPDATE OF started_at ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.lock_fantasy_test_market_on_match();

CREATE OR REPLACE FUNCTION public.process_fantasy_test_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  test_session public.fantasy_test_sessions%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
  s JSONB;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem processar o teste.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));
  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  SELECT * INTO test_session
  FROM public.fantasy_test_sessions
  WHERE round_id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN true; END IF;
  IF selected_round.status <> 'finished' THEN
    RAISE EXCEPTION 'Finalize o amistoso antes de calcular o teste.';
  END IF;
  IF test_session.processed_at IS NOT NULL THEN RETURN true; END IF;
  IF test_session.status = 'open' THEN
    PERFORM public.lock_fantasy_test_market(p_round_id);
    SELECT * INTO test_session FROM public.fantasy_test_sessions WHERE id = test_session.id;
  END IF;
  s := test_session.settings_snapshot;

  UPDATE public.fantasy_test_lineup_players item SET
    base_points = points.base_points,
    captain_bonus = CASE WHEN item.player_id = points.captain_player_id
      THEN points.base_points * ((s->>'captain_multiplier')::NUMERIC - 1) ELSE 0 END,
    total_points = points.base_points * CASE WHEN item.player_id = points.captain_player_id
      THEN (s->>'captain_multiplier')::NUMERIC ELSE 1 END,
    price_after = item.price_locked
  FROM (
    SELECT lineup_player.id item_id, lineup.captain_player_id,
      COALESCE(stats.goals, 0) * (s->>'goal_points')::NUMERIC
        + COALESCE(stats.assists, 0) * (s->>'assist_points')::NUMERIC
        + COALESCE(stats.wins, 0) * (s->>'win_points')::NUMERIC AS base_points
    FROM public.fantasy_test_lineup_players lineup_player
    JOIN public.fantasy_test_lineups lineup ON lineup.id = lineup_player.lineup_id
    LEFT JOIN public.player_round_stats stats
      ON stats.round_id = p_round_id AND stats.player_id = lineup_player.player_id
    WHERE lineup.test_session_id = test_session.id AND lineup.status = 'locked'
  ) points
  WHERE item.id = points.item_id;

  WITH player_leaders AS (
    SELECT max(goals) max_goals, max(assists) max_assists
    FROM public.player_round_stats WHERE round_id = p_round_id
  ), team_wins AS (
    SELECT team_id, count(*) wins FROM (
      SELECT CASE WHEN score_a > score_b THEN team_a_id WHEN score_b > score_a THEN team_b_id END team_id
      FROM public.matches WHERE round_id = p_round_id AND status = 'finished'
    ) winners WHERE team_id IS NOT NULL GROUP BY team_id
  ), team_leader AS (
    SELECT COALESCE(max(wins), 0) max_wins FROM team_wins
  )
  UPDATE public.fantasy_test_lineups lineup SET
    player_points = COALESCE((
      SELECT sum(item.total_points)
      FROM public.fantasy_test_lineup_players item
      WHERE item.lineup_id = lineup.id
    ), 0),
    prediction_points =
      CASE WHEN leaders.max_goals > 0 AND EXISTS (
        SELECT 1 FROM public.player_round_stats stats
        WHERE stats.round_id = p_round_id
          AND stats.player_id = lineup.top_scorer_player_id
          AND stats.goals = leaders.max_goals
      ) THEN (s->>'top_scorer_prediction_points')::NUMERIC ELSE 0 END
      + CASE WHEN leaders.max_assists > 0 AND EXISTS (
        SELECT 1 FROM public.player_round_stats stats
        WHERE stats.round_id = p_round_id
          AND stats.player_id = lineup.top_assist_player_id
          AND stats.assists = leaders.max_assists
      ) THEN (s->>'top_assist_prediction_points')::NUMERIC ELSE 0 END
      + CASE WHEN team_leader.max_wins > 0 AND EXISTS (
        SELECT 1 FROM team_wins team_result
        WHERE team_result.team_id = lineup.top_team_id
          AND team_result.wins = team_leader.max_wins
      ) THEN (s->>'top_team_prediction_points')::NUMERIC ELSE 0 END
  FROM player_leaders leaders, team_leader
  WHERE lineup.test_session_id = test_session.id AND lineup.status = 'locked';

  UPDATE public.fantasy_test_lineups
  SET total_points = player_points + prediction_points,
      budget_after = budget_before,
      status = 'scored',
      updated_at = now()
  WHERE test_session_id = test_session.id AND status = 'locked';

  UPDATE public.fantasy_test_lineups
  SET budget_after = budget_before, updated_at = now()
  WHERE test_session_id = test_session.id AND status = 'missed';

  WITH ranked AS (
    SELECT id, rank() OVER (ORDER BY total_points DESC, updated_at) position
    FROM public.fantasy_test_lineups
    WHERE test_session_id = test_session.id AND status = 'scored'
  )
  UPDATE public.fantasy_test_lineups lineup
  SET round_position = ranked.position
  FROM ranked
  WHERE lineup.id = ranked.id;

  UPDATE public.fantasy_test_sessions
  SET status = 'finished', processed_at = now()
  WHERE id = test_session.id;

  INSERT INTO public.fantasy_audit_log (league_id, user_id, action, payload)
  VALUES (
    test_session.league_id,
    auth.uid(),
    'test_round_processed',
    jsonb_build_object('test_session_id', test_session.id, 'round_id', p_round_id)
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_fantasy_test_session(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  test_session public.fantasy_test_sessions%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem resetar o teste.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));
  SELECT * INTO test_session
  FROM public.fantasy_test_sessions
  WHERE round_id = p_round_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN true; END IF;

  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id;
  IF selected_round.status = 'active' AND EXISTS (
    SELECT 1 FROM public.matches match
    WHERE match.round_id = p_round_id
      AND match.started_at IS NOT NULL
      AND match.status <> 'finished'
  ) THEN
    RAISE EXCEPTION 'Encerre a partida em andamento antes de resetar o teste.';
  END IF;

  DELETE FROM public.fantasy_test_sessions WHERE id = test_session.id;

  INSERT INTO public.fantasy_audit_log (league_id, user_id, action, payload)
  VALUES (
    test_session.league_id,
    auth.uid(),
    'test_session_reset',
    jsonb_build_object('test_session_id', test_session.id, 'round_id', p_round_id)
  );
  RETURN true;
END;
$$;

ALTER TABLE public.fantasy_test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_test_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_test_lineup_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY fantasy_test_sessions_read
ON public.fantasy_test_sessions FOR SELECT TO authenticated
USING (true);

CREATE POLICY fantasy_test_lineups_read
ON public.fantasy_test_lineups FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_app_admin()
  OR EXISTS (
    SELECT 1 FROM public.fantasy_test_sessions session
    WHERE session.id = test_session_id AND session.status <> 'open'
  )
);

CREATE POLICY fantasy_test_lineup_players_read
ON public.fantasy_test_lineup_players FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.fantasy_test_lineups lineup
    JOIN public.fantasy_test_sessions session ON session.id = lineup.test_session_id
    WHERE lineup.id = lineup_id
      AND (lineup.user_id = auth.uid() OR public.is_app_admin() OR session.status <> 'open')
  )
);

REVOKE ALL ON public.fantasy_test_sessions, public.fantasy_test_lineups,
  public.fantasy_test_lineup_players FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.fantasy_test_sessions, public.fantasy_test_lineups,
  public.fantasy_test_lineup_players FROM authenticated;
GRANT SELECT ON public.fantasy_test_sessions, public.fantasy_test_lineups,
  public.fantasy_test_lineup_players TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_fantasy_test_session(UUID),
  public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID),
  public.process_fantasy_test_round(UUID), public.reset_fantasy_test_session(UUID)
TO authenticated;

REVOKE ALL ON FUNCTION public.lock_fantasy_test_market(UUID) FROM PUBLIC, anon, authenticated;
