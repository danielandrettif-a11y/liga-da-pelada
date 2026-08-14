-- Cartola V1: desafios por rodada, snapshots completos e mercado bloqueado
-- exclusivamente pelo início real da primeira partida.

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS king_of_wins_points NUMERIC(8,2) NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS mvp_prediction_points NUMERIC(8,2) NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS bet_of_round_points NUMERIC(8,2) NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS bet_rank_band_1 INTEGER NOT NULL DEFAULT 5 CHECK (bet_rank_band_1 > 0),
  ADD COLUMN IF NOT EXISTS bet_rank_band_2 INTEGER NOT NULL DEFAULT 4 CHECK (bet_rank_band_2 > 0),
  ADD COLUMN IF NOT EXISTS bet_rank_band_3 INTEGER NOT NULL DEFAULT 3 CHECK (bet_rank_band_3 > 0),
  ADD COLUMN IF NOT EXISTS bet_rank_band_4 INTEGER NOT NULL DEFAULT 2 CHECK (bet_rank_band_4 > 0),
  ADD COLUMN IF NOT EXISTS score_goal_reward_band_1 NUMERIC(8,2) NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS score_goal_reward_band_2 NUMERIC(8,2) NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS score_goal_reward_band_3 NUMERIC(8,2) NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS score_goal_reward_band_4 NUMERIC(8,2) NOT NULL DEFAULT 3;

ALTER TABLE public.fantasy_rounds
  ADD COLUMN IF NOT EXISTS challenge_type TEXT CHECK (challenge_type IN (
    'REI_DAS_VITORIAS', 'MITO_DA_RODADA', 'APOSTA_DA_RODADA', 'VAI_GUARDAR'
  )),
  ADD COLUMN IF NOT EXISTS rules_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.fantasy_test_sessions
  ADD COLUMN IF NOT EXISTS challenge_type TEXT CHECK (challenge_type IN (
    'REI_DAS_VITORIAS', 'MITO_DA_RODADA', 'APOSTA_DA_RODADA', 'VAI_GUARDAR'
  )),
  ADD COLUMN IF NOT EXISTS rules_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.fantasy_lineups
  ADD COLUMN IF NOT EXISTS challenge_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS challenge_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS predictions_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.fantasy_test_lineups
  ADD COLUMN IF NOT EXISTS challenge_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS challenge_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS predictions_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.fantasy_lineup_players
  ADD COLUMN IF NOT EXISTS player_name_locked TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url_locked TEXT;

ALTER TABLE public.fantasy_test_lineup_players
  ADD COLUMN IF NOT EXISTS player_name_locked TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url_locked TEXT;

UPDATE public.fantasy_lineup_players item
SET player_name_locked = player.name,
    avatar_url_locked = player.avatar_url
FROM public.players player
WHERE player.id = item.player_id AND item.player_name_locked IS NULL;

UPDATE public.fantasy_test_lineup_players item
SET player_name_locked = player.name,
    avatar_url_locked = player.avatar_url
FROM public.players player
WHERE player.id = item.player_id AND item.player_name_locked IS NULL;

CREATE OR REPLACE FUNCTION public.pick_fantasy_challenge_type()
RETURNS TEXT
LANGUAGE sql
VOLATILE
AS $$
  SELECT (ARRAY[
    'REI_DAS_VITORIAS', 'MITO_DA_RODADA',
    'APOSTA_DA_RODADA', 'VAI_GUARDAR'
  ])[1 + floor(random() * 4)::INTEGER];
$$;

CREATE OR REPLACE FUNCTION public.prepare_fantasy_v1_round()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.challenge_type IS NULL THEN
    NEW.challenge_type := public.pick_fantasy_challenge_type();
  END IF;
  IF NEW.rules_version = 0 THEN NEW.rules_version := 1; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fantasy_rounds_prepare_v1 ON public.fantasy_rounds;
CREATE TRIGGER fantasy_rounds_prepare_v1
BEFORE INSERT ON public.fantasy_rounds
FOR EACH ROW EXECUTE FUNCTION public.prepare_fantasy_v1_round();

DROP TRIGGER IF EXISTS fantasy_test_sessions_prepare_v1 ON public.fantasy_test_sessions;
CREATE TRIGGER fantasy_test_sessions_prepare_v1
BEFORE INSERT ON public.fantasy_test_sessions
FOR EACH ROW EXECUTE FUNCTION public.prepare_fantasy_v1_round();

-- A migration 038 desativava esta cópia. Na V1 o portfólio permanente volta a
-- preparar o rascunho da nova rodada sem tocar em escalações históricas.
DROP TRIGGER IF EXISTS fantasy_rounds_seed_portfolios ON public.fantasy_rounds;
CREATE TRIGGER fantasy_rounds_seed_portfolios
AFTER INSERT ON public.fantasy_rounds
FOR EACH ROW EXECUTE FUNCTION public.seed_new_fantasy_round_from_portfolios();

