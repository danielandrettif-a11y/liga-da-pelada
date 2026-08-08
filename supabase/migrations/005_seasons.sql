-- Temporadas: preserva o historico e permite reiniciar ranking e numeracao.
CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  stats_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_id, number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_one_active_per_league
  ON seasons (league_id)
  WHERE status = 'active';

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS season_id UUID REFERENCES seasons(id) ON DELETE RESTRICT;

-- Toda liga existente recebe uma primeira temporada.
INSERT INTO seasons (league_id, number, status, started_at)
SELECT
  leagues.id,
  1,
  'active',
  COALESCE(
    (SELECT MIN(rounds.created_at) FROM rounds WHERE rounds.league_id = leagues.id),
    now()
  )
FROM leagues
WHERE NOT EXISTS (
  SELECT 1 FROM seasons WHERE seasons.league_id = leagues.id
);

-- Rodadas anteriores passam a pertencer a Temporada 1.
UPDATE rounds
SET season_id = seasons.id
FROM seasons
WHERE rounds.league_id = seasons.league_id
  AND seasons.number = 1
  AND rounds.season_id IS NULL;

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_league_id_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rounds_league_season_number
  ON rounds (league_id, season_id, number);

CREATE INDEX IF NOT EXISTS idx_rounds_season ON rounds(season_id);
CREATE INDEX IF NOT EXISTS idx_seasons_league_status ON seasons(league_id, status);

-- Encerra a temporada atual e cria a proxima dentro da mesma transacao.
CREATE OR REPLACE FUNCTION finish_season(
  p_league_id UUID,
  p_snapshot JSONB
)
RETURNS TABLE (
  finished_season_id UUID,
  finished_season_number INTEGER,
  new_season_id UUID,
  new_season_number INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_season seasons%ROWTYPE;
  created_season seasons%ROWTYPE;
BEGIN
  SELECT * INTO current_season
  FROM seasons
  WHERE league_id = p_league_id AND status = 'active'
  FOR UPDATE;

  IF current_season.id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma temporada ativa encontrada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM rounds
    WHERE season_id = current_season.id AND status <> 'finished'
  ) THEN
    RAISE EXCEPTION 'Finalize todas as rodadas antes de terminar a temporada';
  END IF;

  UPDATE seasons
  SET
    status = 'finished',
    ended_at = now(),
    stats_snapshot = p_snapshot
  WHERE id = current_season.id;

  INSERT INTO seasons (league_id, number, status, started_at)
  VALUES (p_league_id, current_season.number + 1, 'active', now())
  RETURNING * INTO created_season;

  RETURN QUERY SELECT
    current_season.id,
    current_season.number,
    created_season.id,
    created_season.number;
END;
$$;

GRANT SELECT ON seasons TO anon, authenticated;
GRANT INSERT, UPDATE ON seasons TO authenticated;
GRANT EXECUTE ON FUNCTION finish_season(UUID, JSONB) TO authenticated;
