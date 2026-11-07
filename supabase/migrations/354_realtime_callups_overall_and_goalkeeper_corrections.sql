-- Mantem a lista da convocacao sincronizada, corrige a validacao dos
-- snapshots de OVR e permite ao ADM corrigir o goleiro de jogo encerrado.
BEGIN;

ALTER TABLE public.callup_entries REPLICA IDENTITY FULL;
ALTER TABLE public.callups REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'callup_entries'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.callup_entries;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'callups'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.callups;
  END IF;
END;
$$;

-- A versao anterior acessava NEW.round_id no mesmo ramo usado por
-- player_overall_snapshots, que possui last_round_id, nao round_id.
CREATE OR REPLACE FUNCTION public.validate_overall_league_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run_league_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'overall_calculation_runs' THEN
    IF TG_OP = 'UPDATE' AND NEW.league_id IS DISTINCT FROM OLD.league_id THEN
      RAISE EXCEPTION 'A pelada de uma execucao do OVR nao pode ser alterada.';
    END IF;
    IF NEW.source_through_round_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.rounds round_item
      WHERE round_item.id = NEW.source_through_round_id
        AND round_item.league_id = NEW.league_id
    ) THEN
      RAISE EXCEPTION 'Execucao do OVR aponta para rodada de outra pelada.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT run.league_id INTO run_league_id
  FROM public.overall_calculation_runs run
  WHERE run.id = NEW.calculation_run_id;

  IF run_league_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.league_members member
    WHERE member.league_id = run_league_id
      AND member.player_id = NEW.player_id
  ) THEN
    RAISE EXCEPTION 'Registro do OVR aponta para jogador fora da pelada.';
  END IF;

  IF TG_TABLE_NAME = 'player_overall_round_breakdowns' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.rounds round_item
      WHERE round_item.id = NEW.round_id
        AND round_item.league_id = run_league_id
    ) THEN
      RAISE EXCEPTION 'Auditoria do OVR aponta para rodada de outra pelada.';
    END IF;
  ELSIF TG_TABLE_NAME = 'player_overall_snapshots' THEN
    IF NEW.last_round_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.rounds round_item
      WHERE round_item.id = NEW.last_round_id
        AND round_item.league_id = run_league_id
    ) THEN
      RAISE EXCEPTION 'Snapshot do OVR aponta para rodada de outra pelada.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tabela de OVR nao suportada: %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_overall_league_reference()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.correct_finished_match_goalkeeper(
  p_match_id uuid,
  p_team_id uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_match public.matches%ROWTYPE;
  target_league_id uuid;
  final_elapsed integer;
BEGIN
  SELECT * INTO current_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND OR current_match.status <> 'finished' THEN
    RAISE EXCEPTION 'A correcao exige uma partida finalizada.';
  END IF;
  SELECT round_item.league_id INTO target_league_id
  FROM public.rounds round_item
  WHERE round_item.id = current_match.round_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF p_team_id NOT IN (current_match.team_a_id, current_match.team_b_id) THEN
    RAISE EXCEPTION 'Time fora desta partida.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.match_players participant
    WHERE participant.match_id = p_match_id
      AND participant.team_id = p_team_id
      AND participant.player_id = p_player_id
  ) THEN
    RAISE EXCEPTION 'O goleiro precisa ter participado por este time.';
  END IF;

  final_elapsed := GREATEST(
    0,
    COALESCE(current_match.eligibility_elapsed_offset_seconds, 0)
      + COALESCE(current_match.timer_accumulated_seconds, 0)
  );

  INSERT INTO public.match_goalkeepers (
    match_id, team_id, player_id, selected_by, selected_at
  ) VALUES (
    p_match_id, p_team_id, p_player_id, auth.uid(), clock_timestamp()
  )
  ON CONFLICT (match_id, team_id) DO UPDATE SET
    player_id = EXCLUDED.player_id,
    selected_by = EXCLUDED.selected_by,
    selected_at = EXCLUDED.selected_at;

  DELETE FROM public.match_goalkeeper_stints
  WHERE match_id = p_match_id AND team_id = p_team_id;
  INSERT INTO public.match_goalkeeper_stints (
    match_id, team_id, player_id, entered_elapsed_seconds,
    left_elapsed_seconds, selected_by, selected_at
  ) VALUES (
    p_match_id, p_team_id, p_player_id, 0,
    final_elapsed, auth.uid(), clock_timestamp()
  );

  IF p_team_id = current_match.team_a_id THEN
    UPDATE public.match_events
    SET goalkeeper_a_player_id = p_player_id
    WHERE match_id = p_match_id AND event_type = 'goal';
  ELSE
    UPDATE public.match_events
    SET goalkeeper_b_player_id = p_player_id
    WHERE match_id = p_match_id AND event_type = 'goal';
  END IF;

  RETURN jsonb_build_object(
    'match_id', p_match_id,
    'round_id', current_match.round_id,
    'team_id', p_team_id,
    'player_id', p_player_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.correct_finished_match_goalkeeper(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_finished_match_goalkeeper(uuid, uuid, uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
