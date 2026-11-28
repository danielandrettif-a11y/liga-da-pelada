BEGIN;

-- A prévia continua sem alterar dados, valida administração global + da pelada,
-- bloqueia o reprocessamento v15 quando algum participante histórico não possui
-- o par de posições primária/secundária e expõe as limitações reais do histórico.
CREATE OR REPLACE FUNCTION public.preview_reprocess_season(p_league_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_fantasy_season_id uuid;
  v_season_id uuid;
  rounds jsonb;
  accounts jsonb;
  missing_positions jsonb;
  limitations jsonb;
  rounds_count integer;
  lineups_count integer;
  missing_count integer;
  untimed_goal_rounds integer;
  legacy_gk_matches integer;
  legacy_fantasy_rounds integer;
  no_slot_fantasy_rounds integer;
BEGIN
  IF NOT public.is_app_admin() OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente administradores desta pelada podem consultar o reprocessamento.';
  END IF;

  SELECT fantasy_season.id, fantasy_season.season_id
    INTO v_fantasy_season_id, v_season_id
  FROM public.fantasy_seasons fantasy_season
  JOIN public.seasons season ON season.id = fantasy_season.season_id
  WHERE fantasy_season.league_id = p_league_id
    AND season.status = 'active'
  ORDER BY fantasy_season.created_at DESC
  LIMIT 1;

  IF v_fantasy_season_id IS NULL THEN
    RETURN jsonb_build_object('can_reprocess', false, 'reason', 'Nenhuma temporada ativa encontrada.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rounds
    WHERE league_id = p_league_id AND status IN ('active', 'live', 'in_progress')
  ) OR EXISTS (
    SELECT 1 FROM public.fantasy_rounds
    WHERE fantasy_season_id = v_fantasy_season_id AND market_status = 'in_progress'
  ) THEN
    RETURN jsonb_build_object(
      'can_reprocess', false,
      'reason', 'Existe rodada ativa ou mercado em andamento. Finalize antes de reprocessar.'
    );
  END IF;

  SELECT count(DISTINCT round_item.id)::integer
    INTO untimed_goal_rounds
  FROM public.rounds round_item
  JOIN public.matches match_item ON match_item.round_id = round_item.id AND match_item.status = 'finished'
  JOIN public.match_events event_item ON event_item.match_id = match_item.id AND event_item.event_type = 'goal'
  WHERE round_item.season_id = v_season_id
    AND round_item.league_id = p_league_id
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished'
    AND event_item.elapsed_seconds IS NULL;

  SELECT count(*)::integer
    INTO legacy_gk_matches
  FROM public.matches match_item
  JOIN public.rounds round_item ON round_item.id = match_item.round_id
  WHERE round_item.season_id = v_season_id
    AND round_item.league_id = p_league_id
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished'
    AND match_item.status = 'finished'
    AND NOT EXISTS (
      SELECT 1 FROM public.match_goalkeeper_stints stint
      WHERE stint.match_id = match_item.id
    );

  SELECT count(*)::integer
    INTO legacy_fantasy_rounds
  FROM public.fantasy_rounds fantasy_round
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  WHERE fantasy_round.fantasy_season_id = v_fantasy_season_id
    AND round_item.status = 'finished'
    AND COALESCE(fantasy_round.scoring_version, 5) < 14;

  SELECT count(DISTINCT fantasy_round.id)::integer
    INTO no_slot_fantasy_rounds
  FROM public.fantasy_rounds fantasy_round
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  JOIN public.fantasy_lineups lineup ON lineup.fantasy_round_id = fantasy_round.id AND lineup.status = 'scored'
  JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
  WHERE fantasy_round.fantasy_season_id = v_fantasy_season_id
    AND round_item.status = 'finished'
    AND item.slot_role IS NULL;

  limitations := jsonb_build_object(
    'untimed_goal_rounds_count', untimed_goal_rounds,
    'legacy_goalkeeper_matches_count', legacy_gk_matches,
    'legacy_fantasy_rounds_count', legacy_fantasy_rounds,
    'no_slot_fantasy_rounds_count', no_slot_fantasy_rounds
  );

  WITH participants AS (
    SELECT DISTINCT round_player.player_id
    FROM public.round_players round_player
    JOIN public.rounds round_item ON round_item.id = round_player.round_id
    WHERE round_item.season_id = v_season_id
      AND round_item.league_id = p_league_id
      AND round_item.round_type = 'official'
      AND round_item.status = 'finished'
  ), invalid AS (
    SELECT participant.player_id, player.name,
           membership.primary_position, membership.secondary_position
    FROM participants participant
    JOIN public.players player ON player.id = participant.player_id
    LEFT JOIN public.league_members membership
      ON membership.league_id = p_league_id
     AND membership.player_id = participant.player_id
     AND membership.is_active = true
    WHERE membership.player_id IS NULL
       OR membership.primary_position IS NULL
       OR membership.secondary_position IS NULL
       OR membership.primary_position = membership.secondary_position
  )
  SELECT count(*)::integer,
         COALESCE(jsonb_agg(jsonb_build_object(
           'player_id', player_id,
           'name', name,
           'primary_position', primary_position,
           'secondary_position', secondary_position
         ) ORDER BY name), '[]'::jsonb)
    INTO missing_count, missing_positions
  FROM invalid;

  IF missing_count > 0 THEN
    RETURN jsonb_build_object(
      'can_reprocess', false,
      'reason', format('%s participante(s) precisam de posição primária e secundária antes do reprocessamento v15.', missing_count),
      'scoring_version', 15,
      'missing_positions_count', missing_count,
      'missing_positions', missing_positions,
      'historical_limitations', limitations
    );
  END IF;

  SELECT count(*)::integer INTO rounds_count
  FROM public.fantasy_rounds fantasy_round
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  WHERE fantasy_round.fantasy_season_id = v_fantasy_season_id
    AND round_item.status = 'finished';

  SELECT count(*)::integer INTO lineups_count
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  WHERE fantasy_round.fantasy_season_id = v_fantasy_season_id
    AND lineup.status = 'scored';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'round_id', round_item.id,
    'number', round_item.number,
    'date', round_item.date,
    'market_status', fantasy_round.market_status,
    'lineups_count', (SELECT count(*) FROM public.fantasy_lineups lineup WHERE lineup.fantasy_round_id = fantasy_round.id)
  ) ORDER BY round_item.date, round_item.number), '[]'::jsonb)
    INTO rounds
  FROM public.fantasy_rounds fantasy_round
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  WHERE fantasy_round.fantasy_season_id = v_fantasy_season_id
    AND round_item.status = 'finished';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', account.user_id,
    'current_budget', account.current_budget,
    'total_points', account.total_points,
    'rounds_played', account.rounds_played
  ) ORDER BY account.total_points DESC), '[]'::jsonb)
    INTO accounts
  FROM public.fantasy_accounts account
  WHERE account.fantasy_season_id = v_fantasy_season_id;

  RETURN jsonb_build_object(
    'can_reprocess', true,
    'scoring_version', 15,
    'season_id', v_fantasy_season_id,
    'rounds_count', rounds_count,
    'lineups_count', lineups_count,
    'rounds', rounds,
    'accounts', accounts,
    'historical_limitations', limitations
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_reprocess_season(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_reprocess_season(uuid) TO authenticated, service_role;

-- Prepara snapshots e posições congeladas dentro da transação privilegiada do
-- backend TypeScript. Bloqueada para PostgREST (authenticator / authenticated)
-- e protegida por advisory lock + row locks para impedir concorrência.
CREATE OR REPLACE FUNCTION public.prepare_reprocess_active_season_v15(p_league_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_fantasy_season_id uuid;
  v_season_id uuid;
  v_first_round_id uuid;
  v_round_ids jsonb;
  rounds_count integer;
  lineups_count integer;
  missing_count integer;
  settings public.fantasy_settings%ROWTYPE;
  snapshot jsonb;
BEGIN
  IF session_user = 'authenticator'
     OR COALESCE(current_setting('role', true), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Operacao restrita a fronteira transacional privilegiada do backend.';
  END IF;

  IF NOT public.is_app_admin() OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente administradores desta pelada podem reprocessar a temporada.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('reprocess_season_v15'), hashtext(p_league_id::text));

  SELECT fantasy_season.id, fantasy_season.season_id
    INTO v_fantasy_season_id, v_season_id
  FROM public.fantasy_seasons fantasy_season
  JOIN public.seasons season ON season.id = fantasy_season.season_id
  WHERE fantasy_season.league_id = p_league_id
    AND season.status = 'active'
  ORDER BY fantasy_season.created_at DESC
  LIMIT 1
  FOR UPDATE OF fantasy_season, season;

  IF v_fantasy_season_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma temporada ativa encontrada.';
  END IF;

  PERFORM 1 FROM public.rounds
  WHERE league_id = p_league_id AND season_id = v_season_id
  FOR UPDATE;

  PERFORM 1 FROM public.fantasy_rounds
  WHERE fantasy_season_id = v_fantasy_season_id
  FOR UPDATE;

  PERFORM 1 FROM public.league_members
  WHERE league_id = p_league_id AND is_active = true
  FOR SHARE;

  IF EXISTS (
    SELECT 1 FROM public.rounds
    WHERE league_id = p_league_id AND status IN ('active', 'live', 'in_progress')
  ) OR EXISTS (
    SELECT 1 FROM public.fantasy_rounds
    WHERE fantasy_season_id = v_fantasy_season_id AND market_status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'Nao e possivel reprocessar enquanto existe rodada ativa ou mercado em andamento.';
  END IF;

  SELECT * INTO settings
  FROM public.fantasy_settings
  WHERE league_id = p_league_id
  FOR SHARE;
  IF settings.league_id IS NULL OR NOT COALESCE(settings.dual_position_scoring_enabled, false) THEN
    RAISE EXCEPTION 'As regras de pontuacao dual v15 nao estao ativas nesta liga.';
  END IF;

  SELECT count(*)::integer INTO missing_count
  FROM (
    SELECT DISTINCT round_player.player_id
    FROM public.round_players round_player
    JOIN public.rounds round_item ON round_item.id = round_player.round_id
    LEFT JOIN public.league_members membership
      ON membership.league_id = p_league_id
     AND membership.player_id = round_player.player_id
     AND membership.is_active = true
    WHERE round_item.season_id = v_season_id
      AND round_item.league_id = p_league_id
      AND round_item.round_type = 'official'
      AND round_item.status = 'finished'
      AND (membership.player_id IS NULL
        OR membership.primary_position IS NULL
        OR membership.secondary_position IS NULL
        OR membership.primary_position = membership.secondary_position)
  ) invalid;
  IF missing_count > 0 THEN
    RAISE EXCEPTION '% participante(s) precisam de duas posicoes validas antes do reprocessamento v15.', missing_count;
  END IF;

  snapshot := jsonb_build_object(
    'version', 15,
    'goal', COALESCE(settings.attacker_goal_points, 4),
    'assist', COALESCE(settings.attacker_assist_points, 2.5),
    'win', 0, 'draw', 0, 'loss', 0,
    'ownGoal', COALESCE(settings.own_goal_points, -3),
    'positionRules', settings.position_scoring_rules,
    'primaryWeight', settings.primary_position_weight,
    'secondaryWeight', settings.secondary_position_weight,
    'lineCleanSheetMinShare', settings.line_clean_sheet_min_share,
    'goalkeeperAppearance', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
    'goalkeeperGoal', settings.goalkeeper_goal_points,
    'goalkeeperAssist', settings.goalkeeper_assist_points,
    'goalkeeperGoalConceded', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
    'goalkeeperCleanSheet', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 4),
    'goalkeeperOneGoal', COALESCE(settings.goalkeeper_slot_one_goal_points, 2),
    'goalkeeperOwnGoal', settings.goalkeeper_own_goal_points
  );

  PERFORM set_config('app.allow_bq_snapshot_rewrite', 'on', true);
  UPDATE public.rounds round_item
  SET scoring_version = 15,
      scoring_snapshot = snapshot
  WHERE round_item.season_id = v_season_id
    AND round_item.league_id = p_league_id
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished';
  PERFORM set_config('app.allow_bq_snapshot_rewrite', 'off', true);

  UPDATE public.round_players round_player
  SET primary_position_locked = membership.primary_position,
      secondary_position_locked = membership.secondary_position
  FROM public.rounds round_item, public.league_members membership
  WHERE round_item.id = round_player.round_id
    AND membership.league_id = p_league_id
    AND membership.player_id = round_player.player_id
    AND membership.is_active = true
    AND round_item.season_id = v_season_id
    AND round_item.league_id = p_league_id
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished';

  UPDATE public.player_round_stats stats
  SET primary_position_locked = round_player.primary_position_locked,
      secondary_position_locked = round_player.secondary_position_locked
  FROM public.round_players round_player, public.rounds round_item
  WHERE round_player.round_id = stats.round_id
    AND round_player.player_id = stats.player_id
    AND round_item.id = stats.round_id
    AND round_item.season_id = v_season_id
    AND round_item.league_id = p_league_id
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished';

  UPDATE public.fantasy_rounds fantasy_round
  SET scoring_version = 15,
      settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::jsonb) || jsonb_build_object(
        'scoring_version', 15,
        'role_scoring_active', true,
        'position_scoring_rules', settings.position_scoring_rules,
        'primary_position_weight', settings.primary_position_weight,
        'secondary_position_weight', settings.secondary_position_weight,
        'line_clean_sheet_min_share', settings.line_clean_sheet_min_share,
        'goalkeeper_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
        'goalkeeper_goal_points', settings.goalkeeper_goal_points,
        'goalkeeper_assist_points', settings.goalkeeper_assist_points,
        'goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
        'goalkeeper_slot_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
        'goalkeeper_slot_goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
        'goalkeeper_slot_clean_sheet_points', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 4),
        'goalkeeper_slot_one_goal_points', COALESCE(settings.goalkeeper_slot_one_goal_points, 2),
        'goalkeeper_own_goal_points', settings.goalkeeper_own_goal_points
      )
  FROM public.rounds round_item
  WHERE round_item.id = fantasy_round.round_id
    AND fantasy_round.fantasy_season_id = v_fantasy_season_id
    AND round_item.status = 'finished';

  SELECT COALESCE(jsonb_agg(round_item.id ORDER BY round_item.date, round_item.number), '[]'::jsonb),
         count(*)::integer
    INTO v_round_ids, rounds_count
  FROM public.rounds round_item
  WHERE round_item.season_id = v_season_id
    AND round_item.league_id = p_league_id
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished';

  SELECT round_item.id INTO v_first_round_id
  FROM public.fantasy_rounds fantasy_round
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  WHERE fantasy_round.fantasy_season_id = v_fantasy_season_id
    AND round_item.status = 'finished'
  ORDER BY round_item.date, round_item.number
  LIMIT 1;

  SELECT count(*)::integer INTO lineups_count
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  WHERE fantasy_round.fantasy_season_id = v_fantasy_season_id
    AND lineup.status = 'scored';

  RETURN jsonb_build_object(
    'success', true,
    'scoring_version', 15,
    'season_id', v_fantasy_season_id,
    'round_ids', v_round_ids,
    'first_round_id', v_first_round_id,
    'rounds_count', rounds_count,
    'lineups_count', lineups_count
  );
END;
$$;

-- Nunca expor ao PostgREST (PUBLIC, anon, authenticated, authenticator).
-- Um papel dedicado sem login e sem acesso direto a tabelas autoriza apenas a
-- preparação e o fechamento auditado na mesma transação do backend.
CREATE OR REPLACE FUNCTION public.finalize_reprocess_active_season_v15(
  p_league_id uuid,
  p_season_id uuid,
  p_round_ids uuid[],
  p_rounds_count integer,
  p_lineups_count integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_mismatches integer := 0;
BEGIN
  IF session_user = 'authenticator'
     OR COALESCE(current_setting('role', true), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Operacao restrita a fronteira transacional privilegiada do backend.';
  END IF;

  IF NOT public.is_app_admin() OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente administradores desta pelada podem concluir o reprocessamento.';
  END IF;

  IF COALESCE(array_length(p_round_ids, 1), 0) > 0 THEN
    SELECT count(*)::integer INTO v_mismatches
    FROM unnest(p_round_ids) AS r_id
    CROSS JOIN LATERAL public.audit_fantasy_scoring_integrity(r_id);

    IF v_mismatches > 0 THEN
      RAISE EXCEPTION 'Divergência detectada na auditoria do Cartola pós-reprocessamento (% inconsistência(s)); transação revertida.', v_mismatches;
    END IF;
  END IF;

  INSERT INTO public.fantasy_audit_log (league_id, user_id, action, payload)
  VALUES (
    p_league_id,
    auth.uid(),
    'season_reprocessed_dual_positions_v15',
    jsonb_build_object(
      'season_id', p_season_id,
      'rounds_reprocessed', p_rounds_count,
      'lineups_reprocessed', p_lineups_count,
      'scoring_version', 15
    )
  );
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reprocess_executor') THEN
    CREATE ROLE reprocess_executor NOLOGIN NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO reprocess_executor;
REVOKE ALL ON FUNCTION
  public.prepare_reprocess_active_season_v15(uuid),
  public.finalize_reprocess_active_season_v15(uuid, uuid, uuid[], integer, integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.prepare_reprocess_active_season_v15(uuid),
  public.finalize_reprocess_active_season_v15(uuid, uuid, uuid[], integer, integer),
  public.is_app_admin(),
  public.is_league_admin(uuid)
TO reprocess_executor, service_role;

GRANT reprocess_executor TO service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT reprocess_executor TO postgres;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'liga_backend') THEN
    GRANT reprocess_executor TO liga_backend;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
