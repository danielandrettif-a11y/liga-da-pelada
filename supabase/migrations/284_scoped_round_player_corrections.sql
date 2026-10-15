-- Identity transfers and emergency substitutions are SECURITY DEFINER RPCs.
-- Validate the round's league and the destination player before any mutation.
CREATE OR REPLACE FUNCTION public.transfer_round_player_identity(
  p_round_id uuid,
  p_source_player_id uuid,
  p_target_player_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE selected_round public.rounds%ROWTYPE;
BEGIN
  IF p_source_player_id = p_target_player_id THEN RAISE EXCEPTION 'Escolha dois perfis diferentes.'; END IF;
  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada nao encontrada.'; END IF;
  IF NOT public.is_league_admin(selected_round.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND status = 'live') THEN
    RAISE EXCEPTION 'Encerre a partida ao vivo antes de corrigir a identidade.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players player
    JOIN public.league_members member ON member.player_id = player.id
    WHERE player.id = p_target_player_id
      AND member.league_id = selected_round.league_id
      AND member.is_active
      AND player.is_selectable
      AND player.member_category IN ('player', 'guest')
  ) THEN
    RAISE EXCEPTION 'O perfil de destino nao e um atleta ativo desta pelada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.match_players source_entry
    JOIN public.match_players target_entry ON target_entry.match_id = source_entry.match_id
    WHERE source_entry.player_id = p_source_player_id AND target_entry.player_id = p_target_player_id
      AND source_entry.match_id IN (SELECT id FROM public.matches WHERE round_id = p_round_id)
  ) THEN RAISE EXCEPTION 'Os dois perfis aparecem na mesma partida e precisam de revisao manual.'; END IF;

  DELETE FROM public.round_players WHERE round_id = p_round_id AND player_id = p_target_player_id;
  UPDATE public.round_players SET player_id = p_target_player_id WHERE round_id = p_round_id AND player_id = p_source_player_id;

  DELETE FROM public.team_players target_entry
  USING public.teams target_team
  WHERE target_entry.team_id = target_team.id AND target_team.round_id = p_round_id
    AND target_entry.player_id = p_target_player_id;
  UPDATE public.team_players team_player SET player_id = p_target_player_id
  FROM public.teams team WHERE team.id = team_player.team_id AND team.round_id = p_round_id AND team_player.player_id = p_source_player_id;

  UPDATE public.match_players entry SET player_id = p_target_player_id
  FROM public.matches match_item WHERE entry.match_id = match_item.id AND match_item.round_id = p_round_id AND entry.player_id = p_source_player_id;
  UPDATE public.match_events event SET player_id = p_target_player_id
  FROM public.matches match_item WHERE event.match_id = match_item.id AND match_item.round_id = p_round_id AND event.player_id = p_source_player_id;
  UPDATE public.match_events event SET assist_player_id = p_target_player_id
  FROM public.matches match_item WHERE event.match_id = match_item.id AND match_item.round_id = p_round_id AND event.assist_player_id = p_source_player_id;
  UPDATE public.match_substitutions substitution SET player_out_id = p_target_player_id
  FROM public.matches match_item WHERE substitution.match_id = match_item.id AND match_item.round_id = p_round_id AND substitution.player_out_id = p_source_player_id;
  UPDATE public.match_substitutions substitution SET player_in_id = p_target_player_id
  FROM public.matches match_item WHERE substitution.match_id = match_item.id AND match_item.round_id = p_round_id AND substitution.player_in_id = p_source_player_id;

  DELETE FROM public.round_payments WHERE round_id = p_round_id AND player_id = p_target_player_id;
  UPDATE public.round_payments SET player_id = p_target_player_id WHERE round_id = p_round_id AND player_id = p_source_player_id;
  DELETE FROM public.player_round_fitness WHERE round_id = p_round_id AND player_id = p_target_player_id;
  UPDATE public.player_round_fitness SET player_id = p_target_player_id WHERE round_id = p_round_id AND player_id = p_source_player_id;
  UPDATE public.rounds SET best_goalkeeper_player_id = p_target_player_id WHERE id = p_round_id AND best_goalkeeper_player_id = p_source_player_id;
  UPDATE public.teams SET captain_player_id = p_target_player_id WHERE round_id = p_round_id AND captain_player_id = p_source_player_id;
  DELETE FROM public.player_round_stats WHERE round_id = p_round_id AND player_id IN (p_source_player_id, p_target_player_id);

  INSERT INTO public.sports_admin_audit (league_id, round_id, action, changed_by, payload)
  VALUES (selected_round.league_id, selected_round.id, 'round_identity_transferred', auth.uid(), jsonb_build_object('source_player_id', p_source_player_id, 'target_player_id', p_target_player_id));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_round_emergency_substitute(
  p_round_id uuid,
  p_out_player_id uuid,
  p_in_player_id uuid,
  p_team_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_round public.rounds%ROWTYPE;
  next_order integer;
  live_match public.matches%ROWTYPE;
  elapsed_seconds integer;
  linked_callup_id uuid;
BEGIN
  IF p_out_player_id = p_in_player_id THEN RAISE EXCEPTION 'Escolha jogadores diferentes.'; END IF;
  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id AND status <> 'finished' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada nao encontrada ou encerrada.'; END IF;
  IF NOT public.is_league_admin(selected_round.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id AND round_id = p_round_id) THEN RAISE EXCEPTION 'Time invalido.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.round_players WHERE round_id = p_round_id AND player_id = p_out_player_id) THEN RAISE EXCEPTION 'O ausente nao pertence a rodada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.match_players entry JOIN public.matches match_item ON match_item.id = entry.match_id WHERE match_item.round_id = p_round_id AND entry.player_id = p_out_player_id) THEN
    RAISE EXCEPTION 'O jogador que vai sair ja participou de uma partida e nao pode ser removido da rodada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.round_players WHERE round_id = p_round_id AND player_id = p_in_player_id) THEN RAISE EXCEPTION 'O substituto ja esta na rodada.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players player
    JOIN public.league_members member ON member.player_id = player.id
    WHERE player.id = p_in_player_id
      AND member.league_id = selected_round.league_id
      AND member.is_active
      AND player.is_selectable
      AND player.member_category IN ('player', 'guest')
  ) THEN RAISE EXCEPTION 'Substituto invalido para esta pelada.'; END IF;

  SELECT COALESCE(max(attendance_order), 0) + 1 INTO next_order FROM public.round_players WHERE round_id = p_round_id;
  DELETE FROM public.team_players team_player USING public.teams team WHERE team_player.team_id = team.id AND team.round_id = p_round_id AND team_player.player_id = p_out_player_id;
  DELETE FROM public.round_players WHERE round_id = p_round_id AND player_id = p_out_player_id;
  INSERT INTO public.round_players (round_id, player_id, availability_status, availability_updated_at, attendance_status, attendance_order, attendance_marked_at)
  VALUES (p_round_id, p_in_player_id, 'available', now(), CASE WHEN selected_round.formation_mode = 'manual' THEN 'pending' ELSE 'present' END,
    CASE WHEN selected_round.formation_mode = 'manual' THEN NULL ELSE next_order END,
    CASE WHEN selected_round.formation_mode = 'manual' THEN NULL ELSE now() END);
  INSERT INTO public.team_players (team_id, player_id) VALUES (p_team_id, p_in_player_id);

  DELETE FROM public.round_payments WHERE round_id = p_round_id AND player_id = p_out_player_id;
  INSERT INTO public.round_payments (round_id, player_id, paid) VALUES (p_round_id, p_in_player_id, false) ON CONFLICT (round_id, player_id) DO NOTHING;
  SELECT id INTO linked_callup_id FROM public.callups
  WHERE round_id = p_round_id AND league_id = selected_round.league_id LIMIT 1;
  IF linked_callup_id IS NOT NULL THEN
    DELETE FROM public.callup_entries WHERE callup_id = linked_callup_id AND player_id = p_out_player_id;
    INSERT INTO public.callup_entries (callup_id, player_id, status, position, joined_by)
    VALUES (linked_callup_id, p_in_player_id, 'confirmed', COALESCE((SELECT max(position) + 1 FROM public.callup_entries WHERE callup_id = linked_callup_id), 1), auth.uid())
    ON CONFLICT (callup_id, player_id) DO NOTHING;
  END IF;

  SELECT * INTO live_match FROM public.matches WHERE round_id = p_round_id AND status = 'live' AND p_team_id IN (team_a_id, team_b_id) LIMIT 1;
  IF live_match.id IS NOT NULL THEN
    elapsed_seconds := live_match.timer_accumulated_seconds + CASE WHEN live_match.timer_started_at IS NULL THEN 0 ELSE greatest(0, extract(epoch FROM (now() - live_match.timer_started_at))::integer) END;
    INSERT INTO public.match_players (match_id, player_id, team_id, original_team_id, is_starter, is_active, result_eligible, entered_elapsed_seconds)
    VALUES (live_match.id, p_in_player_id, p_team_id, p_team_id, false, true, elapsed_seconds <= live_match.duration_seconds / 2, elapsed_seconds);
  END IF;

  INSERT INTO public.sports_admin_audit (league_id, round_id, action, changed_by, payload)
  VALUES (selected_round.league_id, selected_round.id, 'emergency_substitute_added', auth.uid(), jsonb_build_object('out_player_id', p_out_player_id, 'in_player_id', p_in_player_id, 'team_id', p_team_id));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_round_player_identity(uuid, uuid, uuid),
  public.add_round_emergency_substitute(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_round_player_identity(uuid, uuid, uuid),
  public.add_round_emergency_substitute(uuid, uuid, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
