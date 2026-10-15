-- A uniao de perfis remove o jogador de origem globalmente. Ela so e segura
-- quando ambos pertencem exclusivamente a mesma pelada, e a autorizacao
-- precisa estar na RPC (nao apenas na Server Action).
BEGIN;

CREATE OR REPLACE FUNCTION public.merge_selectable_player_profiles(p_target_id uuid, p_source_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_player public.players%ROWTYPE;
  source_player public.players%ROWTYPE;
  target_user uuid;
  source_user uuid;
  merge_league_id uuid;
  affected_rounds uuid[];
BEGIN
  IF p_target_id IS NULL OR p_source_id IS NULL OR p_target_id = p_source_id THEN
    RAISE EXCEPTION 'Escolha dois perfis diferentes.';
  END IF;
  SELECT * INTO target_player FROM public.players WHERE id = p_target_id FOR UPDATE;
  SELECT * INTO source_player FROM public.players WHERE id = p_source_id FOR UPDATE;
  IF target_player.id IS NULL OR source_player.id IS NULL THEN RAISE EXCEPTION 'Perfil nao encontrado.'; END IF;

  SELECT league_id INTO merge_league_id FROM public.league_members
  WHERE player_id = p_target_id AND is_active LIMIT 1;
  IF merge_league_id IS NULL
    OR NOT public.is_league_admin(merge_league_id)
    -- A acao de recalculo posterior ainda usa o cliente de ADM global.
    -- Nao liberar um ADM apenas local para chamar a RPC diretamente antes
    -- de migrar essa etapa do fluxo.
    OR NOT public.is_app_admin()
    OR NOT EXISTS (SELECT 1 FROM public.league_members
                   WHERE league_id = merge_league_id AND player_id = p_source_id AND is_active)
    OR EXISTS (SELECT 1 FROM public.league_members
               WHERE player_id IN (p_target_id, p_source_id) AND league_id <> merge_league_id)
  THEN
    RAISE EXCEPTION 'A uniao exige ADM e dois perfis exclusivos da mesma pelada.';
  END IF;

  IF NOT target_player.is_selectable OR NOT source_player.is_selectable
    OR target_player.member_category NOT IN ('player', 'guest')
    OR source_player.member_category NOT IN ('player', 'guest') THEN
    RAISE EXCEPTION 'Somente jogadores e convidados selecionaveis podem ser unidos.';
  END IF;
  SELECT user_id INTO target_user FROM public.account_profiles WHERE player_id = p_target_id;
  SELECT user_id INTO source_user FROM public.account_profiles WHERE player_id = p_source_id;
  IF target_user IS NOT NULL AND source_user IS NOT NULL THEN
    RAISE EXCEPTION 'Os dois perfis possuem contas diferentes vinculadas.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_players WHERE player_id IN (p_target_id, p_source_id) AND is_active) THEN
    RAISE EXCEPTION 'Encerre a partida ativa antes de unir os perfis.';
  END IF;

  SELECT array_agg(DISTINCT round_id) INTO affected_rounds FROM (
    SELECT round_id FROM public.round_players WHERE player_id IN (p_target_id,p_source_id)
    UNION SELECT round_id FROM public.player_round_stats WHERE player_id IN (p_target_id,p_source_id)
    UNION SELECT match_item.round_id FROM public.match_events event
      JOIN public.matches match_item ON match_item.id=event.match_id
      WHERE event.player_id IN (p_target_id,p_source_id) OR event.assist_player_id IN (p_target_id,p_source_id)
    UNION SELECT match_item.round_id FROM public.match_goalkeepers gk
      JOIN public.matches match_item ON match_item.id=gk.match_id
      WHERE gk.player_id IN (p_target_id,p_source_id)
  ) affected;
  IF EXISTS (SELECT 1 FROM public.rounds
             WHERE id = ANY(COALESCE(affected_rounds, ARRAY[]::uuid[]))
               AND league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.callup_entries entry
               JOIN public.callups callup ON callup.id=entry.callup_id
               WHERE entry.player_id IN (p_target_id,p_source_id)
                 AND callup.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.callup_withdrawals withdrawal
               WHERE withdrawal.player_id IN (p_target_id,p_source_id)
                 AND withdrawal.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.team_players item
               JOIN public.teams team ON team.id=item.team_id
               JOIN public.rounds round_item ON round_item.id=team.round_id
               WHERE item.player_id IN (p_target_id,p_source_id)
                 AND round_item.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.round_payments payment
               JOIN public.rounds round_item ON round_item.id=payment.round_id
               WHERE payment.player_id IN (p_target_id,p_source_id)
                 AND round_item.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.player_round_fitness item
               JOIN public.rounds round_item ON round_item.id=item.round_id
               WHERE item.player_id IN (p_target_id,p_source_id)
                 AND round_item.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.player_round_stat_overrides item
               JOIN public.rounds round_item ON round_item.id=item.round_id
               WHERE item.player_id IN (p_target_id,p_source_id)
                 AND round_item.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.round_payment_audit item
               JOIN public.rounds round_item ON round_item.id=item.round_id
               WHERE (item.target_player_id IN (p_target_id,p_source_id)
                      OR item.changed_by_player_id IN (p_target_id,p_source_id))
                 AND round_item.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.match_players item
               JOIN public.matches match_item ON match_item.id=item.match_id
               JOIN public.rounds round_item ON round_item.id=match_item.round_id
               WHERE item.player_id IN (p_target_id,p_source_id)
                 AND round_item.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.match_substitutions item
               JOIN public.matches match_item ON match_item.id=item.match_id
               JOIN public.rounds round_item ON round_item.id=match_item.round_id
               WHERE (item.player_out_id IN (p_target_id,p_source_id)
                      OR item.player_in_id IN (p_target_id,p_source_id))
                 AND round_item.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.rounds round_item
               WHERE round_item.best_goalkeeper_player_id IN (p_target_id,p_source_id)
                 AND round_item.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.teams team
               JOIN public.rounds round_item ON round_item.id=team.round_id
               WHERE team.captain_player_id IN (p_target_id,p_source_id)
                 AND round_item.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.fantasy_player_prices price
               JOIN public.fantasy_seasons season ON season.id=price.fantasy_season_id
               WHERE price.player_id IN (p_target_id,p_source_id)
                 AND season.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.fantasy_player_price_history price
               JOIN public.fantasy_seasons season ON season.id=price.fantasy_season_id
               WHERE price.player_id IN (p_target_id,p_source_id)
                 AND season.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.fantasy_lineup_players item
               JOIN public.fantasy_lineups lineup ON lineup.id=item.lineup_id
               JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
               JOIN public.fantasy_seasons season ON season.id=fantasy_round.fantasy_season_id
               WHERE item.player_id IN (p_target_id,p_source_id)
                 AND season.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.fantasy_lineups lineup
               JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
               JOIN public.fantasy_seasons season ON season.id=fantasy_round.fantasy_season_id
               WHERE (lineup.captain_player_id IN (p_target_id,p_source_id)
                      OR lineup.top_scorer_player_id IN (p_target_id,p_source_id)
                      OR lineup.top_assist_player_id IN (p_target_id,p_source_id)
                      OR lineup.challenge_player_id IN (p_target_id,p_source_id))
                 AND season.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.fantasy_lineup_reserves item
               JOIN public.fantasy_lineups lineup ON lineup.id=item.lineup_id
               JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
               JOIN public.fantasy_seasons season ON season.id=fantasy_round.fantasy_season_id
               WHERE (item.player_id IN (p_target_id,p_source_id)
                      OR item.replaced_player_id IN (p_target_id,p_source_id))
                 AND season.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.fantasy_test_lineup_players item
               JOIN public.fantasy_test_lineups lineup ON lineup.id=item.lineup_id
               JOIN public.fantasy_test_sessions session_item ON session_item.id=lineup.test_session_id
               WHERE item.player_id IN (p_target_id,p_source_id)
                 AND session_item.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.fantasy_test_lineups lineup
               JOIN public.fantasy_test_sessions session_item ON session_item.id=lineup.test_session_id
               WHERE (lineup.captain_player_id IN (p_target_id,p_source_id)
                      OR lineup.top_scorer_player_id IN (p_target_id,p_source_id)
                      OR lineup.top_assist_player_id IN (p_target_id,p_source_id)
                      OR lineup.challenge_player_id IN (p_target_id,p_source_id))
                 AND session_item.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.fantasy_portfolio_players item
               JOIN public.fantasy_portfolios portfolio ON portfolio.id=item.portfolio_id
               JOIN public.fantasy_seasons season ON season.id=portfolio.fantasy_season_id
               WHERE item.player_id IN (p_target_id,p_source_id)
                 AND season.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.fantasy_portfolios portfolio
               JOIN public.fantasy_seasons season ON season.id=portfolio.fantasy_season_id
               WHERE portfolio.captain_player_id IN (p_target_id,p_source_id)
                 AND season.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.fantasy_player_profile_locks item
               JOIN public.fantasy_seasons season ON season.id=item.fantasy_season_id
               WHERE item.player_id IN (p_target_id,p_source_id)
                 AND season.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.team_draft_captains item
               JOIN public.team_drafts draft ON draft.id=item.draft_id
               WHERE item.captain_player_id IN (p_target_id,p_source_id)
                 AND draft.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.team_draft_picks item
               JOIN public.team_drafts draft ON draft.id=item.draft_id
               WHERE item.player_id IN (p_target_id,p_source_id)
                 AND draft.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.team_draft_players item
               JOIN public.team_drafts draft ON draft.id=item.draft_id
               WHERE item.player_id IN (p_target_id,p_source_id)
                 AND draft.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.collective_messages item
               JOIN public.callups callup ON callup.id=item.callup_id
               WHERE item.sender_player_id IN (p_target_id,p_source_id)
                 AND callup.league_id <> merge_league_id)
    OR EXISTS (SELECT 1 FROM public.callup_replacement_slots item
               JOIN public.callups callup ON callup.id=item.callup_id
               WHERE (item.vacated_player_id IN (p_target_id,p_source_id)
                      OR item.replacement_player_id IN (p_target_id,p_source_id))
                 AND callup.league_id <> merge_league_id)
  THEN
    RAISE EXCEPTION 'Um dos perfis possui historico em outra pelada; a uniao global foi bloqueada.';
  END IF;

  IF target_user IS NULL AND source_user IS NOT NULL THEN
    UPDATE public.account_profiles SET player_id=p_target_id, updated_at=now() WHERE user_id=source_user;
  END IF;
  INSERT INTO public.league_members (league_id, player_id, role, is_active, joined_at)
  SELECT league_id, p_target_id, role, is_active, joined_at
  FROM public.league_members WHERE player_id=p_source_id
  ON CONFLICT (league_id,player_id) DO UPDATE SET
    role=CASE WHEN public.league_members.role='admin' OR EXCLUDED.role='admin' THEN 'admin' ELSE 'player' END,
    is_active=public.league_members.is_active OR EXCLUDED.is_active,
    joined_at=least(public.league_members.joined_at,EXCLUDED.joined_at);
  DELETE FROM public.league_members WHERE player_id=p_source_id;

  DELETE FROM public.round_players source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.round_players target_entry
                WHERE target_entry.round_id=source_entry.round_id AND target_entry.player_id=p_target_id);
  UPDATE public.round_players SET player_id=p_target_id WHERE player_id=p_source_id;

  DELETE FROM public.team_players source_entry USING public.teams source_team
    WHERE source_entry.team_id=source_team.id AND source_entry.player_id=p_source_id
      AND EXISTS (SELECT 1 FROM public.team_players target_entry
        JOIN public.teams target_team ON target_team.id=target_entry.team_id
        WHERE target_team.round_id=source_team.round_id AND target_entry.player_id=p_target_id);
  UPDATE public.team_players SET player_id=p_target_id WHERE player_id=p_source_id;

  DELETE FROM public.match_players source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.match_players target_entry
                WHERE target_entry.match_id=source_entry.match_id AND target_entry.player_id=p_target_id);
  UPDATE public.match_players SET player_id=p_target_id WHERE player_id=p_source_id;

  DELETE FROM public.match_goalkeepers source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.match_goalkeepers target_entry
                WHERE target_entry.match_id=source_entry.match_id
                  AND target_entry.player_id=p_target_id);
  UPDATE public.match_goalkeepers SET player_id=p_target_id WHERE player_id=p_source_id;

  UPDATE public.match_events SET player_id=p_target_id WHERE player_id=p_source_id;
  UPDATE public.match_events SET assist_player_id=p_target_id WHERE assist_player_id=p_source_id;
  UPDATE public.match_substitutions SET player_out_id=p_target_id WHERE player_out_id=p_source_id;
  UPDATE public.match_substitutions SET player_in_id=p_target_id WHERE player_in_id=p_source_id;
  UPDATE public.rounds SET best_goalkeeper_player_id=p_target_id WHERE best_goalkeeper_player_id=p_source_id;
  UPDATE public.teams SET captain_player_id=p_target_id WHERE captain_player_id=p_source_id;

  DELETE FROM public.round_payments source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.round_payments target_entry
                WHERE target_entry.round_id=source_entry.round_id AND target_entry.player_id=p_target_id);
  UPDATE public.round_payments SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.player_round_fitness source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.player_round_fitness target_entry
                WHERE target_entry.round_id=source_entry.round_id AND target_entry.player_id=p_target_id);
  UPDATE public.player_round_fitness SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.callup_entries source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.callup_entries target_entry
                WHERE target_entry.callup_id=source_entry.callup_id AND target_entry.player_id=p_target_id);
  UPDATE public.callup_entries SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.callup_withdrawals source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.callup_withdrawals target_entry
                WHERE target_entry.callup_id=source_entry.callup_id AND target_entry.player_id=p_target_id);
  UPDATE public.callup_withdrawals SET player_id=p_target_id WHERE player_id=p_source_id;

  UPDATE public.round_payment_audit SET target_player_id=p_target_id WHERE target_player_id=p_source_id;
  UPDATE public.round_payment_audit SET changed_by_player_id=p_target_id WHERE changed_by_player_id=p_source_id;

  DELETE FROM public.fantasy_lineup_players source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.fantasy_lineup_players target_entry
                WHERE target_entry.lineup_id=source_entry.lineup_id AND target_entry.player_id=p_target_id);
  UPDATE public.fantasy_lineup_players SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.fantasy_test_lineup_players source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.fantasy_test_lineup_players target_entry
                WHERE target_entry.lineup_id=source_entry.lineup_id AND target_entry.player_id=p_target_id);
  UPDATE public.fantasy_test_lineup_players SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.fantasy_portfolio_players source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.fantasy_portfolio_players target_entry
                WHERE target_entry.portfolio_id=source_entry.portfolio_id AND target_entry.player_id=p_target_id);
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
  UPDATE public.fantasy_lineup_reserves SET player_id=p_target_id WHERE player_id=p_source_id;
  UPDATE public.fantasy_lineup_reserves SET replaced_player_id=p_target_id WHERE replaced_player_id=p_source_id;
  DELETE FROM public.fantasy_player_price_history source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.fantasy_player_price_history target_entry
                WHERE target_entry.fantasy_round_id=source_entry.fantasy_round_id AND target_entry.player_id=p_target_id);
  UPDATE public.fantasy_player_price_history SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.fantasy_player_prices source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.fantasy_player_prices target_entry
                WHERE target_entry.fantasy_season_id=source_entry.fantasy_season_id AND target_entry.player_id=p_target_id);
  UPDATE public.fantasy_player_prices SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.fantasy_player_profile_locks source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.fantasy_player_profile_locks target_entry
                WHERE target_entry.fantasy_season_id=source_entry.fantasy_season_id
                  AND target_entry.player_id=p_target_id);
  UPDATE public.fantasy_player_profile_locks SET player_id=p_target_id WHERE player_id=p_source_id;

  DELETE FROM public.team_draft_captains source_entry WHERE source_entry.captain_player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.team_draft_captains target_entry
                WHERE target_entry.draft_id=source_entry.draft_id AND target_entry.captain_player_id=p_target_id);
  UPDATE public.team_draft_captains SET captain_player_id=p_target_id WHERE captain_player_id=p_source_id;
  DELETE FROM public.team_draft_picks source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.team_draft_picks target_entry
                WHERE target_entry.draft_id=source_entry.draft_id AND target_entry.player_id=p_target_id);
  UPDATE public.team_draft_picks SET player_id=p_target_id WHERE player_id=p_source_id;
  DELETE FROM public.team_draft_players source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.team_draft_players target_entry
                WHERE target_entry.draft_id=source_entry.draft_id AND target_entry.player_id=p_target_id);
  UPDATE public.team_draft_players SET player_id=p_target_id WHERE player_id=p_source_id;
  UPDATE public.collective_messages SET sender_player_id=p_target_id WHERE sender_player_id=p_source_id;
  UPDATE public.callup_replacement_slots SET vacated_player_id=p_target_id WHERE vacated_player_id=p_source_id;
  UPDATE public.callup_replacement_slots SET replacement_player_id=p_target_id WHERE replacement_player_id=p_source_id;
  DELETE FROM public.player_round_stat_overrides source_entry WHERE source_entry.player_id=p_source_id
    AND EXISTS (SELECT 1 FROM public.player_round_stat_overrides target_entry
                WHERE target_entry.round_id=source_entry.round_id AND target_entry.player_id=p_target_id
                  AND target_entry.override_type=source_entry.override_type);
  UPDATE public.player_round_stat_overrides SET player_id=p_target_id WHERE player_id=p_source_id;

  DELETE FROM public.player_round_stats WHERE player_id IN (p_target_id,p_source_id)
    AND round_id=ANY(COALESCE(affected_rounds,ARRAY[]::uuid[]));
  UPDATE public.players SET
    name=COALESCE(NULLIF(target_player.name,''),source_player.name),
    nickname=COALESCE(target_player.nickname,source_player.nickname),
    avatar_url=COALESCE(target_player.avatar_url,source_player.avatar_url),
    profile_bio=COALESCE(target_player.profile_bio,source_player.profile_bio),
    player_profile=COALESCE(target_player.player_profile,source_player.player_profile,'midfield'),
    is_goalkeeper=target_player.is_goalkeeper OR source_player.is_goalkeeper,
    member_category=CASE WHEN target_player.member_category='player' OR source_player.member_category='player' THEN 'player' ELSE 'guest' END,
    is_selectable=true
  WHERE id=p_target_id;
  DELETE FROM public.players WHERE id=p_source_id;

  INSERT INTO public.sports_admin_audit (league_id, action, changed_by, payload)
  VALUES (merge_league_id, 'profiles_merged', auth.uid(),
    jsonb_build_object('target_player_id',p_target_id,'source_player_id',p_source_id,
      'affected_round_ids',COALESCE(affected_rounds,ARRAY[]::uuid[])));
  RETURN COALESCE(affected_rounds,ARRAY[]::uuid[]);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_selectable_player_profiles(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_selectable_player_profiles(uuid,uuid) TO authenticated;
COMMIT;
