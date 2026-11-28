-- Preserva as escalacoes antes de excluir uma rodada e permite restaurá-las
-- numa rodada substituta da mesma pelada e temporada.
BEGIN;

CREATE TABLE IF NOT EXISTS public.fantasy_deleted_round_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL,
  original_round_id uuid NOT NULL UNIQUE,
  original_fantasy_round_id uuid NOT NULL,
  fantasy_season_id uuid NOT NULL,
  round_number integer NOT NULL,
  round_date date NOT NULL,
  round_data jsonb NOT NULL,
  fantasy_round_data jsonb NOT NULL,
  lineups jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_to_round_id uuid,
  restored_by uuid,
  restored_at timestamptz,
  CHECK (jsonb_typeof(lineups) = 'array')
);

CREATE INDEX IF NOT EXISTS fantasy_deleted_round_snapshots_league_created_idx
  ON public.fantasy_deleted_round_snapshots (league_id, created_at DESC);

ALTER TABLE public.fantasy_deleted_round_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fantasy_deleted_round_snapshots_admin_read
  ON public.fantasy_deleted_round_snapshots;
CREATE POLICY fantasy_deleted_round_snapshots_admin_read
  ON public.fantasy_deleted_round_snapshots
  FOR SELECT TO authenticated
  USING (public.is_league_admin(league_id));

REVOKE ALL ON TABLE public.fantasy_deleted_round_snapshots FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.fantasy_deleted_round_snapshots TO authenticated;

CREATE OR REPLACE FUNCTION public.snapshot_fantasy_round_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_fantasy_round public.fantasy_rounds%ROWTYPE;
  lineup_snapshot jsonb;
BEGIN
  SELECT * INTO target_fantasy_round
  FROM public.fantasy_rounds
  WHERE round_id = OLD.id;

  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'lineup', to_jsonb(lineup),
      'top_team_position', (
        SELECT team.position FROM public.teams team WHERE team.id = lineup.top_team_id
      ),
      'players', COALESCE((
        SELECT jsonb_agg(to_jsonb(item) ORDER BY item.slot_index NULLS LAST, item.created_at, item.id)
        FROM public.fantasy_lineup_players item
        WHERE item.lineup_id = lineup.id
      ), '[]'::jsonb),
      'reserves', COALESCE((
        SELECT jsonb_agg(to_jsonb(reserve) ORDER BY reserve.created_at, reserve.id)
        FROM public.fantasy_lineup_reserves reserve
        WHERE reserve.lineup_id = lineup.id
      ), '[]'::jsonb)
    ) ORDER BY lineup.created_at, lineup.id
  ), '[]'::jsonb)
  INTO lineup_snapshot
  FROM public.fantasy_lineups lineup
  WHERE lineup.fantasy_round_id = target_fantasy_round.id;

  INSERT INTO public.fantasy_deleted_round_snapshots (
    league_id,
    original_round_id,
    original_fantasy_round_id,
    fantasy_season_id,
    round_number,
    round_date,
    round_data,
    fantasy_round_data,
    lineups,
    created_by
  ) VALUES (
    OLD.league_id,
    OLD.id,
    target_fantasy_round.id,
    target_fantasy_round.fantasy_season_id,
    OLD.number,
    OLD.date,
    to_jsonb(OLD),
    to_jsonb(target_fantasy_round),
    lineup_snapshot,
    auth.uid()
  )
  ON CONFLICT (original_round_id) DO NOTHING;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_fantasy_round_before_delete()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rounds_snapshot_fantasy_before_delete ON public.rounds;
CREATE TRIGGER rounds_snapshot_fantasy_before_delete
BEFORE DELETE ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.snapshot_fantasy_round_before_delete();

