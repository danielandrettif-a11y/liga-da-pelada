-- Escalacoes por partida, substituicoes temporarias e disponibilidade na rodada.

ALTER TABLE round_players
ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'available';

ALTER TABLE round_players
DROP CONSTRAINT IF EXISTS round_players_availability_status_check;

ALTER TABLE round_players
ADD CONSTRAINT round_players_availability_status_check
CHECK (availability_status IN ('available', 'injured'));

ALTER TABLE round_players
ADD COLUMN IF NOT EXISTS availability_updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE matches ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS timer_accumulated_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS eligibility_elapsed_offset_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

UPDATE matches AS match
SET duration_seconds = COALESCE(league.match_duration, 7) * 60
FROM rounds AS round
JOIN leagues AS league ON league.id = round.league_id
WHERE match.round_id = round.id
  AND match.duration_seconds IS NULL;

ALTER TABLE matches ALTER COLUMN duration_seconds SET DEFAULT 420;
ALTER TABLE matches ALTER COLUMN duration_seconds SET NOT NULL;

CREATE TABLE IF NOT EXISTS match_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  original_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  is_starter BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  result_eligible BOOLEAN NOT NULL DEFAULT true,
  entered_elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (entered_elapsed_seconds >= 0),
  left_elapsed_seconds INTEGER CHECK (left_elapsed_seconds IS NULL OR left_elapsed_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS match_players_match_id_idx ON match_players (match_id);
CREATE INDEX IF NOT EXISTS match_players_player_id_idx ON match_players (player_id);
CREATE INDEX IF NOT EXISTS match_players_active_idx ON match_players (match_id, team_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS match_players_one_active_match_idx
ON match_players (player_id)
WHERE is_active = true;

CREATE TABLE IF NOT EXISTS match_substitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_out_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_in_id UUID REFERENCES players(id) ON DELETE SET NULL,
  player_in_original_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  reason TEXT NOT NULL DEFAULT 'tired' CHECK (reason IN ('tired', 'injury', 'other')),
  marked_injured BOOLEAN NOT NULL DEFAULT false,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS match_substitutions_match_id_idx
ON match_substitutions (match_id, created_at);

CREATE OR REPLACE FUNCTION prevent_overlapping_live_teams()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Serializa a abertura de partidas dentro da mesma rodada. Assim, duas
  -- requisicoes simultaneas nao conseguem escalar o mesmo time.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.round_id::TEXT, 0));

  IF NEW.status = 'live' AND EXISTS (
    SELECT 1
    FROM matches AS other_match
    WHERE other_match.round_id = NEW.round_id
      AND other_match.status = 'live'
      AND other_match.id <> NEW.id
      AND (
        NEW.team_a_id IN (other_match.team_a_id, other_match.team_b_id)
        OR NEW.team_b_id IN (other_match.team_a_id, other_match.team_b_id)
      )
  ) THEN
    RAISE EXCEPTION 'Um dos times ja esta em outra partida ao vivo.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_prevent_overlapping_live_teams ON matches;
CREATE TRIGGER matches_prevent_overlapping_live_teams
BEFORE INSERT OR UPDATE OF status, team_a_id, team_b_id ON matches
FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_live_teams();

-- Partidas anteriores recebem a formacao original como fotografia historica.
INSERT INTO match_players (
  match_id,
  player_id,
  team_id,
  original_team_id,
  is_starter,
  is_active,
  result_eligible,
  entered_elapsed_seconds
)
SELECT
  match.id,
  team_player.player_id,
  team.id,
  team.id,
  true,
  match.status = 'live',
  true,
  0
FROM matches AS match
JOIN teams AS team
  ON team.id IN (match.team_a_id, match.team_b_id)
JOIN team_players AS team_player ON team_player.team_id = team.id
ON CONFLICT (match_id, player_id) DO NOTHING;

CREATE OR REPLACE FUNCTION prevent_unavailable_active_match_player()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  player_availability TEXT;
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  SELECT round_player.availability_status INTO player_availability
  FROM matches AS match
  LEFT JOIN round_players AS round_player
    ON round_player.round_id = match.round_id
    AND round_player.player_id = NEW.player_id
  WHERE match.id = NEW.match_id;

  IF player_availability IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'O jogador nao esta disponivel para entrar em campo.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_players_prevent_unavailable_active ON match_players;
CREATE TRIGGER match_players_prevent_unavailable_active
BEFORE INSERT OR UPDATE OF is_active, player_id, match_id ON match_players
FOR EACH ROW EXECUTE FUNCTION prevent_unavailable_active_match_player();

