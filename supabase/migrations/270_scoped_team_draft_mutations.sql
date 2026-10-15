-- Funcoes SECURITY DEFINER do Draft precisam validar a pelada diretamente.
BEGIN;

CREATE OR REPLACE FUNCTION public.assert_team_draft_admin(p_draft_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league_id uuid;
BEGIN
  SELECT league_id INTO target_league_id FROM public.team_drafts WHERE id = p_draft_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_team_draft(
  p_callup_id uuid, p_round_id uuid, p_captain_ids uuid[]
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  created_id uuid;
  selected_round public.rounds%ROWTYPE;
  captain_id uuid;
  captain_index integer := 0;
  captain_stats record;
  source_player_ids uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rounds round_item
    WHERE round_item.id = p_round_id AND public.is_league_admin(round_item.league_id)) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF cardinality(p_captain_ids) <> 3
    OR (SELECT count(DISTINCT value) FROM unnest(p_captain_ids) value) <> 3 THEN
    RAISE EXCEPTION 'Escolha três capitães diferentes.';
  END IF;

  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR selected_round.status <> 'draft'
    OR selected_round.preparation_stage <> 'prelist' THEN
    RAISE EXCEPTION 'A pré-rodada precisa estar pronta e ainda sem times.';
  END IF;
  IF NOT public.is_league_admin(selected_round.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;

  IF p_callup_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.callups callup
      WHERE callup.id = p_callup_id AND callup.round_id = p_round_id
        AND callup.league_id = selected_round.league_id
        AND callup.status IN ('open', 'locked')
    ) THEN RAISE EXCEPTION 'Convocação vinculada não encontrada.'; END IF;
    SELECT array_agg(player_id) INTO source_player_ids
    FROM public.callup_entries
    WHERE callup_id = p_callup_id AND status = 'confirmed';
  ELSE
    SELECT array_agg(player_id) INTO source_player_ids
    FROM public.round_players WHERE round_id = p_round_id;
  END IF;

  IF COALESCE(cardinality(source_player_ids), 0) < 6 THEN
    RAISE EXCEPTION 'A lista não possui jogadores suficientes para o Draft.';
  END IF;
  FOREACH captain_id IN ARRAY p_captain_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.players player
      JOIN public.player_season_stats stats ON stats.player_id = player.id
        AND stats.season_id = selected_round.season_id AND stats.round_type = 'official'
      WHERE player.id = captain_id AND player.id = ANY(source_player_ids)
        AND player.member_category = 'player' AND player.is_selectable = true
        AND stats.rounds_count >= 3
    ) THEN RAISE EXCEPTION 'Um dos capitães não possui três rodadas oficiais nesta temporada.'; END IF;
  END LOOP;

  INSERT INTO public.team_drafts (league_id, callup_id, round_id, status)
  VALUES (selected_round.league_id, p_callup_id, p_round_id, 'setup')
  ON CONFLICT (round_id) DO UPDATE SET
    callup_id = EXCLUDED.callup_id, status = 'setup', pause_reason = NULL,
    current_pick = 1, updated_at = now()
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
    WHERE stats.player_id = captain_id AND stats.season_id = selected_round.season_id
      AND stats.round_type = 'official';
    INSERT INTO public.team_draft_captains
      (draft_id, team_slot, captain_player_id, win_rate_snapshot, official_rounds_snapshot)
    VALUES (created_id, captain_index, captain_id,
      COALESCE(captain_stats.win_rate, 0), COALESCE(captain_stats.rounds_count, 0));
  END LOOP;

  UPDATE public.rounds SET formation_mode = 'draft' WHERE id = p_round_id;
  RETURN created_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_team_draft(p_draft_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE selected_draft public.team_drafts%ROWTYPE;
BEGIN
  PERFORM public.assert_team_draft_admin(p_draft_id);
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
  UPDATE public.team_drafts SET status = 'active', pause_reason = NULL, updated_at = now()
  WHERE id = p_draft_id;

  IF selected_draft.callup_id IS NOT NULL THEN
    INSERT INTO public.collective_messages (callup_id, round_id, kind, body, metadata)
    VALUES (selected_draft.callup_id, selected_draft.round_id, 'system',
      'O Draft começou. Boa escolha aos capitães!',
      jsonb_build_object('draft_id', p_draft_id, 'event', 'draft_started'));
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_team_draft_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_team_draft(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_team_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_draft(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_team_draft(uuid) TO authenticated;

COMMIT;
