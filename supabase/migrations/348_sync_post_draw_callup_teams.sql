-- Mantém a convocação e os times sincronizados depois do sorteio.
-- Antes do primeiro jogo, novas confirmações ocupam automaticamente o time
-- com menos atletas. Quando todos os times atingem o tamanho planejado, as
-- próximas pessoas permanecem na fila de espera.

BEGIN;

CREATE OR REPLACE FUNCTION public.attach_confirmed_callup_player_to_team(
  p_callup_id uuid,
  p_player_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  linked_round public.rounds%ROWTYPE;
  target_team_id uuid;
  vacancy_id uuid;
  target_size integer;
  next_attendance_order integer;
  next_goalkeeper_order integer;
  next_loan_order integer;
BEGIN
  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
    AND round_id IS NOT NULL
    AND status IN ('open', 'converted')
  FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.callup_entries entry
    WHERE entry.callup_id = p_callup_id
      AND entry.player_id = p_player_id
      AND entry.status = 'confirmed'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO linked_round
  FROM public.rounds
  WHERE id = current_callup.round_id
    AND status <> 'finished'
  FOR UPDATE;

  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = current_callup.round_id
      AND (
        match_item.started_at IS NOT NULL
        OR match_item.status IN ('in_progress', 'live', 'finished')
      )
  ) THEN
    RETURN NULL;
  END IF;

  SELECT team_player.team_id INTO target_team_id
  FROM public.team_players team_player
  JOIN public.teams team ON team.id = team_player.team_id
  WHERE team.round_id = current_callup.round_id
    AND team_player.player_id = p_player_id
  ORDER BY team.position, team.id
  LIMIT 1;

  IF target_team_id IS NOT NULL THEN
    RETURN target_team_id;
  END IF;

  -- Uma desistência explícita preserva o time e a posição do atleta anterior.
  SELECT slot.id INTO vacancy_id
  FROM public.callup_replacement_slots slot
  WHERE slot.callup_id = p_callup_id
    AND slot.round_id = current_callup.round_id
    AND slot.replacement_player_id IS NULL
  ORDER BY slot.created_at, slot.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF vacancy_id IS NOT NULL
    AND public.attach_callup_replacement_player(vacancy_id, p_player_id)
  THEN
    SELECT slot.team_id INTO target_team_id
    FROM public.callup_replacement_slots slot
    WHERE slot.id = vacancy_id;
    RETURN target_team_id;
  END IF;

  SELECT COALESCE(
    linked_round.target_players_per_team,
    current_callup.players_per_team,
    league.players_per_team
  ) INTO target_size
  FROM public.leagues league
  WHERE league.id = current_callup.league_id;

  -- Empates são resolvidos pela posição fixa dos times, mantendo a distribuição
  -- previsível: o menor time recebe primeiro e nenhum time ultrapassa o formato.
  SELECT candidate.team_id INTO target_team_id
  FROM (
    SELECT team.id AS team_id, team.position, count(team_player.id)::integer AS player_count
    FROM public.teams team
    LEFT JOIN public.team_players team_player ON team_player.team_id = team.id
    WHERE team.round_id = current_callup.round_id
    GROUP BY team.id, team.position
    HAVING count(team_player.id) < target_size
    ORDER BY count(team_player.id), team.position, team.id
    LIMIT 1
  ) candidate;

  IF target_team_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(max(round_player.attendance_order), 0) + 1
  INTO next_attendance_order
  FROM public.round_players round_player
  WHERE round_player.round_id = current_callup.round_id;

  INSERT INTO public.round_players (
    round_id, player_id, availability_status, availability_updated_at,
    attendance_status, attendance_order, attendance_marked_at
  ) VALUES (
    current_callup.round_id,
    p_player_id,
    'available',
    now(),
    CASE WHEN linked_round.formation_mode = 'manual' THEN 'pending' ELSE 'present' END,
    CASE WHEN linked_round.formation_mode = 'manual' THEN NULL ELSE next_attendance_order END,
    CASE WHEN linked_round.formation_mode = 'manual' THEN NULL ELSE now() END
  )
  ON CONFLICT (round_id, player_id) DO NOTHING;

  SELECT COALESCE(max(goalkeeper_order), 0) + 1,
         COALESCE(max(loan_order), 0) + 1
  INTO next_goalkeeper_order, next_loan_order
  FROM public.team_players
  WHERE team_id = target_team_id;

  INSERT INTO public.team_players (team_id, player_id, goalkeeper_order, loan_order)
  VALUES (target_team_id, p_player_id, next_goalkeeper_order, next_loan_order)
  ON CONFLICT (team_id, player_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_players
    WHERE team_id = target_team_id AND player_id = p_player_id
  ) THEN
    RETURN NULL;
  END IF;

  RETURN target_team_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_confirmed_callup_player_to_team(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- O gatilho existente passa a cobrir tanto vagas de desistência quanto vagas
-- que já estavam vazias no momento do sorteio.
CREATE OR REPLACE FUNCTION public.assign_callup_replacement_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    PERFORM public.attach_confirmed_callup_player_to_team(NEW.callup_id, NEW.player_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_callup_replacement_slot_on_confirmation
  ON public.callup_entries;
CREATE TRIGGER assign_callup_replacement_slot_on_confirmation
AFTER INSERT OR UPDATE OF status ON public.callup_entries
FOR EACH ROW EXECUTE FUNCTION public.assign_callup_replacement_slot();

CREATE OR REPLACE FUNCTION public.sync_converted_callup_teams(p_callup_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  candidate record;
  attached_team_id uuid;
  moved_count integer := 0;
  next_position integer;
BEGIN
  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
    AND round_id IS NOT NULL
    AND status IN ('open', 'converted')
  FOR UPDATE;

  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = current_callup.round_id
      AND (
        match_item.started_at IS NOT NULL
        OR match_item.status IN ('in_progress', 'live', 'finished')
      )
  ) THEN
    RETURN 0;
  END IF;

  -- Primeiro aproveita confirmações antigas que ficaram sem time.
  FOR candidate IN
    SELECT entry.id, entry.player_id
    FROM public.callup_entries entry
    WHERE entry.callup_id = p_callup_id
      AND entry.status = 'confirmed'
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_players team_player
        JOIN public.teams team ON team.id = team_player.team_id
        WHERE team.round_id = current_callup.round_id
          AND team_player.player_id = entry.player_id
      )
    ORDER BY entry.position, entry.created_at, entry.id
  LOOP
    attached_team_id := public.attach_confirmed_callup_player_to_team(p_callup_id, candidate.player_id);
    IF attached_team_id IS NULL THEN
      SELECT COALESCE(max(position), 0) + 1 INTO next_position
      FROM public.callup_entries
      WHERE callup_id = p_callup_id AND status = 'waitlist';
      UPDATE public.callup_entries
      SET status = 'waitlist', position = next_position
      WHERE id = candidate.id;
    ELSE
      moved_count := moved_count + 1;
    END IF;
  END LOOP;

  -- Depois promove a fila, uma pessoa por vaga real existente nos times.
  LOOP
    SELECT entry.id, entry.player_id INTO candidate
    FROM public.callup_entries entry
    WHERE entry.callup_id = p_callup_id
      AND entry.status = 'waitlist'
    ORDER BY entry.position, entry.created_at, entry.id
    LIMIT 1;
    EXIT WHEN NOT FOUND;

    SELECT COALESCE(max(position), 0) + 1 INTO next_position
    FROM public.callup_entries
    WHERE callup_id = p_callup_id AND status = 'confirmed';

    UPDATE public.callup_entries
    SET status = 'confirmed', position = next_position
    WHERE id = candidate.id;

    SELECT team_player.team_id INTO attached_team_id
    FROM public.team_players team_player
    JOIN public.teams team ON team.id = team_player.team_id
    WHERE team.round_id = current_callup.round_id
      AND team_player.player_id = candidate.player_id
    LIMIT 1;

    IF attached_team_id IS NULL THEN
      SELECT COALESCE(max(position), 0) + 1 INTO next_position
      FROM public.callup_entries
      WHERE callup_id = p_callup_id AND status = 'waitlist';
      UPDATE public.callup_entries
      SET status = 'waitlist', position = next_position
      WHERE id = candidate.id;
      EXIT;
    END IF;
    moved_count := moved_count + 1;
  END LOOP;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY position, created_at, id)::integer AS new_position
    FROM public.callup_entries
    WHERE callup_id = p_callup_id AND status = 'confirmed'
  )
  UPDATE public.callup_entries entry
  SET position = ordered.new_position
  FROM ordered
  WHERE entry.id = ordered.id;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY position, created_at, id)::integer AS new_position
    FROM public.callup_entries
    WHERE callup_id = p_callup_id AND status = 'waitlist'
  )
  UPDATE public.callup_entries entry
  SET position = ordered.new_position
  FROM ordered
  WHERE entry.id = ordered.id;

  RETURN moved_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_converted_callup_teams(uuid)
  FROM PUBLIC, anon, authenticated;

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
  has_team_vacancy boolean := false;
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
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = current_callup.round_id
      AND (
        match_item.started_at IS NOT NULL
        OR match_item.status IN ('in_progress', 'live', 'finished')
      )
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
  IF FOUND THEN
    IF current_callup.round_id IS NOT NULL THEN
      PERFORM public.sync_converted_callup_teams(p_callup_id);
      SELECT * INTO created_entry FROM public.callup_entries
      WHERE callup_id = p_callup_id AND player_id = p_player_id;
    END IF;
    RETURN created_entry;
  END IF;

  IF current_callup.round_id IS NOT NULL THEN
    PERFORM public.sync_converted_callup_teams(p_callup_id);
    SELECT EXISTS (
      SELECT 1
      FROM (
        SELECT team.id
        FROM public.teams team
        JOIN public.rounds round_item ON round_item.id = team.round_id
        JOIN public.leagues league ON league.id = round_item.league_id
        LEFT JOIN public.team_players team_player ON team_player.team_id = team.id
        WHERE team.round_id = current_callup.round_id
        GROUP BY team.id, round_item.target_players_per_team,
                 current_callup.players_per_team, league.players_per_team
        HAVING count(team_player.id) < COALESCE(
          round_item.target_players_per_team,
          current_callup.players_per_team,
          league.players_per_team
        )
      ) open_team
    ) INTO has_team_vacancy;
    target_status := CASE WHEN has_team_vacancy THEN 'confirmed' ELSE 'waitlist' END;
  ELSE
    PERFORM public.normalize_callup_positions(p_callup_id);
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

  IF current_callup.round_id IS NOT NULL THEN
    PERFORM public.sync_converted_callup_teams(p_callup_id);
    SELECT * INTO created_entry FROM public.callup_entries
    WHERE callup_id = p_callup_id AND player_id = p_player_id;
  END IF;

  RETURN created_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.add_player_to_callup(uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_player_to_callup(uuid, uuid, boolean)
  TO authenticated;

-- Repara as rodadas já sorteadas que ainda não começaram. Isso resolve a
-- rodada atual assim que a migration for aplicada.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT callup.id
    FROM public.callups callup
    JOIN public.rounds round_item ON round_item.id = callup.round_id
    WHERE callup.status IN ('open', 'converted')
      AND round_item.status <> 'finished'
      AND NOT EXISTS (
        SELECT 1 FROM public.matches match_item
        WHERE match_item.round_id = callup.round_id
          AND (
            match_item.started_at IS NOT NULL
            OR match_item.status IN ('in_progress', 'live', 'finished')
          )
      )
    ORDER BY callup.created_at, callup.id
  LOOP
    PERFORM public.sync_converted_callup_teams(target.id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
