-- Visitantes podem acompanhar rodadas e partidas, mas somente usuarios
-- autenticados (administradores do app) podem alterar placar, timer e status.

ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view rounds" ON rounds;
CREATE POLICY "Public can view rounds"
ON rounds FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage rounds" ON rounds;
CREATE POLICY "Authenticated users can manage rounds"
ON rounds FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view matches" ON matches;
CREATE POLICY "Public can view matches"
ON matches FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage matches" ON matches;
CREATE POLICY "Authenticated users can manage matches"
ON matches FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view match events" ON match_events;
CREATE POLICY "Public can view match events"
ON match_events FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage match events" ON match_events;
CREATE POLICY "Authenticated users can manage match events"
ON match_events FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON rounds, matches, match_events
FROM anon;

GRANT SELECT ON rounds, matches, match_events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON rounds, matches, match_events TO authenticated;