CREATE OR REPLACE FUNCTION public.clean_seeded_fantasy_guests()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.fantasy_lineup_players item
  USING public.fantasy_lineups lineup, public.players player
  WHERE lineup.fantasy_round_id = NEW.id
    AND item.lineup_id = lineup.id
    AND player.id = item.player_id
    AND player.member_category = 'guest'
    AND NOT EXISTS (
      SELECT 1 FROM public.round_players participant
      WHERE participant.round_id = NEW.round_id AND participant.player_id = item.player_id
    );

  UPDATE public.fantasy_lineups lineup SET
    captain_player_id = CASE WHEN EXISTS (
      SELECT 1 FROM public.fantasy_lineup_players item
      WHERE item.lineup_id = lineup.id AND item.player_id = lineup.captain_player_id
    ) THEN lineup.captain_player_id ELSE NULL END,
    lineup_cost = COALESCE((SELECT sum(item.price_locked) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
    cash_remaining = lineup.budget_before - COALESCE((SELECT sum(item.price_locked) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
    updated_at = now()
  WHERE lineup.fantasy_round_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_fantasy_rounds_clean_seeded_guests ON public.fantasy_rounds;
CREATE TRIGGER zz_fantasy_rounds_clean_seeded_guests
AFTER INSERT ON public.fantasy_rounds
FOR EACH ROW EXECUTE FUNCTION public.clean_seeded_fantasy_guests();

-- Somente mercados ainda abertos passam a usar as regras V1. Históricos e rodadas
-- em andamento continuam com a versão com que foram iniciados.
UPDATE public.fantasy_rounds fantasy_round
SET challenge_type = COALESCE(fantasy_round.challenge_type, public.pick_fantasy_challenge_type()),
    rules_version = 1,
    settings_snapshot = fantasy_round.settings_snapshot || (
      SELECT to_jsonb(settings) - 'league_id' - 'updated_at'
      FROM public.fantasy_settings settings
      JOIN public.fantasy_seasons season ON season.league_id = settings.league_id
      WHERE season.id = fantasy_round.fantasy_season_id
    )
WHERE fantasy_round.market_status = 'open';

UPDATE public.fantasy_test_sessions test_session
SET challenge_type = COALESCE(test_session.challenge_type, public.pick_fantasy_challenge_type()),
    rules_version = 1,
    settings_snapshot = test_session.settings_snapshot || (
      SELECT to_jsonb(settings) - 'league_id' - 'updated_at'
      FROM public.fantasy_settings settings
      WHERE settings.league_id = test_session.league_id
    )
WHERE test_session.status = 'open';

UPDATE public.fantasy_lineups lineup
SET predictions_snapshot = jsonb_build_object(
  'topScorer', CASE WHEN lineup.top_scorer_player_id IS NULL THEN NULL ELSE jsonb_build_object(
    'playerId', lineup.top_scorer_player_id,
    'playerName', (SELECT name FROM public.players WHERE id = lineup.top_scorer_player_id),
    'reward', (fantasy_round.settings_snapshot->>'top_scorer_prediction_points')::NUMERIC
  ) END,
  'topAssist', CASE WHEN lineup.top_assist_player_id IS NULL THEN NULL ELSE jsonb_build_object(
    'playerId', lineup.top_assist_player_id,
    'playerName', (SELECT name FROM public.players WHERE id = lineup.top_assist_player_id),
    'reward', (fantasy_round.settings_snapshot->>'top_assist_prediction_points')::NUMERIC
  ) END,
  'challenge', '{}'::JSONB
)
FROM public.fantasy_rounds fantasy_round
WHERE lineup.fantasy_round_id = fantasy_round.id AND fantasy_round.market_status = 'open';

UPDATE public.fantasy_test_lineups lineup
SET predictions_snapshot = jsonb_build_object(
  'topScorer', CASE WHEN lineup.top_scorer_player_id IS NULL THEN NULL ELSE jsonb_build_object(
    'playerId', lineup.top_scorer_player_id,
    'playerName', (SELECT name FROM public.players WHERE id = lineup.top_scorer_player_id),
    'reward', (test_session.settings_snapshot->>'top_scorer_prediction_points')::NUMERIC
  ) END,
  'topAssist', CASE WHEN lineup.top_assist_player_id IS NULL THEN NULL ELSE jsonb_build_object(
    'playerId', lineup.top_assist_player_id,
    'playerName', (SELECT name FROM public.players WHERE id = lineup.top_assist_player_id),
    'reward', (test_session.settings_snapshot->>'top_assist_prediction_points')::NUMERIC
  ) END,
  'challenge', '{}'::JSONB
)
FROM public.fantasy_test_sessions test_session
WHERE lineup.test_session_id = test_session.id AND test_session.status = 'open';

SELECT public.seed_fantasy_round_from_portfolios(fantasy_round.id)
FROM public.fantasy_rounds fantasy_round
WHERE fantasy_round.market_status = 'open';

DELETE FROM public.fantasy_lineup_players item
USING public.fantasy_lineups lineup, public.fantasy_rounds fantasy_round, public.players player
WHERE lineup.id = item.lineup_id
  AND fantasy_round.id = lineup.fantasy_round_id
  AND fantasy_round.market_status = 'open'
  AND player.id = item.player_id
  AND player.member_category = 'guest'
  AND NOT EXISTS (
    SELECT 1 FROM public.round_players participant
    WHERE participant.round_id = fantasy_round.round_id AND participant.player_id = item.player_id
  );

UPDATE public.fantasy_lineups lineup SET
  captain_player_id = CASE WHEN EXISTS (
    SELECT 1 FROM public.fantasy_lineup_players item
    WHERE item.lineup_id = lineup.id AND item.player_id = lineup.captain_player_id
  ) THEN lineup.captain_player_id ELSE NULL END,
  lineup_cost = COALESCE((SELECT sum(item.price_locked) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
  cash_remaining = lineup.budget_before - COALESCE((SELECT sum(item.price_locked) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
  updated_at = now()
FROM public.fantasy_rounds fantasy_round
WHERE lineup.fantasy_round_id = fantasy_round.id AND fantasy_round.market_status = 'open';

CREATE OR REPLACE FUNCTION public.build_fantasy_challenge_snapshot(
  p_round_id UUID,
  p_fantasy_season_id UUID,
  p_challenge_type TEXT,
  p_player_id UUID,
  p_settings JSONB,
  p_is_test BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_player public.players%ROWTYPE;
  selected_price NUMERIC(10,2);
  eligible_count INTEGER;
  cheaper_count INTEGER;
  price_percentile NUMERIC;
  price_band INTEGER;
  required_rank INTEGER;
  promised_reward NUMERIC(8,2);
BEGIN
  IF p_player_id IS NULL THEN RETURN '{}'::JSONB; END IF;

  SELECT * INTO selected_player FROM public.players player WHERE player.id = p_player_id;
  IF NOT FOUND OR NOT (
    (p_is_test AND EXISTS (
      SELECT 1 FROM public.round_players participant
      WHERE participant.round_id = p_round_id AND participant.player_id = p_player_id
    )) OR
    (NOT p_is_test AND (
      (selected_player.member_category = 'player' AND selected_player.is_selectable = true)
      OR (selected_player.member_category = 'guest' AND EXISTS (
        SELECT 1 FROM public.round_players participant
        WHERE participant.round_id = p_round_id AND participant.player_id = p_player_id
      ))
    ))
  ) THEN
    RAISE EXCEPTION 'O jogador escolhido no desafio não está elegível nesta rodada.';
  END IF;

  IF p_is_test THEN
    selected_price := (p_settings->>'initial_player_price')::NUMERIC;
    SELECT count(*) INTO eligible_count
    FROM public.round_players participant WHERE participant.round_id = p_round_id;
    cheaper_count := 0;
  ELSE
    SELECT COALESCE(price.current_price, (p_settings->>'initial_player_price')::NUMERIC)
    INTO selected_price
    FROM public.players player
    LEFT JOIN public.fantasy_player_prices price
      ON price.fantasy_season_id = p_fantasy_season_id AND price.player_id = player.id
    WHERE player.id = p_player_id;

    WITH eligible AS (
      SELECT player.id,
        COALESCE(price.current_price, (p_settings->>'initial_player_price')::NUMERIC) AS price
      FROM public.players player
      LEFT JOIN public.fantasy_player_prices price
        ON price.fantasy_season_id = p_fantasy_season_id AND price.player_id = player.id
      WHERE (player.member_category = 'player' AND player.is_selectable = true)
        OR (player.member_category = 'guest' AND EXISTS (
          SELECT 1 FROM public.round_players participant
          WHERE participant.round_id = p_round_id AND participant.player_id = player.id
        ))
    )
    SELECT count(*), count(*) FILTER (WHERE eligible.price < selected_price)
    INTO eligible_count, cheaper_count FROM eligible;
  END IF;

  price_percentile := cheaper_count::NUMERIC / greatest(eligible_count - 1, 1);
  price_band := CASE
    WHEN price_percentile < .25 THEN 1
    WHEN price_percentile < .5 THEN 2
    WHEN price_percentile < .75 THEN 3
    ELSE 4
  END;

  required_rank := CASE price_band
    WHEN 1 THEN (p_settings->>'bet_rank_band_1')::INTEGER
    WHEN 2 THEN (p_settings->>'bet_rank_band_2')::INTEGER
    WHEN 3 THEN (p_settings->>'bet_rank_band_3')::INTEGER
    ELSE (p_settings->>'bet_rank_band_4')::INTEGER
  END;
  promised_reward := CASE p_challenge_type
    WHEN 'REI_DAS_VITORIAS' THEN (p_settings->>'king_of_wins_points')::NUMERIC
    WHEN 'MITO_DA_RODADA' THEN (p_settings->>'mvp_prediction_points')::NUMERIC
    WHEN 'APOSTA_DA_RODADA' THEN (p_settings->>'bet_of_round_points')::NUMERIC
    WHEN 'VAI_GUARDAR' THEN CASE price_band
      WHEN 1 THEN (p_settings->>'score_goal_reward_band_1')::NUMERIC
      WHEN 2 THEN (p_settings->>'score_goal_reward_band_2')::NUMERIC
      WHEN 3 THEN (p_settings->>'score_goal_reward_band_3')::NUMERIC
      ELSE (p_settings->>'score_goal_reward_band_4')::NUMERIC
    END
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'type', p_challenge_type,
    'playerId', selected_player.id,
    'playerName', selected_player.name,
    'playerPrice', selected_price,
    'priceBand', price_band,
    'requiredRank', CASE WHEN p_challenge_type = 'APOSTA_DA_RODADA' THEN required_rank ELSE NULL END,
    'reward', promised_reward
  );
END;
$$;

DROP FUNCTION IF EXISTS public.save_fantasy_prelist_lineup(UUID, UUID[], UUID, UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID);

CREATE FUNCTION public.save_fantasy_lineup(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID DEFAULT NULL,
  p_top_scorer_player_id UUID DEFAULT NULL,
  p_top_assist_player_id UUID DEFAULT NULL,
  p_challenge_player_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  target_round public.rounds%ROWTYPE;
  target_fantasy_round public.fantasy_rounds%ROWTYPE;
  target_season public.fantasy_seasons%ROWTYPE;
  target_account public.fantasy_accounts%ROWTYPE;
  settings_snapshot JSONB;
  saved_lineup_id UUID;
  unique_count INTEGER;
  valid_count INTEGER;
  lineup_cost NUMERIC(10,2);
  challenge_snapshot JSONB;
  predictions_snapshot JSONB;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para escalar.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));

  SELECT * INTO target_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR target_round.round_type <> 'official' OR target_round.status = 'finished' THEN
    RAISE EXCEPTION 'Rodada oficial aberta não encontrada.';
  END IF;
  PERFORM public.ensure_fantasy_round(p_round_id);
  SELECT * INTO target_fantasy_round FROM public.fantasy_rounds WHERE round_id = p_round_id FOR UPDATE;
  IF target_fantasy_round.market_status <> 'open' OR EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = p_round_id
      AND (match_item.started_at IS NOT NULL OR match_item.status = 'live')
  ) THEN RAISE EXCEPTION 'O mercado desta rodada está fechado.'; END IF;

  SELECT * INTO target_season FROM public.fantasy_seasons WHERE id = target_fantasy_round.fantasy_season_id;
  settings_snapshot := target_fantasy_round.settings_snapshot;

  SELECT count(DISTINCT selected.id), count(*) INTO unique_count, valid_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id);
  IF unique_count <> valid_count THEN RAISE EXCEPTION 'Um jogador não pode aparecer duas vezes.'; END IF;
  IF unique_count > 5 THEN RAISE EXCEPTION 'A escalação aceita no máximo 5 jogadores.'; END IF;

  SELECT count(*) INTO valid_count FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])) AND (
    (player.member_category = 'player' AND player.is_selectable = true)
    OR (player.member_category = 'guest' AND EXISTS (
      SELECT 1 FROM public.round_players participant
      WHERE participant.round_id = p_round_id AND participant.player_id = player.id
    ))
  );
  IF valid_count <> unique_count THEN RAISE EXCEPTION 'A escalação contém um jogador inelegível.'; END IF;
  IF p_captain_player_id IS NOT NULL AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))) THEN
    RAISE EXCEPTION 'O capitão precisa estar entre os escalados.';
  END IF;

  IF p_top_scorer_player_id IS NOT NULL THEN
    PERFORM public.build_fantasy_challenge_snapshot(p_round_id, target_season.id, 'VAI_GUARDAR', p_top_scorer_player_id, settings_snapshot, false);
  END IF;
  IF p_top_assist_player_id IS NOT NULL THEN
    PERFORM public.build_fantasy_challenge_snapshot(p_round_id, target_season.id, 'VAI_GUARDAR', p_top_assist_player_id, settings_snapshot, false);
  END IF;
  challenge_snapshot := public.build_fantasy_challenge_snapshot(
    p_round_id, target_season.id, target_fantasy_round.challenge_type,
    p_challenge_player_id, settings_snapshot, false
  );
  predictions_snapshot := jsonb_build_object(
    'topScorer', CASE WHEN p_top_scorer_player_id IS NULL THEN NULL ELSE jsonb_build_object(
      'playerId', p_top_scorer_player_id,
      'playerName', (SELECT name FROM public.players WHERE id = p_top_scorer_player_id),
      'reward', (settings_snapshot->>'top_scorer_prediction_points')::NUMERIC
    ) END,
    'topAssist', CASE WHEN p_top_assist_player_id IS NULL THEN NULL ELSE jsonb_build_object(
      'playerId', p_top_assist_player_id,
      'playerName', (SELECT name FROM public.players WHERE id = p_top_assist_player_id),
      'reward', (settings_snapshot->>'top_assist_prediction_points')::NUMERIC
    ) END,
    'challenge', challenge_snapshot
  );

  INSERT INTO public.fantasy_accounts (fantasy_season_id, user_id, current_budget)
  VALUES (target_season.id, current_user_id, target_season.initial_budget)
  ON CONFLICT (fantasy_season_id, user_id) DO NOTHING;
  SELECT * INTO target_account FROM public.fantasy_accounts
  WHERE fantasy_season_id = target_season.id AND user_id = current_user_id FOR UPDATE;

  INSERT INTO public.fantasy_player_prices (fantasy_season_id, player_id, current_price)
  SELECT target_season.id, player.id, target_season.initial_player_price
  FROM public.players player WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
  ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;
  SELECT COALESCE(sum(price.current_price), 0) INTO lineup_cost
  FROM public.fantasy_player_prices price
  WHERE price.fantasy_season_id = target_season.id
    AND price.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]));
  IF lineup_cost > target_account.current_budget THEN RAISE EXCEPTION 'A escalação ultrapassa o patrimônio disponível.'; END IF;

  INSERT INTO public.fantasy_lineups (
    fantasy_round_id, user_id, status, captain_player_id,
    top_scorer_player_id, top_assist_player_id, top_team_id,
    challenge_player_id, challenge_snapshot, predictions_snapshot,
    budget_before, lineup_cost, cash_remaining, updated_at
  ) VALUES (
    target_fantasy_round.id, current_user_id, 'draft', p_captain_player_id,
    p_top_scorer_player_id, p_top_assist_player_id, NULL,
    p_challenge_player_id, challenge_snapshot, predictions_snapshot,
    target_account.current_budget, lineup_cost, target_account.current_budget - lineup_cost, now()
  ) ON CONFLICT (fantasy_round_id, user_id) DO UPDATE SET
    status = 'draft', captain_player_id = EXCLUDED.captain_player_id,
    top_scorer_player_id = EXCLUDED.top_scorer_player_id,
    top_assist_player_id = EXCLUDED.top_assist_player_id, top_team_id = NULL,
    challenge_player_id = EXCLUDED.challenge_player_id,
    challenge_snapshot = EXCLUDED.challenge_snapshot,
    predictions_snapshot = EXCLUDED.predictions_snapshot,
    score_breakdown = '{}'::JSONB,
    budget_before = EXCLUDED.budget_before, lineup_cost = EXCLUDED.lineup_cost,
    cash_remaining = EXCLUDED.cash_remaining, updated_at = now()
  RETURNING id INTO saved_lineup_id;

  DELETE FROM public.fantasy_lineup_players WHERE lineup_id = saved_lineup_id;
  INSERT INTO public.fantasy_lineup_players (
    lineup_id, player_id, price_locked, player_name_locked, avatar_url_locked
  )
  SELECT saved_lineup_id, selected.id, price.current_price, player.name, player.avatar_url
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id)
  JOIN public.players player ON player.id = selected.id
  JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = target_season.id AND price.player_id = selected.id;

  INSERT INTO public.fantasy_audit_log (league_id, fantasy_round_id, user_id, action, payload)
  VALUES (target_season.league_id, target_fantasy_round.id, current_user_id, 'lineup_saved_v1',
    jsonb_build_object('players', unique_count, 'cost', lineup_cost, 'challenge', challenge_snapshot));
  RETURN saved_lineup_id;
