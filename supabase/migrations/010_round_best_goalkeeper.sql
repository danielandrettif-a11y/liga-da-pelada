-- Premio de melhor goleiro de cada rodada.

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS best_goalkeeper_player_id UUID
  REFERENCES players(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rounds_best_goalkeeper
  ON rounds(best_goalkeeper_player_id)
  WHERE best_goalkeeper_player_id IS NOT NULL;
