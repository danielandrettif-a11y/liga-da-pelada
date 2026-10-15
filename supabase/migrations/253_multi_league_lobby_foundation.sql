-- Base de identidade e participacao para varias peladas.
-- A criacao de novas ligas so sera exposta depois da auditoria de isolamento
-- das consultas e RPCs historicas do aplicativo.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS slug text;

CREATE UNIQUE INDEX IF NOT EXISTS leagues_slug_unique ON public.leagues (lower(slug)) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.league_invites (
  league_id uuid PRIMARY KEY REFERENCES public.leagues(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.league_invites (league_id)
SELECT id FROM public.leagues ON CONFLICT (league_id) DO NOTHING;
ALTER TABLE public.league_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.league_invites FROM PUBLIC, anon, authenticated;

DO $$
DECLARE item record; desired text; suffix integer := 0;
BEGIN
  FOR item IN SELECT id, name FROM public.leagues WHERE slug IS NULL ORDER BY created_at, id LOOP
    desired := trim(both '-' from regexp_replace(
      translate(lower(item.name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
      '[^a-z0-9]+', '-', 'g'));
    IF desired = '' THEN desired := 'pelada'; END IF;
    WHILE EXISTS (SELECT 1 FROM public.leagues WHERE lower(slug) = lower(desired || CASE WHEN suffix = 0 THEN '' ELSE '-' || suffix END)) LOOP
      suffix := suffix + 1;
    END LOOP;
    UPDATE public.leagues SET slug = desired || CASE WHEN suffix = 0 THEN '' ELSE '-' || suffix END WHERE id = item.id;
    suffix := 0;
  END LOOP;
END $$;

ALTER TABLE public.leagues ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.account_profiles
  ADD COLUMN IF NOT EXISTS account_tag text;
CREATE UNIQUE INDEX IF NOT EXISTS account_profiles_tag_unique ON public.account_profiles (lower(account_tag)) WHERE account_tag IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_account_tag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base_name text; candidate text; attempt integer := 0;
BEGIN
  IF NEW.account_tag IS NOT NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(nickname, ''), name) INTO base_name FROM public.players WHERE id = NEW.player_id;
  base_name := trim(both '_' from regexp_replace(
    translate(lower(COALESCE(base_name, 'jogador')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+', '_', 'g'));
  IF base_name = '' THEN base_name := 'jogador'; END IF;
  LOOP
    candidate := left(base_name, 30) || '#' || lpad((floor(random() * 1000000))::integer::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.account_profiles WHERE lower(account_tag) = candidate);
    attempt := attempt + 1;
    IF attempt > 100 THEN RAISE EXCEPTION 'Nao foi possivel gerar identificador de conta.'; END IF;
  END LOOP;
  NEW.account_tag := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_profiles_assign_tag ON public.account_profiles;
CREATE TRIGGER account_profiles_assign_tag BEFORE INSERT ON public.account_profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_account_tag();

DO $$
DECLARE item record; base_name text; candidate text;
BEGIN
  FOR item IN SELECT profile.user_id, COALESCE(NULLIF(player.nickname, ''), player.name, 'jogador') AS name
    FROM public.account_profiles profile LEFT JOIN public.players player ON player.id = profile.player_id
    WHERE profile.account_tag IS NULL ORDER BY profile.created_at, profile.user_id LOOP
    base_name := trim(both '_' from regexp_replace(
      translate(lower(item.name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
      '[^a-z0-9]+', '_', 'g'));
    IF base_name = '' THEN base_name := 'jogador'; END IF;
    LOOP
      candidate := left(base_name, 30) || '#' || lpad((floor(random() * 1000000))::integer::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.account_profiles WHERE lower(account_tag) = candidate);
    END LOOP;
    UPDATE public.account_profiles SET account_tag = candidate WHERE user_id = item.user_id;
  END LOOP;
END $$;

ALTER TABLE public.league_members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

UPDATE public.league_members membership SET user_id = profile.user_id
FROM public.account_profiles profile
WHERE profile.player_id = membership.player_id AND membership.user_id IS NULL;

-- Administradores anteriores continuam administrando a BQ, sem ganhar
-- permissao automatica sobre futuras peladas.
INSERT INTO public.league_members (league_id, player_id, user_id, role, is_active)
SELECT original_league.id, profile.player_id, profile.user_id, 'admin', true
FROM public.account_profiles profile
CROSS JOIN LATERAL (SELECT id FROM public.leagues ORDER BY created_at, id LIMIT 1) original_league
WHERE profile.role = 'admin' AND profile.player_id IS NOT NULL
ON CONFLICT (league_id, player_id) DO UPDATE SET role = 'admin', is_active = true,
  user_id = EXCLUDED.user_id;

CREATE INDEX IF NOT EXISTS league_members_user_active
  ON public.league_members (user_id, is_active, is_favorite) WHERE user_id IS NOT NULL;

-- Mantem o vinculo da conta consistente quando um convidado e unido a um
-- perfil oficial. Sem unicidade por usuario aqui: o merge transfere o vinculo
-- em duas etapas na mesma transacao (insere destino, apaga origem).
CREATE OR REPLACE FUNCTION public.sync_league_member_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT user_id INTO NEW.user_id FROM public.account_profiles WHERE player_id = NEW.player_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS league_members_sync_account ON public.league_members;
CREATE TRIGGER league_members_sync_account BEFORE INSERT OR UPDATE OF player_id, role, is_active
ON public.league_members FOR EACH ROW EXECUTE FUNCTION public.sync_league_member_account();

CREATE OR REPLACE FUNCTION public.is_league_member(p_league_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = p_league_id AND user_id = auth.uid() AND is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.is_league_admin(p_league_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = p_league_id AND user_id = auth.uid() AND is_active AND role = 'admin'
  );
$$;

CREATE TABLE IF NOT EXISTS public.league_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (league_id, user_id)
);

CREATE INDEX IF NOT EXISTS league_join_requests_pending_idx
  ON public.league_join_requests (league_id, status, requested_at);

ALTER TABLE public.league_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY league_join_requests_read ON public.league_join_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_league_admin(league_id));
REVOKE ALL ON public.league_join_requests FROM PUBLIC, anon;
GRANT SELECT ON public.league_join_requests TO authenticated;

CREATE POLICY account_profiles_league_applicants_read ON public.account_profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.league_join_requests request
    WHERE request.user_id = account_profiles.user_id AND request.status = 'pending'
      AND public.is_league_admin(request.league_id)
  ));

CREATE OR REPLACE FUNCTION public.toggle_league_favorite(p_league_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result boolean;
BEGIN
  UPDATE public.league_members SET is_favorite = NOT is_favorite
  WHERE league_id = p_league_id AND user_id = auth.uid() AND is_active
  RETURNING is_favorite INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voce nao participa desta pelada.'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_league_membership(p_invite_token uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para pedir acesso.'; END IF;
  SELECT league.id INTO target_league FROM public.league_invites invite
  JOIN public.leagues league ON league.id = invite.league_id
  WHERE invite.token = p_invite_token AND league.is_active;
  IF target_league IS NULL THEN RAISE EXCEPTION 'Convite invalido ou expirado.'; END IF;
  IF public.is_league_member(target_league) THEN RETURN target_league; END IF;
  INSERT INTO public.league_join_requests (league_id, user_id, status, requested_at, reviewed_at, reviewed_by)
  VALUES (target_league, auth.uid(), 'pending', now(), NULL, NULL)
  ON CONFLICT (league_id, user_id) DO UPDATE SET
    status = 'pending', requested_at = now(), reviewed_at = NULL, reviewed_by = NULL;
  RETURN target_league;
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_league_invite(p_token uuid)
RETURNS TABLE(league_id uuid, league_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT league.id, league.name FROM public.league_invites invite
  JOIN public.leagues league ON league.id = invite.league_id
  WHERE invite.token = p_token AND league.is_active;
$$;

CREATE OR REPLACE FUNCTION public.get_league_invite(p_league_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.'; END IF;
  SELECT token INTO result FROM public.league_invites WHERE league_id = p_league_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_account_for_league(p_league_id uuid, p_account_tag text)
RETURNS TABLE(user_id uuid, account_tag text, player_name text, already_member boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.'; END IF;
  RETURN QUERY SELECT profile.user_id, profile.account_tag, player.name,
    EXISTS (SELECT 1 FROM public.league_members membership
      WHERE membership.league_id = p_league_id AND membership.user_id = profile.user_id AND membership.is_active)
  FROM public.account_profiles profile JOIN public.players player ON player.id = profile.player_id
  WHERE lower(profile.account_tag) = lower(trim(p_account_tag)) LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_account_to_league(p_league_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_player_id uuid;
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.'; END IF;
  SELECT player_id INTO target_player_id FROM public.account_profiles WHERE user_id = p_user_id;
  IF target_player_id IS NULL THEN RAISE EXCEPTION 'Conta sem perfil de jogador.'; END IF;
  INSERT INTO public.league_members (league_id, player_id, user_id, role, is_active)
  VALUES (p_league_id, target_player_id, p_user_id, 'player', true)
  ON CONFLICT (league_id, player_id) DO UPDATE SET is_active = true, user_id = EXCLUDED.user_id;
  UPDATE public.league_join_requests SET status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  WHERE league_id = p_league_id AND user_id = p_user_id AND status = 'pending';
  RETURN true;
END;
$$;

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
      player_profile, overall_seed_mode, registration_source, created_by_user_id)
    VALUES (clean_name, 'guest', true, false, 'midfield', 'observed', 'admin', auth.uid())
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

CREATE OR REPLACE FUNCTION public.review_league_membership(p_request_id uuid, p_approve boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE request_item public.league_join_requests%ROWTYPE; player_id uuid;
BEGIN
  SELECT * INTO request_item FROM public.league_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR request_item.status <> 'pending' THEN RAISE EXCEPTION 'Pedido pendente nao encontrado.'; END IF;
  IF NOT public.is_league_admin(request_item.league_id) THEN RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.'; END IF;
  IF p_approve THEN
    SELECT profile.player_id INTO player_id FROM public.account_profiles profile WHERE profile.user_id = request_item.user_id;
    IF player_id IS NULL THEN RAISE EXCEPTION 'A conta ainda nao possui perfil de jogador.'; END IF;
    INSERT INTO public.league_members (league_id, player_id, user_id, role, is_active)
    VALUES (request_item.league_id, player_id, request_item.user_id, 'player', true)
    ON CONFLICT (league_id, player_id) DO UPDATE SET is_active = true, user_id = EXCLUDED.user_id;
  END IF;
  UPDATE public.league_join_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewed_at = now(), reviewed_by = auth.uid() WHERE id = p_request_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_league_favorite(uuid), public.request_league_membership(uuid),
  public.review_league_membership(uuid, boolean), public.get_league_invite(uuid),
  public.find_account_for_league(uuid, text), public.add_account_to_league(uuid, uuid),
  public.import_league_guest_roster(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_league_favorite(uuid), public.request_league_membership(uuid),
  public.review_league_membership(uuid, boolean), public.get_league_invite(uuid),
  public.is_league_member(uuid), public.is_league_admin(uuid),
  public.find_account_for_league(uuid, text), public.add_account_to_league(uuid, uuid),
  public.import_league_guest_roster(uuid, text[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_league_invite(uuid) TO anon, authenticated;

-- O cadastro cria uma identidade global. O vinculo a uma pelada agora depende
-- de convite aprovado ou de inclusao feita pelo ADM.
CREATE OR REPLACE FUNCTION public.ensure_player_account_for_user(p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE auth_user auth.users%ROWTYPE; profile public.account_profiles%ROWTYPE; player_id uuid; player_name text;
BEGIN
  SELECT * INTO auth_user FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta nao encontrada.'; END IF;
  SELECT * INTO profile FROM public.account_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF profile.player_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.players WHERE id = profile.player_id
      AND is_selectable = true AND member_category IN ('player', 'guest')
  ) THEN
    RETURN profile.player_id;
  END IF;
  player_name := COALESCE(NULLIF(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
    NULLIF(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(trim(auth_user.raw_user_meta_data ->> 'display_name'), ''),
    split_part(COALESCE(auth_user.email, 'Jogador'), '@', 1));
  INSERT INTO public.players (name, nickname, player_profile, overall_seed_mode, is_goalkeeper,
    avatar_url, member_category, is_selectable, registration_source, created_by_user_id)
  VALUES (left(player_name, 120), NULLIF(left(trim(auth_user.raw_user_meta_data ->> 'nickname'), 60), ''),
    'midfield', 'observed', lower(COALESCE(auth_user.raw_user_meta_data ->> 'is_goalkeeper', 'false')) IN ('true', '1', 'yes', 'on'),
    NULL, 'player', true, 'site_signup', p_user_id)
  RETURNING id INTO player_id;
  INSERT INTO public.account_profiles (user_id, role, player_id)
  VALUES (p_user_id, 'player', player_id)
  ON CONFLICT (user_id) DO UPDATE SET player_id = EXCLUDED.player_id, updated_at = now();
  RETURN player_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
