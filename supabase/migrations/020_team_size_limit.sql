-- Configura o tamanho e a quantidade de times por liga e impede novas escalacoes acima dos limites.
-- Times historicos com mais jogadores sao preservados.

ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS players_per_team INTEGER;

ALTER TABLE leagues
ADD COLUMN IF NOT EXISTS teams_per_round INTEGER;

UPDATE leagues
SET players_per_team = 5
WHERE players_per_team IS NULL;

UPDATE leagues
SET teams_per_round = 3
WHERE teams_per_round IS NULL;

ALTER TABLE leagues
ALTER COLUMN players_per_team SET DEFAULT 5,
ALTER COLUMN players_per_team SET NOT NULL;

ALTER TABLE leagues
ALTER COLUMN teams_per_round SET DEFAULT 3,
ALTER COLUMN teams_per_round SET NOT NULL;

ALTER TABLE leagues
DROP CONSTRAINT IF EXISTS leagues_players_per_team_range;

ALTER TABLE leagues
ADD CONSTRAINT leagues_players_per_team_range
CHECK (players_per_team BETWEEN 1 AND 10);

ALTER TABLE leagues
DROP CONSTRAINT IF EXISTS leagues_teams_per_round_range;

ALTER TABLE leagues
ADD CONSTRAINT leagues_teams_per_round_range
CHECK (teams_per_round BETWEEN 2 AND 6);

CREATE OR REPLACE FUNCTION enforce_round_team_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  configured_limit INTEGER;
  current_size INTEGER;
BEGIN
  PERFORM 1 FROM rounds WHERE id = NEW.round_id FOR UPDATE;

  SELECT league.teams_per_round
  INTO configured_limit
  FROM rounds AS round
  JOIN leagues AS league ON league.id = round.league_id
  WHERE round.id = NEW.round_id;

  IF configured_limit IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel identificar o limite de times desta rodada.';
  END IF;

  SELECT count(*)
  INTO current_size
  FROM teams AS team
  WHERE team.round_id = NEW.round_id
    AND (TG_OP = 'INSERT' OR team.id <> NEW.id);

  IF current_size >= configured_limit THEN
    RAISE EXCEPTION 'Esta rodada ja atingiu o limite de % times.', configured_limit;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_round_team_limit_trigger ON teams;
CREATE TRIGGER enforce_round_team_limit_trigger
BEFORE INSERT OR UPDATE OF round_id ON teams
FOR EACH ROW
EXECUTE FUNCTION enforce_round_team_limit();

CREATE OR REPLACE FUNCTION enforce_team_player_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  configured_limit INTEGER;
  current_size INTEGER;
BEGIN
  PERFORM 1 FROM teams WHERE id = NEW.team_id FOR UPDATE;

  SELECT league.players_per_team
  INTO configured_limit
  FROM teams AS team
  JOIN rounds AS round ON round.id = team.round_id
  JOIN leagues AS league ON league.id = round.league_id
  WHERE team.id = NEW.team_id;

  IF configured_limit IS NULL THEN
    RAISE EXCEPTION 'Nao foi possivel identificar o limite de jogadores deste time.';
  END IF;

  SELECT count(*)
  INTO current_size
  FROM team_players AS team_player
  WHERE team_player.team_id = NEW.team_id
    AND (TG_OP = 'INSERT' OR team_player.id <> NEW.id);

  IF current_size >= configured_limit THEN
    RAISE EXCEPTION 'Este time ja atingiu o limite de % jogadores.', configured_limit;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_team_player_limit_trigger ON team_players;
CREATE TRIGGER enforce_team_player_limit_trigger
BEFORE INSERT OR UPDATE OF team_id ON team_players
FOR EACH ROW
EXECUTE FUNCTION enforce_team_player_limit();

