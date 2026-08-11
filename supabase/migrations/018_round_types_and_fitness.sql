-- Rodadas oficiais/amistosas e dados fisicos opcionais.

ALTER TABLE rounds
ADD COLUMN IF NOT EXISTS round_type TEXT NOT NULL DEFAULT 'official';

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_round_type_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_round_type_check
CHECK (round_type IN ('official', 'friendly'));

-- Remove qualquer formato antigo de unicidade e cria contadores independentes.
ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_league_id_season_id_number_key;
DROP INDEX IF EXISTS idx_rounds_league_season_number;
CREATE UNIQUE INDEX IF NOT EXISTS rounds_type_number_unique_idx
ON rounds (league_id, season_id, round_type, number);

CREATE INDEX IF NOT EXISTS rounds_season_type_status_idx
ON rounds (season_id, round_type, status, number);

CREATE TABLE IF NOT EXISTS player_round_fitness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  distance_km NUMERIC(6,2) NOT NULL CHECK (distance_km BETWEEN 0.01 AND 100),
  average_speed_kmh NUMERIC(5,2) NOT NULL CHECK (average_speed_kmh BETWEEN 0.1 AND 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, round_id)
);

CREATE INDEX IF NOT EXISTS player_round_fitness_player_idx
ON player_round_fitness (player_id, round_id);

CREATE OR REPLACE FUNCTION can_manage_own_fitness(p_player_id UUID, p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM account_profiles account
    JOIN round_players participant
      ON participant.player_id = account.player_id AND participant.round_id = p_round_id
    JOIN rounds round ON round.id = participant.round_id AND round.status = 'finished'
    WHERE account.user_id = auth.uid() AND account.player_id = p_player_id
  );
$$;

ALTER TABLE player_round_fitness ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Visible fitness read" ON player_round_fitness;
CREATE POLICY "Visible fitness read" ON player_round_fitness FOR SELECT TO anon, authenticated
USING (
  EXISTS (SELECT 1 FROM players AS player WHERE player.id = player_round_fitness.player_id AND player.show_fitness_stats = true)
  OR EXISTS (SELECT 1 FROM account_profiles WHERE user_id = auth.uid() AND player_id = player_round_fitness.player_id)
);

DROP POLICY IF EXISTS "Owners insert fitness" ON player_round_fitness;
CREATE POLICY "Owners insert fitness" ON player_round_fitness FOR INSERT TO authenticated
WITH CHECK (can_manage_own_fitness(player_id, round_id));
DROP POLICY IF EXISTS "Owners update fitness" ON player_round_fitness;
CREATE POLICY "Owners update fitness" ON player_round_fitness FOR UPDATE TO authenticated
USING (can_manage_own_fitness(player_id, round_id))
WITH CHECK (can_manage_own_fitness(player_id, round_id));
DROP POLICY IF EXISTS "Owners delete fitness" ON player_round_fitness;
CREATE POLICY "Owners delete fitness" ON player_round_fitness FOR DELETE TO authenticated
USING (can_manage_own_fitness(player_id, round_id));

GRANT SELECT ON player_round_fitness TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON player_round_fitness TO authenticated;
GRANT EXECUTE ON FUNCTION can_manage_own_fitness(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION archive_guest_after_finished_round()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
    UPDATE players player
    SET is_selectable = false
    WHERE player.member_category = 'guest'
      AND player.id IN (
        SELECT player_id FROM round_players WHERE round_id = NEW.id
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rounds_archive_guests ON rounds;
CREATE TRIGGER rounds_archive_guests
AFTER UPDATE OF status ON rounds
FOR EACH ROW EXECUTE FUNCTION archive_guest_after_finished_round();
