-- Garante que todo usuário autenticado tenha perfil jogável e vínculo na liga ativa.
-- Corrige contas antigas que ficaram órfãs e completa automaticamente novos cadastros.

CREATE OR REPLACE FUNCTION public.ensure_player_account_for_user(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_auth_user auth.users%ROWTYPE;
  v_profile public.account_profiles%ROWTYPE;
  v_player_id UUID;
  v_player_name TEXT;
  v_player_profile TEXT;
  v_is_goalkeeper BOOLEAN;
BEGIN
  SELECT * INTO v_auth_user
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta de usuário não encontrada.';
  END IF;

  SELECT * INTO v_profile
  FROM public.account_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_profile.player_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.players
       WHERE id = v_profile.player_id
         AND is_selectable = true
         AND member_category IN ('player', 'guest')
     ) THEN
    v_player_id := v_profile.player_id;
  ELSE
    v_player_profile := COALESCE(v_auth_user.raw_user_meta_data ->> 'player_profile', 'midfield');
    IF v_player_profile NOT IN ('offensive', 'wing', 'midfield', 'defensive') THEN
      v_player_profile := 'midfield';
    END IF;

    v_is_goalkeeper := lower(COALESCE(v_auth_user.raw_user_meta_data ->> 'is_goalkeeper', 'false'))
      IN ('true', '1', 'yes', 'on');

    v_player_name := COALESCE(
      NULLIF(trim(v_auth_user.raw_user_meta_data ->> 'name'), ''),
      NULLIF(trim(v_auth_user.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(trim(v_auth_user.raw_user_meta_data ->> 'display_name'), ''),
      split_part(COALESCE(v_auth_user.email, 'Jogador'), '@', 1)
    );

    INSERT INTO public.players (
      name,
      nickname,
      player_profile,
      is_goalkeeper,
      avatar_url,
      member_category,
      is_selectable,
      registration_source,
      created_by_user_id
    ) VALUES (
      left(v_player_name, 120),
      NULLIF(left(trim(v_auth_user.raw_user_meta_data ->> 'nickname'), 60), ''),
      v_player_profile,
      v_is_goalkeeper,
      NULL,
      'player',
      true,
      'site_signup',
      p_user_id
    )
    RETURNING id INTO v_player_id;

    INSERT INTO public.account_profiles (user_id, role, player_id)
    VALUES (p_user_id, 'player', v_player_id)
    ON CONFLICT (user_id) DO UPDATE
    SET player_id = EXCLUDED.player_id,
        updated_at = now();
  END IF;

  -- O cadastro público pertence à liga ativa e precisa estar elegível nela.
  INSERT INTO public.league_members (league_id, player_id, role, is_active)
  SELECT league.id,
         v_player_id,
         CASE WHEN COALESCE(v_profile.role, 'player') = 'admin' THEN 'admin' ELSE 'player' END,
         true
  FROM public.leagues league
  WHERE league.is_active = true
  ON CONFLICT (league_id, player_id) DO UPDATE
  SET is_active = true,
      role = CASE
        WHEN public.league_members.role = 'admin' OR EXCLUDED.role = 'admin' THEN 'admin'
        ELSE 'player'
      END;

  RETURN v_player_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_player_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  PERFORM public.ensure_player_account_for_user(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_player_account_after_signup ON auth.users;
CREATE TRIGGER create_player_account_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.create_player_account();

CREATE OR REPLACE FUNCTION public.ensure_my_player_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_player_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para concluir o cadastro.';
  END IF;

  v_player_id := public.ensure_player_account_for_user(v_user_id);
  RETURN jsonb_build_object('success', true, 'player_id', v_player_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_player_account_for_user(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_player_account() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_my_player_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_player_account() TO authenticated;

NOTIFY pgrst, 'reload schema';
