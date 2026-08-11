-- Convocacoes publicas, com 15 confirmados e 3 pessoas na fila.

CREATE TABLE IF NOT EXISTS callups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  round_type TEXT NOT NULL DEFAULT 'official' CHECK (round_type IN ('official', 'friendly')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'converted', 'closed')),
  capacity INTEGER NOT NULL DEFAULT 15 CHECK (capacity BETWEEN 1 AND 100),
  waitlist_capacity INTEGER NOT NULL DEFAULT 3 CHECK (waitlist_capacity BETWEEN 0 AND 100),
  round_id UUID REFERENCES rounds(id) ON DELETE SET NULL,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS callups_one_active_per_league_idx
ON callups (league_id) WHERE status IN ('open', 'locked');

CREATE TABLE IF NOT EXISTS callup_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  callup_id UUID NOT NULL REFERENCES callups(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'waitlist')),
  position INTEGER NOT NULL CHECK (position > 0),
  joined_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (callup_id, player_id),
  UNIQUE (callup_id, status, position)
);

CREATE INDEX IF NOT EXISTS callup_entries_order_idx
ON callup_entries (callup_id, status, position);

CREATE OR REPLACE FUNCTION normalize_callup_positions(p_callup_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup callups%ROWTYPE;
  promote_id UUID;
BEGIN
  SELECT * INTO current_callup FROM callups WHERE id = p_callup_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  -- Posicoes temporarias evitam conflito com o indice unico durante a reordenacao.
  UPDATE callup_entries SET position = position + 1000 WHERE callup_id = p_callup_id;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY position, created_at, id) AS new_position
    FROM callup_entries
    WHERE callup_id = p_callup_id AND status = 'confirmed'
  )
  UPDATE callup_entries entry
  SET position = ordered.new_position
  FROM ordered WHERE entry.id = ordered.id;

  WHILE (SELECT count(*) FROM callup_entries WHERE callup_id = p_callup_id AND status = 'confirmed') < current_callup.capacity
  LOOP
    SELECT id INTO promote_id
    FROM callup_entries
    WHERE callup_id = p_callup_id AND status = 'waitlist'
    ORDER BY position, created_at, id
    LIMIT 1;
    EXIT WHEN promote_id IS NULL;

    UPDATE callup_entries
    SET status = 'confirmed',
        position = (SELECT count(*) + 1 FROM callup_entries WHERE callup_id = p_callup_id AND status = 'confirmed')
    WHERE id = promote_id;
    promote_id := NULL;
  END LOOP;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY position, created_at, id) AS new_position
    FROM callup_entries
    WHERE callup_id = p_callup_id AND status = 'waitlist'
  )
  UPDATE callup_entries entry
  SET position = ordered.new_position
  FROM ordered WHERE entry.id = ordered.id;
END;
$$;

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
  ) THEN
    RAISE EXCEPTION 'Este perfil nao pode participar da convocacao.';
  END IF;

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
    RAISE EXCEPTION 'Lista cheia: 15 confirmados e 3 pessoas na fila.';
  END IF;

  RETURN created_entry;
END;
$$;

CREATE OR REPLACE FUNCTION leave_callup(p_callup_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_player_id UUID;
  current_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para sair.'; END IF;
  SELECT player_id INTO current_player_id FROM account_profiles WHERE user_id = auth.uid();

  PERFORM 1 FROM callups WHERE id = p_callup_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A convocacao nao esta aberta.'; END IF;

  SELECT status INTO current_status FROM callup_entries
  WHERE callup_id = p_callup_id AND player_id = current_player_id FOR UPDATE;
  IF current_status IS NULL THEN RETURN true; END IF;

  DELETE FROM callup_entries WHERE callup_id = p_callup_id AND player_id = current_player_id;
  PERFORM normalize_callup_positions(p_callup_id);
  RETURN true;
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
    VALUES (p_callup_id, p_player_id, 'confirmed', confirmed_count + 1, auth.uid()) RETURNING * INTO created_entry;
  ELSIF waitlist_count < current_callup.waitlist_capacity THEN
    INSERT INTO callup_entries (callup_id, player_id, status, position, joined_by)
    VALUES (p_callup_id, p_player_id, 'waitlist', waitlist_count + 1, auth.uid()) RETURNING * INTO created_entry;
  ELSE
    RAISE EXCEPTION 'Lista cheia: 15 confirmados e 3 pessoas na fila.';
  END IF;
  RETURN created_entry;
END;
$$;

CREATE OR REPLACE FUNCTION admin_remove_callup_player(p_callup_id UUID, p_player_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem gerenciar a lista.'; END IF;
  PERFORM 1 FROM callups WHERE id = p_callup_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A convocacao nao esta aberta.'; END IF;
  DELETE FROM callup_entries WHERE callup_id = p_callup_id AND player_id = p_player_id;
  PERFORM normalize_callup_positions(p_callup_id);
  RETURN true;
END;
$$;

ALTER TABLE callups ENABLE ROW LEVEL SECURITY;
ALTER TABLE callup_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read callups" ON callups;
CREATE POLICY "Public read callups" ON callups FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage callups" ON callups;
CREATE POLICY "Admins manage callups" ON callups FOR ALL TO authenticated
USING (is_app_admin()) WITH CHECK (is_app_admin());

DROP POLICY IF EXISTS "Public read callup entries" ON callup_entries;
CREATE POLICY "Public read callup entries" ON callup_entries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage callup entries" ON callup_entries;
CREATE POLICY "Admins manage callup entries" ON callup_entries FOR ALL TO authenticated
USING (is_app_admin()) WITH CHECK (is_app_admin());

GRANT SELECT ON callups, callup_entries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON callups, callup_entries TO authenticated;
REVOKE ALL ON FUNCTION normalize_callup_positions(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION join_callup(UUID), leave_callup(UUID),
  admin_add_callup_player(UUID, UUID), admin_remove_callup_player(UUID, UUID)
TO authenticated;
