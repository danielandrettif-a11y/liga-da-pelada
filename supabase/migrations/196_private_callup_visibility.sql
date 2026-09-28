-- Convocações começam privadas: somente ADMs e quem recebeu o link consegue vê-las.
ALTER TABLE public.callups
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS callups_invite_token_key
  ON public.callups (invite_token);

CREATE TABLE IF NOT EXISTS public.callup_invite_access (
  callup_id UUID NOT NULL REFERENCES public.callups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (callup_id, user_id)
);

ALTER TABLE public.callup_invite_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.callup_invite_access FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_access_callup(p_callup_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.callups callup
    WHERE callup.id = p_callup_id
      AND (
        callup.is_public
        OR public.is_app_admin()
        OR EXISTS (
          SELECT 1
          FROM public.callup_invite_access access
          WHERE access.callup_id = callup.id
            AND access.user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.claim_callup_invite(
  p_callup_id UUID,
  p_invite_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para abrir este convite.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.callups
    WHERE id = p_callup_id
      AND invite_token = p_invite_token
      AND status IN ('open', 'locked', 'converted')
  ) THEN
    RAISE EXCEPTION 'Convite inválido ou convocação indisponível.';
  END IF;

  INSERT INTO public.callup_invite_access (callup_id, user_id)
  VALUES (p_callup_id, auth.uid())
  ON CONFLICT (callup_id, user_id) DO NOTHING;

  RETURN true;
END;
$$;

DROP POLICY IF EXISTS "Public read callups" ON public.callups;
DROP POLICY IF EXISTS "Visible callups" ON public.callups;
CREATE POLICY "Visible callups" ON public.callups
FOR SELECT TO anon, authenticated
USING (public.can_access_callup(id));

DROP POLICY IF EXISTS "Public read callup entries" ON public.callup_entries;
DROP POLICY IF EXISTS "Visible callup entries" ON public.callup_entries;
CREATE POLICY "Visible callup entries" ON public.callup_entries
FOR SELECT TO anon, authenticated
USING (public.can_access_callup(callup_id));

CREATE OR REPLACE FUNCTION public.add_player_to_callup(
  p_callup_id UUID,
  p_player_id UUID,
  p_admin_only BOOLEAN DEFAULT false
)
RETURNS public.callup_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  created_entry public.callup_entries%ROWTYPE;
  confirmed_count INTEGER;
  next_position INTEGER;
  target_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para participar.'; END IF;
  IF p_admin_only AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem gerenciar a lista.';
  END IF;

  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
  FOR UPDATE;
  IF NOT FOUND OR current_callup.status NOT IN ('open', 'converted') THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;
  IF NOT public.can_access_callup(p_callup_id) THEN
    RAISE EXCEPTION 'Esta convocacao é privada. Use o convite enviado pelo ADM.';
  END IF;
  IF current_callup.status = 'converted' AND current_callup.round_id IS NULL THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;
  IF current_callup.round_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.matches match_item
    WHERE match_item.round_id = current_callup.round_id
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
  ) THEN
    RAISE EXCEPTION 'A convocacao foi encerrada porque o primeiro jogo ja comecou.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players player
    WHERE player.id = p_player_id
      AND player.is_selectable = true
      AND player.member_category IN ('player', 'guest')
  ) THEN
    RAISE EXCEPTION 'Este perfil nao pode participar da convocacao.';
  END IF;

  INSERT INTO public.league_members (league_id, player_id, role, is_active)
  VALUES (current_callup.league_id, p_player_id, 'player', true)
  ON CONFLICT (league_id, player_id) DO UPDATE SET is_active = true;

  SELECT * INTO created_entry
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND player_id = p_player_id;
  IF FOUND THEN RETURN created_entry; END IF;

  PERFORM public.normalize_callup_positions(p_callup_id);
  IF current_callup.status = 'converted' THEN
    target_status := 'waitlist';
  ELSE
    SELECT count(*) INTO confirmed_count
    FROM public.callup_entries
    WHERE callup_id = p_callup_id AND status = 'confirmed';
    target_status := CASE WHEN confirmed_count < current_callup.capacity THEN 'confirmed' ELSE 'waitlist' END;
  END IF;

  SELECT COALESCE(max(position), 0) + 1 INTO next_position
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND status = target_status;

  INSERT INTO public.callup_entries (callup_id, player_id, status, position, joined_by)
  VALUES (p_callup_id, p_player_id, target_status, next_position, auth.uid())
  RETURNING * INTO created_entry;

  RETURN created_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_callup_guest(
  p_callup_id UUID,
  p_name TEXT,
  p_player_profile TEXT DEFAULT 'midfield',
  p_is_goalkeeper BOOLEAN DEFAULT false
)
RETURNS public.callup_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  guest_player public.players%ROWTYPE;
  created_entry public.callup_entries%ROWTYPE;
  clean_name TEXT := left(trim(COALESCE(p_name, '')), 120);
  clean_profile TEXT := COALESCE(p_player_profile, 'midfield');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para contratar um amigo.'; END IF;
  IF length(clean_name) < 2 THEN RAISE EXCEPTION 'Informe o nome do seu amigo (pelo menos 2 letras).'; END IF;
  IF clean_profile NOT IN ('offensive', 'midfield', 'defensive') THEN clean_profile := 'midfield'; END IF;

  SELECT * INTO current_callup FROM public.callups WHERE id = p_callup_id FOR UPDATE;
  IF NOT FOUND OR current_callup.status NOT IN ('open', 'converted') THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;
  IF NOT public.can_access_callup(p_callup_id) THEN
    RAISE EXCEPTION 'Esta convocacao é privada. Use o convite enviado pelo ADM.';
  END IF;
  IF current_callup.status = 'converted' AND current_callup.round_id IS NULL THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;
  IF current_callup.round_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = current_callup.round_id
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
  ) THEN
    RAISE EXCEPTION 'A convocacao foi encerrada porque o primeiro jogo ja comecou.';
  END IF;

  INSERT INTO public.players (
    name, member_category, is_selectable, is_goalkeeper, player_profile,
    registration_source, created_by_user_id
  ) VALUES (
    clean_name, 'guest', true, COALESCE(p_is_goalkeeper, false), clean_profile,
    'site_signup', auth.uid()
  ) RETURNING * INTO guest_player;

  INSERT INTO public.league_members (league_id, player_id, role, is_active)
  VALUES (current_callup.league_id, guest_player.id, 'player', true);

  SELECT * INTO created_entry
  FROM public.add_player_to_callup(p_callup_id, guest_player.id, false);
  RETURN created_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_callup_entry_joiners(p_callup_ids UUID[])
RETURNS TABLE (
  callup_entry_id UUID,
  joined_by_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    entry.id AS callup_entry_id,
    COALESCE(NULLIF(TRIM(joiner.nickname), ''), joiner.name) AS joined_by_name
  FROM public.callup_entries AS entry
  JOIN public.callups AS callup ON callup.id = entry.callup_id
  JOIN public.account_profiles AS account ON account.user_id = entry.joined_by
  JOIN public.players AS joiner ON joiner.id = account.player_id
  WHERE entry.callup_id = ANY(COALESCE(p_callup_ids, ARRAY[]::UUID[]))
    AND public.can_access_callup(entry.callup_id)
    AND callup.status IN ('open', 'locked')
    AND joiner.id IS DISTINCT FROM entry.player_id;
$$;

REVOKE ALL ON FUNCTION public.claim_callup_invite(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_callup_invite(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_callup_entry_joiners(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_callup_entry_joiners(UUID[]) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.add_player_to_callup(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_player_to_callup(UUID, UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.create_callup_guest(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_callup_guest(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
