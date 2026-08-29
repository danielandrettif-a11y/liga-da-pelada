-- Recupera rodadas cuja primeira partida começou sem o mercado do Cartola
-- mudar de `open` para `in_progress` e reforça o trigger para novas partidas.

CREATE OR REPLACE FUNCTION public.lock_fantasy_market_on_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.started_at IS NOT NULL OR NEW.status = 'live') AND (
    TG_OP = 'INSERT' OR OLD.started_at IS NULL OR OLD.status IS DISTINCT FROM 'live'
  ) THEN
    PERFORM public.lock_fantasy_market(NEW.round_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_lock_fantasy_market ON public.matches;
CREATE TRIGGER matches_lock_fantasy_market
BEFORE INSERT OR UPDATE OF status, started_at ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.lock_fantasy_market_on_match();

DO $$
DECLARE stale_round RECORD;
BEGIN
  FOR stale_round IN
    SELECT fantasy_round.round_id
    FROM public.fantasy_rounds fantasy_round
    WHERE fantasy_round.market_status = 'open'
      AND EXISTS (
        SELECT 1
        FROM public.matches match_item
        WHERE match_item.round_id = fantasy_round.round_id
          AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
      )
  LOOP
    PERFORM public.lock_fantasy_market(stale_round.round_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_fantasy_market_on_match() FROM PUBLIC, anon;
NOTIFY pgrst, 'reload schema';
