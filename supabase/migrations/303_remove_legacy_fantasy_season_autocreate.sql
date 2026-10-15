-- O trigger legado criava Cartola ao abrir qualquer temporada. No modelo
-- multi-pelada isso vazaria recursos da versao Completa para a Basica.
-- A criacao correta passa por create_league_for_admin/upgrade e, na primeira
-- rodada elegivel, por ensure_fantasy_round.
BEGIN;

DROP TRIGGER IF EXISTS seasons_ensure_active_fantasy ON public.seasons;

REVOKE ALL ON FUNCTION public.ensure_active_fantasy_season()
  FROM PUBLIC, anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
