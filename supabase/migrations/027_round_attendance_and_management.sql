-- Presenca por ordem de chegada, modos de formacao, troca permanente e exclusao segura.

ALTER TABLE rounds
ADD COLUMN IF NOT EXISTS formation_mode TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_formation_mode_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_formation_mode_check
CHECK (formation_mode IN ('manual', 'random', 'balanced'));

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS position INTEGER;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY round_id ORDER BY id)::INTEGER AS position
  FROM teams
)
UPDATE teams team
SET position = ordered.position
FROM ordered
WHERE ordered.id = team.id AND team.position IS NULL;

ALTER TABLE teams ALTER COLUMN position SET NOT NULL;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_position_positive;
ALTER TABLE teams ADD CONSTRAINT teams_position_positive CHECK (position > 0);
CREATE UNIQUE INDEX IF NOT EXISTS teams_round_position_unique_idx
ON teams (round_id, position);

ALTER TABLE round_players
ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS attendance_order INTEGER,
ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMPTZ;

ALTER TABLE round_players DROP CONSTRAINT IF EXISTS round_players_attendance_status_check;
ALTER TABLE round_players ADD CONSTRAINT round_players_attendance_status_check
CHECK (attendance_status IN ('pending', 'present'));

ALTER TABLE round_players DROP CONSTRAINT IF EXISTS round_players_attendance_consistency;
ALTER TABLE round_players ADD CONSTRAINT round_players_attendance_consistency CHECK (
  (attendance_status = 'present' AND attendance_order IS NOT NULL AND attendance_order > 0 AND attendance_marked_at IS NOT NULL)
  OR
  (attendance_status = 'pending' AND attendance_order IS NULL AND attendance_marked_at IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS round_players_attendance_order_unique_idx
ON round_players (round_id, attendance_order)
WHERE attendance_status = 'present';

CREATE OR REPLACE FUNCTION prevent_unavailable_active_match_player()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  player_availability TEXT;
  player_attendance TEXT;
  current_formation_mode TEXT;
BEGIN
  IF NOT NEW.is_active THEN RETURN NEW; END IF;

  SELECT round_player.availability_status, round_player.attendance_status, round.formation_mode
  INTO player_availability, player_attendance, current_formation_mode
  FROM matches AS match
  JOIN rounds AS round ON round.id = match.round_id
  LEFT JOIN round_players AS round_player
    ON round_player.round_id = match.round_id AND round_player.player_id = NEW.player_id
  WHERE match.id = NEW.match_id;

  IF player_availability IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION 'O jogador nao esta disponivel para entrar em campo.';
  END IF;
  IF current_formation_mode <> 'manual' AND player_attendance IS DISTINCT FROM 'present' THEN
    RAISE EXCEPTION 'O jogador ainda nao foi marcado como presente.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION normalize_round_attendance(p_round_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE round_players
  SET attendance_order = attendance_order + 10000
  WHERE round_id = p_round_id AND attendance_status = 'present';

  WITH ordered AS (
    SELECT id, row_number() OVER (
      ORDER BY attendance_order, attendance_marked_at, id
    )::INTEGER AS new_order
    FROM round_players
    WHERE round_id = p_round_id AND attendance_status = 'present'
  )
  UPDATE round_players entry
  SET attendance_order = ordered.new_order
  FROM ordered
  WHERE entry.id = ordered.id;
END;
$$;

CREATE OR REPLACE FUNCTION set_round_player_attendance(
  p_round_id UUID,
  p_player_id UUID,
  p_present BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_mode TEXT;
  next_order INTEGER;
BEGIN
  IF NOT is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar a presenca.';
  END IF;

  SELECT formation_mode INTO current_mode
  FROM rounds
  WHERE id = p_round_id AND status <> 'finished'
  FOR UPDATE;

  IF current_mode IS NULL THEN
    RAISE EXCEPTION 'Rodada nao encontrada ou ja encerrada.';
  END IF;
  IF current_mode = 'manual' THEN
    RAISE EXCEPTION 'Rodadas manuais nao usam ordem de chegada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM round_players
    WHERE round_id = p_round_id AND player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'Jogador nao participa desta rodada.';
  END IF;

  IF p_present THEN
    IF EXISTS (
      SELECT 1 FROM round_players
      WHERE round_id = p_round_id AND player_id = p_player_id AND attendance_status = 'present'
    ) THEN
      RETURN true;
    END IF;
    SELECT COALESCE(MAX(attendance_order), 0) + 1 INTO next_order
    FROM round_players WHERE round_id = p_round_id;
    UPDATE round_players
    SET attendance_status = 'present', attendance_order = next_order, attendance_marked_at = now()
    WHERE round_id = p_round_id AND player_id = p_player_id;
  ELSE
    UPDATE round_players
    SET attendance_status = 'pending', attendance_order = NULL, attendance_marked_at = NULL
    WHERE round_id = p_round_id AND player_id = p_player_id;
    PERFORM normalize_round_attendance(p_round_id);
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION mark_round_team_arrived(p_round_id UUID, p_team_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_mode TEXT;
  next_order INTEGER;
  changed_count INTEGER;
BEGIN
  IF NOT is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar a presenca.';
  END IF;
  SELECT formation_mode INTO current_mode
  FROM rounds WHERE id = p_round_id AND status <> 'finished' FOR UPDATE;
  IF current_mode IS NULL OR current_mode = 'manual' THEN
    RAISE EXCEPTION 'Esta rodada nao usa ordem de chegada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id AND round_id = p_round_id) THEN
    RAISE EXCEPTION 'Time invalido para esta rodada.';
  END IF;

  SELECT COALESCE(MAX(attendance_order), 0) INTO next_order
  FROM round_players WHERE round_id = p_round_id;

  WITH pending AS (
    SELECT rp.id, row_number() OVER (ORDER BY tp.goalkeeper_order NULLS LAST, rp.id)::INTEGER AS offset
    FROM round_players rp
    JOIN team_players tp ON tp.player_id = rp.player_id
    WHERE rp.round_id = p_round_id
      AND tp.team_id = p_team_id
      AND rp.attendance_status = 'pending'
  )
  UPDATE round_players rp
  SET attendance_status = 'present',
      attendance_order = next_order + pending.offset,
      attendance_marked_at = now()
  FROM pending
  WHERE rp.id = pending.id;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION swap_round_team_players(
  p_round_id UUID,
  p_player_a_id UUID,
  p_player_b_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  entry_a team_players%ROWTYPE;
  entry_b team_players%ROWTYPE;
BEGIN
  IF NOT is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem trocar jogadores.';
  END IF;
  IF p_player_a_id = p_player_b_id THEN
    RAISE EXCEPTION 'Escolha dois jogadores diferentes.';
  END IF;

  PERFORM 1 FROM rounds WHERE id = p_round_id AND status <> 'finished' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada nao encontrada ou encerrada.'; END IF;
  IF EXISTS (SELECT 1 FROM matches WHERE round_id = p_round_id AND status = 'live') THEN
    RAISE EXCEPTION 'Encerre a partida ao vivo antes de trocar os times.';
  END IF;

  SELECT tp.* INTO entry_a
  FROM team_players tp JOIN teams t ON t.id = tp.team_id
  WHERE t.round_id = p_round_id AND tp.player_id = p_player_a_id
  FOR UPDATE OF tp;
  SELECT tp.* INTO entry_b
  FROM team_players tp JOIN teams t ON t.id = tp.team_id
  WHERE t.round_id = p_round_id AND tp.player_id = p_player_b_id
  FOR UPDATE OF tp;

  IF entry_a.id IS NULL OR entry_b.id IS NULL THEN
    RAISE EXCEPTION 'Os dois jogadores precisam pertencer a esta rodada.';
  END IF;
  IF entry_a.team_id = entry_b.team_id THEN
    RAISE EXCEPTION 'Escolha jogadores de times diferentes.';
  END IF;

  UPDATE team_players
  SET goalkeeper_order = NULL
  WHERE team_id IN (entry_a.team_id, entry_b.team_id);

  UPDATE team_players
  SET team_id = CASE WHEN id = entry_a.id THEN entry_b.team_id ELSE entry_a.team_id END
  WHERE id IN (entry_a.id, entry_b.id);

  WITH reordered AS (
    SELECT id, row_number() OVER (PARTITION BY team_id ORDER BY random(), id)::INTEGER AS new_order
    FROM team_players
    WHERE team_id IN (entry_a.team_id, entry_b.team_id)
  )
  UPDATE team_players team_player
  SET goalkeeper_order = reordered.new_order
  FROM reordered
  WHERE team_player.id = reordered.id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION delete_round_cascade(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_round rounds%ROWTYPE;
  linked_callup_id UUID;
  affected_player_ids UUID[];
BEGIN
  IF NOT is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem excluir rodadas.';
  END IF;

  SELECT * INTO current_round FROM rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada nao encontrada.'; END IF;

  SELECT id INTO linked_callup_id FROM callups WHERE round_id = p_round_id LIMIT 1 FOR UPDATE;
  SELECT array_agg(player_id) INTO affected_player_ids
  FROM round_players WHERE round_id = p_round_id;
  IF linked_callup_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM callups
    WHERE league_id = current_round.league_id
      AND id <> linked_callup_id
      AND status IN ('open', 'locked')
  ) THEN
    RAISE EXCEPTION 'Encerre a convocacao ativa antes de excluir esta rodada.';
  END IF;

  DELETE FROM rounds WHERE id = p_round_id;

  IF linked_callup_id IS NOT NULL THEN
    UPDATE callups
    SET status = 'locked', round_id = NULL, updated_at = now()
    WHERE id = linked_callup_id;
  END IF;

  UPDATE players player
  SET is_selectable = true
  WHERE player.member_category = 'guest'
    AND player.id = ANY(COALESCE(affected_player_ids, ARRAY[]::UUID[]))
    AND NOT EXISTS (
      SELECT 1
      FROM round_players rp
      JOIN rounds round ON round.id = rp.round_id
      WHERE rp.player_id = player.id AND round.status = 'finished'
    );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION set_round_player_attendance(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_round_team_arrived(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION swap_round_team_players(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_round_cascade(UUID) TO authenticated;
