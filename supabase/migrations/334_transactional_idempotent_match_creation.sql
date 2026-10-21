-- A abertura da partida e de toda a sua escalação precisa ser um único commit.
-- A chave de idempotência permite repetir a chamada quando a resposta se perde,
-- sem criar uma segunda partida ou uma escalação parcial.
BEGIN;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS creation_idempotency_key text,
  ADD COLUMN IF NOT EXISTS creation_request_hash text,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS matches_creation_idempotency_unique
  ON public.matches(created_by_user_id, creation_idempotency_key)
  WHERE created_by_user_id IS NOT NULL AND creation_idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.matches.creation_idempotency_key IS
  'Chave opaca gerada pelo cliente para repetir com segurança a abertura da partida.';
COMMENT ON COLUMN public.matches.creation_request_hash IS
  'Assinatura canônica do comando; impede reutilizar a mesma chave com outro conteúdo.';

CREATE OR REPLACE FUNCTION public.create_live_match(
  p_round_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_goalkeeper_a_id uuid,
  p_goalkeeper_b_id uuid,
  p_goalkeeper_a_rotation_order integer,
  p_goalkeeper_b_rotation_order integer,
  p_lineup jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_round public.rounds%ROWTYPE;
  selected_league public.leagues%ROWTYPE;
  team_a public.teams%ROWTYPE;
  team_b public.teams%ROWTYPE;
  existing_match public.matches%ROWTYPE;
  created_match public.matches%ROWTYPE;
  lineup_item RECORD;
  current_user_id uuid := auth.uid();
  normalized_key text := btrim(COALESCE(p_idempotency_key, ''));
  request_hash text;
  target_players_per_team integer;
  next_match_order integer;
  duration_seconds integer;
  forced_goalkeeper_a_id uuid;
  forced_goalkeeper_b_id uuid;
  kickoff_at timestamptz := clock_timestamp();
  is_idempotent boolean := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para iniciar a partida.';
  END IF;
  IF length(normalized_key) < 8 OR length(normalized_key) > 160 THEN
    RAISE EXCEPTION 'Chave de idempotência inválida.';
  END IF;
  IF p_team_a_id IS NULL OR p_team_b_id IS NULL OR p_team_a_id = p_team_b_id THEN
    RAISE EXCEPTION 'Selecione dois times diferentes.';
  END IF;
  IF p_goalkeeper_a_id IS NULL OR p_goalkeeper_b_id IS NULL
     OR p_goalkeeper_a_id = p_goalkeeper_b_id THEN
    RAISE EXCEPTION 'Escolha um goleiro diferente para cada time.';
  END IF;
  IF jsonb_typeof(p_lineup) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lineup) < 2
     OR jsonb_array_length(p_lineup) > 30 THEN
    RAISE EXCEPTION 'Escalação inválida.';
  END IF;
  IF p_goalkeeper_a_rotation_order IS NOT NULL AND p_goalkeeper_a_rotation_order < 1 THEN
    RAISE EXCEPTION 'Ordem do goleiro do time A inválida.';
  END IF;
  IF p_goalkeeper_b_rotation_order IS NOT NULL AND p_goalkeeper_b_rotation_order < 1 THEN
    RAISE EXCEPTION 'Ordem do goleiro do time B inválida.';
  END IF;

  -- Serializa apenas repetições da mesma intenção. A rodada é bloqueada mais
  -- abaixo para também impedir duas aberturas concorrentes com times/jogadores
  -- sobrepostos.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || ':' || normalized_key, 334)
  );

  request_hash := md5(jsonb_build_object(
    'round_id', p_round_id,
    'team_a_id', p_team_a_id,
    'team_b_id', p_team_b_id,
    'goalkeeper_a_id', p_goalkeeper_a_id,
    'goalkeeper_b_id', p_goalkeeper_b_id,
    'goalkeeper_a_rotation_order', p_goalkeeper_a_rotation_order,
    'goalkeeper_b_rotation_order', p_goalkeeper_b_rotation_order,
    'lineup', p_lineup
  )::text);

  SELECT match_item.* INTO existing_match
  FROM public.matches match_item
  WHERE match_item.created_by_user_id = current_user_id
    AND match_item.creation_idempotency_key = normalized_key;

  IF FOUND THEN
    IF existing_match.creation_request_hash IS DISTINCT FROM request_hash THEN
      RAISE EXCEPTION 'Esta chave de idempotência já foi usada com outra partida.';
    END IF;
    SELECT * INTO selected_round FROM public.rounds WHERE id = existing_match.round_id;
    IF selected_round.id IS NULL OR NOT public.is_league_admin(selected_round.league_id) THEN
      RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
    END IF;
    created_match := existing_match;
    is_idempotent := true;
  ELSE
    SELECT * INTO selected_round
    FROM public.rounds
    WHERE id = p_round_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rodada não encontrada.'; END IF;
    IF NOT public.is_league_admin(selected_round.league_id) THEN
      RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
    END IF;
    IF selected_round.status = 'finished' THEN
      RAISE EXCEPTION 'A rodada já foi encerrada.';
    END IF;

    SELECT * INTO selected_league FROM public.leagues WHERE id = selected_round.league_id;
    SELECT * INTO team_a FROM public.teams
      WHERE id = p_team_a_id AND round_id = p_round_id;
    SELECT * INTO team_b FROM public.teams
      WHERE id = p_team_b_id AND round_id = p_round_id;
    IF team_a.id IS NULL OR team_b.id IS NULL THEN
      RAISE EXCEPTION 'Os times precisam pertencer a esta rodada.';
    END IF;

    IF selected_round.arrival_order_enabled = true
       AND NOT EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id) THEN
      IF (SELECT count(*) FROM public.teams first_team
          WHERE first_team.round_id = p_round_id AND first_team.position <= 2) <> 2
         OR (SELECT count(*) FROM public.teams first_team
             WHERE first_team.round_id = p_round_id AND first_team.position <= 2
               AND first_team.id IN (p_team_a_id, p_team_b_id)) <> 2 THEN
        RAISE EXCEPTION 'A primeira partida precisa ser disputada pelos dois times titulares.';
      END IF;
    END IF;

    target_players_per_team := GREATEST(
      1,
      COALESCE(selected_round.target_players_per_team, selected_league.players_per_team, 6)
    );

    IF (
      SELECT count(*) FROM jsonb_to_recordset(p_lineup) AS item(
        player_id uuid, team_id uuid, original_team_id uuid,
        participation_kind text, absent_player_id uuid
      )
    ) IS DISTINCT FROM (
      SELECT count(DISTINCT item.player_id) FROM jsonb_to_recordset(p_lineup) AS item(
        player_id uuid, team_id uuid, original_team_id uuid,
        participation_kind text, absent_player_id uuid
      )
    ) THEN
      RAISE EXCEPTION 'Um jogador não pode ocupar duas vagas na mesma partida.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_lineup) AS item(
        player_id uuid, team_id uuid, original_team_id uuid,
        participation_kind text, absent_player_id uuid
      )
      WHERE item.player_id IS NULL OR item.original_team_id IS NULL
        OR item.team_id NOT IN (p_team_a_id, p_team_b_id)
        OR item.participation_kind NOT IN ('roster', 'replacement', 'structural')
    ) THEN
      RAISE EXCEPTION 'A escalação contém uma vaga inválida.';
    END IF;

    IF EXISTS (
      SELECT item.team_id
      FROM jsonb_to_recordset(p_lineup) AS item(
        player_id uuid, team_id uuid, original_team_id uuid,
        participation_kind text, absent_player_id uuid
      )
      GROUP BY item.team_id
      HAVING count(*) <> target_players_per_team
    ) OR EXISTS (
      SELECT selected_team.team_id
      FROM (VALUES (p_team_a_id), (p_team_b_id)) AS selected_team(team_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_lineup) AS item(
          player_id uuid, team_id uuid, original_team_id uuid,
          participation_kind text, absent_player_id uuid
        ) WHERE item.team_id = selected_team.team_id
      )
    ) THEN
      RAISE EXCEPTION 'A quantidade de jogadores por time é inválida.';
    END IF;

    -- Todo jogador informado precisa estar na rodada, no time de origem e
    -- disponível. Rodadas manuais não exigem confirmação de presença.
    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_lineup) AS item(
        player_id uuid, team_id uuid, original_team_id uuid,
        participation_kind text, absent_player_id uuid
      )
      LEFT JOIN public.round_players round_player
        ON round_player.round_id = p_round_id AND round_player.player_id = item.player_id
      WHERE round_player.player_id IS NULL
        OR round_player.availability_status <> 'available'
        OR (selected_round.formation_mode <> 'manual' AND round_player.attendance_status <> 'present')
        OR NOT EXISTS (
          SELECT 1 FROM public.team_players source_player
          JOIN public.teams source_team ON source_team.id = source_player.team_id
          WHERE source_player.team_id = item.original_team_id
            AND source_player.player_id = item.player_id
            AND source_team.round_id = p_round_id
        )
        OR (item.participation_kind = 'roster' AND item.original_team_id <> item.team_id)
        OR (item.participation_kind <> 'roster' AND item.original_team_id IN (p_team_a_id, p_team_b_id))
    ) THEN
      RAISE EXCEPTION 'A escalação contém jogador indisponível ou fora dos times desta rodada.';
    END IF;

    -- Não é permitido omitir um titular disponível do time selecionado.
    IF EXISTS (
      SELECT 1 FROM public.team_players source_player
      JOIN public.teams source_team ON source_team.id = source_player.team_id
      JOIN public.round_players round_player
        ON round_player.round_id = p_round_id AND round_player.player_id = source_player.player_id
      WHERE source_team.id IN (p_team_a_id, p_team_b_id)
        AND round_player.availability_status = 'available'
        AND (selected_round.formation_mode = 'manual' OR round_player.attendance_status = 'present')
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(p_lineup) AS item(
            player_id uuid, team_id uuid, original_team_id uuid,
            participation_kind text, absent_player_id uuid
          )
          WHERE item.player_id = source_player.player_id
            AND item.team_id = source_team.id
            AND item.participation_kind = 'roster'
        )
    ) THEN
      RAISE EXCEPTION 'A escalação omitiu um jogador disponível do time.';
    END IF;

    -- Cada substituto de ausência corresponde a uma vaga realmente
    -- indisponível, sem reutilizar a mesma vaga duas vezes.
    IF EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_lineup) AS item(
        player_id uuid, team_id uuid, original_team_id uuid,
        participation_kind text, absent_player_id uuid
      )
      WHERE item.participation_kind = 'replacement'
        AND (
          item.absent_player_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.team_players absent_team_player
            JOIN public.round_players absent_round_player
              ON absent_round_player.round_id = p_round_id
             AND absent_round_player.player_id = absent_team_player.player_id
            WHERE absent_team_player.team_id = item.team_id
              AND absent_team_player.player_id = item.absent_player_id
              AND (
                absent_round_player.availability_status = 'injured'
                OR (selected_round.formation_mode <> 'manual'
                    AND absent_round_player.attendance_status <> 'present')
              )
          )
        )
    ) OR EXISTS (
      SELECT item.absent_player_id
      FROM jsonb_to_recordset(p_lineup) AS item(
        player_id uuid, team_id uuid, original_team_id uuid,
        participation_kind text, absent_player_id uuid
      )
      WHERE item.participation_kind = 'replacement'
      GROUP BY item.absent_player_id
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'O empréstimo de ausência não corresponde a uma vaga desfalcada.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.team_players absent_team_player
      JOIN public.round_players absent_round_player
        ON absent_round_player.round_id = p_round_id
       AND absent_round_player.player_id = absent_team_player.player_id
      WHERE absent_team_player.team_id IN (p_team_a_id, p_team_b_id)
        AND (
          absent_round_player.availability_status = 'injured'
          OR (selected_round.formation_mode <> 'manual'
              AND absent_round_player.attendance_status <> 'present')
        )
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(p_lineup) AS item(
            player_id uuid, team_id uuid, original_team_id uuid,
            participation_kind text, absent_player_id uuid
          )
          WHERE item.participation_kind = 'replacement'
            AND item.team_id = absent_team_player.team_id
            AND item.absent_player_id = absent_team_player.player_id
        )
    ) THEN
      RAISE EXCEPTION 'Escolha um substituto para cada vaga desfalcada.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.matches live_match
      WHERE live_match.round_id = p_round_id AND live_match.status = 'live'
        AND (
          live_match.team_a_id IN (p_team_a_id, p_team_b_id)
          OR live_match.team_b_id IN (p_team_a_id, p_team_b_id)
        )
    ) THEN
      RAISE EXCEPTION 'Um dos times selecionados já está em outra partida ao vivo.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.match_players active_player
      JOIN public.matches live_match ON live_match.id = active_player.match_id
      JOIN jsonb_to_recordset(p_lineup) AS item(
        player_id uuid, team_id uuid, original_team_id uuid,
        participation_kind text, absent_player_id uuid
      ) ON item.player_id = active_player.player_id
      WHERE active_player.is_active AND live_match.status = 'live'
    ) THEN
      RAISE EXCEPTION 'Um dos jogadores escalados já está em outra partida ao vivo.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_lineup) AS item(
        player_id uuid, team_id uuid, original_team_id uuid,
        participation_kind text, absent_player_id uuid
      ) WHERE item.player_id = p_goalkeeper_a_id AND item.team_id = p_team_a_id
    ) OR NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_lineup) AS item(
        player_id uuid, team_id uuid, original_team_id uuid,
        participation_kind text, absent_player_id uuid
      ) WHERE item.player_id = p_goalkeeper_b_id AND item.team_id = p_team_b_id
    ) THEN
      RAISE EXCEPTION 'O goleiro precisa estar escalado pelo time nesta partida.';
    END IF;
    IF team_a.fixed_goalkeeper_player_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM jsonb_to_recordset(p_lineup) AS item(player_id uuid) WHERE item.player_id = team_a.fixed_goalkeeper_player_id)
       AND p_goalkeeper_a_id <> team_a.fixed_goalkeeper_player_id THEN
      RAISE EXCEPTION 'O goleiro fixo do time A está disponível e deve iniciar no gol.';
    END IF;
    IF team_b.fixed_goalkeeper_player_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM jsonb_to_recordset(p_lineup) AS item(player_id uuid) WHERE item.player_id = team_b.fixed_goalkeeper_player_id)
       AND p_goalkeeper_b_id <> team_b.fixed_goalkeeper_player_id THEN
      RAISE EXCEPTION 'O goleiro fixo do time B está disponível e deve iniciar no gol.';
    END IF;

    SELECT (entry.value->>'player_id')::uuid INTO forced_goalkeeper_a_id
    FROM jsonb_array_elements(p_lineup) WITH ORDINALITY AS entry(value, position)
    WHERE entry.value->>'participation_kind' = 'replacement'
      AND (entry.value->>'team_id')::uuid = p_team_a_id
    ORDER BY entry.position LIMIT 1;
    SELECT (entry.value->>'player_id')::uuid INTO forced_goalkeeper_b_id
    FROM jsonb_array_elements(p_lineup) WITH ORDINALITY AS entry(value, position)
    WHERE entry.value->>'participation_kind' = 'replacement'
      AND (entry.value->>'team_id')::uuid = p_team_b_id
    ORDER BY entry.position LIMIT 1;
    IF forced_goalkeeper_a_id IS NOT NULL AND p_goalkeeper_a_id <> forced_goalkeeper_a_id THEN
      RAISE EXCEPTION 'O substituto do jogador ausente precisa iniciar no gol pelo time A.';
    END IF;
    IF forced_goalkeeper_b_id IS NOT NULL AND p_goalkeeper_b_id <> forced_goalkeeper_b_id THEN
      RAISE EXCEPTION 'O substituto do jogador ausente precisa iniciar no gol pelo time B.';
    END IF;

    SELECT COALESCE(max(match_order), 0) + 1 INTO next_match_order
    FROM public.matches WHERE round_id = p_round_id;
    duration_seconds := GREATEST(60, COALESCE(selected_league.match_duration, 7) * 60);

    INSERT INTO public.matches (
      round_id, team_a_id, team_b_id, match_order, status, score_a, score_b,
      started_at, timer_started_at, timer_accumulated_seconds, duration_seconds,
      creation_idempotency_key, creation_request_hash, created_by_user_id
    ) VALUES (
      p_round_id, p_team_a_id, p_team_b_id, next_match_order, 'live', 0, 0,
      kickoff_at, kickoff_at, 0, duration_seconds,
      normalized_key, request_hash, current_user_id
    ) RETURNING * INTO created_match;

    INSERT INTO public.match_players (
      match_id, player_id, team_id, original_team_id,
      is_starter, is_active, result_eligible, scoring_eligible,
      entered_elapsed_seconds
    )
    SELECT
      created_match.id, item.player_id, item.team_id, item.original_team_id,
      true, true,
      item.participation_kind <> 'replacement',
      item.participation_kind <> 'replacement' OR selected_round.number < 7,
      0
    FROM jsonb_to_recordset(p_lineup) AS item(
      player_id uuid, team_id uuid, original_team_id uuid,
      participation_kind text, absent_player_id uuid
    );

    INSERT INTO public.match_goalkeepers(match_id, team_id, player_id, rotation_order)
    VALUES
      (created_match.id, p_team_a_id, p_goalkeeper_a_id, p_goalkeeper_a_rotation_order),
      (created_match.id, p_team_b_id, p_goalkeeper_b_id, p_goalkeeper_b_rotation_order);

    INSERT INTO public.match_goalkeeper_stints(
      match_id, team_id, player_id, entered_elapsed_seconds
    ) VALUES
      (created_match.id, p_team_a_id, p_goalkeeper_a_id, 0),
      (created_match.id, p_team_b_id, p_goalkeeper_b_id, 0);

    IF selected_round.status = 'draft' THEN
      UPDATE public.rounds SET status = 'active' WHERE id = p_round_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'match_id', created_match.id,
    'round_id', created_match.round_id,
    'league_id', selected_round.league_id,
    'team_a_id', created_match.team_a_id,
    'team_b_id', created_match.team_b_id,
    'status', created_match.status,
    'match_order', created_match.match_order,
    'duration_seconds', created_match.duration_seconds,
    'kickoff_at', created_match.started_at,
    'idempotent', is_idempotent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_live_match(
  uuid, uuid, uuid, uuid, uuid, integer, integer, jsonb, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_live_match(
  uuid, uuid, uuid, uuid, uuid, integer, integer, jsonb, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
