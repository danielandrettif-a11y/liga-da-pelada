-- Round operations must authorize the administrator of the round's league,
-- not the legacy global app administrator. Keep the functions invoker-rights
-- so the league RLS policies remain an additional boundary.

CREATE OR REPLACE FUNCTION public.set_round_player_attendance(
  p_round_id uuid,
  p_player_id uuid,
  p_present boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_mode text;
  next_order integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rounds round_item
    WHERE round_item.id = p_round_id
      AND public.is_league_admin(round_item.league_id)
  ) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;

  SELECT formation_mode INTO current_mode
  FROM public.rounds
  WHERE id = p_round_id AND status <> 'finished'
  FOR UPDATE;

  IF current_mode IS NULL THEN
    RAISE EXCEPTION 'Rodada nao encontrada ou ja encerrada.';
  END IF;
  IF current_mode = 'manual' THEN
    RAISE EXCEPTION 'Rodadas manuais nao usam ordem de chegada.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.round_players
    WHERE round_id = p_round_id AND player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'Jogador nao participa desta rodada.';
  END IF;

  IF p_present THEN
    IF EXISTS (
      SELECT 1 FROM public.round_players
      WHERE round_id = p_round_id AND player_id = p_player_id AND attendance_status = 'present'
    ) THEN
      RETURN true;
    END IF;
    SELECT COALESCE(MAX(attendance_order), 0) + 1 INTO next_order
    FROM public.round_players WHERE round_id = p_round_id;
    UPDATE public.round_players
    SET attendance_status = 'present', attendance_order = next_order, attendance_marked_at = now()
    WHERE round_id = p_round_id AND player_id = p_player_id;
  ELSE
    UPDATE public.round_players
    SET attendance_status = 'pending', attendance_order = NULL, attendance_marked_at = NULL
    WHERE round_id = p_round_id AND player_id = p_player_id;
    PERFORM public.normalize_round_attendance(p_round_id);
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_round_team_arrived(p_round_id uuid, p_team_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_mode text;
  next_order integer;
  changed_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rounds round_item
    WHERE round_item.id = p_round_id
      AND public.is_league_admin(round_item.league_id)
  ) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;

  SELECT formation_mode INTO current_mode
  FROM public.rounds WHERE id = p_round_id AND status <> 'finished' FOR UPDATE;
  IF current_mode IS NULL OR current_mode = 'manual' THEN
    RAISE EXCEPTION 'Esta rodada nao usa ordem de chegada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id AND round_id = p_round_id) THEN
    RAISE EXCEPTION 'Time invalido para esta rodada.';
  END IF;

  SELECT COALESCE(MAX(attendance_order), 0) INTO next_order
  FROM public.round_players WHERE round_id = p_round_id;

  WITH pending AS (
    SELECT rp.id, row_number() OVER (ORDER BY tp.goalkeeper_order NULLS LAST, rp.id)::integer AS offset
    FROM public.round_players rp
    JOIN public.team_players tp ON tp.player_id = rp.player_id
    WHERE rp.round_id = p_round_id
      AND tp.team_id = p_team_id
      AND rp.attendance_status = 'pending'
  )
  UPDATE public.round_players rp
  SET attendance_status = 'present',
      attendance_order = next_order + pending.offset,
      attendance_marked_at = now()
  FROM pending
  WHERE rp.id = pending.id;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.swap_round_team_players(
  p_round_id uuid,
  p_player_a_id uuid,
  p_player_b_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  entry_a public.team_players%ROWTYPE;
  entry_b public.team_players%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rounds round_item
    WHERE round_item.id = p_round_id
      AND public.is_league_admin(round_item.league_id)
  ) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF p_player_a_id = p_player_b_id THEN
    RAISE EXCEPTION 'Escolha dois jogadores diferentes.';
  END IF;

  PERFORM 1 FROM public.rounds WHERE id = p_round_id AND status <> 'finished' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada nao encontrada ou encerrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND status = 'live') THEN
    RAISE EXCEPTION 'Encerre a partida ao vivo antes de trocar os times.';
  END IF;

  SELECT item.* INTO entry_a
  FROM public.team_players item JOIN public.teams team ON team.id = item.team_id
  WHERE team.round_id = p_round_id AND item.player_id = p_player_a_id
  FOR UPDATE OF item;

  SELECT item.* INTO entry_b
  FROM public.team_players item JOIN public.teams team ON team.id = item.team_id
  WHERE team.round_id = p_round_id AND item.player_id = p_player_b_id
  FOR UPDATE OF item;

  IF entry_a.id IS NULL OR entry_b.id IS NULL THEN
    RAISE EXCEPTION 'Os dois jogadores precisam pertencer a esta rodada.';
  END IF;
  IF entry_a.team_id = entry_b.team_id THEN
    RAISE EXCEPTION 'Escolha jogadores de times diferentes.';
  END IF;

  -- Preserve the destination goalkeeper and loan slots and capacity triggers.
  DELETE FROM public.team_players WHERE id IN (entry_a.id, entry_b.id);

  INSERT INTO public.team_players (id, team_id, player_id, goalkeeper_order, loan_order)
  VALUES
    (entry_a.id, entry_b.team_id, entry_a.player_id, entry_b.goalkeeper_order, entry_b.loan_order),
    (entry_b.id, entry_a.team_id, entry_b.player_id, entry_a.goalkeeper_order, entry_a.loan_order);

  UPDATE public.teams team
  SET captain_player_id = CASE
    WHEN team.id = entry_a.team_id AND team.captain_player_id = entry_a.player_id THEN entry_b.player_id
    WHEN team.id = entry_b.team_id AND team.captain_player_id = entry_b.player_id THEN entry_a.player_id
    ELSE team.captain_player_id
  END
  WHERE id IN (entry_a.team_id, entry_b.team_id);

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.shuffle_round_teams(p_round_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  team_count integer;
  player_count integer;
  assignments jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rounds round_item
    WHERE round_item.id = p_round_id
      AND public.is_league_admin(round_item.league_id)
  ) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;

  PERFORM 1 FROM public.rounds round_item
  WHERE round_item.id = p_round_id AND round_item.status <> 'finished'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada não encontrada ou já encerrada.'; END IF;

  IF EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND status = 'live') THEN
    RAISE EXCEPTION 'Encerre a partida ao vivo antes de misturar os times.';
  END IF;

  SELECT count(*) INTO team_count FROM public.teams WHERE round_id = p_round_id;
  SELECT count(*) INTO player_count
  FROM public.team_players item JOIN public.teams team ON team.id = item.team_id
  WHERE team.round_id = p_round_id;
  IF team_count < 2 OR player_count < team_count * 2 THEN
    RAISE EXCEPTION 'São necessários pelo menos dois times completos para fazer uma nova mistura.';
  END IF;

  WITH team_sizes AS (
    SELECT team.id AS team_id, team.position, count(item.player_id)::integer AS player_count
    FROM public.teams team
    LEFT JOIN public.team_players item ON item.team_id = team.id
    WHERE team.round_id = p_round_id
    GROUP BY team.id, team.position
  ), randomized AS (
    SELECT item.player_id,
      row_number() OVER (ORDER BY random(), item.player_id)::integer AS slot_number
    FROM public.team_players item JOIN public.teams team ON team.id = item.team_id
    WHERE team.round_id = p_round_id
  ), slots AS (
    SELECT size.team_id,
      row_number() OVER (ORDER BY size.position, generated.slot_order)::integer AS slot_number
    FROM team_sizes size
    CROSS JOIN LATERAL generate_series(1, size.player_count) generated(slot_order)
  ), paired_base AS (
    SELECT team_id, player_id
    FROM slots JOIN randomized USING (slot_number)
  ), paired AS (
    SELECT team_id, player_id,
      row_number() OVER (PARTITION BY team_id ORDER BY random(), player_id)::integer AS goalkeeper_order,
      row_number() OVER (PARTITION BY team_id ORDER BY random(), player_id)::integer AS loan_order
    FROM paired_base
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'team_id', team_id,
    'player_id', player_id,
    'goalkeeper_order', goalkeeper_order,
    'loan_order', loan_order
  )), '[]'::jsonb)
  INTO assignments FROM paired;

  DELETE FROM public.team_players item
  USING public.teams team
  WHERE item.team_id = team.id AND team.round_id = p_round_id;

  INSERT INTO public.team_players (team_id, player_id, goalkeeper_order, loan_order)
  SELECT row_item.team_id, row_item.player_id, row_item.goalkeeper_order, row_item.loan_order
  FROM jsonb_to_recordset(assignments) AS row_item(
    team_id uuid,
    player_id uuid,
    goalkeeper_order integer,
    loan_order integer
  );

  UPDATE public.teams SET captain_player_id = NULL WHERE round_id = p_round_id;
  UPDATE public.rounds
  SET notes = concat_ws(E'\n', NULLIF(notes, ''), 'Times misturados pelo administrador em ' || to_char(now(), 'DD/MM HH24:MI'))
  WHERE id = p_round_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_round_player_attendance(uuid, uuid, boolean),
  public.mark_round_team_arrived(uuid, uuid),
  public.swap_round_team_players(uuid, uuid, uuid),
  public.shuffle_round_teams(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_round_player_attendance(uuid, uuid, boolean),
  public.mark_round_team_arrived(uuid, uuid),
  public.swap_round_team_players(uuid, uuid, uuid),
  public.shuffle_round_teams(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
