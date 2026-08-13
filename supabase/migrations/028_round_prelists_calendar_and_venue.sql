-- Pre-listas persistentes, horario da pelada, estadio e integracao com calendarios.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS stadium_name TEXT,
  ADD COLUMN IF NOT EXISTS stadium_map_url TEXT,
  ADD COLUMN IF NOT EXISTS event_duration_minutes INTEGER NOT NULL DEFAULT 120;

ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_event_duration_minutes_check;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_event_duration_minutes_check
  CHECK (event_duration_minutes BETWEEN 30 AND 720);

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS start_time TIME WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS preparation_stage TEXT NOT NULL DEFAULT 'teams_ready';

ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS rounds_preparation_stage_check;
ALTER TABLE public.rounds ADD CONSTRAINT rounds_preparation_stage_check
  CHECK (preparation_stage IN ('prelist', 'teams_ready'));

CREATE INDEX IF NOT EXISTS rounds_preparation_stage_idx
  ON public.rounds (league_id, preparation_stage, date);
CREATE UNIQUE INDEX IF NOT EXISTS rounds_one_open_prelist_per_league_idx
  ON public.rounds (league_id)
  WHERE preparation_stage = 'prelist' AND status = 'draft';

DROP POLICY IF EXISTS "Public read" ON public.round_players;
CREATE POLICY "Public read ready round players"
ON public.round_players FOR SELECT TO anon, authenticated
USING (
  public.is_app_admin()
  OR EXISTS (
    SELECT 1 FROM public.rounds
    WHERE rounds.id = round_players.round_id
      AND rounds.preparation_stage = 'teams_ready'
  )
);

COMMENT ON COLUMN public.rounds.preparation_stage IS
  'prelist enquanto os participantes ainda estao sendo definidos; teams_ready depois da formacao dos times.';

-- Convocacoes bloqueadas pelo fluxo antigo, mas ainda sem rodada, voltam a receber
-- alteracoes ate que a nova pre-lista seja efetivamente convertida em times.
UPDATE public.callups
SET status = 'open', updated_at = now()
WHERE status = 'locked' AND round_id IS NULL;

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
  SET date = current_callup.date
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

