-- A tag serve apenas como estimativa inicial para o elenco oficial já
-- existente. Quem entrar daqui para frente será avaliado pelas atuações.

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS overall_seed_mode TEXT NOT NULL DEFAULT 'observed';

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_overall_seed_mode_check;

ALTER TABLE public.players
  ADD CONSTRAINT players_overall_seed_mode_check
  CHECK (overall_seed_mode IN ('legacy_tag', 'observed'));

-- O retrato do elenco no momento desta migration é o único que recebe a
-- estimativa temporária de posição. Convidados nunca entram no cálculo.
UPDATE public.players
SET overall_seed_mode = CASE
  WHEN member_category = 'player' THEN 'legacy_tag'
  ELSE 'observed'
END;

-- Cadastros públicos novos recebem uma posição operacional neutra para o
-- sorteio atual, mas o OVR deles sempre nasce no modo observado.
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
  v_is_goalkeeper BOOLEAN;
BEGIN
  SELECT * INTO v_auth_user FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta de usuário não encontrada.'; END IF;

  SELECT * INTO v_profile FROM public.account_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF v_profile.player_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.players
    WHERE id = v_profile.player_id AND is_selectable = true AND member_category IN ('player', 'guest')
  ) THEN
    v_player_id := v_profile.player_id;
  ELSE
    v_is_goalkeeper := lower(COALESCE(v_auth_user.raw_user_meta_data ->> 'is_goalkeeper', 'false')) IN ('true', '1', 'yes', 'on');
    v_player_name := COALESCE(
      NULLIF(trim(v_auth_user.raw_user_meta_data ->> 'name'), ''),
      NULLIF(trim(v_auth_user.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(trim(v_auth_user.raw_user_meta_data ->> 'display_name'), ''),
      split_part(COALESCE(v_auth_user.email, 'Jogador'), '@', 1)
    );

    INSERT INTO public.players (
      name, nickname, player_profile, overall_seed_mode, is_goalkeeper,
      avatar_url, member_category, is_selectable, registration_source, created_by_user_id
    ) VALUES (
      left(v_player_name, 120),
      NULLIF(left(trim(v_auth_user.raw_user_meta_data ->> 'nickname'), 60), ''),
      'midfield', 'observed', v_is_goalkeeper, NULL, 'player', true, 'site_signup', p_user_id
    ) RETURNING id INTO v_player_id;

    INSERT INTO public.account_profiles (user_id, role, player_id)
    VALUES (p_user_id, 'player', v_player_id)
    ON CONFLICT (user_id) DO UPDATE SET player_id = EXCLUDED.player_id, updated_at = now();
  END IF;

  INSERT INTO public.league_members (league_id, player_id, role, is_active)
  SELECT league.id, v_player_id,
         CASE WHEN COALESCE(v_profile.role, 'player') = 'admin' THEN 'admin' ELSE 'player' END,
         true
  FROM public.leagues league
  WHERE league.is_active = true
  ON CONFLICT (league_id, player_id) DO UPDATE
  SET is_active = true,
      role = CASE WHEN public.league_members.role = 'admin' OR EXCLUDED.role = 'admin' THEN 'admin' ELSE 'player' END;
  RETURN v_player_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
