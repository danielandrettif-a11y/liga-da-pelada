-- Fechar as entradas publicas de processamento/reprocessamento do Cartola.
-- A logica historica permanece intacta; a checagem de liga ocorre antes de
-- qualquer reset de pontuacao, preco, snapshot ou carta.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_fantasy_round_admin_for_legacy_processor(p_round_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_league_id uuid;
  season_league_id uuid;
BEGIN
  SELECT round_item.league_id, fantasy_season.league_id
    INTO target_league_id, season_league_id
  FROM public.rounds round_item
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = round_item.id
  JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id = fantasy_round.fantasy_season_id
  WHERE round_item.id = p_round_id;

  IF target_league_id IS NULL OR target_league_id IS DISTINCT FROM season_league_id THEN
    RAISE EXCEPTION 'Rodada do Cartola inexistente ou vinculada a outra pelada.';
  END IF;
  -- A cadeia legada ainda exige is_app_admin() em suas funcoes internas.
  -- Esta dupla checagem impede que um ADM global opere outra pelada e evita
  -- liberar um ADM apenas local para uma rotina que falharia no meio.
  IF NOT public.is_app_admin() OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente ADM desta pelada pode processar o Cartola.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_fantasy_round_admin_for_legacy_processor(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assert_fantasy_test_admin_for_legacy_session(p_round_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league_id uuid;
BEGIN
  SELECT round_item.league_id INTO target_league_id
  FROM public.rounds round_item
  JOIN public.leagues league ON league.id = round_item.league_id
  WHERE round_item.id = p_round_id AND league.feature_tier = 'complete';
  IF target_league_id IS NULL THEN
    RAISE EXCEPTION 'Rodada inexistente ou Cartola indisponivel nesta pelada.';
  END IF;
  IF NOT public.is_app_admin() OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente ADM desta pelada pode configurar o teste do Cartola.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_fantasy_test_admin_for_legacy_session(uuid)
  FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.process_fantasy_round_pre_scope_286(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_round(uuid)
      RENAME TO process_fantasy_round_pre_scope_286;
  END IF;
  IF to_regprocedure('public.reprocess_fantasy_from_round_pre_scope_286(uuid)') IS NULL THEN
    ALTER FUNCTION public.reprocess_fantasy_from_round(uuid)
      RENAME TO reprocess_fantasy_from_round_pre_scope_286;
  END IF;
  IF to_regprocedure('public.reprocess_fantasy_with_current_rules_pre_scope_286(uuid)') IS NULL THEN
    ALTER FUNCTION public.reprocess_fantasy_with_current_rules(uuid)
      RENAME TO reprocess_fantasy_with_current_rules_pre_scope_286;
  END IF;
  IF to_regprocedure('public.process_fantasy_test_round_pre_scope_286(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_test_round(uuid)
      RENAME TO process_fantasy_test_round_pre_scope_286;
  END IF;
  IF to_regprocedure('public.create_fantasy_test_session_pre_scope_286(uuid)') IS NULL THEN
    ALTER FUNCTION public.create_fantasy_test_session(uuid)
      RENAME TO create_fantasy_test_session_pre_scope_286;
  END IF;
  IF to_regprocedure('public.reset_fantasy_test_session_pre_scope_286(uuid)') IS NULL THEN
    ALTER FUNCTION public.reset_fantasy_test_session(uuid)
      RENAME TO reset_fantasy_test_session_pre_scope_286;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.process_fantasy_round_pre_scope_286(uuid),
  public.reprocess_fantasy_from_round_pre_scope_286(uuid),
  public.reprocess_fantasy_with_current_rules_pre_scope_286(uuid),
  public.process_fantasy_test_round_pre_scope_286(uuid),
  public.create_fantasy_test_session_pre_scope_286(uuid),
  public.reset_fantasy_test_session_pre_scope_286(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_fantasy_round_admin_for_legacy_processor(p_round_id);
  RETURN public.process_fantasy_round_pre_scope_286(p_round_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reprocess_fantasy_from_round(p_round_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_fantasy_round_admin_for_legacy_processor(p_round_id);
  RETURN public.reprocess_fantasy_from_round_pre_scope_286(p_round_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reprocess_fantasy_with_current_rules(p_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_fantasy_round_admin_for_legacy_processor(p_round_id);
  RETURN public.reprocess_fantasy_with_current_rules_pre_scope_286(p_round_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_fantasy_test_round(p_round_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league_id uuid;
BEGIN
  SELECT session_item.league_id INTO target_league_id
  FROM public.fantasy_test_sessions session_item
  JOIN public.rounds round_item ON round_item.id = session_item.round_id
    AND round_item.league_id = session_item.league_id
  WHERE session_item.round_id = p_round_id;
  IF target_league_id IS NULL THEN
    RAISE EXCEPTION 'Teste do Cartola inexistente ou vinculado a outra pelada.';
  END IF;
  IF NOT public.is_app_admin() OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente ADM desta pelada pode processar o teste do Cartola.';
  END IF;
  RETURN public.process_fantasy_test_round_pre_scope_286(p_round_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_fantasy_test_session(p_round_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_fantasy_test_admin_for_legacy_session(p_round_id);
  RETURN public.create_fantasy_test_session_pre_scope_286(p_round_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_fantasy_test_session(p_round_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_fantasy_test_admin_for_legacy_session(p_round_id);
  RETURN public.reset_fantasy_test_session_pre_scope_286(p_round_id);
END;
$$;

REVOKE ALL ON FUNCTION public.process_fantasy_round(uuid),
  public.reprocess_fantasy_from_round(uuid),
  public.reprocess_fantasy_with_current_rules(uuid),
  public.process_fantasy_test_round(uuid),
  public.create_fantasy_test_session(uuid),
  public.reset_fantasy_test_session(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(uuid),
  public.reprocess_fantasy_from_round(uuid),
  public.reprocess_fantasy_with_current_rules(uuid),
  public.process_fantasy_test_round(uuid),
  public.create_fantasy_test_session(uuid),
  public.reset_fantasy_test_session(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
