-- Cada execucao do OVR pertence a uma pelada. As cartas passam a ler apenas
-- a ultima execucao publicada daquela pelada, inclusive para usuarios que
-- participam de mais de uma liga.
BEGIN;

ALTER TABLE public.overall_calculation_runs
  ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE;

UPDATE public.overall_calculation_runs run
SET league_id = round_item.league_id
FROM public.rounds round_item
WHERE run.league_id IS NULL AND run.source_through_round_id = round_item.id;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.overall_calculation_runs WHERE league_id IS NULL)
    AND (SELECT count(*) FROM public.leagues) <> 1 THEN
    RAISE EXCEPTION 'Execucoes antigas do OVR sem rodada: escolha manualmente sua pelada antes da migration 287.';
  END IF;
END $$;

UPDATE public.overall_calculation_runs
SET league_id = (SELECT id FROM public.leagues LIMIT 1)
WHERE league_id IS NULL;

ALTER TABLE public.overall_calculation_runs ALTER COLUMN league_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS overall_calculation_runs_league_status_idx
  ON public.overall_calculation_runs (league_id, status, created_at DESC);
DROP INDEX IF EXISTS public.overall_calculation_runs_one_processing_per_formula_idx;
CREATE UNIQUE INDEX overall_calculation_runs_one_processing_per_formula_idx
  ON public.overall_calculation_runs (league_id, formula_version_id)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION public.validate_overall_league_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE run_league_id uuid;
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
  ELSE
    SELECT league_id INTO run_league_id FROM public.overall_calculation_runs
    WHERE id = NEW.calculation_run_id;
    IF run_league_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.league_members member
      WHERE member.league_id = run_league_id AND member.player_id = NEW.player_id
    ) THEN
      RAISE EXCEPTION 'Snapshot do OVR aponta para jogador fora da pelada.';
    END IF;
    IF TG_TABLE_NAME = 'player_overall_round_breakdowns' AND NOT EXISTS (
      SELECT 1 FROM public.rounds round_item
      WHERE round_item.id = NEW.round_id AND round_item.league_id = run_league_id
    ) THEN
      RAISE EXCEPTION 'Auditoria do OVR aponta para rodada de outra pelada.';
    END IF;
    IF TG_TABLE_NAME = 'player_overall_snapshots'
      AND NEW.last_round_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.rounds round_item
        WHERE round_item.id = NEW.last_round_id
          AND round_item.league_id = run_league_id
      ) THEN
      RAISE EXCEPTION 'Snapshot do OVR aponta para rodada de outra pelada.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS overall_runs_validate_league ON public.overall_calculation_runs;
CREATE TRIGGER overall_runs_validate_league
  BEFORE INSERT OR UPDATE OF league_id, source_through_round_id
  ON public.overall_calculation_runs FOR EACH ROW
  EXECUTE FUNCTION public.validate_overall_league_reference();
DROP TRIGGER IF EXISTS overall_snapshots_validate_league ON public.player_overall_snapshots;
CREATE TRIGGER overall_snapshots_validate_league
  BEFORE INSERT OR UPDATE OF calculation_run_id, player_id, last_round_id
  ON public.player_overall_snapshots FOR EACH ROW
  EXECUTE FUNCTION public.validate_overall_league_reference();
DROP TRIGGER IF EXISTS overall_breakdowns_validate_league ON public.player_overall_round_breakdowns;
CREATE TRIGGER overall_breakdowns_validate_league
  BEFORE INSERT OR UPDATE OF calculation_run_id, player_id, round_id
  ON public.player_overall_round_breakdowns FOR EACH ROW
  EXECUTE FUNCTION public.validate_overall_league_reference();
REVOKE ALL ON FUNCTION public.validate_overall_league_reference()
  FROM PUBLIC, anon, authenticated;

