-- Mantem o mercado V15 e o reprocessamento integral dentro da pelada da
-- temporada. Os corpos legados sao alterados apenas se os trechos esperados
-- ainda existirem; uma mudanca anterior inesperada interrompe a migration.
BEGIN;

DO $$
DECLARE
  definition text;
  source_join constant text := 'JOIN public.players player ON player.id = history.player_id';
  source_old_join constant text := 'JOIN public.players old_player ON old_player.id = old.player_id';
  source_old_profile constant text := 'old_player.player_profile = player.player_profile';
BEGIN
  SELECT pg_get_functiondef('public.apply_fantasy_role_market_v074(uuid)'::regprocedure)
    INTO definition;
  IF position(source_join IN definition) = 0
    OR position(source_old_join IN definition) = 0
    OR position(source_old_profile IN definition) = 0 THEN
    RAISE EXCEPTION 'Mercado V15 divergiu; revisar isolamento antes de aplicar a 296.';
  END IF;

  definition := replace(definition, source_old_profile,
    'old_member.player_profile = member.player_profile');
  definition := replace(definition, source_old_join,
    'JOIN public.league_members old_member ON old_member.player_id = old.player_id AND old_member.league_id = member.league_id');
  definition := replace(definition, source_join,
    'JOIN public.fantasy_seasons pricing_season ON pricing_season.id = history.fantasy_season_id AND pricing_season.id = target.fantasy_season_id
    JOIN public.league_members member ON member.player_id = history.player_id AND member.league_id = pricing_season.league_id');
  definition := replace(definition, 'player.player_profile,', 'member.player_profile,');

  IF position(source_join IN definition) > 0
    OR position(source_old_join IN definition) > 0
    OR position('player.player_profile' IN definition) > 0 THEN
    RAISE EXCEPTION 'Mercado V15 manteve referencia a posicao global.';
  END IF;
  EXECUTE definition;
END;
$$;

-- Rodadas antigas ainda podem despachar para V12/V13/V14. Elas nao usam a
-- mediana historica da V15, mas tambem precisam agrupar pela tag da pelada.
DO $$
DECLARE
  market_function text;
  definition text;
  source_join_pattern constant text := 'JOIN public[.]players player[[:space:]]+ON player[.]id[[:space:]]*=[[:space:]]*history[.]player_id';
BEGIN
  FOREACH market_function IN ARRAY ARRAY[
    'public.apply_fantasy_role_market_v12(uuid)',
    'public.apply_fantasy_role_market_v13(uuid)',
    'public.apply_fantasy_role_market_v14(uuid)'
  ] LOOP
    SELECT pg_get_functiondef(market_function::regprocedure) INTO definition;
    IF (SELECT count(*) FROM regexp_matches(definition, source_join_pattern, 'g')) <> 1
      OR position('player.player_profile,' IN definition) = 0 THEN
      RAISE EXCEPTION 'Mercado historico % divergiu; revisar antes de aplicar a 296.',
        market_function;
    END IF;
    definition := regexp_replace(definition, source_join_pattern,
      'JOIN public.fantasy_seasons pricing_season ON pricing_season.id=history.fantasy_season_id AND pricing_season.id=target.fantasy_season_id
    JOIN public.league_members member ON member.player_id=history.player_id AND member.league_id=pricing_season.league_id');
    definition := replace(definition, 'player.player_profile,', 'member.player_profile,');
    IF definition ~ source_join_pattern
      OR position('player.player_profile' IN definition) > 0 THEN
      RAISE EXCEPTION 'Mercado historico % manteve posicao global.', market_function;
    END IF;
    EXECUTE definition;
  END LOOP;
END;
$$;

DO $$
DECLARE
  definition text;
  source_actor constant text := 'IF actor_user_id IS NULL OR NOT public.is_app_admin() THEN';
  source_admin_pattern constant text := 'FROM public[.]account_profiles profile[[:space:]]+WHERE profile[.]role=''admin''';
BEGIN
  SELECT pg_get_functiondef('public.reprocess_fantasy_market_v13(uuid)'::regprocedure)
    INTO definition;
  IF position(source_actor IN definition) = 0
    OR (SELECT count(*) FROM regexp_matches(definition, source_admin_pattern, 'g')) <> 1 THEN
    RAISE EXCEPTION 'Reprocessamento V13 divergiu; revisar isolamento antes de aplicar a 296.';
  END IF;

  -- A cadeia historica ainda exige ADM global e ADM da pelada. Nunca
  -- assumir que o primeiro ADM global pertence a temporada reprocessada.
  definition := replace(definition, source_actor,
    'IF actor_user_id IS NULL OR NOT public.is_app_admin()
    OR NOT public.is_league_admin(target_season.league_id) THEN');
  definition := regexp_replace(definition, source_admin_pattern,
    'FROM public.account_profiles profile
    JOIN public.league_members member ON member.user_id = profile.user_id
      AND member.league_id = target_season.league_id
      AND member.is_active AND member.role = ''admin''
    WHERE profile.role=''admin''');
  definition := replace(definition,
    'É necessário existir ao menos um administrador para reprocessar o Cartola.',
    'É necessário existir um administrador global vinculado a esta pelada para reprocessar o Cartola.');
  EXECUTE definition;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_fantasy_role_market_v074(uuid),
  public.apply_fantasy_role_market_v12(uuid),
  public.apply_fantasy_role_market_v13(uuid),
  public.apply_fantasy_role_market_v14(uuid),
  public.reprocess_fantasy_market_v13(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprocess_fantasy_market_v13(uuid) TO service_role;

COMMIT;
