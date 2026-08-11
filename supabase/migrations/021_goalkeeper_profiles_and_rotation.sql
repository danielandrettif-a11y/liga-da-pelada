-- Especialidade complementar de goleiro e ordem sorteada do rodizio no gol.

ALTER TABLE players
ADD COLUMN IF NOT EXISTS is_goalkeeper BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE players
DROP CONSTRAINT IF EXISTS players_goalkeeper_category_check;

ALTER TABLE players
ADD CONSTRAINT players_goalkeeper_category_check CHECK (
  member_category IN ('player', 'guest') OR is_goalkeeper = false
);

ALTER TABLE team_players
ADD COLUMN IF NOT EXISTS goalkeeper_order INTEGER;

WITH ordered_players AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY team_id ORDER BY random(), id) AS drawn_order
  FROM team_players
)
UPDATE team_players AS team_player
SET goalkeeper_order = ordered_players.drawn_order
FROM ordered_players
WHERE team_player.id = ordered_players.id
  AND ordered_players.drawn_order <= 10
  AND team_player.goalkeeper_order IS NULL;

ALTER TABLE team_players
DROP CONSTRAINT IF EXISTS team_players_goalkeeper_order_check;

ALTER TABLE team_players
ADD CONSTRAINT team_players_goalkeeper_order_check CHECK (
  goalkeeper_order IS NULL OR goalkeeper_order BETWEEN 1 AND 10
);

CREATE UNIQUE INDEX IF NOT EXISTS team_players_goalkeeper_order_unique
ON team_players (team_id, goalkeeper_order)
WHERE goalkeeper_order IS NOT NULL;

CREATE OR REPLACE FUNCTION normalize_player_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (NEW.member_category IS DISTINCT FROM OLD.member_category OR NEW.is_selectable IS DISTINCT FROM OLD.is_selectable)
    AND NOT is_app_admin()
  THEN
    RAISE EXCEPTION 'Somente administradores podem alterar categoria e elegibilidade.';
  END IF;

  IF NEW.member_category IN ('wag', 'supporter') THEN
    NEW.is_selectable := false;
    NEW.player_profile := NULL;
    NEW.is_goalkeeper := false;
  ELSE
    NEW.player_profile := COALESCE(NEW.player_profile, 'midfield');
    NEW.is_goalkeeper := COALESCE(NEW.is_goalkeeper, false);
    IF NEW.member_category = 'player' THEN
      NEW.is_selectable := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_normalize_category ON players;
CREATE TRIGGER players_normalize_category
BEFORE INSERT OR UPDATE OF member_category, player_profile, is_selectable, is_goalkeeper ON players
FOR EACH ROW EXECUTE FUNCTION normalize_player_category();

CREATE OR REPLACE FUNCTION create_player_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_player_id UUID;
  requested_profile TEXT;
  requested_goalkeeper BOOLEAN;
  player_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM account_profiles WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  requested_profile := COALESCE(NEW.raw_user_meta_data ->> 'player_profile', 'midfield');
  IF requested_profile NOT IN ('offensive', 'midfield', 'defensive') THEN
    requested_profile := 'midfield';
  END IF;

  requested_goalkeeper := lower(COALESCE(NEW.raw_user_meta_data ->> 'is_goalkeeper', 'false'))
    IN ('true', '1', 'yes', 'on');

  player_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), '')
  );
  IF player_name IS NULL THEN
    player_name := SPLIT_PART(COALESCE(NEW.email, 'Jogador'), '@', 1);
  END IF;

  INSERT INTO players (name, nickname, player_profile, is_goalkeeper, avatar_url)
  VALUES (
    LEFT(player_name, 120),
    NULLIF(LEFT(TRIM(NEW.raw_user_meta_data ->> 'nickname'), 60), ''),
    requested_profile,
    requested_goalkeeper,
    NULL
  )
  RETURNING id INTO created_player_id;

  INSERT INTO account_profiles (user_id, role, player_id)
  VALUES (NEW.id, 'player', created_player_id);

  RETURN NEW;
END;
$$;
