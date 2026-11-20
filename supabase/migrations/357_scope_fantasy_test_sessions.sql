-- As sessoes de teste sao isoladas por pelada e nao exigem papel global.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_fantasy_test_admin_for_legacy_session(p_round_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league_id uuid;
BEGIN
  SELECT r.league_id INTO target_league_id
  FROM public.rounds r JOIN public.leagues league ON league.id=r.league_id
  WHERE r.id=p_round_id AND league.feature_tier='complete';
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente ADM desta pelada pode configurar o teste do Cartola.';
  END IF;
END;
$$;

DO $$
DECLARE signature text; definition text;
  old_guard constant text := 'IF NOT public.is_app_admin() THEN';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.create_fantasy_test_session_pre_scope_286(uuid)',
    'public.reset_fantasy_test_session_pre_scope_286(uuid)',
    'public.process_fantasy_test_round_legacy_v0(uuid)'
  ] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    IF (length(definition)-length(replace(definition,old_guard,''))) <> length(old_guard) THEN
      RAISE EXCEPTION 'Guarda inesperada em %; revisar antes da migration 357.', signature;
    END IF;
    EXECUTE replace(definition, old_guard,
      'IF NOT EXISTS (SELECT 1 FROM public.rounds r WHERE r.id=p_round_id AND public.is_league_admin(r.league_id)) THEN');
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_test_round(p_round_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_fantasy_test_admin_for_legacy_session(p_round_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.fantasy_test_sessions s
    JOIN public.rounds r ON r.id=s.round_id AND r.league_id=s.league_id
    WHERE s.round_id=p_round_id
  ) THEN
    RAISE EXCEPTION 'Teste do Cartola inexistente ou vinculado a outra pelada.';
  END IF;
  RETURN public.process_fantasy_test_round_pre_scope_286(p_round_id);
END;
$$;

REVOKE ALL ON FUNCTION public.assert_fantasy_test_admin_for_legacy_session(uuid),
  public.create_fantasy_test_session_pre_scope_286(uuid),
  public.reset_fantasy_test_session_pre_scope_286(uuid),
  public.process_fantasy_test_round_legacy_v0(uuid),
  public.process_fantasy_test_round_pre_scope_286(uuid),
  public.lock_fantasy_test_market(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_fantasy_test_session(uuid),
  public.reset_fantasy_test_session(uuid), public.process_fantasy_test_round(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_fantasy_test_session(uuid),
  public.reset_fantasy_test_session(uuid), public.process_fantasy_test_round(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