CREATE OR REPLACE FUNCTION public.sync_linked_callup_prelist_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_callup_prelist(COALESCE(NEW.callup_id, OLD.callup_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_linked_callup_prelist_entries ON public.callup_entries;
CREATE TRIGGER sync_linked_callup_prelist_entries
AFTER INSERT OR UPDATE OR DELETE ON public.callup_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_linked_callup_prelist_trigger();

CREATE OR REPLACE FUNCTION public.link_callup_prelist(p_callup_id UUID, p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_round public.rounds%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem vincular uma pre-lista.';
  END IF;

  SELECT * INTO current_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR current_round.preparation_stage <> 'prelist' THEN
    RAISE EXCEPTION 'Pre-lista nao encontrada.';
  END IF;

  UPDATE public.callups
  SET round_id = p_round_id, updated_at = now()
  WHERE id = p_callup_id
    AND league_id = current_round.league_id
    AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convocacao aberta nao encontrada.';
  END IF;

  PERFORM public.sync_callup_prelist(p_callup_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_round_prelist(
  p_round_id UUID,
  p_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_round_type TEXT,
  p_player_ids UUID[],
  p_callup_id UUID DEFAULT NULL
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

  IF p_callup_id IS NOT NULL THEN
    SELECT * INTO current_callup
    FROM public.callups
    WHERE id = p_callup_id AND league_id = active_league_id AND status = 'open'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Convocacao aberta nao encontrada.'; END IF;
    IF current_callup.date <> p_date OR current_callup.round_type <> p_round_type THEN
      RAISE EXCEPTION 'Use a data e o tipo definidos pela convocacao.';
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
      round_type, formation_mode, preparation_stage
    ) VALUES (
      active_league_id, active_season_id, next_number, p_date, p_start_time,
      'draft', p_round_type, 'manual', 'prelist'
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
    SET date = p_date, start_time = p_start_time, round_type = p_round_type
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

CREATE OR REPLACE FUNCTION public.admin_set_callup_confirmed(
  p_callup_id UUID,
  p_player_ids UUID[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  desired_count INTEGER;
  eligible_count INTEGER;
  remaining_waitlist UUID[];
  promote_count INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar a convocacao.';
  END IF;

  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id AND status = 'open'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convocacao aberta nao encontrada.'; END IF;

  SELECT count(DISTINCT selected.player_id) INTO desired_count
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) AS selected(player_id);
  IF desired_count <> COALESCE(array_length(p_player_ids, 1), 0) OR desired_count > current_callup.capacity THEN
    RAISE EXCEPTION 'Lista de confirmados invalida.';
  END IF;

  SELECT count(*) INTO eligible_count
  FROM public.players
  WHERE id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND is_selectable = true
    AND member_category IN ('player', 'guest');
  IF eligible_count <> desired_count THEN RAISE EXCEPTION 'A lista contem uma pessoa indisponivel.'; END IF;

  SELECT COALESCE(array_agg(player_id ORDER BY position), ARRAY[]::UUID[])
  INTO remaining_waitlist
  FROM public.callup_entries
  WHERE callup_id = p_callup_id
    AND status = 'waitlist'
    AND NOT (player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])));

  DELETE FROM public.callup_entries
  WHERE callup_id = p_callup_id
    AND status = 'confirmed'
    AND NOT (player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])));

  UPDATE public.callup_entries SET position = position + 1000 WHERE callup_id = p_callup_id;

  INSERT INTO public.callup_entries (callup_id, player_id, status, position, joined_by)
  SELECT p_callup_id, selected.player_id, 'confirmed', selected.ordinality::INTEGER, auth.uid()
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) WITH ORDINALITY AS selected(player_id, ordinality)
  ON CONFLICT (callup_id, player_id) DO UPDATE
  SET status = 'confirmed', position = EXCLUDED.position;

  promote_count := LEAST(current_callup.capacity - desired_count, COALESCE(array_length(remaining_waitlist, 1), 0));

  UPDATE public.callup_entries entry
  SET status = 'confirmed', position = desired_count + waiting.ordinality
  FROM unnest(remaining_waitlist[1:promote_count]) WITH ORDINALITY AS waiting(player_id, ordinality)
  WHERE entry.callup_id = p_callup_id AND entry.player_id = waiting.player_id;

  UPDATE public.callup_entries entry
  SET status = 'waitlist', position = waiting.ordinality
  FROM unnest(remaining_waitlist[(promote_count + 1):]) WITH ORDINALITY AS waiting(player_id, ordinality)
  WHERE entry.callup_id = p_callup_id AND entry.player_id = waiting.player_id;

  UPDATE public.callups SET updated_at = now() WHERE id = p_callup_id;
  PERFORM public.sync_callup_prelist(p_callup_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_round_cascade(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_round public.rounds%ROWTYPE;
  linked_callup_id UUID;
  linked_callup_status TEXT;
  affected_player_ids UUID[];
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem excluir rodadas.';
  END IF;

  SELECT * INTO current_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada nao encontrada.'; END IF;

  SELECT id, status INTO linked_callup_id, linked_callup_status FROM public.callups WHERE round_id = p_round_id LIMIT 1 FOR UPDATE;
  SELECT array_agg(player_id) INTO affected_player_ids
  FROM public.round_players WHERE round_id = p_round_id;

  IF linked_callup_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.callups
    WHERE league_id = current_round.league_id
      AND id <> linked_callup_id
      AND status IN ('open', 'locked')
  ) THEN
    RAISE EXCEPTION 'Encerre a convocacao ativa antes de excluir esta rodada.';
  END IF;

  DELETE FROM public.rounds WHERE id = p_round_id;

  IF linked_callup_id IS NOT NULL THEN
    UPDATE public.callups
    SET status = CASE
          WHEN linked_callup_status = 'closed' THEN 'closed'
          WHEN current_round.preparation_stage = 'prelist' THEN 'open'
          ELSE 'locked'
        END,
        round_id = NULL,
        updated_at = now()
    WHERE id = linked_callup_id;
  END IF;

  UPDATE public.players player
  SET is_selectable = true
  WHERE player.member_category = 'guest'
    AND player.id = ANY(COALESCE(affected_player_ids, ARRAY[]::UUID[]))
    AND NOT EXISTS (
      SELECT 1
      FROM public.round_players rp
      JOIN public.rounds round_item ON round_item.id = rp.round_id
      WHERE rp.player_id = player.id AND round_item.status = 'finished'
    );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_callup_prelist(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_round_prelist(UUID, DATE, TIME WITHOUT TIME ZONE, TEXT, UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_callup_confirmed(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_round_cascade(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_callup_prelist(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_callup_prelist(UUID) TO authenticated;