CREATE OR REPLACE FUNCTION join_callup(p_callup_id UUID)
RETURNS callup_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup callups%ROWTYPE;
  current_player_id UUID;
  confirmed_count INTEGER;
  waitlist_count INTEGER;
  created_entry callup_entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para participar.'; END IF;
  SELECT player_id INTO current_player_id FROM account_profiles WHERE user_id = auth.uid();
  IF current_player_id IS NULL THEN RAISE EXCEPTION 'Sua conta nao esta vinculada a um jogador.'; END IF;

  SELECT * INTO current_callup FROM callups WHERE id = p_callup_id FOR UPDATE;
  IF NOT FOUND OR current_callup.status <> 'open' THEN RAISE EXCEPTION 'A convocacao nao esta aberta.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM players
    WHERE id = current_player_id AND is_selectable = true AND member_category IN ('player', 'guest')
  ) THEN RAISE EXCEPTION 'Este perfil nao pode participar da convocacao.'; END IF;

  SELECT * INTO created_entry FROM callup_entries
  WHERE callup_id = p_callup_id AND player_id = current_player_id;
  IF FOUND THEN RETURN created_entry; END IF;

  SELECT count(*) INTO confirmed_count FROM callup_entries
  WHERE callup_id = p_callup_id AND status = 'confirmed';
  SELECT count(*) INTO waitlist_count FROM callup_entries
  WHERE callup_id = p_callup_id AND status = 'waitlist';

  IF confirmed_count < current_callup.capacity THEN
    INSERT INTO callup_entries (callup_id, player_id, status, position, joined_by)
    VALUES (p_callup_id, current_player_id, 'confirmed', confirmed_count + 1, auth.uid())
    RETURNING * INTO created_entry;
  ELSIF waitlist_count < current_callup.waitlist_capacity THEN
    INSERT INTO callup_entries (callup_id, player_id, status, position, joined_by)
    VALUES (p_callup_id, current_player_id, 'waitlist', waitlist_count + 1, auth.uid())
    RETURNING * INTO created_entry;
  ELSE
    RAISE EXCEPTION 'Lista cheia: % confirmados e % pessoas na fila.', current_callup.capacity, current_callup.waitlist_capacity;
  END IF;

  RETURN created_entry;
END;
$$;

CREATE OR REPLACE FUNCTION admin_add_callup_player(p_callup_id UUID, p_player_id UUID)
RETURNS callup_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup callups%ROWTYPE;
  confirmed_count INTEGER;
  waitlist_count INTEGER;
  created_entry callup_entries%ROWTYPE;
BEGIN
  IF NOT is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem gerenciar a lista.'; END IF;
  SELECT * INTO current_callup FROM callups WHERE id = p_callup_id FOR UPDATE;
  IF NOT FOUND OR current_callup.status <> 'open' THEN RAISE EXCEPTION 'A convocacao nao esta aberta.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM players WHERE id = p_player_id AND is_selectable = true
      AND member_category IN ('player', 'guest')
  ) THEN RAISE EXCEPTION 'Esta pessoa nao esta elegivel para jogar.'; END IF;

  SELECT * INTO created_entry FROM callup_entries
  WHERE callup_id = p_callup_id AND player_id = p_player_id;
  IF FOUND THEN RETURN created_entry; END IF;

  SELECT count(*) INTO confirmed_count FROM callup_entries
  WHERE callup_id = p_callup_id AND status = 'confirmed';
  SELECT count(*) INTO waitlist_count FROM callup_entries
  WHERE callup_id = p_callup_id AND status = 'waitlist';

  IF confirmed_count < current_callup.capacity THEN
    INSERT INTO callup_entries (callup_id, player_id, status, position, joined_by)
    VALUES (p_callup_id, p_player_id, 'confirmed', confirmed_count + 1, auth.uid())
    RETURNING * INTO created_entry;
  ELSIF waitlist_count < current_callup.waitlist_capacity THEN
    INSERT INTO callup_entries (callup_id, player_id, status, position, joined_by)
    VALUES (p_callup_id, p_player_id, 'waitlist', waitlist_count + 1, auth.uid())
    RETURNING * INTO created_entry;
  ELSE
    RAISE EXCEPTION 'Lista cheia: % confirmados e % pessoas na fila.', current_callup.capacity, current_callup.waitlist_capacity;
  END IF;

  RETURN created_entry;
END;
$$;
