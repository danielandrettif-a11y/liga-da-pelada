-- Depois do sorteio os times permanecem preservados, mas a fila continua
-- recebendo novos nomes até o início da primeira partida. Reposições abertas
-- continuam usando o fluxo existente: nesses casos a convocação fica `open`
-- e o trigger da migration 177 encaixa o próximo confirmado no time correto.

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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para participar.'; END IF;
  IF p_admin_only AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem gerenciar a lista.';
  END IF;

  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
  FOR UPDATE;
  IF NOT FOUND OR current_callup.status NOT IN ('open', 'converted') THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;

  -- `converted` significa somente que os times já foram sorteados. A lista
  -- fecha de fato quando a primeira partida é iniciada.
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
    SELECT 1 FROM public.players player
    WHERE player.id = p_player_id
      AND player.is_selectable = true
      AND player.member_category IN ('player', 'guest')
  ) THEN
    RAISE EXCEPTION 'Este perfil nao pode participar da convocacao.';
  END IF;

  INSERT INTO public.league_members (league_id, player_id, role, is_active)
  VALUES (current_callup.league_id, p_player_id, 'player', true)
  ON CONFLICT (league_id, player_id) DO UPDATE SET is_active = true;

  SELECT * INTO created_entry
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND player_id = p_player_id;
  IF FOUND THEN RETURN created_entry; END IF;

  PERFORM public.normalize_callup_positions(p_callup_id);

  -- Após o sorteio, novos participantes sempre entram na fila: eles não
  -- alteram a escalação já definida. Antes do sorteio, preservamos a regra
  -- normal de ocupar vagas livres e promover reposições.
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

CREATE OR REPLACE FUNCTION public.create_callup_guest(
  p_callup_id UUID,
  p_name TEXT,
  p_player_profile TEXT DEFAULT 'midfield',
  p_is_goalkeeper BOOLEAN DEFAULT false
)
RETURNS public.callup_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  guest_player public.players%ROWTYPE;
  created_entry public.callup_entries%ROWTYPE;
  clean_name TEXT := left(trim(COALESCE(p_name, '')), 120);
  clean_profile TEXT := COALESCE(p_player_profile, 'midfield');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para contratar um amigo.'; END IF;
  IF length(clean_name) < 2 THEN RAISE EXCEPTION 'Informe o nome do seu amigo (pelo menos 2 letras).'; END IF;
  IF clean_profile NOT IN ('offensive', 'midfield', 'defensive') THEN clean_profile := 'midfield'; END IF;

  SELECT * INTO current_callup FROM public.callups WHERE id = p_callup_id FOR UPDATE;
  IF NOT FOUND OR current_callup.status NOT IN ('open', 'converted') THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;
  IF current_callup.status = 'converted' AND current_callup.round_id IS NULL THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;
  IF current_callup.round_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = current_callup.round_id
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
  ) THEN
    RAISE EXCEPTION 'A convocacao foi encerrada porque o primeiro jogo ja comecou.';
  END IF;

  INSERT INTO public.players (
    name, member_category, is_selectable, is_goalkeeper, player_profile,
    registration_source, created_by_user_id
  ) VALUES (
    clean_name, 'guest', true, COALESCE(p_is_goalkeeper, false), clean_profile,
    'site_signup', auth.uid()
  ) RETURNING * INTO guest_player;

  INSERT INTO public.league_members (league_id, player_id, role, is_active)
  VALUES (current_callup.league_id, guest_player.id, 'player', true);

  SELECT * INTO created_entry
  FROM public.add_player_to_callup(p_callup_id, guest_player.id, false);
  RETURN created_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.add_player_to_callup(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_player_to_callup(UUID, UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.create_callup_guest(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_callup_guest(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
