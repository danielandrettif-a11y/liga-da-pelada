-- Repara bases que ficaram com o gatilho do Passe BQ associado a uma estrutura antiga.
-- Sem source_round_id, o fechamento da rodada falhava durante o processamento do Cartola.
BEGIN;

ALTER TABLE public.fantasy_season_pass_events
  ADD COLUMN IF NOT EXISTS source_round_id uuid
    REFERENCES public.rounds(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_season_pass_events_round_unique
  ON public.fantasy_season_pass_events (
    fantasy_season_id,
    user_id,
    source_round_id,
    event_type
  )
  WHERE source_round_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_fantasy_pass_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_league_id uuid;
  round_league_id uuid;
  reward_season_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'fantasy_season_pass_events' AND NEW.source_round_id IS NOT NULL THEN
    SELECT league_id
    INTO expected_league_id
    FROM public.fantasy_seasons
    WHERE id = NEW.fantasy_season_id;

    SELECT league_id
    INTO round_league_id
    FROM public.rounds
    WHERE id = NEW.source_round_id;

    IF expected_league_id IS NULL OR round_league_id IS DISTINCT FROM expected_league_id THEN
      RAISE EXCEPTION 'Evento do Passe referencia rodada de outra pelada';
    END IF;
  ELSIF TG_TABLE_NAME = 'fantasy_season_pass_shop_items' THEN
    SELECT fantasy_season_id
    INTO reward_season_id
    FROM public.fantasy_season_pass_rewards
    WHERE id = NEW.source_reward_id;

    IF reward_season_id IS NULL OR reward_season_id IS DISTINCT FROM NEW.fantasy_season_id THEN
      RAISE EXCEPTION 'Oferta do Passe referencia outra temporada';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Remove somente gatilhos que usam esta validacao e os recria nas duas
-- tabelas corretas. Assim uma associacao antiga nao volta a quebrar o Cartola.
DO $$
DECLARE
  trigger_item record;
BEGIN
  FOR trigger_item IN
    SELECT namespace_item.nspname AS schema_name, table_item.relname AS table_name, trigger_row.tgname
    FROM pg_trigger trigger_row
    JOIN pg_class table_item ON table_item.oid = trigger_row.tgrelid
    JOIN pg_namespace namespace_item ON namespace_item.oid = table_item.relnamespace
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgfoid = 'public.validate_fantasy_pass_links()'::regprocedure
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      trigger_item.tgname,
      trigger_item.schema_name,
      trigger_item.table_name
    );
  END LOOP;
END;
$$;

CREATE TRIGGER fantasy_pass_event_league_guard
  BEFORE INSERT OR UPDATE OF fantasy_season_id, source_round_id
  ON public.fantasy_season_pass_events
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_fantasy_pass_links();

CREATE TRIGGER fantasy_pass_shop_league_guard
  BEFORE INSERT OR UPDATE OF fantasy_season_id, source_reward_id
  ON public.fantasy_season_pass_shop_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_fantasy_pass_links();

NOTIFY pgrst, 'reload schema';
COMMIT;