CREATE OR REPLACE FUNCTION deactivate_match_players_on_finish()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
    UPDATE match_players
    SET is_active = false
    WHERE match_id = NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_deactivate_players_on_finish ON matches;
CREATE TRIGGER matches_deactivate_players_on_finish
AFTER UPDATE OF status ON matches
FOR EACH ROW EXECUTE FUNCTION deactivate_match_players_on_finish();

ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_substitutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view match players" ON match_players;
CREATE POLICY "Public can view match players"
ON match_players FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Admin manage match players" ON match_players;
CREATE POLICY "Admin manage match players"
ON match_players FOR ALL TO authenticated
USING (is_app_admin()) WITH CHECK (is_app_admin());

DROP POLICY IF EXISTS "Public can view match substitutions" ON match_substitutions;
CREATE POLICY "Public can view match substitutions"
ON match_substitutions FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Admin manage match substitutions" ON match_substitutions;
CREATE POLICY "Admin manage match substitutions"
ON match_substitutions FOR ALL TO authenticated
USING (is_app_admin()) WITH CHECK (is_app_admin());

GRANT SELECT ON match_players, match_substitutions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON match_players, match_substitutions TO authenticated;

CREATE OR REPLACE FUNCTION substitute_match_player(
  p_match_id UUID,
  p_team_id UUID,
  p_player_out_id UUID,
  p_player_in_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'tired',
  p_mark_injured BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_match matches%ROWTYPE;
  outgoing match_players%ROWTYPE;
  incoming_original_team_id UUID;
  elapsed INTEGER;
  substitution_id UUID;
BEGIN
  IF NOT is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem fazer substituicoes.';
  END IF;

  IF p_reason NOT IN ('tired', 'injury', 'other') THEN
    RAISE EXCEPTION 'Motivo de substituicao invalido.';
  END IF;

  SELECT * INTO current_match
  FROM matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND OR current_match.status <> 'live' THEN
    RAISE EXCEPTION 'A partida nao esta em andamento.';
  END IF;

  IF p_team_id NOT IN (current_match.team_a_id, current_match.team_b_id) THEN
    RAISE EXCEPTION 'O time informado nao participa desta partida.';
  END IF;

  SELECT * INTO outgoing
  FROM match_players
  WHERE match_id = p_match_id
    AND team_id = p_team_id
    AND player_id = p_player_out_id
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O jogador que vai sair nao esta em campo.';
  END IF;

  elapsed := COALESCE(current_match.eligibility_elapsed_offset_seconds, 0)
    + COALESCE(current_match.timer_accumulated_seconds, 0);
  IF current_match.timer_started_at IS NOT NULL THEN
    elapsed := elapsed + GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (now() - current_match.timer_started_at)))::INTEGER
    );
  END IF;

  IF p_player_in_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM match_players
      WHERE match_id = p_match_id AND player_id = p_player_in_id
    ) THEN
      RAISE EXCEPTION 'Este jogador ja participou da partida e nao pode voltar.';
    END IF;

    SELECT team_player.team_id INTO incoming_original_team_id
    FROM team_players AS team_player
    JOIN teams AS original_team ON original_team.id = team_player.team_id
    JOIN round_players AS round_player
      ON round_player.round_id = current_match.round_id
      AND round_player.player_id = team_player.player_id
    WHERE team_player.player_id = p_player_in_id
      AND original_team.round_id = current_match.round_id
      AND team_player.team_id NOT IN (current_match.team_a_id, current_match.team_b_id)
      AND round_player.availability_status = 'available'
    LIMIT 1
    FOR UPDATE OF round_player;

    IF incoming_original_team_id IS NULL THEN
      RAISE EXCEPTION 'O substituto precisa estar disponivel em um time que esteja aguardando.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM match_players AS active_player
      JOIN matches AS live_match ON live_match.id = active_player.match_id
      WHERE active_player.player_id = p_player_in_id
        AND active_player.is_active = true
        AND live_match.status = 'live'
    ) THEN
      RAISE EXCEPTION 'Este jogador ja esta em outra partida ao vivo.';
    END IF;
  END IF;

  UPDATE match_players
  SET is_active = false, left_elapsed_seconds = elapsed
  WHERE id = outgoing.id;

  IF p_player_in_id IS NOT NULL THEN
    INSERT INTO match_players (
      match_id,
      player_id,
      team_id,
      original_team_id,
      is_starter,
      is_active,
      result_eligible,
      entered_elapsed_seconds
    ) VALUES (
      p_match_id,
      p_player_in_id,
      p_team_id,
      incoming_original_team_id,
      false,
      true,
      elapsed <= (current_match.duration_seconds / 2),
      elapsed
    );
  END IF;

  IF p_mark_injured THEN
    UPDATE round_players
    SET availability_status = 'injured', availability_updated_at = now()
    WHERE round_id = current_match.round_id AND player_id = p_player_out_id;
  END IF;

  INSERT INTO match_substitutions (
    match_id,
    team_id,
    player_out_id,
    player_in_id,
    player_in_original_team_id,
    reason,
    marked_injured,
    elapsed_seconds,
    created_by
  ) VALUES (
    p_match_id,
    p_team_id,
    p_player_out_id,
    p_player_in_id,
    incoming_original_team_id,
    p_reason,
    p_mark_injured,
    elapsed,
    auth.uid()
  )
  RETURNING id INTO substitution_id;

  RETURN substitution_id;