END;
$$;

CREATE FUNCTION public.save_fantasy_prelist_lineup(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID DEFAULT NULL,
  p_top_scorer_player_id UUID DEFAULT NULL,
  p_top_assist_player_id UUID DEFAULT NULL,
  p_challenge_player_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.save_fantasy_lineup(
    p_round_id, p_player_ids, p_captain_player_id,
    p_top_scorer_player_id, p_top_assist_player_id, p_challenge_player_id
  );
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_fantasy_prelist_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_fantasy_prelist_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID);
CREATE FUNCTION public.save_fantasy_test_lineup(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID DEFAULT NULL,
  p_top_scorer_player_id UUID DEFAULT NULL,
  p_top_assist_player_id UUID DEFAULT NULL,
  p_challenge_player_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  test_session public.fantasy_test_sessions%ROWTYPE;
  saved_lineup_id UUID;
  unique_count INTEGER;
  valid_count INTEGER;
  player_price NUMERIC(10,2);
  available_budget NUMERIC(10,2);
  lineup_cost NUMERIC(10,2);
  challenge_snapshot JSONB;
  predictions_snapshot JSONB;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para escalar.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));
  SELECT * INTO test_session FROM public.fantasy_test_sessions WHERE round_id = p_round_id FOR UPDATE;
  IF NOT FOUND OR test_session.status <> 'open' THEN RAISE EXCEPTION 'O mercado de teste está fechado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND (started_at IS NOT NULL OR status = 'live')) THEN
    RAISE EXCEPTION 'O mercado de teste está fechado.';
  END IF;

  SELECT count(DISTINCT selected.id), count(*) INTO unique_count, valid_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id);
  IF unique_count <> valid_count THEN RAISE EXCEPTION 'Um jogador não pode aparecer duas vezes.'; END IF;
  IF unique_count > 5 THEN RAISE EXCEPTION 'A escalação aceita no máximo 5 jogadores.'; END IF;
  SELECT count(*) INTO valid_count FROM public.round_players participant
  WHERE participant.round_id = p_round_id AND participant.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]));
  IF valid_count <> unique_count THEN RAISE EXCEPTION 'No teste, use apenas jogadores convocados para o amistoso.'; END IF;
  IF p_captain_player_id IS NOT NULL AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))) THEN
    RAISE EXCEPTION 'O capitão precisa estar entre os escalados.';
  END IF;

  IF p_top_scorer_player_id IS NOT NULL THEN
    PERFORM public.build_fantasy_challenge_snapshot(p_round_id, NULL, 'VAI_GUARDAR', p_top_scorer_player_id, test_session.settings_snapshot, true);
  END IF;
  IF p_top_assist_player_id IS NOT NULL THEN
    PERFORM public.build_fantasy_challenge_snapshot(p_round_id, NULL, 'VAI_GUARDAR', p_top_assist_player_id, test_session.settings_snapshot, true);
  END IF;
  challenge_snapshot := public.build_fantasy_challenge_snapshot(
    p_round_id, NULL, test_session.challenge_type, p_challenge_player_id,
    test_session.settings_snapshot, true
  );
  predictions_snapshot := jsonb_build_object(
    'topScorer', CASE WHEN p_top_scorer_player_id IS NULL THEN NULL ELSE jsonb_build_object(
      'playerId', p_top_scorer_player_id, 'playerName', (SELECT name FROM public.players WHERE id = p_top_scorer_player_id),
      'reward', (test_session.settings_snapshot->>'top_scorer_prediction_points')::NUMERIC
    ) END,
    'topAssist', CASE WHEN p_top_assist_player_id IS NULL THEN NULL ELSE jsonb_build_object(
      'playerId', p_top_assist_player_id, 'playerName', (SELECT name FROM public.players WHERE id = p_top_assist_player_id),
      'reward', (test_session.settings_snapshot->>'top_assist_prediction_points')::NUMERIC
    ) END,
    'challenge', challenge_snapshot
  );
  player_price := (test_session.settings_snapshot->>'initial_player_price')::NUMERIC;
  available_budget := (test_session.settings_snapshot->>'initial_budget')::NUMERIC;
  lineup_cost := unique_count * player_price;
  IF lineup_cost > available_budget THEN RAISE EXCEPTION 'A escalação ultrapassa o patrimônio de teste.'; END IF;

  INSERT INTO public.fantasy_test_lineups (
    test_session_id, user_id, status, captain_player_id,
    top_scorer_player_id, top_assist_player_id, top_team_id,
    challenge_player_id, challenge_snapshot, predictions_snapshot,
    budget_before, lineup_cost, cash_remaining, updated_at
  ) VALUES (
    test_session.id, current_user_id, 'draft', p_captain_player_id,
    p_top_scorer_player_id, p_top_assist_player_id, NULL,
    p_challenge_player_id, challenge_snapshot, predictions_snapshot,
    available_budget, lineup_cost, available_budget - lineup_cost, now()
  ) ON CONFLICT (test_session_id, user_id) DO UPDATE SET
    status = 'draft', captain_player_id = EXCLUDED.captain_player_id,
    top_scorer_player_id = EXCLUDED.top_scorer_player_id,
    top_assist_player_id = EXCLUDED.top_assist_player_id, top_team_id = NULL,
    challenge_player_id = EXCLUDED.challenge_player_id,
    challenge_snapshot = EXCLUDED.challenge_snapshot,
    predictions_snapshot = EXCLUDED.predictions_snapshot,
    score_breakdown = '{}'::JSONB,
    budget_before = EXCLUDED.budget_before, lineup_cost = EXCLUDED.lineup_cost,
    cash_remaining = EXCLUDED.cash_remaining, budget_after = NULL,
    player_points = 0, prediction_points = 0, total_points = 0,
    round_position = NULL, locked_at = NULL, updated_at = now()
  RETURNING id INTO saved_lineup_id;

  DELETE FROM public.fantasy_test_lineup_players WHERE lineup_id = saved_lineup_id;
  INSERT INTO public.fantasy_test_lineup_players (
    lineup_id, player_id, price_locked, player_name_locked, avatar_url_locked
  )
  SELECT saved_lineup_id, selected.id, player_price, player.name, player.avatar_url
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id)
  JOIN public.players player ON player.id = selected.id;
  RETURN saved_lineup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;

