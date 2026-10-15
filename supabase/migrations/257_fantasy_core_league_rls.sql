-- Isolamento das tabelas centrais do Cartola. Aplicar somente apos 253-256
-- e validar com duas contas em peladas diferentes antes da publicacao.

BEGIN;

-- Um registro mal associado nao pode vazar entre peladas por uma das suas FKs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fantasy_seasons fs
    JOIN public.seasons season_item ON season_item.id = fs.season_id
    WHERE fs.league_id IS DISTINCT FROM season_item.league_id
  ) THEN
    RAISE EXCEPTION 'fantasy_seasons contem liga diferente da temporada';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fantasy_rounds fr
    JOIN public.fantasy_seasons fs ON fs.id = fr.fantasy_season_id
    JOIN public.rounds round_item ON round_item.id = fr.round_id
    WHERE fs.league_id IS DISTINCT FROM round_item.league_id
      OR fs.season_id IS DISTINCT FROM round_item.season_id
  ) THEN
    RAISE EXCEPTION 'fantasy_rounds contem rodada fora da temporada/pelada';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fantasy_player_price_history history
    JOIN public.fantasy_rounds fr ON fr.id = history.fantasy_round_id
    WHERE history.fantasy_season_id IS DISTINCT FROM fr.fantasy_season_id
  ) THEN
    RAISE EXCEPTION 'fantasy_player_price_history contem rodada fora da temporada';
  END IF;
END $$;

-- Helpers sob SECURITY DEFINER evitam recursao entre politicas RLS. Nenhum
-- helper concede acesso apenas por ser ADM global de outra pelada.
CREATE OR REPLACE FUNCTION public.can_access_fantasy_season(p_fantasy_season_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.fantasy_seasons fs
    WHERE fs.id = p_fantasy_season_id AND public.is_league_member(fs.league_id));
$$;
CREATE OR REPLACE FUNCTION public.can_admin_fantasy_season(p_fantasy_season_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.fantasy_seasons fs
    WHERE fs.id = p_fantasy_season_id AND public.is_league_admin(fs.league_id));
$$;
CREATE OR REPLACE FUNCTION public.can_access_fantasy_round(p_fantasy_round_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.fantasy_rounds fr
    JOIN public.fantasy_seasons fs ON fs.id = fr.fantasy_season_id
    WHERE fr.id = p_fantasy_round_id AND public.is_league_member(fs.league_id));
$$;
CREATE OR REPLACE FUNCTION public.can_view_fantasy_lineup(p_lineup_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fr ON fr.id = lineup.fantasy_round_id
    JOIN public.fantasy_seasons fs ON fs.id = fr.fantasy_season_id
    WHERE lineup.id = p_lineup_id AND public.is_league_member(fs.league_id)
      AND (lineup.user_id = auth.uid() OR public.is_league_admin(fs.league_id)
        OR fr.market_status <> 'open'));
$$;
CREATE OR REPLACE FUNCTION public.can_view_fantasy_portfolio(p_portfolio_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.fantasy_portfolios portfolio
    JOIN public.fantasy_seasons fs ON fs.id = portfolio.fantasy_season_id
    WHERE portfolio.id = p_portfolio_id AND public.is_league_member(fs.league_id)
      AND (portfolio.user_id = auth.uid() OR public.is_league_admin(fs.league_id)));
$$;

