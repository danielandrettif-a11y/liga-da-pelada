-- O reprocessamento altera a temporada desde a rodada informada. Verifique
-- toda a temporada antes de permitir qualquer escrita, mesmo em dados antigos.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_fantasy_reprocess_admin(p_round_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_season_id uuid; target_league_id uuid;
BEGIN
  PERFORM public.assert_official_fantasy_round_admin(p_round_id);
  SELECT fr.fantasy_season_id, r.league_id INTO target_season_id, target_league_id
  FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id = fr.round_id
  WHERE fr.round_id = p_round_id;
  IF EXISTS (
    SELECT 1 FROM public.fantasy_rounds fr
    LEFT JOIN public.rounds r ON r.id = fr.round_id
    WHERE fr.fantasy_season_id = target_season_id
      AND (r.id IS NULL OR r.league_id IS DISTINCT FROM target_league_id)
  ) THEN
    RAISE EXCEPTION 'Temporada do Cartola contem rodada vinculada a outra pelada.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_fantasy_reprocess_admin(uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE signature text; definition text;
  old_guard constant text := 'IF NOT public.is_app_admin() THEN';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.reprocess_fantasy_from_round_pre_scope_286(uuid)',
    'public.reprocess_fantasy_with_current_rules_pre_scope_286(uuid)'
  ] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    IF (length(definition) - length(replace(definition, old_guard, ''))) <> length(old_guard) THEN
      RAISE EXCEPTION 'Guarda inesperada em %; revisar antes da migration 356.', signature;
    END IF;
    EXECUTE replace(definition, old_guard,
      'IF NOT EXISTS (SELECT 1 FROM public.rounds r WHERE r.id=p_round_id AND public.is_league_admin(r.league_id)) THEN');
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.reprocess_fantasy_from_round(p_round_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_fantasy_reprocess_admin(p_round_id);
  RETURN public.reprocess_fantasy_from_round_pre_scope_286(p_round_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reprocess_fantasy_with_current_rules(p_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_fantasy_reprocess_admin(p_round_id);
  RETURN public.reprocess_fantasy_with_current_rules_pre_scope_286(p_round_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reprocess_fantasy_from_round_pre_scope_286(uuid),
  public.reprocess_fantasy_with_current_rules_pre_scope_286(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reprocess_fantasy_from_round(uuid),
  public.reprocess_fantasy_with_current_rules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reprocess_fantasy_from_round(uuid),
  public.reprocess_fantasy_with_current_rules(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
