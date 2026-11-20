BEGIN;

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.rounds
  ALTER COLUMN updated_at SET DEFAULT clock_timestamp();

CREATE OR REPLACE FUNCTION public.set_round_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rounds_set_updated_at ON public.rounds;
CREATE TRIGGER rounds_set_updated_at
  BEFORE UPDATE ON public.rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.set_round_updated_at();

NOTIFY pgrst, 'reload schema';
COMMIT;
