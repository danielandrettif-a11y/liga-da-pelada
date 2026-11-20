-- Autoriza o fechamento apenas ao ADM da pelada dona da rodada, sem elevar
-- o papel da conta ou confiar na pelada selecionada pelo navegador.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_official_fantasy_round_admin(p_round_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league_id uuid;
BEGIN
  SELECT r.league_id INTO target_league_id
  FROM public.rounds r
  JOIN public.fantasy_rounds fr ON fr.round_id = r.id
  JOIN public.fantasy_seasons fs ON fs.id = fr.fantasy_season_id
    AND fs.league_id = r.league_id
  WHERE r.id = p_round_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente ADM desta pelada pode processar o Cartola.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_official_fantasy_round_admin(uuid) FROM PUBLIC, anon, authenticated;

-- Os corpos sao preservados; recusamos a migration se a guarda esperada tiver
-- mudado. As funcoes internas continuam sujeitas a uma validacao da rodada.
DO $$
DECLARE signature text; definition text;
  old_guard constant text := 'IF NOT public.is_app_admin() THEN';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.process_fantasy_round_legacy_v0(uuid)',
    'public.apply_fantasy_card_activations_pre_059(uuid)'
  ] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    IF (length(definition) - length(replace(definition, old_guard, ''))) <> length(old_guard) THEN
      RAISE EXCEPTION 'Guarda inesperada em %; revisar antes de aplicar a migration 355.', signature;
    END IF;
    definition := replace(definition, old_guard,
      'IF NOT EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = p_round_id AND public.is_league_admin(r.league_id)) THEN');
    EXECUTE definition;
  END LOOP;
END $$;

-- Auditorias sem rodada especifica continuam restritas ao administrador global.
-- Com rodada, o administrador local pode auditar somente a propria pelada.
DO $$
DECLARE signature text; definition text;
  old_guard constant text := 'auth.uid() IS NOT NULL AND auth.role()<>''service_role'' AND NOT public.is_app_admin()';
  new_guard constant text := 'auth.uid() IS NOT NULL AND COALESCE(auth.role(), '''')<>''service_role'' AND NOT (public.is_app_admin() AND p_round_id IS NULL OR p_round_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.rounds r WHERE r.id=p_round_id AND public.is_league_admin(r.league_id)))';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.audit_fantasy_scoring_integrity(uuid)',
    'public.audit_fantasy_scoring_integrity_pre_ranked_v14_238(uuid)',
    'public.audit_fantasy_scoring_integrity_pre_v12_222(uuid)'
  ] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    IF position(old_guard IN definition) = 0 THEN
      RAISE EXCEPTION 'Guarda inesperada em %; revisar antes de aplicar a migration 355.', signature;
    END IF;
    EXECUTE replace(definition, old_guard, new_guard);
  END LOOP;
END $$;

DO $$
DECLARE definition text;
  old_guard constant text := 'auth.role() <> ''service_role'' AND NOT public.is_app_admin()';
BEGIN
  SELECT pg_get_functiondef('public.reconcile_fantasy_round_totals(uuid)'::regprocedure) INTO definition;
  IF position(old_guard IN definition) = 0 THEN
    RAISE EXCEPTION 'Guarda da reconciliacao divergiu; revisar antes de aplicar a migration 355.';
  END IF;
  EXECUTE replace(definition, old_guard,
    'COALESCE(auth.role(), '''') <> ''service_role'' AND NOT EXISTS (SELECT 1 FROM public.rounds r WHERE r.id=p_round_id AND public.is_league_admin(r.league_id))');
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_official_fantasy_round_admin(p_round_id);
  RETURN public.process_fantasy_round_pre_scope_286(p_round_id);
END;
$$;

REVOKE ALL ON FUNCTION public.process_fantasy_round_legacy_v0(uuid),
  public.apply_fantasy_card_activations_pre_059(uuid),
  public.audit_fantasy_scoring_integrity_pre_ranked_v14_238(uuid),
  public.audit_fantasy_scoring_integrity_pre_v12_222(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fantasy_round(uuid),
  public.reconcile_fantasy_round_totals(uuid),
  public.audit_fantasy_scoring_integrity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(uuid),
  public.reconcile_fantasy_round_totals(uuid),
  public.audit_fantasy_scoring_integrity(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