CREATE OR REPLACE FUNCTION public.restore_deleted_fantasy_lineups(
  p_snapshot_id uuid,
  p_target_round_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_snapshot public.fantasy_deleted_round_snapshots%ROWTYPE;
  target_round public.rounds%ROWTYPE;
  target_fantasy_round public.fantasy_rounds%ROWTYPE;
  lineup_item jsonb;
  lineup_data jsonb;
  player_item jsonb;
  reserve_item jsonb;
  source_user_id uuid;
  new_lineup_id uuid;
  mapped_top_team_id uuid;
  expected_players integer;
  restored_count integer := 0;
  skipped_count integer := 0;
  invalid_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.';
  END IF;

  SELECT * INTO source_snapshot
  FROM public.fantasy_deleted_round_snapshots
  WHERE id = p_snapshot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot de escalacoes nao encontrado.';
  END IF;
  IF NOT public.is_league_admin(source_snapshot.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;

  SELECT * INTO target_round
  FROM public.rounds
  WHERE id = p_target_round_id
    AND league_id = source_snapshot.league_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rodada substituta nao encontrada na mesma pelada.';
  END IF;

  SELECT * INTO target_fantasy_round
  FROM public.fantasy_rounds
  WHERE round_id = target_round.id
  FOR UPDATE;

  IF NOT FOUND OR target_fantasy_round.fantasy_season_id <> source_snapshot.fantasy_season_id THEN
    RAISE EXCEPTION 'A rodada substituta precisa pertencer a mesma temporada do Cartola.';
  END IF;
  IF target_fantasy_round.market_status NOT IN ('open', 'in_progress') THEN
    RAISE EXCEPTION 'A rodada substituta ja foi processada e nao aceita restauracao.';
  END IF;

  expected_players := COALESCE(
    (target_fantasy_round.settings_snapshot->>'players_per_team')::integer,
    (source_snapshot.fantasy_round_data->'settings_snapshot'->>'players_per_team')::integer
  );

  FOR lineup_item IN SELECT value FROM jsonb_array_elements(source_snapshot.lineups)
  LOOP
    lineup_data := lineup_item->'lineup';
    source_user_id := NULLIF(lineup_data->>'user_id', '')::uuid;

    IF source_user_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM auth.users account WHERE account.id = source_user_id)
      OR (expected_players IS NOT NULL AND jsonb_array_length(lineup_item->'players') <> expected_players)
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(lineup_item->'players') player_json
        WHERE NOT EXISTS (
          SELECT 1 FROM public.players player
          WHERE player.id = (player_json->>'player_id')::uuid
        )
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(lineup_item->'reserves') reserve_json
        WHERE NOT EXISTS (
          SELECT 1 FROM public.players player
          WHERE player.id = (reserve_json->>'player_id')::uuid
        )
      )
    THEN
      invalid_count := invalid_count + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.fantasy_lineups current_lineup
      WHERE current_lineup.fantasy_round_id = target_fantasy_round.id
        AND current_lineup.user_id = source_user_id
    ) THEN
      skipped_count := skipped_count + 1;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      restored_count := restored_count + 1;
      CONTINUE;
    END IF;

    mapped_top_team_id := NULL;
    IF NULLIF(lineup_item->>'top_team_position', '') IS NOT NULL THEN
      SELECT team.id INTO mapped_top_team_id
      FROM public.teams team
      WHERE team.round_id = target_round.id
        AND team.position = (lineup_item->>'top_team_position')::integer
      LIMIT 1;
    END IF;

    new_lineup_id := gen_random_uuid();
    INSERT INTO public.fantasy_lineups (
      id, fantasy_round_id, user_id, status,
      captain_player_id, top_scorer_player_id, top_assist_player_id,
      top_team_id, challenge_player_id, challenge_snapshot, predictions_snapshot,
      budget_before, lineup_cost, cash_remaining,
      budget_after, player_points, prediction_points, total_points,
      round_position, locked_at, score_breakdown, saved_at, created_at, updated_at
    ) VALUES (
      new_lineup_id,
      target_fantasy_round.id,
      source_user_id,
      CASE WHEN target_fantasy_round.market_status = 'open' THEN 'draft' ELSE 'locked' END,
      NULLIF(lineup_data->>'captain_player_id', '')::uuid,
      NULLIF(lineup_data->>'top_scorer_player_id', '')::uuid,
      NULLIF(lineup_data->>'top_assist_player_id', '')::uuid,
      mapped_top_team_id,
      NULLIF(lineup_data->>'challenge_player_id', '')::uuid,
      COALESCE(lineup_data->'challenge_snapshot', '{}'::jsonb),
      COALESCE(lineup_data->'predictions_snapshot', '{}'::jsonb),
      COALESCE((lineup_data->>'budget_before')::numeric, 0),
      COALESCE((lineup_data->>'lineup_cost')::numeric, 0),
      COALESCE((lineup_data->>'cash_remaining')::numeric, 0),
      NULL, 0, 0, 0, NULL,
      CASE WHEN target_fantasy_round.market_status = 'open' THEN NULL ELSE now() END,
      '{}'::jsonb,
      COALESCE(NULLIF(lineup_data->>'saved_at', '')::timestamptz, now()),
      now(), now()
    );

    FOR player_item IN SELECT value FROM jsonb_array_elements(lineup_item->'players')
    LOOP
      INSERT INTO public.fantasy_lineup_players (
        lineup_id, player_id, price_locked,
        base_points, captain_bonus, total_points, price_after,
        player_name_locked, avatar_url_locked,
        slot_index, slot_role, player_profile_locked,
        is_position_correct, position_bonus, created_at
      ) VALUES (
        new_lineup_id,
        (player_item->>'player_id')::uuid,
        COALESCE((player_item->>'price_locked')::numeric, 0),
        0, 0, 0, NULL,
        NULLIF(player_item->>'player_name_locked', ''),
        NULLIF(player_item->>'avatar_url_locked', ''),
        NULLIF(player_item->>'slot_index', '')::integer,
        NULLIF(player_item->>'slot_role', ''),
        NULLIF(player_item->>'player_profile_locked', ''),
        COALESCE((player_item->>'is_position_correct')::boolean, false),
        0,
        now()
      );
    END LOOP;

    FOR reserve_item IN SELECT value FROM jsonb_array_elements(lineup_item->'reserves')
    LOOP
      INSERT INTO public.fantasy_lineup_reserves (
        lineup_id, player_id, slot_role, price_locked,
        price_after, base_points, applied, replaced_player_id,
        replaced_player_points, points_gain, captain_inherited,
        captain_bonus, player_name_locked, avatar_url_locked,
        created_at, updated_at
      ) VALUES (
        new_lineup_id,
        (reserve_item->>'player_id')::uuid,
        reserve_item->>'slot_role',
        COALESCE((reserve_item->>'price_locked')::numeric, 0),
        NULL, 0, false, NULL, NULL, 0, false, 0,
        NULLIF(reserve_item->>'player_name_locked', ''),
        NULLIF(reserve_item->>'avatar_url_locked', ''),
        now(), now()
      );
    END LOOP;

    restored_count := restored_count + 1;
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE public.fantasy_deleted_round_snapshots
    SET restored_to_round_id = target_round.id,
        restored_by = auth.uid(),
        restored_at = now()
    WHERE id = source_snapshot.id;

    INSERT INTO public.fantasy_audit_log (
      league_id, fantasy_round_id, user_id, action, payload
    ) VALUES (
      source_snapshot.league_id,
      target_fantasy_round.id,
      auth.uid(),
      'deleted_round_lineups_restored',
      jsonb_build_object(
        'snapshot_id', source_snapshot.id,
        'source_round_id', source_snapshot.original_round_id,
        'target_round_id', target_round.id,
        'restored', restored_count,
        'skipped', skipped_count,
        'invalid', invalid_count
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'source_round_id', source_snapshot.original_round_id,
    'target_round_id', target_round.id,
    'restored', restored_count,
    'skipped', skipped_count,
    'invalid', invalid_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_deleted_fantasy_lineups(uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_fantasy_lineups(uuid, uuid, boolean)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
