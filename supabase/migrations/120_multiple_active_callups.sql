-- Permite que a liga prepare mais de uma convocacao futura ao mesmo tempo.
DROP INDEX IF EXISTS public.callups_one_active_per_league_idx;

CREATE INDEX IF NOT EXISTS callups_active_schedule_idx
  ON public.callups (league_id, status, date, start_time)
  WHERE status IN ('open', 'locked');
