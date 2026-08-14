-- Mercado permanente do Cartola.
-- Permite manter e editar o elenco entre rodadas sem alterar escalações históricas.

CREATE TABLE IF NOT EXISTS public.fantasy_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  captain_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fantasy_season_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_portfolio_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.fantasy_portfolios(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  price_selected NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, player_id)
);

CREATE INDEX IF NOT EXISTS fantasy_portfolios_user_idx
ON public.fantasy_portfolios (fantasy_season_id, user_id);

ALTER TABLE public.fantasy_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_portfolio_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fantasy_portfolios_read ON public.fantasy_portfolios;
CREATE POLICY fantasy_portfolios_read
ON public.fantasy_portfolios FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_app_admin());

DROP POLICY IF EXISTS fantasy_portfolio_players_read ON public.fantasy_portfolio_players;
CREATE POLICY fantasy_portfolio_players_read
ON public.fantasy_portfolio_players FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.fantasy_portfolios portfolio
    WHERE portfolio.id = portfolio_id
      AND (portfolio.user_id = auth.uid() OR public.is_app_admin())
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.fantasy_portfolios, public.fantasy_portfolio_players FROM authenticated;
GRANT SELECT ON public.fantasy_portfolios, public.fantasy_portfolio_players TO authenticated;

-- O Fantasy passa a existir desde o início da temporada, mesmo sem pré-lista.
INSERT INTO public.fantasy_settings (league_id)
SELECT DISTINCT season_item.league_id
FROM public.seasons season_item
WHERE season_item.status = 'active'
ON CONFLICT (league_id) DO NOTHING;

INSERT INTO public.fantasy_seasons (
  league_id, season_id, initial_budget, initial_player_price
)
SELECT
  season_item.league_id,
  season_item.id,
  settings.initial_budget,
  settings.initial_player_price
FROM public.seasons season_item
JOIN public.fantasy_settings settings ON settings.league_id = season_item.league_id
WHERE season_item.status = 'active'
ON CONFLICT (season_id) DO UPDATE SET league_id = EXCLUDED.league_id;

INSERT INTO public.fantasy_player_prices (
  fantasy_season_id, player_id, current_price
)
SELECT fantasy_season.id, player.id, fantasy_season.initial_player_price
FROM public.fantasy_seasons fantasy_season
JOIN public.seasons season_item ON season_item.id = fantasy_season.season_id
CROSS JOIN public.players player
WHERE season_item.status = 'active'
  AND player.is_selectable = true
  AND player.member_category IN ('player', 'guest')
ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_active_fantasy_season()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_settings public.fantasy_settings%ROWTYPE;
  fantasy_season_id UUID;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;

  INSERT INTO public.fantasy_settings (league_id)
  VALUES (NEW.league_id)
  ON CONFLICT (league_id) DO NOTHING;

  SELECT * INTO current_settings
  FROM public.fantasy_settings
  WHERE league_id = NEW.league_id;

  INSERT INTO public.fantasy_seasons (
    league_id, season_id, initial_budget, initial_player_price
  ) VALUES (
    NEW.league_id, NEW.id,
    current_settings.initial_budget, current_settings.initial_player_price
  )
  ON CONFLICT (season_id) DO UPDATE SET league_id = EXCLUDED.league_id
  RETURNING id INTO fantasy_season_id;

  INSERT INTO public.fantasy_player_prices (
    fantasy_season_id, player_id, current_price
  )
  SELECT fantasy_season_id, player.id, current_settings.initial_player_price
  FROM public.players player
  WHERE player.is_selectable = true
    AND player.member_category IN ('player', 'guest')
  ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seasons_ensure_active_fantasy ON public.seasons;
CREATE TRIGGER seasons_ensure_active_fantasy
AFTER INSERT OR UPDATE OF status ON public.seasons
FOR EACH ROW EXECUTE FUNCTION public.ensure_active_fantasy_season();

