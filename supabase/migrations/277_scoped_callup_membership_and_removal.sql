-- A callup is not a way to enroll an arbitrary global player in a league.
-- The player must already belong to the league through its invite/ADM flow.
CREATE OR REPLACE FUNCTION public.add_player_to_callup(
  p_callup_id uuid,
  p_player_id uuid,
  p_admin_only boolean DEFAULT false
)
RETURNS public.callup_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  created_entry public.callup_entries%ROWTYPE;
  confirmed_count integer;
  next_position integer;
  target_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para participar.';
  END IF;

  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
  FOR UPDATE;
  IF NOT FOUND OR current_callup.status NOT IN ('open', 'converted') THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;
  IF NOT public.is_league_member(current_callup.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito aos membros desta pelada.';
  END IF;
  IF p_admin_only AND NOT public.is_league_admin(current_callup.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF NOT public.can_access_callup(p_callup_id) THEN
    RAISE EXCEPTION 'Esta convocacao é privada. Use o convite enviado pelo ADM.';
  END IF;
  IF current_callup.status = 'converted' AND current_callup.round_id IS NULL THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;
  IF current_callup.round_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.matches match_item
    WHERE match_item.round_id = current_callup.round_id
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
  ) THEN
    RAISE EXCEPTION 'A convocacao foi encerrada porque o primeiro jogo ja comecou.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.league_members member
    JOIN public.players player ON player.id = member.player_id
    WHERE member.league_id = current_callup.league_id
      AND member.player_id = p_player_id
      AND member.is_active
      AND player.is_selectable = true
      AND player.member_category IN ('player', 'guest')
  ) THEN
    RAISE EXCEPTION 'Este perfil nao pertence ao elenco ativo desta pelada.';
  END IF;

  SELECT * INTO created_entry
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND player_id = p_player_id;
  IF FOUND THEN RETURN created_entry; END IF;

  PERFORM public.normalize_callup_positions(p_callup_id);
  IF current_callup.status = 'converted' THEN
    target_status := 'waitlist';
  ELSE
    SELECT count(*) INTO confirmed_count
    FROM public.callup_entries
    WHERE callup_id = p_callup_id AND status = 'confirmed';
    target_status := CASE WHEN confirmed_count < current_callup.capacity THEN 'confirmed' ELSE 'waitlist' END;
  END IF;

  SELECT COALESCE(max(position), 0) + 1 INTO next_position
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND status = target_status;

  INSERT INTO public.callup_entries (callup_id, player_id, status, position, joined_by)
  VALUES (p_callup_id, p_player_id, target_status, next_position, auth.uid())
  RETURNING * INTO created_entry;

  RETURN created_entry;
END;
$$;

-- The internal removal helper deliberately has no public execute privilege.
-- Both entry points check the target league before invoking it.
CREATE OR REPLACE FUNCTION public.admin_remove_callup_player(
  p_callup_id uuid,
  p_player_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_league_id uuid;
BEGIN
  SELECT league_id INTO target_league_id
  FROM public.callups
  WHERE id = p_callup_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;

  RETURN public.remove_callup_player_before_first_match(p_callup_id, p_player_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_callup(p_callup_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_player_id uuid;
  target_league_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para sair.';
  END IF;

  SELECT league_id INTO target_league_id
  FROM public.callups
  WHERE id = p_callup_id;
  IF target_league_id IS NULL OR NOT public.is_league_member(target_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito aos membros desta pelada.';
  END IF;

  SELECT profile.player_id INTO current_player_id
  FROM public.account_profiles profile
  JOIN public.league_members member
    ON member.player_id = profile.player_id
   AND member.league_id = target_league_id
   AND member.is_active
  WHERE profile.user_id = auth.uid();

  IF current_player_id IS NULL THEN
    RAISE EXCEPTION 'Sua conta não está vinculada a um jogador desta pelada.';
  END IF;

  RETURN public.remove_callup_player_before_first_match(p_callup_id, current_player_id);
END;
$$;

REVOKE ALL ON FUNCTION public.add_player_to_callup(uuid, uuid, boolean),
  public.admin_remove_callup_player(uuid, uuid), public.leave_callup(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_player_to_callup(uuid, uuid, boolean),
  public.admin_remove_callup_player(uuid, uuid), public.leave_callup(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
