-- Categorias do elenco e controle de elegibilidade esportiva.

ALTER TABLE players
ADD COLUMN IF NOT EXISTS member_category TEXT NOT NULL DEFAULT 'player';

ALTER TABLE players
DROP CONSTRAINT IF EXISTS players_member_category_check;

ALTER TABLE players
ADD CONSTRAINT players_member_category_check
CHECK (member_category IN ('player', 'guest', 'wag', 'supporter'));

ALTER TABLE players
ADD COLUMN IF NOT EXISTS is_selectable BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE players
ADD COLUMN IF NOT EXISTS show_fitness_stats BOOLEAN NOT NULL DEFAULT false;

-- Perfis de jogo so fazem sentido para jogadores e convidados.
ALTER TABLE players ALTER COLUMN player_profile DROP NOT NULL;
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_player_profile_check;
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_profile_check;
ALTER TABLE players
ADD CONSTRAINT players_category_profile_check CHECK (
  (member_category IN ('player', 'guest') AND player_profile IN ('offensive', 'midfield', 'defensive'))
  OR
  (member_category IN ('wag', 'supporter') AND player_profile IS NULL)
);

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
    -- Nao permite esconder um historico esportivo convertendo o atleta.
    IF TG_OP = 'UPDATE'
      AND OLD.member_category IN ('player', 'guest')
      AND EXISTS (
        SELECT 1 FROM player_round_stats
        WHERE player_id = OLD.id
          AND (games > 0 OR goals > 0 OR assists > 0 OR wins > 0 OR draws > 0 OR losses > 0)
      )
    THEN
      RAISE EXCEPTION 'Jogador com historico nao pode ser convertido em WAG ou torcedor.';
    END IF;

    NEW.is_selectable := false;
    NEW.player_profile := NULL;
  ELSE
    NEW.player_profile := COALESCE(NEW.player_profile, 'midfield');
    IF NEW.member_category = 'player' THEN
      NEW.is_selectable := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_normalize_category ON players;
CREATE TRIGGER players_normalize_category
BEFORE INSERT OR UPDATE OF member_category, player_profile, is_selectable ON players
FOR EACH ROW EXECUTE FUNCTION normalize_player_category();

UPDATE players
SET member_category = COALESCE(member_category, 'player'),
    is_selectable = true,
    player_profile = COALESCE(player_profile, 'midfield');

CREATE INDEX IF NOT EXISTS players_category_selectable_idx
ON players (member_category, is_selectable, name);