CREATE OR REPLACE FUNCTION public.save_fantasy_portfolio(
  p_fantasy_season_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  target_season public.fantasy_seasons%ROWTYPE;
  target_account public.fantasy_accounts%ROWTYPE;
  portfolio_id UUID;
  unique_count INTEGER;
  selected_count INTEGER;
  portfolio_cost NUMERIC(10,2);
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para montar o elenco.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_fantasy_season_id::TEXT || current_user_id::TEXT, 0));

  SELECT fantasy_season.* INTO target_season
  FROM public.fantasy_seasons fantasy_season
  JOIN public.seasons season_item ON season_item.id = fantasy_season.season_id
  WHERE fantasy_season.id = p_fantasy_season_id
    AND season_item.status = 'active'
  FOR UPDATE OF fantasy_season;
  IF NOT FOUND THEN RAISE EXCEPTION 'Temporada do Cartola não encontrada.'; END IF;

  SELECT count(DISTINCT selected.id), count(*)
  INTO unique_count, selected_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id);
  IF unique_count <> selected_count THEN RAISE EXCEPTION 'Um jogador não pode aparecer duas vezes.'; END IF;
  IF unique_count > 5 THEN RAISE EXCEPTION 'O elenco aceita no máximo 5 jogadores.'; END IF;

  SELECT count(*) INTO selected_count
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.is_selectable = true
    AND player.member_category IN ('player', 'guest');
  IF selected_count <> unique_count THEN RAISE EXCEPTION 'O elenco contém uma pessoa indisponível no mercado.'; END IF;

  IF p_captain_player_id IS NOT NULL
    AND NOT (p_captain_player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])))
  THEN RAISE EXCEPTION 'O capitão precisa estar entre os jogadores comprados.'; END IF;

  INSERT INTO public.fantasy_player_prices (
    fantasy_season_id, player_id, current_price
  )
  SELECT target_season.id, player.id, target_season.initial_player_price
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
  ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;

  INSERT INTO public.fantasy_accounts (
    fantasy_season_id, user_id, current_budget
  ) VALUES (
    target_season.id, current_user_id, target_season.initial_budget
  ) ON CONFLICT (fantasy_season_id, user_id) DO NOTHING;

  SELECT * INTO target_account
  FROM public.fantasy_accounts account_item
  WHERE account_item.fantasy_season_id = target_season.id
    AND account_item.user_id = current_user_id
  FOR UPDATE;

  SELECT COALESCE(sum(price.current_price), 0) INTO portfolio_cost
  FROM public.fantasy_player_prices price
  WHERE price.fantasy_season_id = target_season.id
    AND price.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]));
  IF portfolio_cost > target_account.current_budget THEN
    RAISE EXCEPTION 'As compras ultrapassam o seu patrimônio disponível.';
  END IF;

  INSERT INTO public.fantasy_portfolios (
    fantasy_season_id, user_id, captain_player_id, updated_at
  ) VALUES (
    target_season.id, current_user_id, p_captain_player_id, now()
  )
  ON CONFLICT (fantasy_season_id, user_id) DO UPDATE SET
    captain_player_id = EXCLUDED.captain_player_id,
    updated_at = now()
  RETURNING id INTO portfolio_id;

  DELETE FROM public.fantasy_portfolio_players item
  WHERE item.portfolio_id = portfolio_id;

  INSERT INTO public.fantasy_portfolio_players (
    portfolio_id, player_id, price_selected
  )
  SELECT portfolio_id, selected.id, price.current_price
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(id)
  JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = target_season.id
    AND price.player_id = selected.id;

  INSERT INTO public.fantasy_audit_log (
    league_id, user_id, action, payload
  ) VALUES (
    target_season.league_id,
    current_user_id,
    'portfolio_saved',
    jsonb_build_object('players', unique_count, 'cost', portfolio_cost)
  );

  RETURN portfolio_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_portfolio(UUID, UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_portfolio(UUID, UUID[], UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_fantasy_round_from_portfolios(
  p_fantasy_round_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_round public.fantasy_rounds%ROWTYPE;
BEGIN
  SELECT * INTO target_round
  FROM public.fantasy_rounds
  WHERE id = p_fantasy_round_id;
  IF NOT FOUND OR target_round.market_status <> 'open' THEN RETURN true; END IF;

  INSERT INTO public.fantasy_lineups (
    fantasy_round_id, user_id, status, captain_player_id,
    budget_before, lineup_cost, cash_remaining, updated_at
  )
  SELECT
    target_round.id,
    portfolio.user_id,
    'draft',
    CASE WHEN bool_or(item.player_id = portfolio.captain_player_id)
      THEN portfolio.captain_player_id ELSE NULL END,
    account.current_budget,
    COALESCE(sum(price.current_price), 0),
    account.current_budget - COALESCE(sum(price.current_price), 0),
    now()
  FROM public.fantasy_portfolios portfolio
  JOIN public.fantasy_accounts account
    ON account.fantasy_season_id = portfolio.fantasy_season_id
    AND account.user_id = portfolio.user_id
  JOIN public.fantasy_portfolio_players item ON item.portfolio_id = portfolio.id
  JOIN public.players player ON player.id = item.player_id
    AND player.is_selectable = true
    AND player.member_category IN ('player', 'guest')
  JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = portfolio.fantasy_season_id
    AND price.player_id = item.player_id
  WHERE portfolio.fantasy_season_id = target_round.fantasy_season_id
  GROUP BY portfolio.id, portfolio.user_id, portfolio.captain_player_id, account.current_budget
  HAVING count(*) <= 5 AND COALESCE(sum(price.current_price), 0) <= account.current_budget
  ON CONFLICT (fantasy_round_id, user_id) DO NOTHING;

  INSERT INTO public.fantasy_lineup_players (
    lineup_id, player_id, price_locked
  )
  SELECT lineup.id, item.player_id, price.current_price
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_portfolios portfolio
    ON portfolio.fantasy_season_id = target_round.fantasy_season_id
    AND portfolio.user_id = lineup.user_id
  JOIN public.fantasy_portfolio_players item ON item.portfolio_id = portfolio.id
  JOIN public.players player ON player.id = item.player_id
    AND player.is_selectable = true
    AND player.member_category IN ('player', 'guest')
  JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = target_round.fantasy_season_id
    AND price.player_id = item.player_id
  WHERE lineup.fantasy_round_id = target_round.id
    AND lineup.status = 'draft'
  ON CONFLICT (lineup_id, player_id) DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_new_fantasy_round_from_portfolios()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_fantasy_round_from_portfolios(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fantasy_rounds_seed_portfolios ON public.fantasy_rounds;
CREATE TRIGGER fantasy_rounds_seed_portfolios
AFTER INSERT ON public.fantasy_rounds
FOR EACH ROW EXECUTE FUNCTION public.seed_new_fantasy_round_from_portfolios();

REVOKE ALL ON FUNCTION public.seed_fantasy_round_from_portfolios(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_new_fantasy_round_from_portfolios() FROM PUBLIC, anon, authenticated;

-- Aproveita a escalação mais recente como elenco inicial, sem alterar o histórico.
INSERT INTO public.fantasy_portfolios (
  fantasy_season_id, user_id, captain_player_id
)
SELECT
  account.fantasy_season_id,
  account.user_id,
  latest_lineup.captain_player_id
FROM public.fantasy_accounts account
JOIN LATERAL (
  SELECT lineup.id, lineup.captain_player_id
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  WHERE fantasy_round.fantasy_season_id = account.fantasy_season_id
    AND lineup.user_id = account.user_id
  ORDER BY round_item.date DESC, round_item.number DESC, lineup.updated_at DESC
  LIMIT 1
) latest_lineup ON true
ON CONFLICT (fantasy_season_id, user_id) DO NOTHING;

INSERT INTO public.fantasy_portfolio_players (
  portfolio_id, player_id, price_selected
)
SELECT
  portfolio.id,
  lineup_player.player_id,
  COALESCE(price.current_price, lineup_player.price_after, lineup_player.price_locked)
FROM public.fantasy_portfolios portfolio
JOIN LATERAL (
  SELECT lineup.id
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  WHERE fantasy_round.fantasy_season_id = portfolio.fantasy_season_id
    AND lineup.user_id = portfolio.user_id
  ORDER BY round_item.date DESC, round_item.number DESC, lineup.updated_at DESC
  LIMIT 1
) latest_lineup ON true
JOIN public.fantasy_lineup_players lineup_player ON lineup_player.lineup_id = latest_lineup.id
LEFT JOIN public.fantasy_player_prices price
  ON price.fantasy_season_id = portfolio.fantasy_season_id
  AND price.player_id = lineup_player.player_id
ON CONFLICT (portfolio_id, player_id) DO NOTHING;

-- Também prepara rodadas oficiais que já estejam abertas quando a migration rodar.
SELECT public.seed_fantasy_round_from_portfolios(fantasy_round.id)
FROM public.fantasy_rounds fantasy_round
WHERE fantasy_round.market_status = 'open';
