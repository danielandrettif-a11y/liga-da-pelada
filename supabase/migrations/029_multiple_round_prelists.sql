-- Permite manter varias pre-listas futuras simultaneamente.

DROP INDEX IF EXISTS public.rounds_one_open_prelist_per_league_idx;

CREATE INDEX IF NOT EXISTS rounds_open_prelists_by_date_idx
  ON public.rounds (league_id, season_id, date, start_time, created_at)
  WHERE preparation_stage = 'prelist' AND status = 'draft';

COMMENT ON INDEX public.rounds_open_prelists_by_date_idx IS
  'Lista os rascunhos de pre-listas futuros sem limitar a liga a apenas um rascunho.';
