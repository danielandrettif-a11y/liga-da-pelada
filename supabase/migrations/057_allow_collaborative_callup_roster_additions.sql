-- A convocação é colaborativa: qualquer usuário autenticado pode incluir um
-- jogador/convidado selecionável do elenco. A associação com a liga é criada
-- automaticamente quando ainda não existir.

CREATE OR REPLACE FUNCTION public.add_player_to_callup(
  p_callup_id UUID,
  p_player_id UUID,
  p_admin_only BOOLEAN DEFAULT false
)
RETURNS public.callup_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  created_entry public.callup_entries%ROWTYPE;
  confirmed_count INTEGER;
  next_position INTEGER;
  target_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para participar.';
  END IF;
  IF p_admin_only AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem gerenciar a lista.';
  END IF;

  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
  FOR UPDATE;

  IF NOT FOUND OR current_callup.status <> 'open' THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.players player
    WHERE player.id = p_player_id
      AND player.is_selectable = true
      AND player.member_category IN ('player', 'guest')
  ) THEN
    RAISE EXCEPTION 'Este perfil nao pode participar da convocacao.';
  END IF;

  -- Mantém o elenco compartilhado disponível para a convocação, inclusive
  -- quando o perfil foi criado depois da liga ou em um cadastro manual.
  INSERT INTO public.league_members (league_id, player_id, role, is_active)
  VALUES (current_callup.league_id, p_player_id, 'player', true)
  ON CONFLICT (league_id, player_id)
  DO UPDATE SET is_active = true;

  SELECT * INTO created_entry
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND player_id = p_player_id;
  IF FOUND THEN RETURN created_entry; END IF;

  PERFORM public.normalize_callup_positions(p_callup_id);

  SELECT count(*) INTO confirmed_count
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND status = 'confirmed';

  target_status := CASE
    WHEN confirmed_count < current_callup.capacity THEN 'confirmed'
    ELSE 'waitlist'
  END;

  SELECT COALESCE(max(position), 0) + 1 INTO next_position
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND status = target_status;

  INSERT INTO public.callup_entries (callup_id, player_id, status, position, joined_by)
  VALUES (p_callup_id, p_player_id, target_status, next_position, auth.uid())
  RETURNING * INTO created_entry;

  RETURN created_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.add_player_to_callup(UUID, UUID, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_player_to_callup(UUID, UUID, BOOLEAN)
  TO authenticated;
