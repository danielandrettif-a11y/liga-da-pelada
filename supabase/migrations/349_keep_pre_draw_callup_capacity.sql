-- Uma rodada pode existir antes do sorteio. Nesse intervalo, a convocacao
-- continua usando a capacidade normal; a distribuicao por vagas dos times so
-- comeca depois que os times forem realmente criados.

BEGIN;

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
  has_drawn_teams boolean := false;
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
    RAISE EXCEPTION 'Esta convocacao e privada. Use o convite enviado pelo ADM.';
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

  IF current_callup.round_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.teams team
      WHERE team.round_id = current_callup.round_id
    ) INTO has_drawn_teams;
  END IF;

  SELECT * INTO created_entry
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND player_id = p_player_id;
  IF FOUND THEN
    IF has_drawn_teams THEN
      PERFORM public.sync_converted_callup_teams(p_callup_id);
      SELECT * INTO created_entry FROM public.callup_entries
      WHERE callup_id = p_callup_id AND player_id = p_player_id;
    END IF;
    RETURN created_entry;
  END IF;

  IF has_drawn_teams THEN
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

  IF has_drawn_teams THEN
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

-- Recupera pessoas que a versao anterior colocou na fila em partidas rapidas
-- ainda sem times. A funcao respeita a capacidade e preserva a ordem da fila.
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
        SELECT 1 FROM public.teams team
        WHERE team.round_id = callup.round_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.matches match_item
        WHERE match_item.round_id = callup.round_id
          AND (
            match_item.started_at IS NOT NULL
            OR match_item.status IN ('in_progress', 'live', 'finished')
          )
      )
      AND EXISTS (
        SELECT 1 FROM public.callup_entries entry
        WHERE entry.callup_id = callup.id
          AND entry.status = 'waitlist'
      )
    ORDER BY callup.created_at, callup.id
  LOOP
    PERFORM public.normalize_callup_positions(target.id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
