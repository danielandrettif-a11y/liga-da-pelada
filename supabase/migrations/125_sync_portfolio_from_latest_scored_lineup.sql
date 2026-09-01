-- O elenco permanente é a base da próxima rodada. Ao finalizar uma rodada,
-- ele deve refletir a última escalação pontuada do usuário, e não o primeiro
-- elenco que foi salvo no início da temporada.

CREATE OR REPLACE FUNCTION public.sync_fantasy_portfolio_from_lineup(p_lineup_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_lineup RECORD;
  target_portfolio_id UUID;
BEGIN
  SELECT lineup.id, lineup.user_id, lineup.captain_player_id, fantasy_round.fantasy_season_id
  INTO source_lineup
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  WHERE lineup.id = p_lineup_id
    AND lineup.status = 'scored';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.fantasy_portfolios (
    fantasy_season_id, user_id, captain_player_id, updated_at
  ) VALUES (
    source_lineup.fantasy_season_id, source_lineup.user_id, source_lineup.captain_player_id, now()
  )
  ON CONFLICT (fantasy_season_id, user_id) DO UPDATE
  SET captain_player_id = EXCLUDED.captain_player_id,
      updated_at = now()
  RETURNING id INTO target_portfolio_id;

  DELETE FROM public.fantasy_portfolio_players
  WHERE portfolio_id = target_portfolio_id;

  INSERT INTO public.fantasy_portfolio_players (
    portfolio_id, player_id, price_selected, slot_index, slot_role,
    player_profile_locked, is_position_correct
  )
  SELECT
    target_portfolio_id,
    lineup_player.player_id,
    COALESCE(lineup_player.price_after, lineup_player.price_locked, 0),
    lineup_player.slot_index,
    lineup_player.slot_role,
    lineup_player.player_profile_locked,
    lineup_player.is_position_correct
  FROM public.fantasy_lineup_players lineup_player
  WHERE lineup_player.lineup_id = source_lineup.id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_finished_fantasy_round_portfolios()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lineup_row RECORD;
BEGIN
  IF NEW.market_status = 'finished' AND OLD.market_status IS DISTINCT FROM 'finished' THEN
    FOR lineup_row IN
      SELECT id
      FROM public.fantasy_lineups
      WHERE fantasy_round_id = NEW.id
        AND status = 'scored'
    LOOP
      PERFORM public.sync_fantasy_portfolio_from_lineup(lineup_row.id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_finished_fantasy_round_portfolios ON public.fantasy_rounds;
CREATE TRIGGER sync_finished_fantasy_round_portfolios
AFTER UPDATE OF market_status ON public.fantasy_rounds
FOR EACH ROW EXECUTE FUNCTION public.sync_finished_fantasy_round_portfolios();

-- Corrige imediatamente os elencos existentes com a escalação pontuada mais
-- recente de cada usuário na temporada.
DO $$
DECLARE
  lineup_row RECORD;
BEGIN
  FOR lineup_row IN
    SELECT DISTINCT ON (fantasy_round.fantasy_season_id, lineup.user_id) lineup.id
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    WHERE lineup.status = 'scored'
    ORDER BY fantasy_round.fantasy_season_id, lineup.user_id,
      round_item.date DESC, round_item.number DESC, lineup.updated_at DESC
  LOOP
    PERFORM public.sync_fantasy_portfolio_from_lineup(lineup_row.id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_fantasy_portfolio_from_lineup(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_finished_fantasy_round_portfolios() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
