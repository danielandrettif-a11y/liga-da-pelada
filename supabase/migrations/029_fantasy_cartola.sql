-- Fantasy da Pelada: mercado, escalacoes, palpites, pontuacao e patrimonio.
-- O ranking principal continua independente e nenhuma tabela historica existente e alterada.

CREATE TABLE IF NOT EXISTS public.fantasy_settings (
  league_id UUID PRIMARY KEY REFERENCES public.leagues(id) ON DELETE CASCADE,
  currency_name TEXT NOT NULL DEFAULT 'C$' CHECK (char_length(currency_name) BETWEEN 1 AND 8),
  initial_budget NUMERIC(10,2) NOT NULL DEFAULT 55 CHECK (initial_budget > 0),
  initial_player_price NUMERIC(10,2) NOT NULL DEFAULT 10 CHECK (initial_player_price > 0),
  min_player_price NUMERIC(10,2) NOT NULL DEFAULT 5 CHECK (min_player_price > 0),
  max_player_price NUMERIC(10,2) NOT NULL DEFAULT 25 CHECK (max_player_price > min_player_price),
  goal_points NUMERIC(8,2) NOT NULL DEFAULT 5,
  assist_points NUMERIC(8,2) NOT NULL DEFAULT 3,
  win_points NUMERIC(8,2) NOT NULL DEFAULT 2,
  captain_multiplier NUMERIC(5,2) NOT NULL DEFAULT 2 CHECK (captain_multiplier >= 1),
  top_scorer_prediction_points NUMERIC(8,2) NOT NULL DEFAULT 8,
  top_assist_prediction_points NUMERIC(8,2) NOT NULL DEFAULT 6,
  top_team_prediction_points NUMERIC(8,2) NOT NULL DEFAULT 5,
  recent_weight NUMERIC(6,5) NOT NULL DEFAULT .4,
  win_rate_weight NUMERIC(6,5) NOT NULL DEFAULT .35,
  historical_weight NUMERIC(6,5) NOT NULL DEFAULT .15,
  consistency_weight NUMERIC(6,5) NOT NULL DEFAULT .1,
  smoothing_games INTEGER NOT NULL DEFAULT 5 CHECK (smoothing_games BETWEEN 0 AND 100),
  max_price_increase NUMERIC(6,5) NOT NULL DEFAULT .12 CHECK (max_price_increase BETWEEN 0 AND 1),
  max_price_decrease NUMERIC(6,5) NOT NULL DEFAULT .1 CHECK (max_price_decrease BETWEEN 0 AND 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (abs((recent_weight + win_rate_weight + historical_weight + consistency_weight) - 1) < .00001)
);

CREATE TABLE IF NOT EXISTS public.fantasy_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  season_id UUID NOT NULL UNIQUE REFERENCES public.seasons(id) ON DELETE CASCADE,
  initial_budget NUMERIC(10,2) NOT NULL,
  initial_player_price NUMERIC(10,2) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fantasy_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_budget NUMERIC(10,2) NOT NULL,
  total_points NUMERIC(12,2) NOT NULL DEFAULT 0,
  rounds_played INTEGER NOT NULL DEFAULT 0,
  best_round_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fantasy_season_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  round_id UUID NOT NULL UNIQUE REFERENCES public.rounds(id) ON DELETE CASCADE,
  market_status TEXT NOT NULL DEFAULT 'open' CHECK (market_status IN ('open', 'in_progress', 'finished')),
  settings_snapshot JSONB NOT NULL,
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fantasy_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_round_id UUID NOT NULL REFERENCES public.fantasy_rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked', 'missed', 'scored', 'needs_review')),
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
  UNIQUE (fantasy_round_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_lineup_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lineup_id UUID NOT NULL REFERENCES public.fantasy_lineups(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  price_locked NUMERIC(10,2) NOT NULL,
  base_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  captain_bonus NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_after NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lineup_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_player_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  current_price NUMERIC(10,2) NOT NULL,
  rounds_played INTEGER NOT NULL DEFAULT 0,
  total_points NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fantasy_season_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_player_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  fantasy_round_id UUID NOT NULL REFERENCES public.fantasy_rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  price_before NUMERIC(10,2) NOT NULL,
  price_after NUMERIC(10,2) NOT NULL,
  variation_rate NUMERIC(8,6) NOT NULL DEFAULT 0,
  round_points NUMERIC(10,2) NOT NULL DEFAULT 0,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fantasy_round_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  fantasy_round_id UUID REFERENCES public.fantasy_rounds(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fantasy_rounds_status_idx ON public.fantasy_rounds (fantasy_season_id, market_status);
CREATE INDEX IF NOT EXISTS fantasy_lineups_ranking_idx ON public.fantasy_lineups (fantasy_round_id, total_points DESC);
CREATE INDEX IF NOT EXISTS fantasy_price_history_player_idx ON public.fantasy_player_price_history (fantasy_season_id, player_id, created_at);

CREATE OR REPLACE FUNCTION public.ensure_fantasy_round(p_round_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_round public.rounds%ROWTYPE;
  current_settings public.fantasy_settings%ROWTYPE;
  v_fantasy_season_id UUID;
  v_fantasy_round_id UUID;
BEGIN
  SELECT * INTO current_round FROM public.rounds WHERE id = p_round_id;
  IF NOT FOUND OR current_round.round_type <> 'official' OR current_round.status = 'finished' THEN RETURN NULL; END IF;

  INSERT INTO public.fantasy_settings (league_id) VALUES (current_round.league_id)
  ON CONFLICT (league_id) DO NOTHING;
  SELECT * INTO current_settings FROM public.fantasy_settings WHERE league_id = current_round.league_id;

  INSERT INTO public.fantasy_seasons (league_id, season_id, initial_budget, initial_player_price)
  VALUES (current_round.league_id, current_round.season_id, current_settings.initial_budget, current_settings.initial_player_price)
  ON CONFLICT (season_id) DO UPDATE SET league_id = EXCLUDED.league_id
  RETURNING id INTO v_fantasy_season_id;

  INSERT INTO public.fantasy_player_prices (fantasy_season_id, player_id, current_price)
  SELECT v_fantasy_season_id, player.id, current_settings.initial_player_price
  FROM public.players player
  WHERE player.is_selectable = true AND player.member_category = 'player'
  ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;

  INSERT INTO public.fantasy_rounds (fantasy_season_id, round_id, settings_snapshot)
  VALUES (v_fantasy_season_id, current_round.id, to_jsonb(current_settings) - 'league_id' - 'updated_at')
  ON CONFLICT (round_id) DO UPDATE SET round_id = EXCLUDED.round_id
  RETURNING id INTO v_fantasy_round_id;
  RETURN v_fantasy_round_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_fantasy_round_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.round_type = 'official' AND NEW.status <> 'finished' THEN PERFORM public.ensure_fantasy_round(NEW.id); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rounds_create_fantasy_round ON public.rounds;
CREATE TRIGGER rounds_create_fantasy_round
AFTER INSERT OR UPDATE OF round_type, status ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.create_fantasy_round_trigger();

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup(
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
  current_round public.rounds%ROWTYPE;
  fantasy_round public.fantasy_rounds%ROWTYPE;
  fantasy_season public.fantasy_seasons%ROWTYPE;
  settings public.fantasy_settings%ROWTYPE;
  account public.fantasy_accounts%ROWTYPE;
  saved_lineup_id UUID;
  unique_count INTEGER;
  valid_count INTEGER;
  lineup_cost NUMERIC(10,2);
BEGIN
  IF current_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para escalar.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));
  SELECT * INTO current_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR current_round.round_type <> 'official' THEN RAISE EXCEPTION 'Rodada oficial nao encontrada.'; END IF;
  PERFORM public.ensure_fantasy_round(p_round_id);
  SELECT * INTO fantasy_round FROM public.fantasy_rounds WHERE round_id = p_round_id FOR UPDATE;
  IF fantasy_round.market_status <> 'open' OR EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND started_at IS NOT NULL) THEN
    RAISE EXCEPTION 'O mercado desta rodada esta fechado.';
  END IF;
  SELECT * INTO fantasy_season FROM public.fantasy_seasons WHERE id = fantasy_round.fantasy_season_id;
  SELECT * INTO settings FROM public.fantasy_settings WHERE league_id = fantasy_season.league_id;

  SELECT count(DISTINCT id), count(*) INTO unique_count, valid_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) AS selected(id);
  IF unique_count <> valid_count THEN RAISE EXCEPTION 'Um jogador nao pode aparecer duas vezes.'; END IF;
  IF unique_count > 5 THEN RAISE EXCEPTION 'A escalacao aceita no maximo 5 jogadores.'; END IF;

  SELECT count(*) INTO valid_count
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND ((player.member_category = 'player' AND player.is_selectable = true)
      OR (player.member_category = 'guest' AND EXISTS (
        SELECT 1 FROM public.round_players rp WHERE rp.round_id = p_round_id AND rp.player_id = player.id
      )));
  IF valid_count <> unique_count THEN RAISE EXCEPTION 'A escalacao contem um jogador inelegivel.'; END IF;
  IF p_captain_player_id IS NOT NULL AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))) THEN
    RAISE EXCEPTION 'O capitao precisa estar entre os escalados.';
  END IF;
  IF p_top_team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_top_team_id AND round_id = p_round_id) THEN
    RAISE EXCEPTION 'O time escolhido nao pertence a esta rodada.';
  END IF;
  IF p_top_scorer_player_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_top_scorer_player_id AND is_selectable = true) THEN
    RAISE EXCEPTION 'Palpite de artilheiro invalido.';
  END IF;
  IF p_top_assist_player_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_top_assist_player_id AND is_selectable = true) THEN
    RAISE EXCEPTION 'Palpite de garcom invalido.';
  END IF;

  INSERT INTO public.fantasy_accounts (fantasy_season_id, user_id, current_budget)
  VALUES (fantasy_round.fantasy_season_id, current_user, fantasy_season.initial_budget)
  ON CONFLICT (fantasy_season_id, user_id) DO NOTHING;
  SELECT * INTO account FROM public.fantasy_accounts
  WHERE fantasy_season_id = fantasy_round.fantasy_season_id AND user_id = current_user FOR UPDATE;

  INSERT INTO public.fantasy_player_prices (fantasy_season_id, player_id, current_price)
  SELECT fantasy_round.fantasy_season_id, player.id, fantasy_season.initial_player_price
  FROM public.players player WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
  ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;
  SELECT COALESCE(sum(price.current_price), 0) INTO lineup_cost
  FROM public.fantasy_player_prices price
  WHERE price.fantasy_season_id = fantasy_round.fantasy_season_id
    AND price.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]));
  IF lineup_cost > account.current_budget THEN RAISE EXCEPTION 'A escalacao ultrapassa o patrimonio disponivel.'; END IF;

  INSERT INTO public.fantasy_lineups (
    fantasy_round_id, user_id, status, captain_player_id, top_scorer_player_id,
    top_assist_player_id, top_team_id, budget_before, lineup_cost, cash_remaining, updated_at
  ) VALUES (
    fantasy_round.id, current_user, 'draft', p_captain_player_id, p_top_scorer_player_id,
    p_top_assist_player_id, p_top_team_id, account.current_budget, lineup_cost,
    account.current_budget - lineup_cost, now()
  ) ON CONFLICT (fantasy_round_id, user_id) DO UPDATE SET
    status = 'draft', captain_player_id = EXCLUDED.captain_player_id,
    top_scorer_player_id = EXCLUDED.top_scorer_player_id,
    top_assist_player_id = EXCLUDED.top_assist_player_id, top_team_id = EXCLUDED.top_team_id,
    budget_before = EXCLUDED.budget_before, lineup_cost = EXCLUDED.lineup_cost,
    cash_remaining = EXCLUDED.cash_remaining, updated_at = now()
  RETURNING id INTO saved_lineup_id;

  DELETE FROM public.fantasy_lineup_players item WHERE item.lineup_id = saved_lineup_id;
  INSERT INTO public.fantasy_lineup_players (lineup_id, player_id, price_locked)
  SELECT saved_lineup_id, selected.id, price.current_price
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id)
  JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = fantasy_round.fantasy_season_id AND price.player_id = selected.id;

  INSERT INTO public.fantasy_audit_log (league_id, fantasy_round_id, user_id, action, payload)
  VALUES (fantasy_season.league_id, fantasy_round.id, current_user, 'lineup_saved', jsonb_build_object('players', unique_count, 'cost', lineup_cost));
  RETURN saved_lineup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_fantasy_market(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fantasy_round public.fantasy_rounds%ROWTYPE;
  fantasy_season public.fantasy_seasons%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));
  SELECT * INTO fantasy_round FROM public.fantasy_rounds WHERE round_id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN true; END IF;
  IF fantasy_round.market_status <> 'open' THEN RETURN true; END IF;
  SELECT * INTO fantasy_season FROM public.fantasy_seasons WHERE id = fantasy_round.fantasy_season_id;

  UPDATE public.fantasy_lineups lineup SET
    status = CASE WHEN (
      SELECT count(*) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id
    ) = 5 AND lineup.captain_player_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id AND item.player_id = lineup.captain_player_id
    ) AND (
      SELECT count(*) FROM public.fantasy_lineup_players item
      JOIN public.players player ON player.id = item.player_id
      WHERE item.lineup_id = lineup.id AND (
        (player.member_category = 'player' AND player.is_selectable = true)
        OR (player.member_category = 'guest' AND EXISTS (
          SELECT 1 FROM public.round_players rp WHERE rp.round_id = p_round_id AND rp.player_id = player.id
        ))
      )
    ) = 5 THEN 'locked' ELSE 'missed' END,
    locked_at = now(), updated_at = now()
  WHERE lineup.fantasy_round_id = fantasy_round.id;
  UPDATE public.fantasy_rounds SET market_status = 'in_progress', locked_at = now() WHERE id = fantasy_round.id;
  INSERT INTO public.fantasy_audit_log (league_id, fantasy_round_id, user_id, action)
  VALUES (fantasy_season.league_id, fantasy_round.id, auth.uid(), 'market_locked');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_fantasy_market_on_match()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'live' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'live') THEN
    PERFORM public.lock_fantasy_market(NEW.round_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_lock_fantasy_market ON public.matches;
CREATE TRIGGER matches_lock_fantasy_market
BEFORE INSERT OR UPDATE OF status ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.lock_fantasy_market_on_match();

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fantasy_round public.fantasy_rounds%ROWTYPE;
  fantasy_season public.fantasy_seasons%ROWTYPE;
  current_round public.rounds%ROWTYPE;
  s JSONB;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem processar o Cartola.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));
  SELECT * INTO current_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  SELECT * INTO fantasy_round FROM public.fantasy_rounds WHERE round_id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN true; END IF;
  IF current_round.status <> 'finished' THEN RAISE EXCEPTION 'Finalize a rodada antes de processar o Cartola.'; END IF;
  IF fantasy_round.processed_at IS NOT NULL THEN RETURN true; END IF;
  IF fantasy_round.market_status = 'open' THEN PERFORM public.lock_fantasy_market(p_round_id); SELECT * INTO fantasy_round FROM public.fantasy_rounds WHERE id = fantasy_round.id; END IF;
  SELECT * INTO fantasy_season FROM public.fantasy_seasons WHERE id = fantasy_round.fantasy_season_id;
  s := fantasy_round.settings_snapshot;

  UPDATE public.fantasy_lineup_players item SET
    base_points = points.base_points,
    captain_bonus = CASE WHEN item.player_id = points.captain_player_id
      THEN points.base_points * ((s->>'captain_multiplier')::NUMERIC - 1) ELSE 0 END,
    total_points = points.base_points * CASE WHEN item.player_id = points.captain_player_id
      THEN (s->>'captain_multiplier')::NUMERIC ELSE 1 END
  FROM (
    SELECT lp.id item_id, lineup.captain_player_id,
      COALESCE(stats.goals, 0) * (s->>'goal_points')::NUMERIC
        + COALESCE(stats.assists, 0) * (s->>'assist_points')::NUMERIC
        + COALESCE(stats.wins, 0) * (s->>'win_points')::NUMERIC AS base_points
    FROM public.fantasy_lineup_players lp
    JOIN public.fantasy_lineups lineup ON lineup.id = lp.lineup_id
    LEFT JOIN public.player_round_stats stats ON stats.round_id = p_round_id AND stats.player_id = lp.player_id
    WHERE lineup.fantasy_round_id = fantasy_round.id AND lineup.status = 'locked'
  ) points
  WHERE item.id = points.item_id;

  WITH player_leaders AS (
    SELECT max(goals) max_goals, max(assists) max_assists FROM public.player_round_stats WHERE round_id = p_round_id
  ), team_wins AS (
    SELECT team_id, count(*) wins FROM (
      SELECT CASE WHEN score_a > score_b THEN team_a_id WHEN score_b > score_a THEN team_b_id END team_id
      FROM public.matches WHERE round_id = p_round_id AND status = 'finished'
    ) won WHERE team_id IS NOT NULL GROUP BY team_id
  ), team_leader AS (SELECT COALESCE(max(wins), 0) max_wins FROM team_wins)
  UPDATE public.fantasy_lineups lineup SET
    player_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
    prediction_points =
      CASE WHEN leaders.max_goals > 0 AND EXISTS (SELECT 1 FROM public.player_round_stats ps WHERE ps.round_id = p_round_id AND ps.player_id = lineup.top_scorer_player_id AND ps.goals = leaders.max_goals) THEN (s->>'top_scorer_prediction_points')::NUMERIC ELSE 0 END
      + CASE WHEN leaders.max_assists > 0 AND EXISTS (SELECT 1 FROM public.player_round_stats ps WHERE ps.round_id = p_round_id AND ps.player_id = lineup.top_assist_player_id AND ps.assists = leaders.max_assists) THEN (s->>'top_assist_prediction_points')::NUMERIC ELSE 0 END
      + CASE WHEN tl.max_wins > 0 AND EXISTS (SELECT 1 FROM team_wins tw WHERE tw.team_id = lineup.top_team_id AND tw.wins = tl.max_wins) THEN (s->>'top_team_prediction_points')::NUMERIC ELSE 0 END
  FROM player_leaders leaders, team_leader tl
  WHERE lineup.fantasy_round_id = fantasy_round.id AND lineup.status = 'locked';
  UPDATE public.fantasy_lineups SET total_points = player_points + prediction_points WHERE fantasy_round_id = fantasy_round.id AND status = 'locked';

  WITH features AS (
    SELECT price.player_id, price.current_price, COALESCE(stats.games, 0) games, COALESCE(stats.wins, 0) wins,
      COALESCE(stats.draws, 0) draws, COALESCE(stats.goals, 0) goals, COALESCE(stats.assists, 0) assists,
      COALESCE(stats.goals, 0) * (s->>'goal_points')::NUMERIC + COALESCE(stats.assists, 0) * (s->>'assist_points')::NUMERIC + COALESCE(stats.wins, 0) * (s->>'win_points')::NUMERIC round_points,
      COALESCE((SELECT avg(h.round_points) FROM (SELECT round_points FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = fantasy_round.fantasy_season_id AND h.player_id = price.player_id AND h.games > 0 ORDER BY h.created_at DESC LIMIT 3) h), 0) recent_avg,
      COALESCE((SELECT avg(h.round_points) FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = fantasy_round.fantasy_season_id AND h.player_id = price.player_id AND h.games > 0), 0) historical_avg,
      COALESCE((SELECT -stddev_pop(h.round_points) FROM (SELECT round_points FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = fantasy_round.fantasy_season_id AND h.player_id = price.player_id AND h.games > 0 ORDER BY h.created_at DESC LIMIT 5) h), 0) consistency,
      COALESCE((SELECT avg((h.wins * 3.0 + h.draws) / NULLIF(h.games * 3.0, 0)) FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = fantasy_round.fantasy_season_id AND h.games > 0), .5) league_rate
    FROM public.fantasy_player_prices price
    LEFT JOIN public.player_round_stats stats ON stats.round_id = p_round_id AND stats.player_id = price.player_id
    WHERE price.fantasy_season_id = fantasy_round.fantasy_season_id
  ), ranked AS (
    SELECT *, percent_rank() OVER (ORDER BY (.6 * round_points + .4 * recent_avg)) recent_pct,
      percent_rank() OVER (ORDER BY (((wins * 3 + draws) + league_rate * 3 * (s->>'smoothing_games')::NUMERIC) / NULLIF(games * 3 + (s->>'smoothing_games')::NUMERIC * 3, 0))) win_pct,
      percent_rank() OVER (ORDER BY historical_avg) historical_pct,
      percent_rank() OVER (ORDER BY consistency) consistency_pct
    FROM features WHERE games > 0
  ), scored AS (
    SELECT *, recent_pct * (s->>'recent_weight')::NUMERIC + win_pct * (s->>'win_rate_weight')::NUMERIC
      + historical_pct * (s->>'historical_weight')::NUMERIC + consistency_pct * (s->>'consistency_weight')::NUMERIC score
    FROM ranked
  ), raw AS (
    SELECT *, CASE WHEN score >= .5 THEN ((score - .5) / .5) * (s->>'max_price_increase')::NUMERIC
      ELSE -((.5 - score) / .5) * (s->>'max_price_decrease')::NUMERIC END raw_rate FROM scored
  ), normalized AS (
    SELECT *, greatest(-(s->>'max_price_decrease')::NUMERIC, least((s->>'max_price_increase')::NUMERIC, raw_rate - avg(raw_rate) OVER ())) variation_rate FROM raw
  )
  INSERT INTO public.fantasy_player_price_history (
    fantasy_season_id, fantasy_round_id, player_id, price_before, price_after, variation_rate,
    round_points, games, wins, draws, goals, assists, metrics
  ) SELECT fantasy_round.fantasy_season_id, fantasy_round.id, player_id, current_price,
      round(greatest((s->>'min_player_price')::NUMERIC, least((s->>'max_player_price')::NUMERIC, current_price * (1 + variation_rate))), 2),
      variation_rate, round_points, games, wins, draws, goals, assists, jsonb_build_object('score', score)
    FROM normalized
  ON CONFLICT (fantasy_round_id, player_id) DO NOTHING;

  UPDATE public.fantasy_player_prices price SET
    current_price = history.price_after, rounds_played = price.rounds_played + 1,
    total_points = price.total_points + history.round_points, updated_at = now()
  FROM public.fantasy_player_price_history history
  WHERE history.fantasy_round_id = fantasy_round.id AND history.player_id = price.player_id
    AND price.fantasy_season_id = fantasy_round.fantasy_season_id;

  UPDATE public.fantasy_lineup_players item SET price_after = COALESCE(
    (SELECT history.price_after FROM public.fantasy_player_price_history history
      WHERE history.fantasy_round_id = fantasy_round.id AND history.player_id = item.player_id),
    item.price_locked
  )
  WHERE EXISTS (SELECT 1 FROM public.fantasy_lineups lineup
    WHERE lineup.id = item.lineup_id AND lineup.fantasy_round_id = fantasy_round.id);
  UPDATE public.fantasy_lineups lineup SET budget_after = lineup.cash_remaining + COALESCE((SELECT sum(item.price_after) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0), status = 'scored'
  WHERE lineup.fantasy_round_id = fantasy_round.id AND lineup.status = 'locked';
  UPDATE public.fantasy_lineups lineup SET budget_after = lineup.budget_before WHERE lineup.fantasy_round_id = fantasy_round.id AND lineup.status = 'missed';

  WITH ranked AS (SELECT id, rank() OVER (ORDER BY total_points DESC, updated_at) position FROM public.fantasy_lineups WHERE fantasy_round_id = fantasy_round.id AND status = 'scored')
  UPDATE public.fantasy_lineups lineup SET round_position = ranked.position FROM ranked WHERE lineup.id = ranked.id;
  UPDATE public.fantasy_accounts account SET
    current_budget = COALESCE(latest.budget_after, account.current_budget),
    total_points = totals.total_points, rounds_played = totals.rounds_played,
    best_round_points = totals.best_round, updated_at = now()
  FROM (
    SELECT user_id, sum(total_points) total_points, count(*) rounds_played, max(total_points) best_round
    FROM public.fantasy_lineups WHERE status = 'scored' AND fantasy_round_id IN (SELECT id FROM public.fantasy_rounds WHERE fantasy_season_id = fantasy_round.fantasy_season_id) GROUP BY user_id
  ) totals
  LEFT JOIN public.fantasy_lineups latest ON latest.id = (
    SELECT l.id FROM public.fantasy_lineups l JOIN public.fantasy_rounds fr ON fr.id = l.fantasy_round_id
    JOIN public.rounds r ON r.id = fr.round_id WHERE fr.fantasy_season_id = fantasy_round.fantasy_season_id AND l.user_id = totals.user_id AND l.budget_after IS NOT NULL ORDER BY r.date DESC, r.number DESC LIMIT 1
  ) WHERE account.fantasy_season_id = fantasy_round.fantasy_season_id AND account.user_id = totals.user_id;

  UPDATE public.fantasy_rounds SET market_status = 'finished', processed_at = now() WHERE id = fantasy_round.id;
  INSERT INTO public.fantasy_audit_log (league_id, fantasy_round_id, user_id, action) VALUES (fantasy_season.league_id, fantasy_round.id, auth.uid(), 'round_processed');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reprocess_fantasy_from_round(p_round_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.fantasy_rounds%ROWTYPE; target_round public.rounds%ROWTYPE; item RECORD; settings public.fantasy_settings%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem reprocessar o Cartola.'; END IF;
  SELECT * INTO target FROM public.fantasy_rounds WHERE round_id = p_round_id;
  SELECT * INTO target_round FROM public.rounds WHERE id = p_round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada Fantasy nao encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id = fr.round_id WHERE fr.fantasy_season_id = target.fantasy_season_id AND r.date >= target_round.date AND fr.market_status = 'in_progress') THEN
    RAISE EXCEPTION 'Nao e possivel reprocessar enquanto existe rodada posterior em andamento.';
  END IF;
  SELECT fs.* INTO settings FROM public.fantasy_settings fs JOIN public.fantasy_seasons season ON season.league_id = fs.league_id WHERE season.id = target.fantasy_season_id;
  DELETE FROM public.fantasy_player_price_history history USING public.fantasy_rounds fr, public.rounds r
  WHERE history.fantasy_round_id = fr.id AND fr.round_id = r.id AND fr.fantasy_season_id = target.fantasy_season_id AND (r.date, r.number) >= (target_round.date, target_round.number);
  UPDATE public.fantasy_player_prices price SET current_price = COALESCE((SELECT h.price_after FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = target.fantasy_season_id AND h.player_id = price.player_id ORDER BY h.created_at DESC LIMIT 1), (SELECT initial_player_price FROM public.fantasy_seasons WHERE id = target.fantasy_season_id)),
    rounds_played = (SELECT count(*) FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = target.fantasy_season_id AND h.player_id = price.player_id AND h.games > 0),
    total_points = COALESCE((SELECT sum(h.round_points) FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = target.fantasy_season_id AND h.player_id = price.player_id), 0)
  WHERE price.fantasy_season_id = target.fantasy_season_id;
  UPDATE public.fantasy_lineup_players lp SET base_points = 0, captain_bonus = 0, total_points = 0, price_after = NULL
  FROM public.fantasy_lineups l, public.fantasy_rounds fr, public.rounds r WHERE lp.lineup_id = l.id AND l.fantasy_round_id = fr.id AND fr.round_id = r.id AND fr.fantasy_season_id = target.fantasy_season_id AND (r.date, r.number) >= (target_round.date, target_round.number);
  UPDATE public.fantasy_lineups l SET player_points = 0, prediction_points = 0, total_points = 0, budget_after = NULL, round_position = NULL,
    status = CASE WHEN status IN ('scored','locked') THEN 'locked' ELSE status END
  FROM public.fantasy_rounds fr, public.rounds r WHERE l.fantasy_round_id = fr.id AND fr.round_id = r.id AND fr.fantasy_season_id = target.fantasy_season_id AND (r.date, r.number) >= (target_round.date, target_round.number);
  UPDATE public.fantasy_rounds fr SET processed_at = NULL, market_status = CASE WHEN r.status = 'finished' THEN 'in_progress' WHEN EXISTS (SELECT 1 FROM public.matches m WHERE m.round_id = r.id AND m.started_at IS NOT NULL) THEN 'in_progress' ELSE 'open' END
  FROM public.rounds r WHERE fr.round_id = r.id AND fr.fantasy_season_id = target.fantasy_season_id AND (r.date, r.number) >= (target_round.date, target_round.number);
  FOR item IN SELECT r.id FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id = fr.round_id WHERE fr.fantasy_season_id = target.fantasy_season_id AND r.status = 'finished' AND (r.date, r.number) >= (target_round.date, target_round.number) ORDER BY r.date, r.number LOOP
    PERFORM public.process_fantasy_round(item.id);
  END LOOP;
  UPDATE public.fantasy_lineup_players lp SET price_locked = price.current_price
  FROM public.fantasy_lineups lineup, public.fantasy_rounds fr, public.fantasy_player_prices price
  WHERE lp.lineup_id = lineup.id AND lineup.fantasy_round_id = fr.id
    AND fr.fantasy_season_id = target.fantasy_season_id AND fr.market_status = 'open'
    AND price.fantasy_season_id = target.fantasy_season_id AND price.player_id = lp.player_id;
  UPDATE public.fantasy_lineups lineup SET
    budget_before = account.current_budget,
    lineup_cost = COALESCE((SELECT sum(lp.price_locked) FROM public.fantasy_lineup_players lp WHERE lp.lineup_id = lineup.id), 0),
    cash_remaining = account.current_budget - COALESCE((SELECT sum(lp.price_locked) FROM public.fantasy_lineup_players lp WHERE lp.lineup_id = lineup.id), 0),
    status = CASE WHEN COALESCE((SELECT sum(lp.price_locked) FROM public.fantasy_lineup_players lp WHERE lp.lineup_id = lineup.id), 0) > account.current_budget THEN 'needs_review' ELSE 'draft' END,
    updated_at = now()
  FROM public.fantasy_rounds fr, public.fantasy_accounts account
  WHERE lineup.fantasy_round_id = fr.id AND fr.fantasy_season_id = target.fantasy_season_id
    AND fr.market_status = 'open' AND account.fantasy_season_id = target.fantasy_season_id AND account.user_id = lineup.user_id;
  INSERT INTO public.fantasy_audit_log (league_id, fantasy_round_id, user_id, action) SELECT league_id, target.id, auth.uid(), 'rounds_reprocessed' FROM public.fantasy_seasons WHERE id = target.fantasy_season_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_fantasy_settings(p_settings JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE active_league_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem configurar o Cartola.'; END IF;
  SELECT id INTO active_league_id FROM public.leagues WHERE is_active = true ORDER BY created_at LIMIT 1;
  INSERT INTO public.fantasy_settings (league_id) VALUES (active_league_id) ON CONFLICT (league_id) DO NOTHING;
  UPDATE public.fantasy_settings SET
    currency_name = COALESCE(NULLIF(trim(p_settings->>'currency_name'), ''), currency_name),
    initial_budget = COALESCE((p_settings->>'initial_budget')::NUMERIC, initial_budget),
    initial_player_price = COALESCE((p_settings->>'initial_player_price')::NUMERIC, initial_player_price),
    goal_points = COALESCE((p_settings->>'goal_points')::NUMERIC, goal_points), assist_points = COALESCE((p_settings->>'assist_points')::NUMERIC, assist_points),
    win_points = COALESCE((p_settings->>'win_points')::NUMERIC, win_points), captain_multiplier = COALESCE((p_settings->>'captain_multiplier')::NUMERIC, captain_multiplier),
    top_scorer_prediction_points = COALESCE((p_settings->>'top_scorer_prediction_points')::NUMERIC, top_scorer_prediction_points),
    top_assist_prediction_points = COALESCE((p_settings->>'top_assist_prediction_points')::NUMERIC, top_assist_prediction_points),
    top_team_prediction_points = COALESCE((p_settings->>'top_team_prediction_points')::NUMERIC, top_team_prediction_points),
    min_player_price = COALESCE((p_settings->>'min_player_price')::NUMERIC, min_player_price), max_player_price = COALESCE((p_settings->>'max_player_price')::NUMERIC, max_player_price),
    recent_weight = COALESCE((p_settings->>'recent_weight')::NUMERIC, recent_weight), win_rate_weight = COALESCE((p_settings->>'win_rate_weight')::NUMERIC, win_rate_weight),
    historical_weight = COALESCE((p_settings->>'historical_weight')::NUMERIC, historical_weight), consistency_weight = COALESCE((p_settings->>'consistency_weight')::NUMERIC, consistency_weight),
    smoothing_games = COALESCE((p_settings->>'smoothing_games')::INTEGER, smoothing_games), max_price_increase = COALESCE((p_settings->>'max_price_increase')::NUMERIC, max_price_increase),
    max_price_decrease = COALESCE((p_settings->>'max_price_decrease')::NUMERIC, max_price_decrease), updated_at = now()
  WHERE fantasy_settings.league_id = active_league_id;
  INSERT INTO public.fantasy_audit_log (league_id, user_id, action, payload) VALUES (active_league_id, auth.uid(), 'settings_updated', p_settings);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_locked_fantasy_round_delete()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fantasy_rounds fr WHERE fr.round_id = OLD.id AND (fr.market_status <> 'open' OR fr.locked_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Esta rodada possui um Cartola bloqueado ou processado e nao pode ser excluida.';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS rounds_prevent_locked_fantasy_delete ON public.rounds;
CREATE TRIGGER rounds_prevent_locked_fantasy_delete BEFORE DELETE ON public.rounds FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_fantasy_round_delete();

ALTER TABLE public.fantasy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_lineup_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_player_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_player_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY fantasy_settings_read ON public.fantasy_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY fantasy_seasons_read ON public.fantasy_seasons FOR SELECT TO authenticated USING (true);
CREATE POLICY fantasy_accounts_read ON public.fantasy_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY fantasy_rounds_read ON public.fantasy_rounds FOR SELECT TO authenticated USING (true);
CREATE POLICY fantasy_lineups_read ON public.fantasy_lineups FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.is_app_admin() OR EXISTS (SELECT 1 FROM public.fantasy_rounds fr WHERE fr.id = fantasy_round_id AND fr.market_status <> 'open')
);
CREATE POLICY fantasy_lineup_players_read ON public.fantasy_lineup_players FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.fantasy_lineups l JOIN public.fantasy_rounds fr ON fr.id = l.fantasy_round_id WHERE l.id = lineup_id AND (l.user_id = auth.uid() OR public.is_app_admin() OR fr.market_status <> 'open'))
);
CREATE POLICY fantasy_prices_read ON public.fantasy_player_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY fantasy_price_history_read ON public.fantasy_player_price_history FOR SELECT TO authenticated USING (true);
CREATE POLICY fantasy_audit_admin_read ON public.fantasy_audit_log FOR SELECT TO authenticated USING (public.is_app_admin());

GRANT SELECT ON public.fantasy_settings, public.fantasy_seasons, public.fantasy_accounts, public.fantasy_rounds,
  public.fantasy_lineups, public.fantasy_lineup_players, public.fantasy_player_prices, public.fantasy_player_price_history TO authenticated;
GRANT SELECT ON public.fantasy_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(UUID), public.reprocess_fantasy_from_round(UUID), public.update_fantasy_settings(JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.ensure_fantasy_round(UUID), public.lock_fantasy_market(UUID) FROM PUBLIC, anon;

-- Inicializa somente rodadas oficiais ainda nao iniciadas; nao cria historico retroativo.
SELECT public.ensure_fantasy_round(round.id)
FROM public.rounds round
WHERE round.round_type = 'official' AND round.status <> 'finished'
  AND NOT EXISTS (SELECT 1 FROM public.matches match WHERE match.round_id = round.id AND match.started_at IS NOT NULL);