-- A publicacao v20 ainda dispara um reprocessamento global da Ranked.
-- Bloqueia-a quando houver outra pelada ativa ate essa cadeia ser isolada.
CREATE OR REPLACE FUNCTION public.block_cross_league_overall_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM NEW.status
    AND EXISTS (
      SELECT 1 FROM public.leagues league
      WHERE league.id <> NEW.league_id AND league.is_active
    ) THEN
    RAISE EXCEPTION 'Publicacao do OVR suspensa ate isolar o reprocessamento da Ranked por pelada.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS overall_runs_block_cross_league_publish
  ON public.overall_calculation_runs;
CREATE TRIGGER overall_runs_block_cross_league_publish
  BEFORE UPDATE OF status ON public.overall_calculation_runs
  FOR EACH ROW EXECUTE FUNCTION public.block_cross_league_overall_publish();
REVOKE ALL ON FUNCTION public.block_cross_league_overall_publish()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE item record; policy_item record;
BEGIN
  FOR item IN SELECT unnest(ARRAY[
    'overall_calculation_runs', 'player_overall_snapshots',
    'player_overall_round_breakdowns'
  ]) AS table_name LOOP
    FOR policy_item IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = item.table_name LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_item.policyname, item.table_name);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY overall_runs_league_read ON public.overall_calculation_runs
  FOR SELECT TO authenticated USING (public.is_league_member(league_id));
CREATE POLICY overall_runs_league_write ON public.overall_calculation_runs
  FOR ALL TO authenticated USING (public.is_league_admin(league_id))
  WITH CHECK (public.is_league_admin(league_id));
CREATE POLICY overall_snapshots_league_read ON public.player_overall_snapshots
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.overall_calculation_runs run
    WHERE run.id = calculation_run_id AND public.is_league_member(run.league_id)
  ));
CREATE POLICY overall_snapshots_league_write ON public.player_overall_snapshots
  FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM public.overall_calculation_runs run
    WHERE run.id = calculation_run_id AND public.is_league_admin(run.league_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.overall_calculation_runs run
    WHERE run.id = calculation_run_id AND public.is_league_admin(run.league_id)
  ));
CREATE POLICY overall_breakdowns_league_read ON public.player_overall_round_breakdowns
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.overall_calculation_runs run
    WHERE run.id = calculation_run_id AND public.is_league_member(run.league_id)
  ));
CREATE POLICY overall_breakdowns_league_write ON public.player_overall_round_breakdowns
  FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM public.overall_calculation_runs run
    WHERE run.id = calculation_run_id AND public.is_league_admin(run.league_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.overall_calculation_runs run
    WHERE run.id = calculation_run_id AND public.is_league_admin(run.league_id)
  ));

CREATE OR REPLACE FUNCTION public.get_latest_player_card_overalls_for_league(p_league_id uuid)
RETURNS TABLE (
  player_id uuid, overall numeric, trend text, def_overall numeric,
  ala_mei_overall numeric, ata_overall numeric, gol_overall numeric,
  goalkeeper_rounds integer, goalkeeper_games integer, rounds_played integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT ON (snapshot.player_id)
    snapshot.player_id, snapshot.overall,
    COALESCE(snapshot.data_quality->>'overall_trend','steady'),
    snapshot.def_overall, snapshot.ata_overall, snapshot.ata_overall,
    snapshot.gol_overall, snapshot.goalkeeper_rounds,
    snapshot.goalkeeper_games, snapshot.rounds_played
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  JOIN public.players player ON player.id = snapshot.player_id
  JOIN public.league_members member
    ON member.league_id = p_league_id AND member.player_id = snapshot.player_id
  WHERE public.is_league_member(p_league_id)
    AND run.league_id = p_league_id AND run.status = 'published'
    AND player.is_competitive_profile_complete = true
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
REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls_for_league(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_latest_player_card_overalls_for_league(uuid)
  TO authenticated;

-- O RPC sem escopo ainda e chamado por funcoes legadas do Draft. Nao pode
-- ficar disponivel como endpoint direto enquanto esses leitores sao migrados.
REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
