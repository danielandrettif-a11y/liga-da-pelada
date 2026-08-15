-- Auditoria esportiva, correcao de gols, identidade por rodada e substitutos emergenciais.

CREATE TABLE IF NOT EXISTS public.sports_admin_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  round_id UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sports_admin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY sports_admin_audit_read ON public.sports_admin_audit
FOR SELECT TO authenticated USING (public.is_app_admin());
REVOKE ALL ON public.sports_admin_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sports_admin_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.correct_finished_goal(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_event public.match_events%ROWTYPE;
  selected_match public.matches%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem corrigir gols.'; END IF;

  SELECT * INTO selected_event FROM public.match_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gol nao encontrado.'; END IF;
  SELECT * INTO selected_match FROM public.matches WHERE id = selected_event.match_id FOR UPDATE;
  SELECT * INTO selected_round FROM public.rounds WHERE id = selected_match.round_id FOR UPDATE;
  IF selected_match.status <> 'finished' OR selected_round.status <> 'finished' THEN
    RAISE EXCEPTION 'Esta correcao e exclusiva para partidas de rodadas finalizadas.';
  END IF;

  DELETE FROM public.match_events WHERE id = p_event_id;
  UPDATE public.matches match_item SET
    score_a = (SELECT count(*) FROM public.match_events event WHERE event.match_id = match_item.id AND event.team_id = match_item.team_a_id),
    score_b = (SELECT count(*) FROM public.match_events event WHERE event.match_id = match_item.id AND event.team_id = match_item.team_b_id)
  WHERE match_item.id = selected_match.id;

  INSERT INTO public.sports_admin_audit (league_id, round_id, match_id, action, changed_by, payload)
  VALUES (selected_round.league_id, selected_round.id, selected_match.id, 'goal_corrected', auth.uid(), jsonb_build_object(
    'event_id', selected_event.id, 'player_id', selected_event.player_id,
    'assist_player_id', selected_event.assist_player_id, 'team_id', selected_event.team_id,
    'minute', selected_event.minute
  ));
  RETURN jsonb_build_object('round_id', selected_round.id, 'match_id', selected_match.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_round_player_identity(
  p_round_id UUID,
  p_source_player_id UUID,
  p_target_player_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE selected_round public.rounds%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem transferir participacoes.'; END IF;
  IF p_source_player_id = p_target_player_id THEN RAISE EXCEPTION 'Escolha dois perfis diferentes.'; END IF;
  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada nao encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND status = 'live') THEN
    RAISE EXCEPTION 'Encerre a partida ao vivo antes de corrigir a identidade.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_target_player_id AND is_selectable AND member_category IN ('player','guest')) THEN
    RAISE EXCEPTION 'O perfil de destino nao e um atleta selecionavel.';
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
  p_round_id UUID,
  p_out_player_id UUID,
  p_in_player_id UUID,
  p_team_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_round public.rounds%ROWTYPE;
  next_order INTEGER;
  live_match public.matches%ROWTYPE;
  elapsed_seconds INTEGER;
  linked_callup_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem incluir substitutos emergenciais.'; END IF;
  IF p_out_player_id = p_in_player_id THEN RAISE EXCEPTION 'Escolha jogadores diferentes.'; END IF;
  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id AND status <> 'finished' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada nao encontrada ou encerrada.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id AND round_id = p_round_id) THEN RAISE EXCEPTION 'Time invalido.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.round_players WHERE round_id = p_round_id AND player_id = p_out_player_id) THEN RAISE EXCEPTION 'O ausente nao pertence a rodada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.match_players entry JOIN public.matches match_item ON match_item.id = entry.match_id WHERE match_item.round_id = p_round_id AND entry.player_id = p_out_player_id) THEN
    RAISE EXCEPTION 'O jogador que vai sair ja participou de uma partida e nao pode ser removido da rodada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.round_players WHERE round_id = p_round_id AND player_id = p_in_player_id) THEN RAISE EXCEPTION 'O substituto ja esta na rodada.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_in_player_id AND is_selectable AND member_category IN ('player','guest')) THEN RAISE EXCEPTION 'Substituto invalido.'; END IF;

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
  SELECT id INTO linked_callup_id FROM public.callups WHERE round_id = p_round_id LIMIT 1;
  IF linked_callup_id IS NOT NULL THEN
    DELETE FROM public.callup_entries WHERE callup_id = linked_callup_id AND player_id = p_out_player_id;
    INSERT INTO public.callup_entries (callup_id, player_id, status, position, joined_by)
    VALUES (linked_callup_id, p_in_player_id, 'confirmed', COALESCE((SELECT max(position) + 1 FROM public.callup_entries WHERE callup_id = linked_callup_id), 1), auth.uid())
    ON CONFLICT (callup_id, player_id) DO NOTHING;
  END IF;

  SELECT * INTO live_match FROM public.matches WHERE round_id = p_round_id AND status = 'live' AND p_team_id IN (team_a_id, team_b_id) LIMIT 1;
  IF live_match.id IS NOT NULL THEN
    elapsed_seconds := live_match.timer_accumulated_seconds + CASE WHEN live_match.timer_started_at IS NULL THEN 0 ELSE greatest(0, extract(epoch FROM (now() - live_match.timer_started_at))::INTEGER) END;
    INSERT INTO public.match_players (match_id, player_id, team_id, original_team_id, is_starter, is_active, result_eligible, entered_elapsed_seconds)
    VALUES (live_match.id, p_in_player_id, p_team_id, p_team_id, false, true, elapsed_seconds <= live_match.duration_seconds / 2, elapsed_seconds);
  END IF;

  INSERT INTO public.sports_admin_audit (league_id, round_id, action, changed_by, payload)
  VALUES (selected_round.league_id, selected_round.id, 'emergency_substitute_added', auth.uid(), jsonb_build_object('out_player_id', p_out_player_id, 'in_player_id', p_in_player_id, 'team_id', p_team_id));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_selectable_player_profiles(p_target_id UUID, p_source_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_player public.players%ROWTYPE;
  source_player public.players%ROWTYPE;
  target_user UUID;
  source_user UUID;
  affected_rounds UUID[];
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem unir perfis.'; END IF;
  IF p_target_id = p_source_id THEN RAISE EXCEPTION 'Escolha dois perfis diferentes.'; END IF;
  SELECT * INTO target_player FROM public.players WHERE id = p_target_id FOR UPDATE;
  SELECT * INTO source_player FROM public.players WHERE id = p_source_id FOR UPDATE;
  IF target_player.id IS NULL OR source_player.id IS NULL THEN RAISE EXCEPTION 'Perfil nao encontrado.'; END IF;
  IF NOT target_player.is_selectable OR NOT source_player.is_selectable OR target_player.member_category NOT IN ('player','guest') OR source_player.member_category NOT IN ('player','guest') THEN
    RAISE EXCEPTION 'Somente jogadores e convidados selecionaveis podem ser unidos.';
  END IF;
  SELECT user_id INTO target_user FROM public.account_profiles WHERE player_id = p_target_id;
  SELECT user_id INTO source_user FROM public.account_profiles WHERE player_id = p_source_id;
  IF target_user IS NOT NULL AND source_user IS NOT NULL THEN RAISE EXCEPTION 'Os dois perfis possuem contas diferentes vinculadas.'; END IF;
  IF EXISTS (SELECT 1 FROM public.match_players WHERE player_id IN (p_target_id, p_source_id) AND is_active) THEN RAISE EXCEPTION 'Encerre a partida ativa antes de unir os perfis.'; END IF;

  SELECT array_agg(DISTINCT round_id) INTO affected_rounds FROM (
    SELECT round_id FROM public.round_players WHERE player_id IN (p_target_id,p_source_id)
    UNION SELECT round_id FROM public.player_round_stats WHERE player_id IN (p_target_id,p_source_id)
    UNION SELECT match_item.round_id FROM public.match_events event JOIN public.matches match_item ON match_item.id=event.match_id WHERE event.player_id IN (p_target_id,p_source_id) OR event.assist_player_id IN (p_target_id,p_source_id)
  ) affected;

  IF target_user IS NULL AND source_user IS NOT NULL THEN UPDATE public.account_profiles SET player_id = p_target_id, updated_at = now() WHERE user_id = source_user; END IF;
  INSERT INTO public.league_members (league_id, player_id, role, is_active, joined_at)
  SELECT league_id, p_target_id, role, is_active, joined_at FROM public.league_members WHERE player_id=p_source_id
  ON CONFLICT (league_id,player_id) DO UPDATE SET role=CASE WHEN public.league_members.role='admin' OR EXCLUDED.role='admin' THEN 'admin' ELSE 'player' END, is_active=public.league_members.is_active OR EXCLUDED.is_active, joined_at=least(public.league_members.joined_at,EXCLUDED.joined_at);
  DELETE FROM public.league_members WHERE player_id=p_source_id;

  DELETE FROM public.round_players source_entry WHERE source_entry.player_id=p_source_id AND EXISTS (SELECT 1 FROM public.round_players target_entry WHERE target_entry.round_id=source_entry.round_id AND target_entry.player_id=p_target_id);
  UPDATE public.round_players SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.team_players source_entry USING public.teams source_team WHERE source_entry.team_id=source_team.id AND source_entry.player_id=p_source_id AND EXISTS (SELECT 1 FROM public.team_players target_entry JOIN public.teams target_team ON target_team.id=target_entry.team_id WHERE target_team.round_id=source_team.round_id AND target_entry.player_id=p_target_id);
  UPDATE public.team_players SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.match_players source_entry WHERE source_entry.player_id=p_source_id AND EXISTS (SELECT 1 FROM public.match_players target_entry WHERE target_entry.match_id=source_entry.match_id AND target_entry.player_id=p_target_id);
  UPDATE public.match_players SET player_id=p_target_id WHERE player_id=p_source_id;
  UPDATE public.match_events SET player_id=p_target_id WHERE player_id=p_source_id;
  UPDATE public.match_events SET assist_player_id=p_target_id WHERE assist_player_id=p_source_id;
  UPDATE public.match_substitutions SET player_out_id=p_target_id WHERE player_out_id=p_source_id;
  UPDATE public.match_substitutions SET player_in_id=p_target_id WHERE player_in_id=p_source_id;
  UPDATE public.rounds SET best_goalkeeper_player_id=p_target_id WHERE best_goalkeeper_player_id=p_source_id;
  UPDATE public.teams SET captain_player_id=p_target_id WHERE captain_player_id=p_source_id;

  DELETE FROM public.round_payments source_entry WHERE source_entry.player_id=p_source_id AND EXISTS (SELECT 1 FROM public.round_payments target_entry WHERE target_entry.round_id=source_entry.round_id AND target_entry.player_id=p_target_id);
  UPDATE public.round_payments SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.player_round_fitness source_entry WHERE source_entry.player_id=p_source_id AND EXISTS (SELECT 1 FROM public.player_round_fitness target_entry WHERE target_entry.round_id=source_entry.round_id AND target_entry.player_id=p_target_id);
  UPDATE public.player_round_fitness SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.callup_entries source_entry WHERE source_entry.player_id=p_source_id AND EXISTS (SELECT 1 FROM public.callup_entries target_entry WHERE target_entry.callup_id=source_entry.callup_id AND target_entry.player_id=p_target_id);
  UPDATE public.callup_entries SET player_id=p_target_id WHERE player_id=p_source_id;
  UPDATE public.round_payment_audit SET target_player_id=p_target_id WHERE target_player_id=p_source_id;
  UPDATE public.round_payment_audit SET changed_by_player_id=p_target_id WHERE changed_by_player_id=p_source_id;

  DELETE FROM public.fantasy_lineup_players source_entry WHERE source_entry.player_id=p_source_id AND EXISTS (SELECT 1 FROM public.fantasy_lineup_players target_entry WHERE target_entry.lineup_id=source_entry.lineup_id AND target_entry.player_id=p_target_id);
  UPDATE public.fantasy_lineup_players SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.fantasy_test_lineup_players source_entry WHERE source_entry.player_id=p_source_id AND EXISTS (SELECT 1 FROM public.fantasy_test_lineup_players target_entry WHERE target_entry.lineup_id=source_entry.lineup_id AND target_entry.player_id=p_target_id);
  UPDATE public.fantasy_test_lineup_players SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.fantasy_portfolio_players source_entry WHERE source_entry.player_id=p_source_id AND EXISTS (SELECT 1 FROM public.fantasy_portfolio_players target_entry WHERE target_entry.portfolio_id=source_entry.portfolio_id AND target_entry.player_id=p_target_id);
  UPDATE public.fantasy_portfolio_players SET player_id=p_target_id WHERE player_id=p_source_id;
  UPDATE public.fantasy_lineups SET captain_player_id=p_target_id WHERE captain_player_id=p_source_id;
  UPDATE public.fantasy_lineups SET top_scorer_player_id=p_target_id WHERE top_scorer_player_id=p_source_id;
  UPDATE public.fantasy_lineups SET top_assist_player_id=p_target_id WHERE top_assist_player_id=p_source_id;
  UPDATE public.fantasy_lineups SET challenge_player_id=p_target_id WHERE challenge_player_id=p_source_id;
  UPDATE public.fantasy_test_lineups SET captain_player_id=p_target_id WHERE captain_player_id=p_source_id;
  UPDATE public.fantasy_test_lineups SET top_scorer_player_id=p_target_id WHERE top_scorer_player_id=p_source_id;
  UPDATE public.fantasy_test_lineups SET top_assist_player_id=p_target_id WHERE top_assist_player_id=p_source_id;
  UPDATE public.fantasy_test_lineups SET challenge_player_id=p_target_id WHERE challenge_player_id=p_source_id;
  UPDATE public.fantasy_portfolios SET captain_player_id=p_target_id WHERE captain_player_id=p_source_id;
  DELETE FROM public.fantasy_player_price_history source_entry WHERE source_entry.player_id=p_source_id AND EXISTS (SELECT 1 FROM public.fantasy_player_price_history target_entry WHERE target_entry.fantasy_round_id=source_entry.fantasy_round_id AND target_entry.player_id=p_target_id);
  UPDATE public.fantasy_player_price_history SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.fantasy_player_prices source_entry WHERE source_entry.player_id=p_source_id AND EXISTS (SELECT 1 FROM public.fantasy_player_prices target_entry WHERE target_entry.fantasy_season_id=source_entry.fantasy_season_id AND target_entry.player_id=p_target_id);
  UPDATE public.fantasy_player_prices SET player_id=p_target_id WHERE player_id=p_source_id;

  DELETE FROM public.player_round_stats WHERE player_id IN (p_target_id,p_source_id) AND round_id=ANY(COALESCE(affected_rounds,ARRAY[]::UUID[]));
  UPDATE public.players SET
    name=COALESCE(NULLIF(target_player.name,''),source_player.name), nickname=COALESCE(target_player.nickname,source_player.nickname),
    avatar_url=COALESCE(target_player.avatar_url,source_player.avatar_url), profile_bio=COALESCE(target_player.profile_bio,source_player.profile_bio),
    player_profile=COALESCE(target_player.player_profile,source_player.player_profile,'midfield'), is_goalkeeper=target_player.is_goalkeeper OR source_player.is_goalkeeper,
    member_category=CASE WHEN target_player.member_category='player' OR source_player.member_category='player' THEN 'player' ELSE 'guest' END, is_selectable=true
  WHERE id=p_target_id;
  DELETE FROM public.players WHERE id=p_source_id;

  INSERT INTO public.sports_admin_audit (league_id, action, changed_by, payload)
  SELECT league_id, 'profiles_merged', auth.uid(), jsonb_build_object('target_player_id',p_target_id,'source_player_id',p_source_id,'affected_round_ids',COALESCE(affected_rounds,ARRAY[]::UUID[]))
  FROM public.leagues WHERE is_active=true ORDER BY created_at LIMIT 1;
  RETURN COALESCE(affected_rounds,ARRAY[]::UUID[]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.correct_finished_goal(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_round_player_identity(UUID,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_round_emergency_substitute(UUID,UUID,UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_selectable_player_profiles(UUID,UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.correct_finished_goal(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_round_player_identity(UUID,UUID,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_round_emergency_substitute(UUID,UUID,UUID,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_selectable_player_profiles(UUID,UUID) FROM PUBLIC, anon;
