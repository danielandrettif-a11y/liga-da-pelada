-- Escolhas dos capitaes e ajustes manuais permanecem dentro da pelada.
BEGIN;

CREATE OR REPLACE FUNCTION public.make_team_draft_pick(p_draft_id uuid, p_player_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  selected_draft public.team_drafts%ROWTYPE;
  pick_number integer;
  total_available integer;
  expected_order integer;
  expected_slot integer;
  captain_id uuid;
  picked_name text;
  player_is_available boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para escolher.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_drafts draft
    WHERE draft.id = p_draft_id AND public.is_league_member(draft.league_id)) THEN
    RAISE EXCEPTION 'Voce nao participa desta pelada.';
  END IF;
  SELECT * INTO selected_draft FROM public.team_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR selected_draft.status <> 'active' THEN
    RAISE EXCEPTION 'O Draft não está ativo.';
  END IF;
  IF NOT public.is_league_member(selected_draft.league_id) THEN
    RAISE EXCEPTION 'Voce nao participa desta pelada.';
  END IF;

  SELECT count(*) + 1 INTO pick_number FROM public.team_draft_picks WHERE draft_id = p_draft_id;
  expected_order := (ARRAY[1,2,3,3,2,1])[((pick_number - 1) % 6) + 1];
  SELECT team_slot, captain_player_id INTO expected_slot, captain_id
  FROM public.team_draft_captains
  WHERE draft_id = p_draft_id AND selection_order = expected_order;
  IF NOT public.is_league_admin(selected_draft.league_id)
    AND captain_id IS DISTINCT FROM (
      SELECT player_id FROM public.account_profiles WHERE user_id = auth.uid()
    ) THEN
    RAISE EXCEPTION 'Agora é a vez de outro capitão.';
  END IF;

  IF selected_draft.callup_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.callup_entries
      WHERE callup_id = selected_draft.callup_id AND status = 'confirmed'
        AND player_id = p_player_id) INTO player_is_available;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.round_players
      WHERE round_id = selected_draft.round_id AND player_id = p_player_id)
      INTO player_is_available;
  END IF;
  IF EXISTS (SELECT 1 FROM public.team_draft_captains
      WHERE draft_id = p_draft_id AND captain_player_id = p_player_id)
    OR EXISTS (SELECT 1 FROM public.team_draft_picks
      WHERE draft_id = p_draft_id AND player_id = p_player_id)
    OR NOT player_is_available THEN
    RAISE EXCEPTION 'Este jogador não está disponível.';
  END IF;

  INSERT INTO public.team_draft_picks (draft_id, team_slot, player_id, pick_number)
  VALUES (p_draft_id, expected_slot, p_player_id, pick_number);
  SELECT name INTO picked_name FROM public.players WHERE id = p_player_id;
  IF selected_draft.callup_id IS NOT NULL THEN
    INSERT INTO public.collective_messages (callup_id, round_id, kind, body, metadata)
    VALUES (selected_draft.callup_id, selected_draft.round_id, 'system',
      COALESCE(picked_name, 'Jogador') || ' foi escolhido no Draft.',
      jsonb_build_object('draft_id', p_draft_id, 'pick_number', pick_number,
        'team_slot', expected_slot, 'player_id', p_player_id));
  END IF;

  IF selected_draft.callup_id IS NOT NULL THEN
    SELECT count(*) - 3 INTO total_available FROM public.callup_entries
    WHERE callup_id = selected_draft.callup_id AND status = 'confirmed';
  ELSE
    SELECT count(*) - 3 INTO total_available FROM public.round_players
    WHERE round_id = selected_draft.round_id;
  END IF;
  UPDATE public.team_drafts SET current_pick = pick_number + 1,
    status = CASE WHEN pick_number >= total_available THEN 'completed' ELSE 'active' END,
    updated_at = now() WHERE id = p_draft_id;
  RETURN jsonb_build_object('pick_number', pick_number, 'team_slot', expected_slot,
    'completed', pick_number >= total_available);
END;
$$;

CREATE OR REPLACE FUNCTION public.swap_team_draft_picks(
  p_draft_id uuid, p_player_a uuid, p_player_b uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a_slot integer; b_slot integer;
BEGIN
  PERFORM public.assert_team_draft_admin(p_draft_id);
  SELECT team_slot INTO a_slot FROM public.team_draft_picks
  WHERE draft_id = p_draft_id AND player_id = p_player_a FOR UPDATE;
  SELECT team_slot INTO b_slot FROM public.team_draft_picks
  WHERE draft_id = p_draft_id AND player_id = p_player_b FOR UPDATE;
  IF a_slot IS NULL OR b_slot IS NULL OR a_slot = b_slot THEN
    RAISE EXCEPTION 'Escolha jogadores não capitães de times diferentes.';
  END IF;
  UPDATE public.team_draft_picks
  SET team_slot = CASE WHEN player_id = p_player_a THEN b_slot ELSE a_slot END
  WHERE draft_id = p_draft_id AND player_id IN (p_player_a, p_player_b);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.restart_team_draft(p_draft_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_team_draft_admin(p_draft_id);
  DELETE FROM public.team_draft_picks WHERE draft_id = p_draft_id;
  UPDATE public.team_draft_captains SET selection_order = NULL WHERE draft_id = p_draft_id;
  UPDATE public.team_drafts SET status = 'setup', current_pick = 1,
    pause_reason = NULL, updated_at = now() WHERE id = p_draft_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.make_team_draft_pick(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.swap_team_draft_picks(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restart_team_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.make_team_draft_pick(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.swap_team_draft_picks(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restart_team_draft(uuid) TO authenticated;

COMMIT;
