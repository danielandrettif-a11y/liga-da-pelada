-- Vitrine de peladas abertas. A BQ e todas as peladas atuais continuam privadas.
-- Nenhum historico, convite ou dado de jogadores e exposto na descoberta.
BEGIN;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';
ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_visibility_check;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_visibility_check
  CHECK (visibility IN ('private', 'open'));

CREATE OR REPLACE FUNCTION public.find_open_leagues(p_query text DEFAULT '')
RETURNS TABLE(league_id uuid, league_name text, league_slug text, feature_tier text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT league.id, league.name, league.slug, league.feature_tier
  FROM public.leagues league
  WHERE auth.uid() IS NOT NULL AND league.is_active
    AND league.visibility = 'open'
    AND (NULLIF(btrim(p_query), '') IS NULL
      OR league.name ILIKE '%' || replace(replace(left(btrim(p_query), 80), '%', '\%'), '_', '\_') || '%' ESCAPE '\')
  ORDER BY league.name
  LIMIT 60;
$$;

CREATE OR REPLACE FUNCTION public.join_open_league(p_league_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_player_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta primeiro.'; END IF;
  PERFORM 1 FROM public.leagues
    WHERE id = p_league_id AND is_active AND visibility = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esta pelada nao esta aberta para entrada.'; END IF;
  SELECT profile.player_id INTO target_player_id
  FROM public.account_profiles profile WHERE profile.user_id = auth.uid();
  IF target_player_id IS NULL THEN RAISE EXCEPTION 'Complete seu perfil antes de entrar.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players player WHERE player.id = target_player_id
    AND player.member_category = 'player' AND player.is_selectable) THEN
    RAISE EXCEPTION 'Seu perfil de jogador nao esta disponivel.';
  END IF;
  INSERT INTO public.league_members (league_id, player_id, user_id, role, is_active)
  VALUES (p_league_id, target_player_id, auth.uid(), 'player', true)
  ON CONFLICT (league_id, player_id) DO UPDATE SET
    user_id = EXCLUDED.user_id, is_active = true;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_league_visibility(p_league_id uuid, p_visibility text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente ADM desta pelada pode mudar a visibilidade.';
  END IF;
  IF p_visibility NOT IN ('private', 'open') THEN
    RAISE EXCEPTION 'Visibilidade invalida.';
  END IF;
  UPDATE public.leagues SET visibility = p_visibility WHERE id = p_league_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelada nao encontrada.'; END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.find_open_leagues(text),
  public.join_open_league(uuid), public.set_league_visibility(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_open_leagues(text),
  public.join_open_league(uuid), public.set_league_visibility(uuid, text)
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