END;
$$;

CREATE OR REPLACE FUNCTION undo_last_match_substitution(p_substitution_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  substitution match_substitutions%ROWTYPE;
  latest_substitution_id UUID;
  match_status TEXT;
BEGIN
  IF NOT is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem corrigir substituicoes.';
  END IF;

  SELECT * INTO substitution
  FROM match_substitutions
  WHERE id = p_substitution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Substituicao nao encontrada.';
  END IF;

  SELECT status INTO match_status FROM matches WHERE id = substitution.match_id FOR UPDATE;
  IF match_status <> 'live' THEN
    RAISE EXCEPTION 'Somente partidas em andamento podem ser corrigidas.';
  END IF;

  SELECT id INTO latest_substitution_id
  FROM match_substitutions
  WHERE match_id = substitution.match_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF latest_substitution_id <> p_substitution_id THEN
    RAISE EXCEPTION 'Apenas a substituicao mais recente pode ser desfeita.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM match_events
    WHERE match_id = substitution.match_id
      AND created_at > substitution.created_at
  ) THEN
    RAISE EXCEPTION 'Ha um gol registrado depois desta substituicao.';
  END IF;

  IF substitution.marked_injured THEN
    UPDATE round_players AS round_player
    SET availability_status = 'available', availability_updated_at = now()
    FROM matches AS match
    WHERE match.id = substitution.match_id
      AND round_player.round_id = match.round_id
      AND round_player.player_id = substitution.player_out_id;
  END IF;

  UPDATE match_players
  SET is_active = true, left_elapsed_seconds = NULL
  WHERE match_id = substitution.match_id
    AND player_id = substitution.player_out_id;

  IF substitution.player_in_id IS NOT NULL THEN
    DELETE FROM match_players
    WHERE match_id = substitution.match_id
      AND player_id = substitution.player_in_id;
  END IF;

  DELETE FROM match_substitutions WHERE id = p_substitution_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION set_round_player_availability(
  p_round_id UUID,
  p_player_id UUID,
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  round_player_id UUID;
BEGIN
  IF NOT is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar a disponibilidade.';
  END IF;
  IF p_status NOT IN ('available', 'injured') THEN
    RAISE EXCEPTION 'Status de disponibilidade invalido.';
  END IF;

  SELECT id INTO round_player_id
  FROM round_players
  WHERE round_id = p_round_id AND player_id = p_player_id
  FOR UPDATE;

  IF round_player_id IS NULL THEN
    RAISE EXCEPTION 'Jogador nao encontrado nesta rodada.';
  END IF;

  IF p_status = 'injured' AND EXISTS (
    SELECT 1
    FROM match_players AS participant
    JOIN matches AS match ON match.id = participant.match_id
    WHERE match.round_id = p_round_id
      AND match.status = 'live'
      AND participant.player_id = p_player_id
      AND participant.is_active = true
  ) THEN
    RAISE EXCEPTION 'Retire o jogador da partida ao vivo antes de marca-lo como machucado.';
  END IF;

  UPDATE round_players
  SET availability_status = p_status, availability_updated_at = now()
  WHERE id = round_player_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION substitute_match_player(UUID, UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION undo_last_match_substitution(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_round_player_availability(UUID, UUID, TEXT) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'match_players'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE match_players;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'match_substitutions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE match_substitutions;
    END IF;
  END IF;
END;
$$;
