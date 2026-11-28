-- Torna a posição secundária opcional na v15 (100% Fixo quando vazia,
-- 60/40 Dual quando preenchida), calibra a tabela posicional anti-exploit
-- e ajusta o peso do goleiro para a Pelada BQ.
BEGIN;

ALTER TABLE public.fantasy_settings
  ALTER COLUMN primary_position_weight SET DEFAULT 0.60,
  ALTER COLUMN secondary_position_weight SET DEFAULT 0.40,
  ALTER COLUMN position_scoring_rules SET DEFAULT '{
    "DEF":{"goal":3.5,"assist":2.5,"cleanSheet":4.25,"conceded":-0.95,"ownGoal":-3},
    "MEI":{"goal":4.5,"assist":4,"cleanSheet":1.5,"conceded":-0.6,"ownGoal":-3},
    "ALA":{"goal":4.75,"assist":3.25,"cleanSheet":2,"conceded":-0.75,"ownGoal":-3},
    "ATA":{"goal":5.5,"assist":2.5,"cleanSheet":0,"conceded":-0.25,"ownGoal":-3}
  }'::jsonb;

UPDATE public.fantasy_settings settings
SET primary_position_weight = 0.60,
    secondary_position_weight = 0.40,
    position_scoring_rules = '{
      "DEF":{"goal":3.5,"assist":2.5,"cleanSheet":4.25,"conceded":-0.95,"ownGoal":-3},
      "MEI":{"goal":4.5,"assist":4,"cleanSheet":1.5,"conceded":-0.6,"ownGoal":-3},
      "ALA":{"goal":4.75,"assist":3.25,"cleanSheet":2,"conceded":-0.75,"ownGoal":-3},
      "ATA":{"goal":5.5,"assist":2.5,"cleanSheet":0,"conceded":-0.25,"ownGoal":-3}
    }'::jsonb,
    goalkeeper_slot_appearance_points = 0.5,
    goalkeeper_slot_clean_sheet_points = 3,
    goalkeeper_slot_one_goal_points = 1,
    dual_position_scoring_enabled = true,
    scoring_version = 15,
    updated_at = now()
FROM public.leagues league
WHERE league.id = settings.league_id
  AND league.slug = 'liga-da-pelada';

SELECT set_config('app.allow_bq_snapshot_rewrite', 'on', true);
UPDATE public.rounds round_item
SET scoring_version = 15,
    scoring_snapshot = jsonb_build_object(
      'version', 15,
      'goal', COALESCE(settings.attacker_goal_points, 4),
      'assist', COALESCE(settings.attacker_assist_points, 2.5),
      'win', 0, 'draw', 0, 'loss', 0,
      'ownGoal', COALESCE(settings.own_goal_points, -3),
      'positionRules', settings.position_scoring_rules,
      'primaryWeight', settings.primary_position_weight,
      'secondaryWeight', settings.secondary_position_weight,
      'lineCleanSheetMinShare', settings.line_clean_sheet_min_share,
      'goalkeeperAppearance', COALESCE(settings.goalkeeper_slot_appearance_points, 0.5),
      'goalkeeperGoal', settings.goalkeeper_goal_points,
      'goalkeeperAssist', settings.goalkeeper_assist_points,
      'goalkeeperGoalConceded', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeperCleanSheet', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 3),
      'goalkeeperOneGoal', COALESCE(settings.goalkeeper_slot_one_goal_points, 1),
      'goalkeeperOwnGoal', settings.goalkeeper_own_goal_points
    )
FROM public.fantasy_settings settings, public.leagues league
WHERE settings.league_id = round_item.league_id
  AND league.id = round_item.league_id
  AND league.slug = 'liga-da-pelada'
  AND round_item.status = 'draft'
  AND round_item.round_type = 'official';
SELECT set_config('app.allow_bq_snapshot_rewrite', 'off', true);

UPDATE public.fantasy_rounds fantasy_round
SET scoring_version = 15,
    settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::jsonb) || jsonb_build_object(
      'scoring_version', 15, 'role_scoring_active', true,
      'goal_points', COALESCE(settings.attacker_goal_points, 4),
      'attacker_goal_points', COALESCE(settings.attacker_goal_points, 4),
      'attacker_assist_points', COALESCE(settings.attacker_assist_points, 2.5),
      'win_points', 0, 'draw_points', 0, 'loss_points', 0,
      'own_goal_points', COALESCE(settings.own_goal_points, -3),
      'position_scoring_rules', settings.position_scoring_rules,
      'primary_position_weight', settings.primary_position_weight,
      'secondary_position_weight', settings.secondary_position_weight,
      'line_clean_sheet_min_share', settings.line_clean_sheet_min_share,
      'goalkeeper_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 0.5),
      'goalkeeper_goal_points', settings.goalkeeper_goal_points,
      'goalkeeper_assist_points', settings.goalkeeper_assist_points,
      'goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeper_slot_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 0.5),
      'goalkeeper_slot_goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeper_slot_clean_sheet_points', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 3),
      'goalkeeper_slot_one_goal_points', COALESCE(settings.goalkeeper_slot_one_goal_points, 1),
      'goalkeeper_own_goal_points', settings.goalkeeper_own_goal_points,
      'captain_multiplier', COALESCE(settings.captain_multiplier, 1.5)
    )
FROM public.fantasy_seasons fantasy_season, public.fantasy_settings settings,
     public.rounds round_item, public.leagues league
WHERE fantasy_round.fantasy_season_id = fantasy_season.id
  AND settings.league_id = fantasy_season.league_id
  AND round_item.id = fantasy_round.round_id
  AND league.id = fantasy_season.league_id
  AND league.slug = 'liga-da-pelada'
  AND (round_item.status = 'draft' OR fantasy_round.market_status IN ('draft', 'open'));

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
       OR (membership.secondary_position IS NOT NULL
         AND membership.primary_position = membership.secondary_position)
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
      'reason', format('%s participante(s) precisam de posição primária válida antes do reprocessamento v15.', missing_count),
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
        OR (membership.secondary_position IS NOT NULL
          AND membership.primary_position = membership.secondary_position))
  ) invalid;
  IF missing_count > 0 THEN
    RAISE EXCEPTION '% participante(s) precisam de posicao primaria valida antes do reprocessamento v15.', missing_count;
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
    'goalkeeperAppearance', COALESCE(settings.goalkeeper_slot_appearance_points, 0.5),
    'goalkeeperGoal', settings.goalkeeper_goal_points,
    'goalkeeperAssist', settings.goalkeeper_assist_points,
    'goalkeeperGoalConceded', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
    'goalkeeperCleanSheet', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 3),
    'goalkeeperOneGoal', COALESCE(settings.goalkeeper_slot_one_goal_points, 1),
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
        'goalkeeper_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 0.5),
        'goalkeeper_goal_points', settings.goalkeeper_goal_points,
        'goalkeeper_assist_points', settings.goalkeeper_assist_points,
        'goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
        'goalkeeper_slot_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 0.5),
        'goalkeeper_slot_goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
        'goalkeeper_slot_clean_sheet_points', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 3),
        'goalkeeper_slot_one_goal_points', COALESCE(settings.goalkeeper_slot_one_goal_points, 1),
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

NOTIFY pgrst, 'reload schema';
COMMIT;
