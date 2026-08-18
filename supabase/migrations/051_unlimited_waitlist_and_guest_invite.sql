-- 051_unlimited_waitlist_and_guest_invite.sql
-- Fila de espera flexível sem teto de 3 e permissão para qualquer usuário cadastrar convidado na convocação

-- 1. Atualiza join_callup para suportar fila de espera ilimitada
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
  ELSE
    INSERT INTO callup_entries (callup_id, player_id, status, position, joined_by)
    VALUES (p_callup_id, current_player_id, 'waitlist', waitlist_count + 1, auth.uid())
    RETURNING * INTO created_entry;
  END IF;

  RETURN created_entry;
END;
$$;

-- 2. Atualiza admin_add_callup_player para permitir fila sem trava fixa
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
  ELSE
    INSERT INTO callup_entries (callup_id, player_id, status, position, joined_by)
    VALUES (p_callup_id, p_player_id, 'waitlist', waitlist_count + 1, auth.uid()) RETURNING * INTO created_entry;
  END IF;
  RETURN created_entry;
END;
$$;
