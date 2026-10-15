-- Troca de capitao e confirmacao dos times exigem ADM da pelada do Draft.
BEGIN;

CREATE OR REPLACE FUNCTION public.replace_team_draft_captain(
  p_draft_id uuid, p_team_slot integer, p_player_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  selected_draft public.team_drafts%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
  stats record;
  previous_order integer;
  player_is_in_pool boolean;
BEGIN
  PERFORM public.assert_team_draft_admin(p_draft_id);
  SELECT * INTO selected_draft FROM public.team_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR selected_draft.status NOT IN ('setup', 'paused') THEN
    RAISE EXCEPTION 'Pause ou reinicie o Draft antes de trocar capitães.';
  END IF;
  SELECT * INTO selected_round FROM public.rounds WHERE id = selected_draft.round_id;
  SELECT win_rate, rounds_count INTO stats FROM public.player_season_stats
  WHERE player_id = p_player_id AND season_id = selected_round.season_id
    AND round_type = 'official' AND rounds_count >= 3;
  IF selected_draft.callup_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.callup_entries entry
      JOIN public.players player ON player.id = entry.player_id
      WHERE entry.callup_id = selected_draft.callup_id AND entry.status = 'confirmed'
        AND entry.player_id = p_player_id
        AND player.member_category = 'player' AND player.is_selectable = true
    ) INTO player_is_in_pool;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.round_players participant
      JOIN public.players player ON player.id = participant.player_id
      WHERE participant.round_id = selected_draft.round_id
        AND participant.player_id = p_player_id
        AND player.member_category = 'player' AND player.is_selectable = true
    ) INTO player_is_in_pool;
  END IF;
  IF NOT COALESCE(player_is_in_pool, false) OR stats.rounds_count IS NULL THEN
    RAISE EXCEPTION 'Novo capitão não elegível.';
  END IF;

  SELECT selection_order INTO previous_order FROM public.team_draft_captains
  WHERE draft_id = p_draft_id AND team_slot = p_team_slot;
  DELETE FROM public.team_draft_picks WHERE draft_id = p_draft_id AND player_id = p_player_id;
  UPDATE public.team_draft_captains SET captain_player_id = p_player_id,
    win_rate_snapshot = COALESCE(stats.win_rate, 0),
    official_rounds_snapshot = COALESCE(stats.rounds_count, 0),
    selection_order = previous_order
  WHERE draft_id = p_draft_id AND team_slot = p_team_slot;
  UPDATE public.team_draft_picks SET pick_number = pick_number + 1000
  WHERE draft_id = p_draft_id;
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY pick_number, created_at, id) AS next_number
    FROM public.team_draft_picks WHERE draft_id = p_draft_id
  )
  UPDATE public.team_draft_picks pick SET pick_number = ordered.next_number
  FROM ordered WHERE pick.id = ordered.id;
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

CREATE OR REPLACE FUNCTION public.finalize_team_draft(p_draft_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  selected_draft public.team_drafts%ROWTYPE;
  slot integer;
  created_team uuid;
  captain_id uuid;
  expected_players integer;
  materialized_players integer;
  colors text[] := ARRAY['#ef4444', '#2563eb', '#eab308'];
BEGIN
  PERFORM public.assert_team_draft_admin(p_draft_id);
  SELECT * INTO selected_draft FROM public.team_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR selected_draft.status <> 'completed' THEN
    RAISE EXCEPTION 'Complete todas as escolhas antes de confirmar.';
  END IF;
  IF selected_draft.callup_id IS NOT NULL THEN
    SELECT count(*) INTO expected_players FROM public.callup_entries
    WHERE callup_id = selected_draft.callup_id AND status = 'confirmed';
  ELSE
    SELECT count(*) INTO expected_players FROM public.round_players
    WHERE round_id = selected_draft.round_id;
  END IF;
  SELECT count(*) + 3 INTO materialized_players FROM public.team_draft_picks
  WHERE draft_id = p_draft_id;
  IF materialized_players <> expected_players THEN
    RAISE EXCEPTION 'A lista mudou. Preencha novamente as vagas abertas.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.teams WHERE round_id = selected_draft.round_id) THEN
    RAISE EXCEPTION 'A rodada já possui times.';
  END IF;

  FOR slot IN 1..3 LOOP
    SELECT captain_player_id INTO captain_id FROM public.team_draft_captains
    WHERE draft_id = p_draft_id AND team_slot = slot;
    INSERT INTO public.teams (round_id, name, color, position, captain_player_id)
    VALUES (selected_draft.round_id, 'Time ' || slot, colors[slot], slot, captain_id)
    RETURNING id INTO created_team;
    INSERT INTO public.team_players (team_id, player_id, goalkeeper_order)
    SELECT created_team, player_id, row_number() OVER (ORDER BY pick_order, player_id)
    FROM (
      SELECT captain_id AS player_id, 0 AS pick_order
      UNION ALL
      SELECT player_id, pick_number FROM public.team_draft_picks
      WHERE draft_id = p_draft_id AND team_slot = slot
    ) roster;
  END LOOP;

  UPDATE public.rounds SET formation_mode = 'draft', preparation_stage = 'teams_ready',
    arrival_order_enabled = false WHERE id = selected_draft.round_id;
  IF selected_draft.callup_id IS NOT NULL THEN
    UPDATE public.callups SET status = 'converted', round_id = selected_draft.round_id,
      updated_at = now() WHERE id = selected_draft.callup_id;
    INSERT INTO public.collective_messages (callup_id, round_id, kind, body, metadata)
    VALUES (selected_draft.callup_id, selected_draft.round_id, 'system',
      'Times do Draft confirmados.',
      jsonb_build_object('draft_id', p_draft_id, 'event', 'draft_confirmed'));
  END IF;
  UPDATE public.team_drafts SET status = 'confirmed', updated_at = now()
  WHERE id = p_draft_id;
  RETURN selected_draft.round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_team_draft_captain(uuid, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_team_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_team_draft_captain(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_team_draft(uuid) TO authenticated;

COMMIT;
