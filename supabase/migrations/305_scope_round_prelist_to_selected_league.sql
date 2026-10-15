-- A criacao legada de pre-lista escolhia a primeira liga ativa do banco.
-- Exigir a pelada selecionada impede que uma rodada nova seja gravada em outra
-- pelada e aplica a autorizacao por membership, nao pelo papel global antigo.
BEGIN;

DROP FUNCTION IF EXISTS public.save_round_prelist(
  uuid,
  date,
  time without time zone,
  text,
  uuid[],
  uuid,
  uuid,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.save_round_prelist(
  p_league_id uuid,
  p_round_id uuid,
  p_date date,
  p_start_time time without time zone,
  p_round_type text,
  p_player_ids uuid[],
  p_callup_id uuid DEFAULT NULL,
  p_stadium_id uuid DEFAULT NULL,
  p_stadium_name text DEFAULT NULL,
  p_stadium_map_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  target_season_id uuid;
  saved_round_id uuid;
  next_round_number integer;
  expected_players integer;
  eligible_players integer;
  target_callup public.callups%ROWTYPE;
  target_stadium_name text := p_stadium_name;
  target_stadium_map_url text := p_stadium_map_url;
BEGIN
  IF p_league_id IS NULL OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente ADM da pelada selecionada pode salvar uma pre-lista.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.leagues league
    WHERE league.id = p_league_id AND league.is_active
  ) THEN
    RAISE EXCEPTION 'Pelada selecionada nao encontrada ou inativa.';
  END IF;
  IF p_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'Informe data e horario da pelada.';
  END IF;
  IF p_round_type NOT IN ('official', 'friendly') THEN
    RAISE EXCEPTION 'Tipo de rodada invalido.';
  END IF;

  SELECT season.id
  INTO target_season_id
  FROM public.seasons season
  WHERE season.league_id = p_league_id
    AND season.status = 'active'
  ORDER BY season.started_at DESC, season.created_at DESC
  LIMIT 1;
  IF target_season_id IS NULL THEN
    RAISE EXCEPTION 'Temporada ativa da pelada selecionada nao encontrada.';
  END IF;

  SELECT count(DISTINCT selected.player_id)
  INTO expected_players
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::uuid[])) AS selected(player_id);
  IF expected_players <> COALESCE(array_length(p_player_ids, 1), 0) THEN
    RAISE EXCEPTION 'A pre-lista contem jogadores duplicados.';
  END IF;

  SELECT count(*)
  INTO eligible_players
  FROM public.league_members member
  JOIN public.players player ON player.id = member.player_id
  WHERE member.league_id = p_league_id
    AND member.is_active
    AND player.id = ANY(COALESCE(p_player_ids, ARRAY[]::uuid[]))
    AND player.is_selectable
    AND player.member_category IN ('player', 'guest');
  IF eligible_players <> expected_players THEN
    RAISE EXCEPTION 'A pre-lista contem jogador fora da pelada selecionada.';
  END IF;

  IF p_stadium_id IS NOT NULL THEN
    SELECT stadium.name, stadium.google_maps_url
    INTO target_stadium_name, target_stadium_map_url
    FROM public.stadiums stadium
    WHERE stadium.id = p_stadium_id
      AND stadium.league_id = p_league_id
      AND stadium.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Estadio fora da pelada selecionada.';
    END IF;
  END IF;

  IF p_callup_id IS NOT NULL THEN
    SELECT callup.*
    INTO target_callup
    FROM public.callups callup
    WHERE callup.id = p_callup_id
      AND callup.league_id = p_league_id
      AND callup.status = 'open'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Convocacao aberta da pelada selecionada nao encontrada.';
    END IF;
    IF target_callup.date <> p_date OR target_callup.round_type <> p_round_type THEN
      RAISE EXCEPTION 'Use a data e o tipo definidos pela convocacao.';
    END IF;
    IF p_stadium_id IS NULL AND target_stadium_name IS NULL
      AND target_callup.stadium_name IS NOT NULL THEN
      target_stadium_name := target_callup.stadium_name;
      target_stadium_map_url := target_callup.stadium_map_url;
    END IF;
  END IF;

  IF p_round_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtext(p_league_id::text || target_season_id::text || p_round_type)
    );
    SELECT COALESCE(max(round_item.number), 0) + 1
    INTO next_round_number
    FROM public.rounds round_item
    WHERE round_item.league_id = p_league_id
      AND round_item.season_id = target_season_id
      AND round_item.round_type = p_round_type;

    INSERT INTO public.rounds (
      league_id,
      season_id,
      number,
      date,
      start_time,
      status,
      round_type,
      formation_mode,
      preparation_stage,
      stadium_id,
      stadium_name,
      stadium_map_url
    )
    VALUES (
      p_league_id,
      target_season_id,
      next_round_number,
      p_date,
      p_start_time,
      'draft',
      p_round_type,
      'manual',
      'prelist',
      p_stadium_id,
      target_stadium_name,
      target_stadium_map_url
    )
    RETURNING id INTO saved_round_id;
  ELSE
    SELECT round_item.id
    INTO saved_round_id
    FROM public.rounds round_item
    WHERE round_item.id = p_round_id
      AND round_item.league_id = p_league_id
      AND round_item.season_id = target_season_id
      AND round_item.preparation_stage = 'prelist'
      AND round_item.status = 'draft'
    FOR UPDATE;
    IF saved_round_id IS NULL THEN
      RAISE EXCEPTION 'Pre-lista editavel da pelada selecionada nao encontrada.';
    END IF;

    UPDATE public.rounds round_item
    SET date = p_date,
        start_time = p_start_time,
        round_type = p_round_type,
        stadium_id = COALESCE(p_stadium_id, round_item.stadium_id),
        stadium_name = COALESCE(target_stadium_name, round_item.stadium_name),
        stadium_map_url = COALESCE(target_stadium_map_url, round_item.stadium_map_url)
    WHERE round_item.id = saved_round_id;
  END IF;

  IF p_callup_id IS NULL THEN
    DELETE FROM public.round_players entry
    WHERE entry.round_id = saved_round_id;

    INSERT INTO public.round_players (round_id, player_id)
    SELECT saved_round_id, selected.player_id
    FROM unnest(COALESCE(p_player_ids, ARRAY[]::uuid[])) AS selected(player_id);
  ELSE
    UPDATE public.callups callup
    SET round_id = saved_round_id,
        updated_at = now()
    WHERE callup.id = p_callup_id
      AND callup.league_id = p_league_id;
    PERFORM public.sync_callup_prelist(p_callup_id);
  END IF;

  RETURN saved_round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_round_prelist(
  uuid,
  uuid,
  date,
  time without time zone,
  text,
  uuid[],
  uuid,
  uuid,
  text,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_round_prelist(
  uuid,
  uuid,
  date,
  time without time zone,
  text,
  uuid[],
  uuid,
  uuid,
  text,
  text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
