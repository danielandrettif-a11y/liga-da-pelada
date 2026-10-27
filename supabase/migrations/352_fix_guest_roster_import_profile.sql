-- Mantém a importação administrativa alinhada ao modelo de perfis vigente.
-- `midfield` deixou de ser aceito como perfil persistido na migration 220,
-- mas a RPC criada na 253 ainda tentava gravá-lo.

BEGIN;

CREATE OR REPLACE FUNCTION public.import_league_guest_roster(p_league_id uuid, p_names text[])
RETURNS TABLE(created_name text, player_id uuid, added_to_callup boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE raw_name text; clean_name text; created_player_id uuid; open_callup_id uuid;
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.'; END IF;
  IF COALESCE(array_length(p_names, 1), 0) > 100 THEN RAISE EXCEPTION 'Importe no maximo 100 nomes por vez.'; END IF;
  PERFORM 1 FROM public.leagues WHERE id = p_league_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelada nao encontrada.'; END IF;
  SELECT id INTO open_callup_id FROM public.callups
  WHERE league_id = p_league_id AND status = 'open'
  ORDER BY date DESC, created_at DESC LIMIT 1;
  FOREACH raw_name IN ARRAY p_names LOOP
    clean_name := left(trim(regexp_replace(COALESCE(raw_name, ''), '\s+', ' ', 'g')), 120);
    IF length(clean_name) < 2 THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.league_members membership
      JOIN public.players player ON player.id = membership.player_id
      WHERE membership.league_id = p_league_id AND lower(player.name) = lower(clean_name)) THEN CONTINUE; END IF;
    INSERT INTO public.players (name, member_category, is_selectable, is_goalkeeper,
      player_profile, overall_traits, overall_seed_mode, registration_source, created_by_user_id)
    VALUES (clean_name, 'guest', true, false, 'offensive', ARRAY['offensive']::text[],
      'observed', 'admin', auth.uid())
    RETURNING id INTO created_player_id;
    INSERT INTO public.league_members (league_id, player_id, role, is_active)
    VALUES (p_league_id, created_player_id, 'player', true);
    IF open_callup_id IS NOT NULL THEN
      PERFORM public.add_player_to_callup(open_callup_id, created_player_id, false);
    END IF;
    created_name := clean_name; player_id := created_player_id;
    added_to_callup := open_callup_id IS NOT NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.import_league_guest_roster(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_league_guest_roster(uuid, text[]) TO authenticated;

COMMENT ON FUNCTION public.import_league_guest_roster(uuid, text[]) IS
  'Importa convidados na pelada com perfil competitivo vigente e inclui na convocacao aberta, quando houver.';

COMMIT;
