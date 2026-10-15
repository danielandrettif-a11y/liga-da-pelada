-- Impede novas convocações concorrentes para a mesma pelada e data.
-- Duplicatas legadas são preservadas: podem ser fechadas normalmente,
-- mas não servem de precedente para novas inserções ou mudança de data.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_callup_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'closed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('open', 'locked', 'converted')
      AND NEW.league_id = OLD.league_id
      AND NEW.date = OLD.date THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Serializa tentativas simultâneas para a mesma pelada/data.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.league_id::text || ':' || NEW.date::text, 0)
  );
  IF EXISTS (
    SELECT 1 FROM public.callups existing
    WHERE existing.league_id = NEW.league_id
      AND existing.date = NEW.date
      AND existing.status IN ('open', 'locked', 'converted')
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Já existe uma convocação nesta pelada para essa data. Escolha outro dia.'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS callups_prevent_duplicate_active_date ON public.callups;
CREATE TRIGGER callups_prevent_duplicate_active_date
BEFORE INSERT OR UPDATE OF date, league_id, status ON public.callups
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_active_callup_date();

REVOKE ALL ON FUNCTION public.prevent_duplicate_active_callup_date()
  FROM PUBLIC, anon, authenticated;
