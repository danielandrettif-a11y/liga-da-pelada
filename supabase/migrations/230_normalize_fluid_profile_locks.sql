-- Normaliza tags históricas antes que a publicação v18 as copie para as
-- travas de rodada. O modelo atual aceita somente DEF/VOL e ATA/ALA.

BEGIN;

SELECT set_config('app.allow_fluid_profile_update', 'on', true);

UPDATE public.player_overall_round_breakdowns breakdown
SET played_profile = CASE
  WHEN lower(btrim(breakdown.played_profile)) IN ('defensive','def','def/vol') THEN 'defensive'
  WHEN lower(btrim(breakdown.played_profile)) IN (
    'offensive','midfield','wing','ata','ala','ala/mei','ata/ala'
  ) THEN 'offensive'
  ELSE 'offensive'
END
FROM public.overall_calculation_runs run
JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
WHERE run.id = breakdown.calculation_run_id
  AND formula.key = 'adaptive-v18-fluid-profile'
  AND breakdown.played_profile IS NOT NULL;

UPDATE public.player_round_stats
SET player_profile_locked = CASE
  WHEN lower(btrim(player_profile_locked)) IN ('defensive','def','def/vol') THEN 'defensive'
  WHEN lower(btrim(player_profile_locked)) IN (
    'offensive','midfield','wing','ata','ala','ala/mei','ata/ala'
  ) THEN 'offensive'
  ELSE 'offensive'
END
WHERE player_profile_locked IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_fluid_profile_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.player_profile_locked IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.player_profile_locked := CASE
    WHEN lower(btrim(NEW.player_profile_locked)) IN ('defensive','def','def/vol') THEN 'defensive'
    WHEN lower(btrim(NEW.player_profile_locked)) IN (
      'offensive','midfield','wing','ata','ala','ala/mei','ata/ala'
    ) THEN 'offensive'
    ELSE 'offensive'
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_fluid_profile_lock ON public.round_players;
CREATE TRIGGER normalize_fluid_profile_lock
BEFORE INSERT OR UPDATE OF player_profile_locked ON public.round_players
FOR EACH ROW EXECUTE FUNCTION public.normalize_fluid_profile_lock();

DROP TRIGGER IF EXISTS normalize_fluid_profile_lock ON public.player_round_stats;
CREATE TRIGGER normalize_fluid_profile_lock
BEFORE INSERT OR UPDATE OF player_profile_locked ON public.player_round_stats
FOR EACH ROW EXECUTE FUNCTION public.normalize_fluid_profile_lock();

NOTIFY pgrst, 'reload schema';
COMMIT;
