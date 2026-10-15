-- Mercado, sorteio Draft e seus snapshots passam a consumir o perfil
-- competitivo do vinculo jogador-pelada criado na 291.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_fantasy_market_read_model(p_fantasy_season_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH target AS (
    SELECT fs.id, fs.season_id, fs.league_id FROM public.fantasy_seasons fs
    WHERE fs.id = p_fantasy_season_id AND public.is_league_member(fs.league_id)
  )
  SELECT jsonb_build_object(
    'prices', COALESCE((
      SELECT jsonb_agg(to_jsonb(price)) FROM public.fantasy_player_prices price
      JOIN target ON target.id = price.fantasy_season_id
    ), '[]'::jsonb),
    'stats', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'round_id', stats.round_id, 'player_id', stats.player_id,
        'goals', stats.goals, 'assists', stats.assists,
        'wins', stats.wins, 'draws', stats.draws, 'losses', stats.losses,
        'own_goals', stats.own_goals, 'games', stats.games,
        'goalkeeper_games', stats.goalkeeper_games,
        'goalkeeper_goals', stats.goalkeeper_goals,
        'goalkeeper_assists', stats.goalkeeper_assists,
        'goalkeeper_own_goals', stats.goalkeeper_own_goals,
        'goalkeeper_wins', stats.goalkeeper_wins,
        'goalkeeper_draws', stats.goalkeeper_draws,
        'goalkeeper_losses', stats.goalkeeper_losses,
        'goals_conceded', stats.goals_conceded,
        'clean_sheets', stats.clean_sheets,
        'defensive_clean_games', stats.defensive_clean_games,
        'defensive_one_goal_games', stats.defensive_one_goal_games,
        'team_goals_conceded', stats.team_goals_conceded,
        'ranking_points', stats.ranking_points
      ))
      FROM public.player_round_stats stats
      JOIN public.rounds round_item ON round_item.id = stats.round_id
        AND round_item.round_type = 'official'
      JOIN target ON target.season_id = round_item.season_id
        AND target.league_id = round_item.league_id
    ), '[]'::jsonb),
    'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', player.id, 'name', player.name,
        'avatar_url', player.avatar_url,
        'player_profile', member.player_profile,
        'overall_traits', member.overall_traits,
        'is_goalkeeper', player.is_goalkeeper,
        'member_category', player.member_category,
        'is_selectable', player.is_selectable,
        'is_competitive_profile_complete', true
      ) ORDER BY player.name)
      FROM target
      JOIN public.league_members member ON member.league_id = target.league_id
        AND member.is_active
      JOIN public.players player ON player.id = member.player_id
      WHERE player.member_category = 'player' AND player.is_selectable
        AND NULLIF(btrim(player.name), '') IS NOT NULL
        AND NULLIF(btrim(player.avatar_url), '') IS NOT NULL
        AND member.player_profile IN ('defensive','offensive')
        AND COALESCE(cardinality(member.overall_traits),0) BETWEEN 1 AND 2
    ), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(to_jsonb(history) ORDER BY history.created_at DESC)
      FROM public.fantasy_player_price_history history
      JOIN target ON target.id = history.fantasy_season_id
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.get_fantasy_market_read_model(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fantasy_market_read_model(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_latest_draft_overalls_for_league(p_league_id uuid)
RETURNS TABLE (player_id uuid, overall numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT ON (snapshot.player_id) snapshot.player_id, snapshot.overall
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  JOIN public.players player ON player.id = snapshot.player_id
  JOIN public.league_members member
    ON member.league_id = p_league_id AND member.player_id = snapshot.player_id
  WHERE run.league_id = p_league_id AND run.status = 'published'
    AND member.is_active
    AND player.member_category = 'player' AND player.is_selectable
    AND NULLIF(btrim(player.name), '') IS NOT NULL
    AND NULLIF(btrim(player.avatar_url), '') IS NOT NULL
    AND member.player_profile IN ('defensive','offensive')
    AND COALESCE(cardinality(member.overall_traits),0) BETWEEN 1 AND 2
  ORDER BY snapshot.player_id,
    CASE formula.key
      WHEN 'adaptive-v20-statistical-confidence' THEN 0
      WHEN 'adaptive-v19-admin-fixed-profile' THEN 1
      WHEN 'adaptive-v18-fluid-profile' THEN 2
      WHEN 'adaptive-v17-three-positions-column-c' THEN 3
      ELSE 4
    END,
    run.published_at DESC NULLS LAST, run.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_latest_draft_overalls_for_league(uuid)
  FROM PUBLIC, anon, authenticated;

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
    RAISE EXCEPTION 'Escolha tres capitaes diferentes.';
  END IF;

  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR selected_round.status <> 'draft'
    OR selected_round.preparation_stage <> 'prelist' THEN
    RAISE EXCEPTION 'A pre-rodada precisa estar pronta e ainda sem times.';
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
    ) THEN RAISE EXCEPTION 'Convocacao vinculada nao encontrada.'; END IF;
    SELECT array_agg(player_id) INTO source_player_ids
    FROM public.callup_entries
    WHERE callup_id = p_callup_id AND status = 'confirmed';
  ELSE
    SELECT array_agg(player_id) INTO source_player_ids
    FROM public.round_players WHERE round_id = p_round_id;
  END IF;

  IF COALESCE(cardinality(source_player_ids), 0) < 6 THEN
    RAISE EXCEPTION 'A lista nao possui jogadores suficientes para o Draft.';
  END IF;
  FOREACH captain_id IN ARRAY p_captain_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.players player
      JOIN public.league_members member ON member.player_id = player.id
        AND member.league_id = selected_round.league_id AND member.is_active
      JOIN public.player_season_stats stats ON stats.player_id = player.id
        AND stats.season_id = selected_round.season_id AND stats.round_type = 'official'
      WHERE player.id = captain_id AND player.id = ANY(source_player_ids)
        AND player.member_category = 'player' AND player.is_selectable = true
        AND stats.rounds_count >= 3
    ) THEN RAISE EXCEPTION 'Um dos capitaes nao possui tres rodadas oficiais nesta temporada.'; END IF;
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

  INSERT INTO public.team_draft_players
    (draft_id, player_id, overall_snapshot, speed_rating_snapshot, profile_snapshot)
  SELECT created_id, player.id, overall.overall, attributes.speed_rating, member.player_profile
  FROM public.players player
  JOIN public.league_members member ON member.player_id = player.id
    AND member.league_id = selected_round.league_id AND member.is_active
  LEFT JOIN public.player_admin_attributes attributes ON attributes.player_id = player.id
  LEFT JOIN public.get_latest_draft_overalls_for_league(selected_round.league_id) overall
    ON overall.player_id = player.id
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
REVOKE ALL ON FUNCTION public.create_team_draft(uuid,uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_draft(uuid,uuid,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_active_team_draft_from_callup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_callup uuid;
  removed_player uuid;
  target_draft uuid;
  target_league_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_callup := OLD.callup_id;
    removed_player := OLD.player_id;
  ELSE
    target_callup := NEW.callup_id;
    removed_player := CASE WHEN TG_OP = 'UPDATE' THEN OLD.player_id ELSE NEW.player_id END;
  END IF;
  SELECT draft.id, draft.league_id INTO target_draft, target_league_id
  FROM public.team_drafts draft
  WHERE draft.callup_id = target_callup
    AND draft.status IN ('setup', 'active', 'paused', 'completed') LIMIT 1;
  IF target_draft IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status <> 'confirmed') THEN
    IF EXISTS (SELECT 1 FROM public.team_draft_captains
      WHERE draft_id = target_draft AND captain_player_id = removed_player) THEN
      UPDATE public.team_drafts SET status = 'paused',
        pause_reason = 'Um capitao saiu da convocacao.', updated_at = now()
      WHERE id = target_draft;
    ELSE
      DELETE FROM public.team_draft_picks
      WHERE draft_id = target_draft AND player_id = removed_player;
      UPDATE public.team_draft_picks SET pick_number = pick_number + 1000
      WHERE draft_id = target_draft;
      WITH ordered AS (
        SELECT id, row_number() OVER (ORDER BY pick_number, created_at, id) AS next_number
        FROM public.team_draft_picks WHERE draft_id = target_draft
      )
      UPDATE public.team_draft_picks pick SET pick_number = ordered.next_number
      FROM ordered WHERE pick.id = ordered.id;
      UPDATE public.team_drafts
      SET status = CASE WHEN status = 'completed' THEN 'active' ELSE status END,
        current_pick = (SELECT count(*) + 1 FROM public.team_draft_picks
          WHERE draft_id = target_draft), updated_at = now()
      WHERE id = target_draft;
    END IF;
    DELETE FROM public.team_draft_players
    WHERE draft_id = target_draft AND player_id = removed_player;
  ELSIF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'confirmed' AND NEW.status = 'confirmed') THEN
    INSERT INTO public.team_draft_players
      (draft_id, player_id, overall_snapshot, speed_rating_snapshot, profile_snapshot)
    SELECT target_draft, NEW.player_id, overall.overall, attributes.speed_rating, member.player_profile
    FROM public.players player
    JOIN public.league_members member ON member.player_id = player.id
      AND member.league_id = target_league_id AND member.is_active
    LEFT JOIN public.player_admin_attributes attributes ON attributes.player_id = player.id
    LEFT JOIN public.get_latest_draft_overalls_for_league(target_league_id) overall
      ON overall.player_id = player.id
    WHERE player.id = NEW.player_id
    ON CONFLICT (draft_id, player_id) DO UPDATE SET
      overall_snapshot = EXCLUDED.overall_snapshot,
      speed_rating_snapshot = EXCLUDED.speed_rating_snapshot,
      profile_snapshot = EXCLUDED.profile_snapshot;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_active_team_draft_from_callup()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