-- O início real é a única trava definitiva. O trigger cobre tanto o status live
-- quanto started_at para não depender de um único fluxo da interface.
CREATE OR REPLACE FUNCTION public.lock_fantasy_market_on_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.started_at IS NOT NULL OR NEW.status = 'live') AND (
    TG_OP = 'INSERT' OR OLD.started_at IS NULL OR OLD.status IS DISTINCT FROM 'live'
  ) THEN
    PERFORM public.lock_fantasy_market(NEW.round_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_lock_fantasy_market ON public.matches;
CREATE TRIGGER matches_lock_fantasy_market
BEFORE INSERT OR UPDATE OF status, started_at ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.lock_fantasy_market_on_match();

-- Preserva o processador histórico e envolve apenas rodadas V1 com o novo
-- detalhamento. A valorização existente continua intocada.
ALTER FUNCTION public.process_fantasy_round(UUID) RENAME TO process_fantasy_round_legacy_v0;
ALTER FUNCTION public.process_fantasy_test_round(UUID) RENAME TO process_fantasy_test_round_legacy_v0;

CREATE OR REPLACE FUNCTION public.apply_fantasy_v1_score_breakdown(
  p_round_id UUID,
  p_container_id UUID,
  p_is_test BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings_snapshot JSONB;
BEGIN
  IF p_is_test THEN
    SELECT test_session.settings_snapshot INTO settings_snapshot
    FROM public.fantasy_test_sessions test_session WHERE test_session.id = p_container_id;

    WITH calculated AS (
      SELECT lineup.id,
        CASE WHEN EXISTS (
          SELECT 1 FROM public.player_round_stats selected
          WHERE selected.round_id = p_round_id AND selected.player_id = lineup.top_scorer_player_id
            AND selected.goals > 0 AND selected.goals = (SELECT max(goals) FROM public.player_round_stats WHERE round_id = p_round_id)
        ) THEN (settings_snapshot->>'top_scorer_prediction_points')::NUMERIC ELSE 0 END AS scorer_points,
        CASE WHEN EXISTS (
          SELECT 1 FROM public.player_round_stats selected
          WHERE selected.round_id = p_round_id AND selected.player_id = lineup.top_assist_player_id
            AND selected.assists > 0 AND selected.assists = (SELECT max(assists) FROM public.player_round_stats WHERE round_id = p_round_id)
        ) THEN (settings_snapshot->>'top_assist_prediction_points')::NUMERIC ELSE 0 END AS assist_points,
        public.calculate_fantasy_challenge_points(p_round_id, lineup.challenge_player_id, lineup.challenge_snapshot, settings_snapshot) AS challenge_points
      FROM public.fantasy_test_lineups lineup
      WHERE lineup.test_session_id = p_container_id AND lineup.status = 'scored'
    )
    UPDATE public.fantasy_test_lineups lineup SET
      prediction_points = calculated.scorer_points + calculated.assist_points + calculated.challenge_points,
      total_points = lineup.player_points + calculated.scorer_points + calculated.assist_points + calculated.challenge_points,
      score_breakdown = jsonb_build_object(
        'playersBase', COALESCE((SELECT sum(base_points) FROM public.fantasy_test_lineup_players WHERE lineup_id = lineup.id), 0),
        'topScorer', calculated.scorer_points,
        'topAssist', calculated.assist_points, 'challenge', calculated.challenge_points,
        'captainBonus', COALESCE((SELECT sum(captain_bonus) FROM public.fantasy_test_lineup_players WHERE lineup_id = lineup.id), 0)
      )
    FROM calculated WHERE lineup.id = calculated.id;

    WITH ranked AS (
      SELECT id, rank() OVER (ORDER BY total_points DESC) AS position
      FROM public.fantasy_test_lineups WHERE test_session_id = p_container_id AND status = 'scored'
    )
    UPDATE public.fantasy_test_lineups lineup SET round_position = ranked.position
    FROM ranked WHERE lineup.id = ranked.id;
  ELSE
    SELECT fantasy_round.settings_snapshot INTO settings_snapshot
    FROM public.fantasy_rounds fantasy_round WHERE fantasy_round.id = p_container_id;

    WITH calculated AS (
      SELECT lineup.id,
        CASE WHEN EXISTS (
          SELECT 1 FROM public.player_round_stats selected
          WHERE selected.round_id = p_round_id AND selected.player_id = lineup.top_scorer_player_id
            AND selected.goals > 0 AND selected.goals = (SELECT max(goals) FROM public.player_round_stats WHERE round_id = p_round_id)
        ) THEN (settings_snapshot->>'top_scorer_prediction_points')::NUMERIC ELSE 0 END AS scorer_points,
        CASE WHEN EXISTS (
          SELECT 1 FROM public.player_round_stats selected
          WHERE selected.round_id = p_round_id AND selected.player_id = lineup.top_assist_player_id
            AND selected.assists > 0 AND selected.assists = (SELECT max(assists) FROM public.player_round_stats WHERE round_id = p_round_id)
        ) THEN (settings_snapshot->>'top_assist_prediction_points')::NUMERIC ELSE 0 END AS assist_points,
        public.calculate_fantasy_challenge_points(p_round_id, lineup.challenge_player_id, lineup.challenge_snapshot, settings_snapshot) AS challenge_points
      FROM public.fantasy_lineups lineup
      WHERE lineup.fantasy_round_id = p_container_id AND lineup.status = 'scored'
    )
    UPDATE public.fantasy_lineups lineup SET
      prediction_points = calculated.scorer_points + calculated.assist_points + calculated.challenge_points,
      total_points = lineup.player_points + calculated.scorer_points + calculated.assist_points + calculated.challenge_points,
      score_breakdown = jsonb_build_object(
        'playersBase', COALESCE((SELECT sum(base_points) FROM public.fantasy_lineup_players WHERE lineup_id = lineup.id), 0),
        'topScorer', calculated.scorer_points,
        'topAssist', calculated.assist_points, 'challenge', calculated.challenge_points,
        'captainBonus', COALESCE((SELECT sum(captain_bonus) FROM public.fantasy_lineup_players WHERE lineup_id = lineup.id), 0)
      )
    FROM calculated WHERE lineup.id = calculated.id;

    WITH ranked AS (
      SELECT id, rank() OVER (ORDER BY total_points DESC) AS position
      FROM public.fantasy_lineups WHERE fantasy_round_id = p_container_id AND status = 'scored'
    )
    UPDATE public.fantasy_lineups lineup SET round_position = ranked.position
    FROM ranked WHERE lineup.id = ranked.id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_fantasy_challenge_points(
  p_round_id UUID,
  p_player_id UUID,
  p_snapshot JSONB,
  p_settings JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  selected_stats public.player_round_stats%ROWTYPE;
  selected_base NUMERIC;
  required_rank INTEGER;
  actual_rank INTEGER;
  reward NUMERIC;
BEGIN
  IF p_player_id IS NULL OR COALESCE(p_snapshot, '{}'::JSONB) = '{}'::JSONB THEN RETURN 0; END IF;
  SELECT * INTO selected_stats FROM public.player_round_stats
  WHERE round_id = p_round_id AND player_id = p_player_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  reward := COALESCE((p_snapshot->>'reward')::NUMERIC, 0);

  IF p_snapshot->>'type' = 'REI_DAS_VITORIAS' THEN
    IF selected_stats.wins > 0 AND selected_stats.wins = (SELECT max(wins) FROM public.player_round_stats WHERE round_id = p_round_id) THEN RETURN reward; END IF;
  ELSIF p_snapshot->>'type' = 'MITO_DA_RODADA' THEN
    selected_base := selected_stats.goals * (p_settings->>'goal_points')::NUMERIC
      + selected_stats.assists * (p_settings->>'assist_points')::NUMERIC
      + selected_stats.wins * (p_settings->>'win_points')::NUMERIC;
    IF selected_base > 0 AND selected_base = (
      SELECT max(goals * (p_settings->>'goal_points')::NUMERIC
        + assists * (p_settings->>'assist_points')::NUMERIC
        + wins * (p_settings->>'win_points')::NUMERIC)
      FROM public.player_round_stats WHERE round_id = p_round_id
    ) THEN RETURN reward; END IF;
  ELSIF p_snapshot->>'type' = 'APOSTA_DA_RODADA' THEN
    selected_base := selected_stats.goals * (p_settings->>'goal_points')::NUMERIC
      + selected_stats.assists * (p_settings->>'assist_points')::NUMERIC
      + selected_stats.wins * (p_settings->>'win_points')::NUMERIC;
    required_rank := COALESCE((p_snapshot->>'requiredRank')::INTEGER, 0);
    SELECT 1 + count(*) INTO actual_rank FROM public.player_round_stats candidate
    WHERE candidate.round_id = p_round_id AND (
      candidate.goals * (p_settings->>'goal_points')::NUMERIC
      + candidate.assists * (p_settings->>'assist_points')::NUMERIC
      + candidate.wins * (p_settings->>'win_points')::NUMERIC
    ) > selected_base;
    IF selected_base > 0 AND actual_rank <= required_rank THEN RETURN reward; END IF;
  ELSIF p_snapshot->>'type' = 'VAI_GUARDAR' AND selected_stats.goals >= 1 THEN
    RETURN reward;
  END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_round public.fantasy_rounds%ROWTYPE;
BEGIN
  SELECT * INTO target_round FROM public.fantasy_rounds WHERE round_id = p_round_id;
  IF NOT FOUND THEN RETURN true; END IF;
  IF target_round.processed_at IS NOT NULL THEN RETURN true; END IF;
  PERFORM public.process_fantasy_round_legacy_v0(p_round_id);
  IF target_round.rules_version >= 1 THEN
    PERFORM public.apply_fantasy_v1_score_breakdown(p_round_id, target_round.id, false);
    UPDATE public.fantasy_accounts account SET
      total_points = totals.total_points,
      rounds_played = totals.rounds_played,
      best_round_points = totals.best_round,
      updated_at = now()
    FROM (
      SELECT lineup.user_id, sum(lineup.total_points) total_points,
        count(*)::INTEGER rounds_played, max(lineup.total_points) best_round
      FROM public.fantasy_lineups lineup
      JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
      WHERE fantasy_round.fantasy_season_id = target_round.fantasy_season_id AND lineup.status = 'scored'
      GROUP BY lineup.user_id
    ) totals
    WHERE account.fantasy_season_id = target_round.fantasy_season_id AND account.user_id = totals.user_id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_fantasy_test_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_session public.fantasy_test_sessions%ROWTYPE;
BEGIN
  SELECT * INTO target_session FROM public.fantasy_test_sessions WHERE round_id = p_round_id;
  IF NOT FOUND THEN RETURN true; END IF;
  IF target_session.processed_at IS NOT NULL THEN RETURN true; END IF;
  PERFORM public.process_fantasy_test_round_legacy_v0(p_round_id);
  IF target_session.rules_version >= 1 THEN
    PERFORM public.apply_fantasy_v1_score_breakdown(p_round_id, target_session.id, true);
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.process_fantasy_round_legacy_v0(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fantasy_test_round_legacy_v0(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_fantasy_test_round(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_fantasy_settings(p_settings JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE active_league_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem configurar o Cartola.'; END IF;
  SELECT id INTO active_league_id FROM public.leagues WHERE is_active = true ORDER BY created_at LIMIT 1;
  INSERT INTO public.fantasy_settings (league_id) VALUES (active_league_id) ON CONFLICT (league_id) DO NOTHING;
  UPDATE public.fantasy_settings SET
    currency_name = COALESCE(NULLIF(trim(p_settings->>'currency_name'), ''), currency_name),
    initial_budget = COALESCE((p_settings->>'initial_budget')::NUMERIC, initial_budget),
    initial_player_price = COALESCE((p_settings->>'initial_player_price')::NUMERIC, initial_player_price),
    goal_points = COALESCE((p_settings->>'goal_points')::NUMERIC, goal_points),
    assist_points = COALESCE((p_settings->>'assist_points')::NUMERIC, assist_points),
    win_points = COALESCE((p_settings->>'win_points')::NUMERIC, win_points),
    captain_multiplier = COALESCE((p_settings->>'captain_multiplier')::NUMERIC, captain_multiplier),
    top_scorer_prediction_points = COALESCE((p_settings->>'top_scorer_prediction_points')::NUMERIC, top_scorer_prediction_points),
    top_assist_prediction_points = COALESCE((p_settings->>'top_assist_prediction_points')::NUMERIC, top_assist_prediction_points),
    king_of_wins_points = COALESCE((p_settings->>'king_of_wins_points')::NUMERIC, king_of_wins_points),
    mvp_prediction_points = COALESCE((p_settings->>'mvp_prediction_points')::NUMERIC, mvp_prediction_points),
    bet_of_round_points = COALESCE((p_settings->>'bet_of_round_points')::NUMERIC, bet_of_round_points),
    bet_rank_band_1 = COALESCE((p_settings->>'bet_rank_band_1')::INTEGER, bet_rank_band_1),
    bet_rank_band_2 = COALESCE((p_settings->>'bet_rank_band_2')::INTEGER, bet_rank_band_2),
    bet_rank_band_3 = COALESCE((p_settings->>'bet_rank_band_3')::INTEGER, bet_rank_band_3),
    bet_rank_band_4 = COALESCE((p_settings->>'bet_rank_band_4')::INTEGER, bet_rank_band_4),
    score_goal_reward_band_1 = COALESCE((p_settings->>'score_goal_reward_band_1')::NUMERIC, score_goal_reward_band_1),
    score_goal_reward_band_2 = COALESCE((p_settings->>'score_goal_reward_band_2')::NUMERIC, score_goal_reward_band_2),
    score_goal_reward_band_3 = COALESCE((p_settings->>'score_goal_reward_band_3')::NUMERIC, score_goal_reward_band_3),
    score_goal_reward_band_4 = COALESCE((p_settings->>'score_goal_reward_band_4')::NUMERIC, score_goal_reward_band_4),
    min_player_price = COALESCE((p_settings->>'min_player_price')::NUMERIC, min_player_price),
    max_player_price = COALESCE((p_settings->>'max_player_price')::NUMERIC, max_player_price),
    recent_weight = COALESCE((p_settings->>'recent_weight')::NUMERIC, recent_weight),
    win_rate_weight = COALESCE((p_settings->>'win_rate_weight')::NUMERIC, win_rate_weight),
    historical_weight = COALESCE((p_settings->>'historical_weight')::NUMERIC, historical_weight),
    consistency_weight = COALESCE((p_settings->>'consistency_weight')::NUMERIC, consistency_weight),
    smoothing_games = COALESCE((p_settings->>'smoothing_games')::INTEGER, smoothing_games),
    max_price_increase = COALESCE((p_settings->>'max_price_increase')::NUMERIC, max_price_increase),
    max_price_decrease = COALESCE((p_settings->>'max_price_decrease')::NUMERIC, max_price_decrease),
    updated_at = now()
  WHERE league_id = active_league_id;
  INSERT INTO public.fantasy_audit_log (league_id, user_id, action, payload)
  VALUES (active_league_id, auth.uid(), 'settings_updated_v1', p_settings);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_fantasy_settings(JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.pick_fantasy_challenge_type() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepare_fantasy_v1_round() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clean_seeded_fantasy_guests() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.build_fantasy_challenge_snapshot(UUID, UUID, TEXT, UUID, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_fantasy_challenge_points(UUID, UUID, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_fantasy_v1_score_breakdown(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
