-- Perfis taticos dos jogadores e controle de pagamentos por rodada.
-- Esta migration e aditiva e preserva todos os dados existentes.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS player_profile TEXT NOT NULL DEFAULT 'midfield';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'players_player_profile_check'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_player_profile_check
      CHECK (player_profile IN ('offensive', 'midfield', 'defensive'));
  END IF;
END $$;

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS payment_pix TEXT;

CREATE TABLE IF NOT EXISTS round_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_round_payments_round_id
  ON round_payments(round_id);

CREATE INDEX IF NOT EXISTS idx_round_payments_player_id
  ON round_payments(player_id);

-- Cria os registros de pagamento das rodadas que ja existem.
INSERT INTO round_payments (round_id, player_id)
SELECT round_id, player_id
FROM round_players
ON CONFLICT (round_id, player_id) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_round_player_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO round_payments (round_id, player_id)
    VALUES (NEW.round_id, NEW.player_id)
    ON CONFLICT (round_id, player_id) DO NOTHING;
    RETURN NEW;
  END IF;

  DELETE FROM round_payments
  WHERE round_id = OLD.round_id
    AND player_id = OLD.player_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS round_players_sync_payment ON round_players;
CREATE TRIGGER round_players_sync_payment
AFTER INSERT OR DELETE ON round_players
FOR EACH ROW
EXECUTE FUNCTION sync_round_player_payment();

GRANT SELECT ON round_payments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON round_payments TO authenticated;
