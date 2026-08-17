-- Gestao de estadios / campos de futebol, horarios e integracao com convocacoes e rodadas.

CREATE TABLE IF NOT EXISTS public.stadiums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  google_maps_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stadiums_league_order_idx
  ON public.stadiums (league_id, display_order, created_at);

-- Migra estadio inicial existente nas ligas caso exista
INSERT INTO public.stadiums (league_id, name, address, google_maps_url, display_order)
SELECT
  id AS league_id,
  stadium_name AS name,
  stadium_name AS address,
  stadium_map_url AS google_maps_url,
  1 AS display_order
FROM public.leagues
WHERE stadium_name IS NOT NULL
  AND stadium_map_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.stadiums WHERE stadiums.league_id = leagues.id
  );

-- Colunas na tabela callups
ALTER TABLE public.callups
  ADD COLUMN IF NOT EXISTS start_time TIME WITHOUT TIME ZONE DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS stadium_id UUID REFERENCES public.stadiums(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stadium_name TEXT,
  ADD COLUMN IF NOT EXISTS stadium_map_url TEXT;

-- Colunas na tabela rounds
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS stadium_id UUID REFERENCES public.stadiums(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stadium_name TEXT,
  ADD COLUMN IF NOT EXISTS stadium_map_url TEXT;

-- Atualizar funcoes de sincronizacao de pre-lista com estadio
CREATE OR REPLACE FUNCTION public.sync_callup_prelist(p_callup_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  linked_round public.rounds%ROWTYPE;
BEGIN
  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
  FOR UPDATE;

  IF NOT FOUND OR current_callup.round_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO linked_round
  FROM public.rounds
  WHERE id = current_callup.round_id
  FOR UPDATE;

  IF NOT FOUND OR linked_round.preparation_stage <> 'prelist' THEN
    RETURN;
  END IF;

  UPDATE public.rounds
  SET date = current_callup.date,
      start_time = COALESCE(current_callup.start_time, linked_round.start_time),
      stadium_id = COALESCE(current_callup.stadium_id, linked_round.stadium_id),
      stadium_name = COALESCE(current_callup.stadium_name, linked_round.stadium_name),
      stadium_map_url = COALESCE(current_callup.stadium_map_url, linked_round.stadium_map_url)
  WHERE id = linked_round.id;

  DELETE FROM public.round_players rp
  WHERE rp.round_id = linked_round.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.callup_entries ce
      WHERE ce.callup_id = current_callup.id
        AND ce.status = 'confirmed'
        AND ce.player_id = rp.player_id
    );

  INSERT INTO public.round_players (round_id, player_id)
  SELECT linked_round.id, ce.player_id
  FROM public.callup_entries ce
  WHERE ce.callup_id = current_callup.id
    AND ce.status = 'confirmed'
  ON CONFLICT (round_id, player_id) DO NOTHING;
END;
$$;

-- Atualizar criacao e salvamento de pre-lista aceitando dados de estadio
CREATE OR REPLACE FUNCTION public.save_round_prelist(
  p_round_id UUID,
  p_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_round_type TEXT,
  p_player_ids UUID[],
  p_callup_id UUID DEFAULT NULL,
  p_stadium_id UUID DEFAULT NULL,
  p_stadium_name TEXT DEFAULT NULL,
  p_stadium_map_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  active_league_id UUID;
  active_season_id UUID;
  saved_round_id UUID;
  next_number INTEGER;
  expected_players INTEGER;
  eligible_players INTEGER;
  current_callup public.callups%ROWTYPE;
  v_stadium_name TEXT := p_stadium_name;
  v_stadium_map_url TEXT := p_stadium_map_url;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem salvar uma pre-lista.';
  END IF;
  IF p_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'Informe data e horario da pelada.';
  END IF;
  IF p_round_type NOT IN ('official', 'friendly') THEN
    RAISE EXCEPTION 'Tipo de rodada invalido.';
  END IF;

  SELECT id INTO active_league_id
  FROM public.leagues WHERE is_active = true ORDER BY created_at LIMIT 1;
  IF active_league_id IS NULL THEN
    SELECT id INTO active_league_id FROM public.leagues ORDER BY created_at LIMIT 1;
  END IF;
  SELECT id INTO active_season_id
  FROM public.seasons
  WHERE league_id = active_league_id AND status = 'active'
  ORDER BY started_at DESC LIMIT 1;
  IF active_league_id IS NULL OR active_season_id IS NULL THEN
    RAISE EXCEPTION 'Liga ou temporada ativa nao encontrada.';
  END IF;

  SELECT count(DISTINCT selected.player_id) INTO expected_players
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) AS selected(player_id);
  IF expected_players <> COALESCE(array_length(p_player_ids, 1), 0) THEN
    RAISE EXCEPTION 'A pre-lista contem jogadores duplicados.';
  END IF;

  SELECT count(*) INTO eligible_players
  FROM public.players
  WHERE id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND is_selectable = true
    AND member_category IN ('player', 'guest');
  IF eligible_players <> expected_players THEN
    RAISE EXCEPTION 'A pre-lista contem uma pessoa que nao pode jogar.';
  END IF;

  -- Se foi passado stadium_id e nao foram informados os nomes/maps, buscar da tabela stadiums
  IF p_stadium_id IS NOT NULL AND (v_stadium_name IS NULL OR v_stadium_map_url IS NULL) THEN
    SELECT name, google_maps_url INTO v_stadium_name, v_stadium_map_url
    FROM public.stadiums WHERE id = p_stadium_id;
  END IF;

  IF p_callup_id IS NOT NULL THEN
    SELECT * INTO current_callup
    FROM public.callups
    WHERE id = p_callup_id AND league_id = active_league_id AND status = 'open'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Convocacao aberta nao encontrada.'; END IF;
    IF current_callup.date <> p_date OR current_callup.round_type <> p_round_type THEN
      RAISE EXCEPTION 'Use a data e o tipo definidos pela convocacao.';
    END IF;

    IF v_stadium_name IS NULL AND current_callup.stadium_name IS NOT NULL THEN
      v_stadium_name := current_callup.stadium_name;
      v_stadium_map_url := current_callup.stadium_map_url;
    END IF;
  END IF;

  IF p_round_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(active_league_id::TEXT || active_season_id::TEXT || p_round_type));
    SELECT COALESCE(max(number), 0) + 1 INTO next_number
    FROM public.rounds
    WHERE league_id = active_league_id
      AND season_id = active_season_id
      AND round_type = p_round_type;

    INSERT INTO public.rounds (
      league_id, season_id, number, date, start_time, status,
      round_type, formation_mode, preparation_stage,
      stadium_id, stadium_name, stadium_map_url
    ) VALUES (
      active_league_id, active_season_id, next_number, p_date, p_start_time,
      'draft', p_round_type, 'manual', 'prelist',
      p_stadium_id, v_stadium_name, v_stadium_map_url
    ) RETURNING id INTO saved_round_id;
  ELSE
    SELECT id INTO saved_round_id
    FROM public.rounds
    WHERE id = p_round_id
      AND league_id = active_league_id
      AND season_id = active_season_id
      AND preparation_stage = 'prelist'
      AND status = 'draft'
    FOR UPDATE;
    IF saved_round_id IS NULL THEN RAISE EXCEPTION 'Pre-lista editavel nao encontrada.'; END IF;

    UPDATE public.rounds
    SET date = p_date,
        start_time = p_start_time,
        round_type = p_round_type,
        stadium_id = COALESCE(p_stadium_id, stadium_id),
        stadium_name = COALESCE(v_stadium_name, stadium_name),
        stadium_map_url = COALESCE(v_stadium_map_url, stadium_map_url)
    WHERE id = saved_round_id;
  END IF;

  IF p_callup_id IS NULL THEN
    DELETE FROM public.round_players WHERE round_id = saved_round_id;
    INSERT INTO public.round_players (round_id, player_id)
    SELECT saved_round_id, selected.player_id
    FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) AS selected(player_id);
  ELSE
    UPDATE public.callups SET round_id = saved_round_id, updated_at = now()
    WHERE id = p_callup_id;
    PERFORM public.sync_callup_prelist(p_callup_id);
  END IF;

  RETURN saved_round_id;
END;
$$;

-- RLS para stadiums
ALTER TABLE public.stadiums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read stadiums" ON public.stadiums;
CREATE POLICY "Public read stadiums" ON public.stadiums FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage stadiums" ON public.stadiums;
CREATE POLICY "Admins manage stadiums" ON public.stadiums FOR ALL TO authenticated
USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

GRANT SELECT ON public.stadiums TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stadiums TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_round_prelist(UUID, DATE, TIME WITHOUT TIME ZONE, TEXT, UUID[], UUID, UUID, TEXT, TEXT) TO authenticated;
