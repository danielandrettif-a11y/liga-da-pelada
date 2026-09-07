-- Exportação somente leitura do Mercado V11.
-- Execute no SQL Editor do Supabase e salve a coluna audit como market-v11-audit.json.
-- IDs de contas são anonimizados; não há e-mail, nome ou escalação individual.

WITH active_fantasy_season AS (
  SELECT fantasy_season.id, fantasy_season.league_id, league.players_per_team
  FROM public.fantasy_seasons fantasy_season
  JOIN public.seasons season ON season.id = fantasy_season.season_id AND season.status = 'active'
  JOIN public.leagues league ON league.id = fantasy_season.league_id
  ORDER BY season.started_at DESC LIMIT 1
), finished_rounds AS (
  SELECT fantasy_round.id, round_item.id round_id, round_item.number, round_item.date
  FROM public.fantasy_rounds fantasy_round
  JOIN active_fantasy_season season ON season.id = fantasy_round.fantasy_season_id
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  WHERE round_item.round_type = 'official' AND round_item.status = 'finished'
  ORDER BY round_item.date DESC, round_item.number DESC LIMIT 3
)
SELECT jsonb_build_object(
  'generatedAt', now(),
  'season', (SELECT to_jsonb(season) FROM active_fantasy_season season),
  'settings', (SELECT to_jsonb(settings) FROM public.fantasy_settings settings JOIN active_fantasy_season season ON season.league_id = settings.league_id),
  'accounts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'managerKey', md5(account.user_id::TEXT), 'budget', account.current_budget,
    'roundsPlayed', account.rounds_played, 'totalPoints', account.total_points
  ) ORDER BY account.current_budget) FROM public.fantasy_accounts account JOIN active_fantasy_season season ON season.id = account.fantasy_season_id), '[]'::JSONB),
  'players', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'playerKey', md5(price.player_id::TEXT), 'profile', player.player_profile,
    'currentPrice', price.current_price, 'roundsPlayed', price.rounds_played, 'totalPoints', price.total_points
  ) ORDER BY price.current_price) FROM public.fantasy_player_prices price JOIN active_fantasy_season season ON season.id = price.fantasy_season_id JOIN public.players player ON player.id = price.player_id), '[]'::JSONB),
  'performances', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'round', round_item.number, 'date', round_item.date, 'playerKey', md5(history.player_id::TEXT),
    'priceBefore', history.price_before, 'priceAfter', history.price_after, 'roundPoints', history.round_points,
    'games', history.games, 'variationRate', history.variation_rate, 'metrics', history.metrics
  ) ORDER BY round_item.date, round_item.number) FROM public.fantasy_player_price_history history JOIN finished_rounds round_item ON round_item.id = history.fantasy_round_id), '[]'::JSONB),
  'savedLineups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'managerKey', md5(lineup.user_id::TEXT), 'round', round_item.number, 'budgetBefore', lineup.budget_before,
    'budgetAfter', lineup.budget_after, 'lineupCost', lineup.lineup_cost, 'status', lineup.status
  ) ORDER BY round_item.number) FROM public.fantasy_lineups lineup JOIN finished_rounds round_item ON round_item.id = lineup.fantasy_round_id), '[]'::JSONB)
) AS audit;
