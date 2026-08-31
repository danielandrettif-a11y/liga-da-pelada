-- Restaura a associação automática do atleta com a liga, separa sorteio
-- normal de ordem de chegada e permite atualizar todas as presenças em uma
-- única ida ao banco.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS arrival_order_enabled BOOLEAN NOT NULL DEFAULT false;

-- Sorteios normais antigos nasciam com todo mundo pendente. Só inicializamos
-- os que ainda não possuem nenhuma presença, preservando marcações reais.
UPDATE public.round_players entry
SET attendance_status = 'present',
    attendance_order = ordered.new_order,
    attendance_marked_at = now()
FROM (
  SELECT rp.id,
    row_number() OVER (
      PARTITION BY rp.round_id
      ORDER BY
        (SELECT team.position FROM public.teams team JOIN public.team_players tp ON tp.team_id = team.id WHERE team.round_id = rp.round_id AND tp.player_id = rp.player_id LIMIT 1),
        (SELECT tp.goalkeeper_order FROM public.teams team JOIN public.team_players tp ON tp.team_id = team.id WHERE team.round_id = rp.round_id AND tp.player_id = rp.player_id LIMIT 1),
        rp.id
    )::INTEGER AS new_order
  FROM public.round_players rp
  JOIN public.rounds round_item ON round_item.id = rp.round_id
  WHERE round_item.status <> 'finished'
    AND round_item.formation_mode IN ('random', 'balanced')
    AND round_item.arrival_order_enabled = false
    AND NOT EXISTS (
      SELECT 1 FROM public.round_players present
      WHERE present.round_id = rp.round_id AND present.attendance_status = 'present'
    )
) ordered
WHERE entry.id = ordered.id;

-- O aplicativo trabalha com uma liga ativa compartilhada. Perfis jogáveis
-- criados antes/depois da liga não podem desaparecer da convocação.
INSERT INTO public.league_members (league_id, player_id, role, is_active)
SELECT league.id, player.id, 'player', true
FROM public.leagues league
CROSS JOIN public.players player
WHERE league.is_active = true
  AND player.is_selectable = true
  AND player.member_category IN ('player', 'guest')
ON CONFLICT (league_id, player_id)
DO UPDATE SET is_active = true;

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

  SELECT * INTO current_callup FROM public.callups WHERE id = p_callup_id FOR UPDATE;
  IF NOT FOUND OR current_callup.status <> 'open' THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
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

  SELECT * INTO created_entry FROM public.callup_entries
  WHERE callup_id = p_callup_id AND player_id = p_player_id;
  IF FOUND THEN RETURN created_entry; END IF;

  PERFORM public.normalize_callup_positions(p_callup_id);
  SELECT count(*) INTO confirmed_count FROM public.callup_entries
  WHERE callup_id = p_callup_id AND status = 'confirmed';
  target_status := CASE WHEN confirmed_count < current_callup.capacity THEN 'confirmed' ELSE 'waitlist' END;
  SELECT COALESCE(max(position), 0) + 1 INTO next_position FROM public.callup_entries
  WHERE callup_id = p_callup_id AND status = target_status;

  INSERT INTO public.callup_entries (callup_id, player_id, status, position, joined_by)
  VALUES (p_callup_id, p_player_id, target_status, next_position, auth.uid())
  RETURNING * INTO created_entry;
  RETURN created_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_round_attendance_bulk(
  p_round_id UUID,
  p_present_player_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE changed_count INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar a presenca.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rounds WHERE id = p_round_id AND status <> 'finished') THEN
    RAISE EXCEPTION 'Rodada nao encontrada ou ja encerrada.';
  END IF;

  WITH ordered AS (
    SELECT rp.id,
      array_position(COALESCE(p_present_player_ids, ARRAY[]::UUID[]), rp.player_id) AS new_order
    FROM public.round_players rp
    WHERE rp.round_id = p_round_id
  )
  UPDATE public.round_players rp
  SET attendance_status = CASE WHEN ordered.new_order IS NULL THEN 'pending' ELSE 'present' END,
      attendance_order = ordered.new_order,
      attendance_marked_at = CASE WHEN ordered.new_order IS NULL THEN NULL ELSE now() END
  FROM ordered
  WHERE rp.id = ordered.id;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.add_player_to_callup(UUID,UUID,BOOLEAN),
  public.set_round_attendance_bulk(UUID,UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_player_to_callup(UUID,UUID,BOOLEAN),
  public.set_round_attendance_bulk(UUID,UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
