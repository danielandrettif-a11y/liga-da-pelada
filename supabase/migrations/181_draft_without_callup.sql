-- Permite usar o Draft como um modo de sorteio normal, inclusive sem convocação.

ALTER TABLE public.team_drafts
  ALTER COLUMN callup_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.can_access_team_draft(p_draft_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_drafts draft
    WHERE draft.id = p_draft_id
      AND (
        public.is_app_admin()
        OR (
          draft.callup_id IS NOT NULL
          AND public.can_access_collective(draft.callup_id)
        )
        OR (
          draft.callup_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.round_players participant
            JOIN public.account_profiles account ON account.player_id = participant.player_id
            WHERE participant.round_id = draft.round_id
              AND account.user_id = auth.uid()
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS team_drafts_read ON public.team_drafts;
DROP POLICY IF EXISTS team_draft_captains_read ON public.team_draft_captains;
DROP POLICY IF EXISTS team_draft_picks_read ON public.team_draft_picks;
DROP POLICY IF EXISTS team_draft_players_read ON public.team_draft_players;

CREATE POLICY team_drafts_read ON public.team_drafts FOR SELECT TO authenticated
  USING (public.can_access_team_draft(id));
CREATE POLICY team_draft_captains_read ON public.team_draft_captains FOR SELECT TO authenticated
  USING (public.can_access_team_draft(draft_id));
CREATE POLICY team_draft_picks_read ON public.team_draft_picks FOR SELECT TO authenticated
  USING (public.can_access_team_draft(draft_id));
CREATE POLICY team_draft_players_read ON public.team_draft_players FOR SELECT TO authenticated
  USING (public.can_access_team_draft(draft_id));

CREATE OR REPLACE FUNCTION public.create_team_draft(
  p_callup_id UUID,
  p_round_id UUID,
  p_captain_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_id UUID;
  selected_round public.rounds%ROWTYPE;
  captain_id UUID;
  captain_index INTEGER := 0;
  captain_stats RECORD;
  source_player_ids UUID[];
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem iniciar o Draft.'; END IF;
  IF cardinality(p_captain_ids) <> 3 OR (SELECT count(DISTINCT value) FROM unnest(p_captain_ids) value) <> 3 THEN
    RAISE EXCEPTION 'Escolha três capitães diferentes.';
  END IF;

  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR selected_round.status <> 'draft' OR selected_round.preparation_stage <> 'prelist' THEN
    RAISE EXCEPTION 'A pré-rodada precisa estar pronta e ainda sem times.';
  END IF;

  IF p_callup_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.callups callup
      WHERE callup.id = p_callup_id AND callup.round_id = p_round_id AND callup.status IN ('open', 'locked')
    ) THEN RAISE EXCEPTION 'Convocação vinculada não encontrada.'; END IF;
    SELECT array_agg(player_id) INTO source_player_ids
    FROM public.callup_entries
    WHERE callup_id = p_callup_id AND status = 'confirmed';
  ELSE
    SELECT array_agg(player_id) INTO source_player_ids
    FROM public.round_players
    WHERE round_id = p_round_id;
  END IF;

  IF COALESCE(cardinality(source_player_ids), 0) < 6 THEN
    RAISE EXCEPTION 'A lista não possui jogadores suficientes para o Draft.';
  END IF;

  FOREACH captain_id IN ARRAY p_captain_ids LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.players player
      JOIN public.player_season_stats stats ON stats.player_id = player.id
        AND stats.season_id = selected_round.season_id AND stats.round_type = 'official'
      WHERE player.id = captain_id
        AND player.id = ANY(source_player_ids)
        AND player.member_category = 'player'
        AND player.is_selectable = true
        AND stats.rounds_count >= 3
    ) THEN RAISE EXCEPTION 'Um dos capitães não possui três rodadas oficiais nesta temporada.'; END IF;
  END LOOP;

  INSERT INTO public.team_drafts (league_id, callup_id, round_id, status)
  VALUES (selected_round.league_id, p_callup_id, p_round_id, 'setup')
  ON CONFLICT (round_id) DO UPDATE SET
    callup_id = EXCLUDED.callup_id,
    status = 'setup', pause_reason = NULL, current_pick = 1, updated_at = now()
  RETURNING id INTO created_id;

  DELETE FROM public.team_draft_picks WHERE draft_id = created_id;
  DELETE FROM public.team_draft_captains WHERE draft_id = created_id;
  DELETE FROM public.team_draft_players WHERE draft_id = created_id;

  INSERT INTO public.team_draft_players (draft_id, player_id, overall_snapshot, speed_rating_snapshot, profile_snapshot)
  SELECT created_id, player.id, overall.overall, attributes.speed_rating, player.player_profile
  FROM public.players player
  LEFT JOIN public.player_admin_attributes attributes ON attributes.player_id = player.id
  LEFT JOIN public.get_latest_player_card_overalls() overall ON overall.player_id = player.id
  WHERE player.id = ANY(source_player_ids);

  FOREACH captain_id IN ARRAY p_captain_ids LOOP
    captain_index := captain_index + 1;
    SELECT stats.win_rate, stats.rounds_count INTO captain_stats
    FROM public.player_season_stats stats
    WHERE stats.player_id = captain_id AND stats.season_id = selected_round.season_id AND stats.round_type = 'official';
    INSERT INTO public.team_draft_captains (draft_id, team_slot, captain_player_id, win_rate_snapshot, official_rounds_snapshot)
    VALUES (created_id, captain_index, captain_id, COALESCE(captain_stats.win_rate, 0), COALESCE(captain_stats.rounds_count, 0));
  END LOOP;

  UPDATE public.rounds SET formation_mode = 'draft' WHERE id = p_round_id;
  RETURN created_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_team_draft(p_draft_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE selected_draft public.team_drafts%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem iniciar o Draft.'; END IF;
  SELECT * INTO selected_draft FROM public.team_drafts
  WHERE id = p_draft_id AND status IN ('setup', 'paused') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft indisponível para iniciar.'; END IF;

  UPDATE public.team_draft_captains SET selection_order = NULL WHERE draft_id = p_draft_id;
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY win_rate_snapshot ASC, random()) AS order_number
    FROM public.team_draft_captains WHERE draft_id = p_draft_id
  )
  UPDATE public.team_draft_captains captain SET selection_order = ordered.order_number
  FROM ordered WHERE captain.id = ordered.id;
  UPDATE public.team_drafts SET status = 'active', pause_reason = NULL, updated_at = now() WHERE id = p_draft_id;

  IF selected_draft.callup_id IS NOT NULL THEN
    INSERT INTO public.collective_messages (callup_id, round_id, kind, body, metadata)
    VALUES (selected_draft.callup_id, selected_draft.round_id, 'system', 'O Draft começou. Boa escolha aos capitães!', jsonb_build_object('draft_id', p_draft_id, 'event', 'draft_started'));
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.make_team_draft_pick(p_draft_id UUID, p_player_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_draft public.team_drafts%ROWTYPE;
  pick_number INTEGER;
  total_available INTEGER;
  expected_order INTEGER;
  expected_slot INTEGER;
  captain_id UUID;
  picked_name TEXT;
  player_is_available BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para escolher.'; END IF;
  SELECT * INTO selected_draft FROM public.team_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR selected_draft.status <> 'active' THEN RAISE EXCEPTION 'O Draft não está ativo.'; END IF;

  SELECT count(*) + 1 INTO pick_number FROM public.team_draft_picks WHERE draft_id = p_draft_id;
  expected_order := (ARRAY[1,2,3,3,2,1])[((pick_number - 1) % 6) + 1];
  SELECT team_slot, captain_player_id INTO expected_slot, captain_id
  FROM public.team_draft_captains WHERE draft_id = p_draft_id AND selection_order = expected_order;
  IF NOT public.is_app_admin() AND captain_id IS DISTINCT FROM (SELECT player_id FROM public.account_profiles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Agora é a vez de outro capitão.';
  END IF;

  IF selected_draft.callup_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.callup_entries WHERE callup_id = selected_draft.callup_id AND status = 'confirmed' AND player_id = p_player_id)
    INTO player_is_available;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.round_players WHERE round_id = selected_draft.round_id AND player_id = p_player_id)
    INTO player_is_available;
  END IF;
  IF EXISTS (SELECT 1 FROM public.team_draft_captains WHERE draft_id = p_draft_id AND captain_player_id = p_player_id)
    OR EXISTS (SELECT 1 FROM public.team_draft_picks WHERE draft_id = p_draft_id AND player_id = p_player_id)
    OR NOT player_is_available
  THEN RAISE EXCEPTION 'Este jogador não está disponível.'; END IF;

  INSERT INTO public.team_draft_picks (draft_id, team_slot, player_id, pick_number)
  VALUES (p_draft_id, expected_slot, p_player_id, pick_number);
  SELECT name INTO picked_name FROM public.players WHERE id = p_player_id;

  IF selected_draft.callup_id IS NOT NULL THEN
    INSERT INTO public.collective_messages (callup_id, round_id, kind, body, metadata)
    VALUES (selected_draft.callup_id, selected_draft.round_id, 'system',
      COALESCE(picked_name, 'Jogador') || ' foi escolhido no Draft.',
      jsonb_build_object('draft_id', p_draft_id, 'pick_number', pick_number, 'team_slot', expected_slot, 'player_id', p_player_id));
  END IF;

  IF selected_draft.callup_id IS NOT NULL THEN
    SELECT count(*) - 3 INTO total_available FROM public.callup_entries WHERE callup_id = selected_draft.callup_id AND status = 'confirmed';
  ELSE
    SELECT count(*) - 3 INTO total_available FROM public.round_players WHERE round_id = selected_draft.round_id;
  END IF;
  UPDATE public.team_drafts SET current_pick = pick_number + 1,
    status = CASE WHEN pick_number >= total_available THEN 'completed' ELSE 'active' END,
    updated_at = now() WHERE id = p_draft_id;
  RETURN jsonb_build_object('pick_number', pick_number, 'team_slot', expected_slot, 'completed', pick_number >= total_available);
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_team_draft_captain(
  p_draft_id UUID,
  p_team_slot INTEGER,
  p_player_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_draft public.team_drafts%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
  stats RECORD;
  previous_order INTEGER;
  player_is_in_pool BOOLEAN;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem trocar capitães.'; END IF;
  SELECT * INTO selected_draft FROM public.team_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR selected_draft.status NOT IN ('setup', 'paused') THEN RAISE EXCEPTION 'Pause ou reinicie o Draft antes de trocar capitães.'; END IF;
  SELECT * INTO selected_round FROM public.rounds WHERE id = selected_draft.round_id;
  SELECT win_rate, rounds_count INTO stats FROM public.player_season_stats
  WHERE player_id = p_player_id AND season_id = selected_round.season_id AND round_type = 'official' AND rounds_count >= 3;
  IF selected_draft.callup_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.callup_entries entry JOIN public.players player ON player.id = entry.player_id
      WHERE entry.callup_id = selected_draft.callup_id AND entry.status = 'confirmed' AND entry.player_id = p_player_id
        AND player.member_category = 'player' AND player.is_selectable = true) INTO player_is_in_pool;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.round_players participant JOIN public.players player ON player.id = participant.player_id
      WHERE participant.round_id = selected_draft.round_id AND participant.player_id = p_player_id
        AND player.member_category = 'player' AND player.is_selectable = true) INTO player_is_in_pool;
  END IF;
  IF NOT COALESCE(player_is_in_pool, false) OR stats.rounds_count IS NULL THEN RAISE EXCEPTION 'Novo capitão não elegível.'; END IF;

  SELECT selection_order INTO previous_order FROM public.team_draft_captains WHERE draft_id = p_draft_id AND team_slot = p_team_slot;
  DELETE FROM public.team_draft_picks WHERE draft_id = p_draft_id AND player_id = p_player_id;
  UPDATE public.team_draft_captains SET captain_player_id = p_player_id,
    win_rate_snapshot = COALESCE(stats.win_rate, 0), official_rounds_snapshot = COALESCE(stats.rounds_count, 0), selection_order = previous_order
  WHERE draft_id = p_draft_id AND team_slot = p_team_slot;
  UPDATE public.team_draft_picks SET pick_number = pick_number + 1000 WHERE draft_id = p_draft_id;
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY pick_number, created_at, id) AS next_number
    FROM public.team_draft_picks WHERE draft_id = p_draft_id
  ) UPDATE public.team_draft_picks pick SET pick_number = ordered.next_number FROM ordered WHERE pick.id = ordered.id;
  UPDATE public.team_drafts SET status = CASE WHEN status = 'paused' THEN CASE
      WHEN previous_order IS NULL THEN 'setup'
      WHEN (SELECT count(*) FROM public.team_draft_picks WHERE draft_id = p_draft_id) >=
        (SELECT count(*) - 3 FROM public.team_draft_players WHERE draft_id = p_draft_id)
      THEN 'completed' ELSE 'active' END ELSE status END,
    current_pick = (SELECT count(*) + 1 FROM public.team_draft_picks WHERE draft_id = p_draft_id),
    pause_reason = NULL, updated_at = now()
  WHERE id = p_draft_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_team_draft(p_draft_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_draft public.team_drafts%ROWTYPE;
  slot INTEGER;
  created_team UUID;
  captain_id UUID;
  expected_players INTEGER;
  materialized_players INTEGER;
  colors TEXT[] := ARRAY['#ef4444', '#2563eb', '#eab308'];
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem confirmar o Draft.'; END IF;
  SELECT * INTO selected_draft FROM public.team_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR selected_draft.status <> 'completed' THEN RAISE EXCEPTION 'Complete todas as escolhas antes de confirmar.'; END IF;
  IF selected_draft.callup_id IS NOT NULL THEN
    SELECT count(*) INTO expected_players FROM public.callup_entries WHERE callup_id = selected_draft.callup_id AND status = 'confirmed';
  ELSE
    SELECT count(*) INTO expected_players FROM public.round_players WHERE round_id = selected_draft.round_id;
  END IF;
  SELECT count(*) + 3 INTO materialized_players FROM public.team_draft_picks WHERE draft_id = p_draft_id;
  IF materialized_players <> expected_players THEN RAISE EXCEPTION 'A lista mudou. Preencha novamente as vagas abertas.'; END IF;
  IF EXISTS (SELECT 1 FROM public.teams WHERE round_id = selected_draft.round_id) THEN RAISE EXCEPTION 'A rodada já possui times.'; END IF;

  FOR slot IN 1..3 LOOP
    SELECT captain_player_id INTO captain_id FROM public.team_draft_captains WHERE draft_id = p_draft_id AND team_slot = slot;
    INSERT INTO public.teams (round_id, name, color, position, captain_player_id)
    VALUES (selected_draft.round_id, 'Time ' || slot, colors[slot], slot, captain_id)
    RETURNING id INTO created_team;
    INSERT INTO public.team_players (team_id, player_id, goalkeeper_order)
    SELECT created_team, player_id, row_number() OVER (ORDER BY pick_order, player_id)
    FROM (
      SELECT captain_id AS player_id, 0 AS pick_order
      UNION ALL
      SELECT player_id, pick_number FROM public.team_draft_picks WHERE draft_id = p_draft_id AND team_slot = slot
    ) roster;
  END LOOP;

  UPDATE public.rounds SET formation_mode = 'draft', preparation_stage = 'teams_ready', arrival_order_enabled = false
  WHERE id = selected_draft.round_id;
  IF selected_draft.callup_id IS NOT NULL THEN
    UPDATE public.callups SET status = 'converted', round_id = selected_draft.round_id, updated_at = now()
    WHERE id = selected_draft.callup_id;
    INSERT INTO public.collective_messages (callup_id, round_id, kind, body, metadata)
    VALUES (selected_draft.callup_id, selected_draft.round_id, 'system', 'Times do Draft confirmados.', jsonb_build_object('draft_id', p_draft_id, 'event', 'draft_confirmed'));
  END IF;
  UPDATE public.team_drafts SET status = 'confirmed', updated_at = now() WHERE id = p_draft_id;
  RETURN selected_draft.round_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_team_draft(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
