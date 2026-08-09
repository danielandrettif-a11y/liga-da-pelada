-- Fotos de provedores OAuth não devem virar automaticamente a foto do jogador.

CREATE OR REPLACE FUNCTION create_player_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_player_id UUID;
  requested_profile TEXT;
  player_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM account_profiles WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  requested_profile := COALESCE(NEW.raw_user_meta_data ->> 'player_profile', 'midfield');
  IF requested_profile NOT IN ('offensive', 'midfield', 'defensive') THEN
    requested_profile := 'midfield';
  END IF;

  player_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), '')
  );
  IF player_name IS NULL THEN
    player_name := SPLIT_PART(COALESCE(NEW.email, 'Jogador'), '@', 1);
  END IF;

  INSERT INTO players (name, nickname, player_profile, avatar_url)
  VALUES (
    LEFT(player_name, 120),
    NULLIF(LEFT(TRIM(NEW.raw_user_meta_data ->> 'nickname'), 60), ''),
    requested_profile,
    NULL
  )
  RETURNING id INTO created_player_id;

  INSERT INTO account_profiles (user_id, role, player_id)
  VALUES (NEW.id, 'player', created_player_id);

  RETURN NEW;
END;
$$;

-- Remove somente fotos que ainda são exatamente a imagem recebida do Google.
-- Fotos enviadas pelo próprio jogador permanecem intactas.
UPDATE players AS player
SET avatar_url = NULL
FROM account_profiles AS profile
JOIN auth.users AS auth_user ON auth_user.id = profile.user_id
WHERE player.id = profile.player_id
  AND COALESCE(auth_user.raw_app_meta_data ->> 'provider', '') = 'google'
  AND player.avatar_url IS NOT NULL
  AND (
    player.avatar_url = auth_user.raw_user_meta_data ->> 'avatar_url'
    OR player.avatar_url = auth_user.raw_user_meta_data ->> 'picture'
  );
