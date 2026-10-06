-- Garante que uma pessoa promovida da fila somente conclua a reposicao depois
-- de realmente entrar no time da vaga. Tambem repara reposicoes antigas que
-- ficaram confirmadas na convocacao, mas sem time na rodada.

CREATE OR REPLACE FUNCTION public.attach_callup_replacement_player(
  p_slot_id UUID,
  p_player_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vacancy public.callup_replacement_slots%ROWTYPE;
  linked_round public.rounds%ROWTYPE;
  existing_team_id UUID;
  next_attendance_order INTEGER;
BEGIN
  SELECT slot.* INTO vacancy
  FROM public.callup_replacement_slots slot
  JOIN public.rounds round_item ON round_item.id = slot.round_id
  WHERE slot.id = p_slot_id
    AND (slot.replacement_player_id IS NULL OR slot.replacement_player_id = p_player_id)
    AND round_item.status <> 'finished'
    AND NOT EXISTS (
      SELECT 1
      FROM public.matches match_item
      WHERE match_item.round_id = slot.round_id
        AND (
          match_item.started_at IS NOT NULL
          OR match_item.status IN ('in_progress', 'live', 'finished')
        )
    )
  FOR UPDATE OF slot;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.callup_entries entry
    WHERE entry.callup_id = vacancy.callup_id
      AND entry.player_id = p_player_id
      AND entry.status = 'confirmed'
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT team_player.team_id INTO existing_team_id
  FROM public.team_players team_player
  JOIN public.teams team ON team.id = team_player.team_id
  WHERE team.round_id = vacancy.round_id
    AND team_player.player_id = p_player_id
  ORDER BY team.position, team.id
  LIMIT 1;

  IF existing_team_id IS NOT NULL AND existing_team_id <> vacancy.team_id THEN
    RAISE EXCEPTION 'O jogador promovido já pertence a outro time desta rodada.';
  END IF;

  SELECT * INTO linked_round
  FROM public.rounds
  WHERE id = vacancy.round_id
  FOR UPDATE;

  SELECT COALESCE(MAX(round_player.attendance_order), 0) + 1
  INTO next_attendance_order
  FROM public.round_players round_player
  WHERE round_player.round_id = vacancy.round_id;

  INSERT INTO public.round_players (
    round_id,
    player_id,
    availability_status,
    availability_updated_at,
    attendance_status,
    attendance_order,
    attendance_marked_at
  ) VALUES (
    vacancy.round_id,
    p_player_id,
    'available',
    now(),
    CASE WHEN linked_round.formation_mode = 'manual' THEN 'pending' ELSE 'present' END,
    CASE WHEN linked_round.formation_mode = 'manual' THEN NULL ELSE next_attendance_order END,
    CASE WHEN linked_round.formation_mode = 'manual' THEN NULL ELSE now() END
  )
  ON CONFLICT (round_id, player_id) DO NOTHING;

  INSERT INTO public.team_players (
    team_id,
    player_id,
    goalkeeper_order,
    loan_order
  ) VALUES (
    vacancy.team_id,
    p_player_id,
    vacancy.goalkeeper_order,
    vacancy.loan_order
  )
  ON CONFLICT DO NOTHING;

  -- Nunca fecha a vaga se alguma restricao impediu a entrada no time.
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_players team_player
    WHERE team_player.team_id = vacancy.team_id
      AND team_player.player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'Não foi possível inserir o jogador promovido no time da vaga.';
  END IF;

  UPDATE public.callup_replacement_slots
  SET replacement_player_id = p_player_id,
      resolved_at = now()
  WHERE id = vacancy.id;

  UPDATE public.callups callup
  SET status = CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.callup_replacement_slots slot
          WHERE slot.callup_id = callup.id
            AND slot.replacement_player_id IS NULL
        ) THEN 'open'
        ELSE 'converted'
      END,
      updated_at = now()
  WHERE callup.id = vacancy.callup_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_callup_replacement_player(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_callup_replacement_slot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vacancy_id UUID;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT slot.id INTO vacancy_id
  FROM public.callup_replacement_slots slot
  JOIN public.rounds round_item ON round_item.id = slot.round_id
  WHERE slot.callup_id = NEW.callup_id
    AND slot.replacement_player_id IS NULL
    AND round_item.status <> 'finished'
    AND NOT EXISTS (
      SELECT 1
      FROM public.matches match_item
      WHERE match_item.round_id = slot.round_id
        AND (
          match_item.started_at IS NOT NULL
          OR match_item.status IN ('in_progress', 'live', 'finished')
        )
    )
  ORDER BY slot.created_at, slot.id
  FOR UPDATE OF slot SKIP LOCKED
  LIMIT 1;

  IF vacancy_id IS NOT NULL THEN
    PERFORM public.attach_callup_replacement_player(vacancy_id, NEW.player_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_callup_replacement_slot_on_confirmation
  ON public.callup_entries;
CREATE TRIGGER assign_callup_replacement_slot_on_confirmation
AFTER INSERT OR UPDATE OF status ON public.callup_entries
FOR EACH ROW EXECUTE FUNCTION public.assign_callup_replacement_slot();

-- Funcao interna compartilhada pela remocao do ADM e pela desistência do
-- proprio jogador. Se ele for uma reposicao, a mesma vaga volta a ficar aberta.
CREATE OR REPLACE FUNCTION public.remove_callup_player_before_first_match(
  p_callup_id UUID,
  p_player_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  current_status TEXT;
  previous_team_player public.team_players%ROWTYPE;
  replacement_slot public.callup_replacement_slots%ROWTYPE;
  inferred_team_id UUID;
BEGIN
  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
    AND status IN ('open', 'converted')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A convocação não está disponível para alterações.';
  END IF;

  IF current_callup.round_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.matches match_item
    WHERE match_item.round_id = current_callup.round_id
      AND (
        match_item.started_at IS NOT NULL
        OR match_item.status IN ('in_progress', 'live', 'finished')
      )
  ) THEN
    RAISE EXCEPTION 'A convocação foi encerrada porque o primeiro jogo já começou.';
  END IF;

  SELECT entry.status INTO current_status
  FROM public.callup_entries entry
  WHERE entry.callup_id = p_callup_id
    AND entry.player_id = p_player_id
  FOR UPDATE;

  IF current_status IS NULL THEN
    RETURN TRUE;
  END IF;

  IF current_callup.round_id IS NOT NULL THEN
    SELECT team_player.* INTO previous_team_player
    FROM public.team_players team_player
    JOIN public.teams team ON team.id = team_player.team_id
    WHERE team.round_id = current_callup.round_id
      AND team_player.player_id = p_player_id
    FOR UPDATE OF team_player;

    SELECT slot.* INTO replacement_slot
    FROM public.callup_replacement_slots slot
    WHERE slot.callup_id = p_callup_id
      AND slot.round_id = current_callup.round_id
      AND slot.replacement_player_id = p_player_id
    ORDER BY slot.resolved_at DESC NULLS LAST, slot.created_at DESC, slot.id
    FOR UPDATE
    LIMIT 1;

    IF previous_team_player.id IS NOT NULL THEN
      DELETE FROM public.team_players
      WHERE id = previous_team_player.id;

      UPDATE public.teams
      SET captain_player_id = NULL
      WHERE id = previous_team_player.team_id
        AND captain_player_id = p_player_id;

      IF replacement_slot.id IS NOT NULL
        AND replacement_slot.team_id = previous_team_player.team_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.callup_replacement_slots open_slot
          WHERE open_slot.callup_id = p_callup_id
            AND open_slot.team_id = previous_team_player.team_id
            AND open_slot.replacement_player_id IS NULL
            AND open_slot.id <> replacement_slot.id
        )
      THEN
        UPDATE public.callup_replacement_slots
        SET replacement_player_id = NULL,
            resolved_at = NULL
        WHERE id = replacement_slot.id;
      ELSIF NOT EXISTS (
        SELECT 1
        FROM public.callup_replacement_slots open_slot
        WHERE open_slot.callup_id = p_callup_id
          AND open_slot.team_id = previous_team_player.team_id
          AND open_slot.replacement_player_id IS NULL
      ) THEN
        INSERT INTO public.callup_replacement_slots (
          callup_id,
          round_id,
          team_id,
          vacated_player_id,
          goalkeeper_order,
          loan_order
        ) VALUES (
          p_callup_id,
          current_callup.round_id,
          previous_team_player.team_id,
          p_player_id,
          previous_team_player.goalkeeper_order,
          previous_team_player.loan_order
        );
      END IF;
    ELSIF current_status = 'confirmed' THEN
      -- Caso quebrado já existente: a vaga foi resolvida no banco, mas o
      -- jogador nunca entrou no time. Reabrimos essa mesma vaga.
      IF replacement_slot.id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.callup_replacement_slots open_slot
        WHERE open_slot.callup_id = p_callup_id
          AND open_slot.team_id = replacement_slot.team_id
          AND open_slot.replacement_player_id IS NULL
          AND open_slot.id <> replacement_slot.id
      ) THEN
        UPDATE public.callup_replacement_slots
        SET replacement_player_id = NULL,
            resolved_at = NULL
        WHERE id = replacement_slot.id;
      ELSIF replacement_slot.id IS NULL AND NOT EXISTS (
        SELECT 1
        FROM public.callup_replacement_slots open_slot
        WHERE open_slot.callup_id = p_callup_id
          AND open_slot.replacement_player_id IS NULL
      ) THEN
        -- Ultimo recurso para bases antigas sem o vinculo da vaga: usa o
        -- unico time que estiver abaixo do tamanho planejado.
        SELECT team.id INTO inferred_team_id
        FROM public.teams team
        JOIN public.rounds round_item ON round_item.id = team.round_id
        JOIN public.leagues league ON league.id = round_item.league_id
        LEFT JOIN public.team_players team_player ON team_player.team_id = team.id
        WHERE team.round_id = current_callup.round_id
        GROUP BY team.id, team.position, round_item.target_players_per_team, league.players_per_team
        HAVING count(team_player.id) < COALESCE(round_item.target_players_per_team, league.players_per_team)
        ORDER BY count(team_player.id), team.position, team.id
        LIMIT 1;

        IF inferred_team_id IS NOT NULL THEN
          INSERT INTO public.callup_replacement_slots (
            callup_id,
            round_id,
            team_id,
            vacated_player_id
          ) VALUES (
            p_callup_id,
            current_callup.round_id,
            inferred_team_id,
            p_player_id
          );
        END IF;
      END IF;
    END IF;

    DELETE FROM public.round_players
    WHERE round_id = current_callup.round_id
      AND player_id = p_player_id;

    UPDATE public.teams
    SET captain_player_id = NULL
    WHERE round_id = current_callup.round_id
      AND captain_player_id = p_player_id;
  END IF;

  DELETE FROM public.callup_entries
  WHERE callup_id = p_callup_id
    AND player_id = p_player_id;

  PERFORM public.normalize_callup_positions(p_callup_id);

  UPDATE public.callups callup
  SET status = CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.callup_replacement_slots slot
          WHERE slot.callup_id = callup.id
            AND slot.replacement_player_id IS NULL
        ) THEN 'open'
        WHEN callup.round_id IS NOT NULL THEN 'converted'
        ELSE 'open'
      END,
      updated_at = now()
  WHERE callup.id = p_callup_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_callup_player_before_first_match(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_remove_callup_player(
  p_callup_id UUID,
  p_player_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem gerenciar a lista.';
  END IF;

  RETURN public.remove_callup_player_before_first_match(p_callup_id, p_player_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_remove_callup_player(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_callup_player(UUID, UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_callup(p_callup_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_player_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para sair.';
  END IF;

  SELECT profile.player_id INTO current_player_id
  FROM public.account_profiles profile
  WHERE profile.user_id = auth.uid();

  IF current_player_id IS NULL THEN
    RAISE EXCEPTION 'Sua conta não está vinculada a um jogador.';
  END IF;

  RETURN public.remove_callup_player_before_first_match(
    p_callup_id,
    current_player_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.leave_callup(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_callup(UUID) TO authenticated;

-- Repara imediatamente o estado relatado: primeiro as vagas marcadas como
-- resolvidas cujo substituto nao esta em time algum da rodada.
DO $$
DECLARE
  vacancy RECORD;
  orphan_player_id UUID;
BEGIN
  FOR vacancy IN
    SELECT slot.id, slot.callup_id, slot.round_id
    FROM public.callup_replacement_slots slot
    JOIN public.rounds round_item ON round_item.id = slot.round_id
    WHERE slot.replacement_player_id IS NOT NULL
      AND round_item.status <> 'finished'
      AND NOT EXISTS (
        SELECT 1
        FROM public.matches match_item
        WHERE match_item.round_id = slot.round_id
          AND (
            match_item.started_at IS NOT NULL
            OR match_item.status IN ('in_progress', 'live', 'finished')
          )
      )
      AND EXISTS (
        SELECT 1
        FROM public.callup_entries entry
        WHERE entry.callup_id = slot.callup_id
          AND entry.player_id = slot.replacement_player_id
          AND entry.status = 'confirmed'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_players team_player
        JOIN public.teams team ON team.id = team_player.team_id
        WHERE team.round_id = slot.round_id
          AND team_player.player_id = slot.replacement_player_id
      )
    ORDER BY slot.created_at, slot.id
  LOOP
    SELECT slot.replacement_player_id INTO orphan_player_id
    FROM public.callup_replacement_slots slot
    WHERE slot.id = vacancy.id;

    PERFORM public.attach_callup_replacement_player(vacancy.id, orphan_player_id);
  END LOOP;

  -- Tambem cobre uma transacao antiga que tenha deixado a vaga aberta e o
  -- primeiro da fila confirmado, mas sem registrar o replacement_player_id.
  FOR vacancy IN
    SELECT slot.id, slot.callup_id, slot.round_id
    FROM public.callup_replacement_slots slot
    JOIN public.rounds round_item ON round_item.id = slot.round_id
    WHERE slot.replacement_player_id IS NULL
      AND round_item.status <> 'finished'
      AND NOT EXISTS (
        SELECT 1
        FROM public.matches match_item
        WHERE match_item.round_id = slot.round_id
          AND (
            match_item.started_at IS NOT NULL
            OR match_item.status IN ('in_progress', 'live', 'finished')
          )
      )
    ORDER BY slot.created_at, slot.id
  LOOP
    SELECT entry.player_id INTO orphan_player_id
    FROM public.callup_entries entry
    WHERE entry.callup_id = vacancy.callup_id
      AND entry.status = 'confirmed'
      AND NOT EXISTS (
        SELECT 1
        FROM public.team_players team_player
        JOIN public.teams team ON team.id = team_player.team_id
        WHERE team.round_id = vacancy.round_id
          AND team_player.player_id = entry.player_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.callup_replacement_slots resolved_slot
        WHERE resolved_slot.callup_id = vacancy.callup_id
          AND resolved_slot.replacement_player_id = entry.player_id
      )
    ORDER BY entry.position, entry.created_at, entry.id
    LIMIT 1;

    IF orphan_player_id IS NOT NULL THEN
      PERFORM public.attach_callup_replacement_player(vacancy.id, orphan_player_id);
    END IF;
    orphan_player_id := NULL;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
