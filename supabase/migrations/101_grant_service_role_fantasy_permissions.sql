-- Concede permissoes completas de leitura para a role `service_role` nas tabelas do Cartola Fantasy.
-- Necessario para que o client de servico do backend consiga consolidar rankings,
-- apurar pontuacoes ao vivo e ler perfis sem ser bloqueado por politicas RLS de usuario comum.

GRANT SELECT ON 
  public.fantasy_settings,
  public.fantasy_seasons,
  public.fantasy_accounts,
  public.fantasy_rounds,
  public.fantasy_lineups,
  public.fantasy_lineup_players,
  public.fantasy_player_prices,
  public.fantasy_player_price_history,
  public.fantasy_audit_log
TO service_role;

NOTIFY pgrst, 'reload schema';
