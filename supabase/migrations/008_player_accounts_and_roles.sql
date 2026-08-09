-- Contas de jogadores, administradores manuais e permissoes por papel.
-- Execute depois das migrations 006 e 007.

CREATE TABLE IF NOT EXISTS account_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('admin', 'player')),
  player_id UUID UNIQUE REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Todas as contas anteriores ao cadastro publico sao preservadas como ADM.
INSERT INTO account_profiles (user_id, role)
SELECT id, 'admin'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM account_profiles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  );
$$;

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

  player_name := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), '');
  IF player_name IS NULL THEN
    player_name := SPLIT_PART(COALESCE(NEW.email, 'Jogador'), '@', 1);
  END IF;

  INSERT INTO players (name, nickname, player_profile)
  VALUES (
    LEFT(player_name, 120),
    NULLIF(LEFT(TRIM(NEW.raw_user_meta_data ->> 'nickname'), 60), ''),
    requested_profile
  )
  RETURNING id INTO created_player_id;

  INSERT INTO account_profiles (user_id, role, player_id)
  VALUES (NEW.id, 'player', created_player_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_player_account_after_signup ON auth.users;
CREATE TRIGGER create_player_account_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION create_player_account();

ALTER TABLE account_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own account" ON account_profiles;
CREATE POLICY "Users can view own account"
ON account_profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_app_admin());

DROP POLICY IF EXISTS "Admins can manage accounts" ON account_profiles;
CREATE POLICY "Admins can manage accounts"
ON account_profiles FOR ALL
TO authenticated
USING (is_app_admin())
WITH CHECK (is_app_admin());

-- Substitui as politicas amplas da migration 007 por permissoes reais de ADM.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'leagues', 'league_members', 'ranking_rules', 'rounds', 'round_players',
    'teams', 'team_players', 'matches', 'match_events', 'player_round_stats',
    'seasons', 'round_payments'
  ]
  LOOP
    EXECUTE FORMAT('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE FORMAT('DROP POLICY IF EXISTS "Public read" ON %I', table_name);
    EXECUTE FORMAT('DROP POLICY IF EXISTS "Admin manage" ON %I', table_name);
    EXECUTE FORMAT('DROP POLICY IF EXISTS "Authenticated users can manage rounds" ON %I', table_name);
    EXECUTE FORMAT('DROP POLICY IF EXISTS "Authenticated users can manage matches" ON %I', table_name);
    EXECUTE FORMAT('DROP POLICY IF EXISTS "Authenticated users can manage match events" ON %I', table_name);
    EXECUTE FORMAT('DROP POLICY IF EXISTS "Public can view rounds" ON %I', table_name);
    EXECUTE FORMAT('DROP POLICY IF EXISTS "Public can view matches" ON %I', table_name);
    EXECUTE FORMAT('DROP POLICY IF EXISTS "Public can view match events" ON %I', table_name);
    EXECUTE FORMAT('CREATE POLICY "Public read" ON %I FOR SELECT TO anon, authenticated USING (true)', table_name);
    EXECUTE FORMAT('CREATE POLICY "Admin manage" ON %I FOR ALL TO authenticated USING (is_app_admin()) WITH CHECK (is_app_admin())', table_name);
  END LOOP;
END $$;

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON players;
DROP POLICY IF EXISTS "Admin manage" ON players;
DROP POLICY IF EXISTS "Players can update own profile" ON players;
CREATE POLICY "Public read"
ON players FOR SELECT
TO anon, authenticated
USING (true);
CREATE POLICY "Admin manage"
ON players FOR ALL
TO authenticated
USING (is_app_admin())
WITH CHECK (is_app_admin());
CREATE POLICY "Players can update own profile"
ON players FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM account_profiles
  WHERE user_id = auth.uid() AND player_id = players.id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM account_profiles
  WHERE user_id = auth.uid() AND player_id = players.id
));

-- A tabela users e legada e contem apenas dados administrativos.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage" ON users;
CREATE POLICY "Admin manage"
ON users FOR ALL
TO authenticated
USING (is_app_admin())
WITH CHECK (is_app_admin());

-- Remove escrita anonima e mantem a leitura publica usada pelo aplicativo.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON players, leagues, league_members, ranking_rules, rounds, round_players,
   teams, team_players, matches, match_events, player_round_stats, seasons,
   round_payments, users, account_profiles
FROM anon;

GRANT SELECT ON players, leagues, league_members, ranking_rules, rounds,
  round_players, teams, team_players, matches, match_events, player_round_stats,
  seasons, round_payments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON players, leagues, league_members, ranking_rules,
  rounds, round_players, teams, team_players, matches, match_events,
  player_round_stats, seasons, round_payments, users, account_profiles
TO authenticated;
GRANT SELECT ON account_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION is_app_admin() TO anon, authenticated;

-- Fotos: ADM edita qualquer jogador; jogador comum edita somente sua pasta.
DROP POLICY IF EXISTS "Authenticated users can upload player avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update player avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete player avatars" ON storage.objects;

CREATE POLICY "Account owners can upload player avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'player-avatars'
  AND (
    is_app_admin()
    OR EXISTS (
      SELECT 1 FROM account_profiles
      WHERE user_id = auth.uid()
        AND player_id::TEXT = (storage.foldername(name))[1]
    )
  )
);

CREATE POLICY "Account owners can update player avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'player-avatars'
  AND (
    is_app_admin()
    OR EXISTS (
      SELECT 1 FROM account_profiles
      WHERE user_id = auth.uid()
        AND player_id::TEXT = (storage.foldername(name))[1]
    )
  )
)
WITH CHECK (
  bucket_id = 'player-avatars'
  AND (
    is_app_admin()
    OR EXISTS (
      SELECT 1 FROM account_profiles
      WHERE user_id = auth.uid()
        AND player_id::TEXT = (storage.foldername(name))[1]
    )
  )
);

CREATE POLICY "Account owners can delete player avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'player-avatars'
  AND (
    is_app_admin()
    OR EXISTS (
      SELECT 1 FROM account_profiles
      WHERE user_id = auth.uid()
        AND player_id::TEXT = (storage.foldername(name))[1]
    )
  )
);
