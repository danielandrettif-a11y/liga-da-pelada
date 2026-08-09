-- Melhora os perfis criados por provedores OAuth, como o Google.
-- Novas contas continuam sempre com o papel de jogador.

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
  player_avatar_url TEXT;
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

  player_avatar_url := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'avatar_url'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'picture'), '')
  );

  INSERT INTO players (name, nickname, player_profile, avatar_url)
  VALUES (
    LEFT(player_name, 120),
    NULLIF(LEFT(TRIM(NEW.raw_user_meta_data ->> 'nickname'), 60), ''),
    requested_profile,
    player_avatar_url
  )
  RETURNING id INTO created_player_id;

  INSERT INTO account_profiles (user_id, role, player_id)
  VALUES (NEW.id, 'player', created_player_id);

  RETURN NEW;
END;
$$;
