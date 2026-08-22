-- Corrige a ambiguidade entre fantasy_lineups.status e rounds.status durante
-- o reprocessamento administrativo de uma rodada já finalizada.

CREATE OR REPLACE FUNCTION public.reprocess_fantasy_from_round(p_round_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.fantasy_rounds%ROWTYPE; target_round public.rounds%ROWTYPE; item RECORD; settings public.fantasy_settings%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem reprocessar o Cartola.'; END IF;
  SELECT * INTO target FROM public.fantasy_rounds WHERE round_id = p_round_id;
  SELECT * INTO target_round FROM public.rounds WHERE id = p_round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada Fantasy nao encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id = fr.round_id WHERE fr.fantasy_season_id = target.fantasy_season_id AND r.date >= target_round.date AND fr.market_status = 'in_progress') THEN
    RAISE EXCEPTION 'Nao e possivel reprocessar enquanto existe rodada posterior em andamento.';
  END IF;
  SELECT fs.* INTO settings FROM public.fantasy_settings fs JOIN public.fantasy_seasons season ON season.league_id = fs.league_id WHERE season.id = target.fantasy_season_id;
  DELETE FROM public.fantasy_player_price_history history USING public.fantasy_rounds fr, public.rounds r
  WHERE history.fantasy_round_id = fr.id AND fr.round_id = r.id AND fr.fantasy_season_id = target.fantasy_season_id AND (r.date, r.number) >= (target_round.date, target_round.number);
  UPDATE public.fantasy_player_prices price SET current_price = COALESCE((SELECT h.price_after FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = target.fantasy_season_id AND h.player_id = price.player_id ORDER BY h.created_at DESC LIMIT 1), (SELECT initial_player_price FROM public.fantasy_seasons WHERE id = target.fantasy_season_id)),
    rounds_played = (SELECT count(*) FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = target.fantasy_season_id AND h.player_id = price.player_id AND h.games > 0),
    total_points = COALESCE((SELECT sum(h.round_points) FROM public.fantasy_player_price_history h WHERE h.fantasy_season_id = target.fantasy_season_id AND h.player_id = price.player_id), 0)
  WHERE price.fantasy_season_id = target.fantasy_season_id;
  UPDATE public.fantasy_lineup_players lp SET base_points = 0, captain_bonus = 0, total_points = 0, price_after = NULL
  FROM public.fantasy_lineups l, public.fantasy_rounds fr, public.rounds r WHERE lp.lineup_id = l.id AND l.fantasy_round_id = fr.id AND fr.round_id = r.id AND fr.fantasy_season_id = target.fantasy_season_id AND (r.date, r.number) >= (target_round.date, target_round.number);
  UPDATE public.fantasy_lineups l SET player_points = 0, prediction_points = 0, total_points = 0, budget_after = NULL, round_position = NULL,
    status = CASE WHEN l.status IN ('scored','locked') THEN 'locked' ELSE l.status END
  FROM public.fantasy_rounds fr, public.rounds r WHERE l.fantasy_round_id = fr.id AND fr.round_id = r.id AND fr.fantasy_season_id = target.fantasy_season_id AND (r.date, r.number) >= (target_round.date, target_round.number);
  UPDATE public.fantasy_rounds fr SET processed_at = NULL, market_status = CASE WHEN r.status = 'finished' THEN 'in_progress' WHEN EXISTS (SELECT 1 FROM public.matches m WHERE m.round_id = r.id AND m.started_at IS NOT NULL) THEN 'in_progress' ELSE 'open' END
  FROM public.rounds r WHERE fr.round_id = r.id AND fr.fantasy_season_id = target.fantasy_season_id AND (r.date, r.number) >= (target_round.date, target_round.number);
  FOR item IN SELECT r.id FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id = fr.round_id WHERE fr.fantasy_season_id = target.fantasy_season_id AND r.status = 'finished' AND (r.date, r.number) >= (target_round.date, target_round.number) ORDER BY r.date, r.number LOOP
    PERFORM public.process_fantasy_round(item.id);
  END LOOP;
  UPDATE public.fantasy_lineup_players lp SET price_locked = price.current_price
  FROM public.fantasy_lineups lineup, public.fantasy_rounds fr, public.fantasy_player_prices price
  WHERE lp.lineup_id = lineup.id AND lineup.fantasy_round_id = fr.id
    AND fr.fantasy_season_id = target.fantasy_season_id AND fr.market_status = 'open'
    AND price.fantasy_season_id = target.fantasy_season_id AND price.player_id = lp.player_id;
  UPDATE public.fantasy_lineups lineup SET
    budget_before = account.current_budget,
    lineup_cost = COALESCE((SELECT sum(lp.price_locked) FROM public.fantasy_lineup_players lp WHERE lp.lineup_id = lineup.id), 0),
    cash_remaining = account.current_budget - COALESCE((SELECT sum(lp.price_locked) FROM public.fantasy_lineup_players lp WHERE lp.lineup_id = lineup.id), 0),
    status = CASE WHEN COALESCE((SELECT sum(lp.price_locked) FROM public.fantasy_lineup_players lp WHERE lp.lineup_id = lineup.id), 0) > account.current_budget THEN 'needs_review' ELSE 'draft' END,
    updated_at = now()
  FROM public.fantasy_rounds fr, public.fantasy_accounts account
  WHERE lineup.fantasy_round_id = fr.id AND fr.fantasy_season_id = target.fantasy_season_id
    AND fr.market_status = 'open' AND account.fantasy_season_id = target.fantasy_season_id AND account.user_id = lineup.user_id;
  INSERT INTO public.fantasy_audit_log (league_id, fantasy_round_id, user_id, action) SELECT league_id, target.id, auth.uid(), 'rounds_reprocessed' FROM public.fantasy_seasons WHERE id = target.fantasy_season_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reprocess_fantasy_from_round(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