REVOKE ALL ON FUNCTION public.can_access_fantasy_season(uuid),
  public.can_admin_fantasy_season(uuid), public.can_access_fantasy_round(uuid),
  public.can_view_fantasy_lineup(uuid), public.can_view_fantasy_portfolio(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_fantasy_season(uuid),
  public.can_admin_fantasy_season(uuid), public.can_access_fantasy_round(uuid),
  public.can_view_fantasy_lineup(uuid), public.can_view_fantasy_portfolio(uuid)
  TO authenticated;

-- Politicas permissivas antigas (USING true / is_app_admin) precisam ser
-- removidas por inteiro: elas seriam combinadas com as novas por OR.
DO $$
DECLARE item record; old_policy record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('fantasy_settings', 'public.is_league_member(league_id)'),
    ('fantasy_seasons', 'public.is_league_member(league_id)'),
    ('fantasy_accounts', 'public.can_access_fantasy_season(fantasy_season_id)'),
    ('fantasy_rounds', 'public.can_access_fantasy_season(fantasy_season_id)'),
    ('fantasy_lineups', 'public.can_view_fantasy_lineup(id)'),
    ('fantasy_lineup_players', 'public.can_view_fantasy_lineup(lineup_id)'),
    ('fantasy_lineup_reserves', 'public.can_view_fantasy_lineup(lineup_id)'),
    ('fantasy_player_prices', 'public.can_access_fantasy_season(fantasy_season_id)'),
    ('fantasy_player_price_history', 'public.can_access_fantasy_season(fantasy_season_id)'),
    ('fantasy_audit_log', 'public.is_league_admin(league_id)'),
    ('fantasy_portfolios', 'public.can_view_fantasy_portfolio(id)'),
    ('fantasy_portfolio_players', 'public.can_view_fantasy_portfolio(portfolio_id)')
  ) AS scope(table_name, read_predicate) LOOP
    IF to_regclass(format('public.%I', item.table_name)) IS NULL THEN
      RAISE EXCEPTION 'Tabela obrigatoria do Cartola ausente: %', item.table_name;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.table_name);
    FOR old_policy IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = item.table_name LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', old_policy.policyname, item.table_name);
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', item.table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', item.table_name);
    EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING (%s)',
      item.table_name, item.read_predicate);
  END LOOP;
END $$;

-- O mercado e um read model SECURITY INVOKER. Alem de RLS, filtra atletas
-- pelo elenco da temporada solicitada para nao misturar duas peladas das
-- quais a mesma conta participa.
CREATE OR REPLACE FUNCTION public.get_fantasy_market_read_model(p_fantasy_season_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH target AS (
    SELECT fs.id, fs.season_id, fs.league_id FROM public.fantasy_seasons fs
    WHERE fs.id = p_fantasy_season_id AND public.is_league_member(fs.league_id)
  )
  SELECT jsonb_build_object(
    'prices', COALESCE((
      SELECT jsonb_agg(to_jsonb(price)) FROM public.fantasy_player_prices price
      JOIN target ON target.id = price.fantasy_season_id
    ), '[]'::jsonb),
    'stats', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'round_id', stats.round_id, 'player_id', stats.player_id,
        'goals', stats.goals, 'assists', stats.assists,
        'wins', stats.wins, 'draws', stats.draws, 'losses', stats.losses,
        'own_goals', stats.own_goals, 'games', stats.games,
        'goalkeeper_games', stats.goalkeeper_games,
        'goalkeeper_goals', stats.goalkeeper_goals,
        'goalkeeper_assists', stats.goalkeeper_assists,
        'goalkeeper_own_goals', stats.goalkeeper_own_goals,
        'goalkeeper_wins', stats.goalkeeper_wins,
        'goalkeeper_draws', stats.goalkeeper_draws,
        'goalkeeper_losses', stats.goalkeeper_losses,
        'goals_conceded', stats.goals_conceded,
        'clean_sheets', stats.clean_sheets,
        'defensive_clean_games', stats.defensive_clean_games,
        'defensive_one_goal_games', stats.defensive_one_goal_games,
        'team_goals_conceded', stats.team_goals_conceded,
        'ranking_points', stats.ranking_points
      ))
      FROM public.player_round_stats stats
      JOIN public.rounds round_item ON round_item.id = stats.round_id
        AND round_item.round_type = 'official'
      JOIN target ON target.season_id = round_item.season_id
        AND target.league_id = round_item.league_id
    ), '[]'::jsonb),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', player.id, 'name', player.name,
        'avatar_url', player.avatar_url,
        'player_profile', player.player_profile,
        'overall_traits', player.overall_traits,
        'is_goalkeeper', player.is_goalkeeper,
        'member_category', player.member_category,
        'is_selectable', player.is_selectable,
        'is_competitive_profile_complete', player.is_competitive_profile_complete
      ) ORDER BY player.name)
      FROM target
      JOIN public.league_members member ON member.league_id = target.league_id
        AND member.is_active
      JOIN public.players player ON player.id = member.player_id
      WHERE player.is_competitive_profile_complete = true
    ), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(to_jsonb(history) ORDER BY history.created_at DESC)
      FROM public.fantasy_player_price_history history
      JOIN target ON target.id = history.fantasy_season_id
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.get_fantasy_market_read_model(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fantasy_market_read_model(uuid) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
