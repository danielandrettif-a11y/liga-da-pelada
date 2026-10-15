-- O cadastro cria apenas a identidade global. A participacao em uma pelada
-- acontece por convite, entrada em pelada aberta ou acao de um ADM.
BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_player_account_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  auth_user auth.users%ROWTYPE;
  existing_player_id uuid;
  created_player_id uuid;
  player_name text;
  player_profile text;
  player_is_goalkeeper boolean;
BEGIN
  SELECT * INTO auth_user
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta de usuario nao encontrada.';
  END IF;

  SELECT profile.player_id INTO existing_player_id
  FROM public.account_profiles profile
  WHERE profile.user_id = p_user_id
  FOR UPDATE;

  IF existing_player_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.players player
    WHERE player.id = existing_player_id
      AND player.member_category IN ('player', 'guest')
  ) THEN
    RETURN existing_player_id;
  END IF;

  player_profile := COALESCE(
    NULLIF(auth_user.raw_user_meta_data ->> 'player_profile', ''),
    'offensive'
  );
  IF player_profile NOT IN ('offensive', 'defensive') THEN
    player_profile := 'offensive';
  END IF;

  player_is_goalkeeper := lower(COALESCE(
    auth_user.raw_user_meta_data ->> 'is_goalkeeper', 'false'
  )) IN ('true', '1', 'yes', 'on');

  player_name := COALESCE(
    NULLIF(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
    NULLIF(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(auth_user.raw_user_meta_data ->> 'display_name'), ''),
    split_part(COALESCE(auth_user.email, 'Jogador'), '@', 1)
  );

  INSERT INTO public.players (
    name,
    nickname,
    player_profile,
    initial_player_profile,
    overall_traits,
    overall_seed_mode,
    is_goalkeeper,
    avatar_url,
    member_category,
    is_selectable,
    registration_source,
    created_by_user_id
  ) VALUES (
    left(player_name, 120),
    NULLIF(left(btrim(auth_user.raw_user_meta_data ->> 'nickname'), 60), ''),
    player_profile,
    player_profile,
    ARRAY[player_profile]::text[],
    'observed',
    player_is_goalkeeper,
    NULL,
    'player',
    true,
    'site_signup',
    p_user_id
  )
  RETURNING id INTO created_player_id;

  INSERT INTO public.account_profiles (user_id, role, player_id)
  VALUES (p_user_id, 'player', created_player_id)
  ON CONFLICT (user_id) DO UPDATE
  SET player_id = EXCLUDED.player_id,
      updated_at = now();

  RETURN created_player_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_player_account_for_user(uuid)
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS create_player_account_after_signup ON auth.users;
CREATE TRIGGER create_player_account_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.create_player_account();

NOTIFY pgrst, 'reload schema';
COMMIT;
