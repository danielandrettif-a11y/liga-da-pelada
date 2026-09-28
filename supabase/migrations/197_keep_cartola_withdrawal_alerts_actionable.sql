-- O aviso de desfalque pertence somente ao Cartola da mesma rodada da convocação.
CREATE OR REPLACE FUNCTION public.record_callup_withdrawal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_callup public.callups%ROWTYPE;
  removed_player_name TEXT;
  withdrawal_id UUID;
BEGIN
  IF OLD.status <> 'confirmed' THEN RETURN OLD; END IF;

  SELECT * INTO source_callup FROM public.callups WHERE id = OLD.callup_id;
  IF NOT FOUND THEN RETURN OLD; END IF;

  SELECT name INTO removed_player_name FROM public.players WHERE id = OLD.player_id;
  IF NOT FOUND THEN RETURN OLD; END IF;

  INSERT INTO public.callup_withdrawals (callup_id, league_id, player_id, player_name, removed_by)
  VALUES (OLD.callup_id, source_callup.league_id, OLD.player_id, removed_player_name, auth.uid())
  ON CONFLICT (callup_id, player_id) DO NOTHING
  RETURNING id INTO withdrawal_id;

  IF withdrawal_id IS NULL OR source_callup.round_id IS NULL THEN RETURN OLD; END IF;

  INSERT INTO public.user_inbox_notifications (
    user_id, league_id, notification_type, dedupe_key, title, body, href
  )
  SELECT DISTINCT
    lineup.user_id,
    source_callup.league_id,
    'callup_withdrawal',
    'callup:withdrawal:' || OLD.callup_id::TEXT || ':' || OLD.player_id::TEXT,
    '🚨 Desfalque no Cartola',
    removed_player_name || ' saiu da lista da rodada. Ajuste sua escalação antes do mercado fechar.',
    '/cartola'
  FROM public.fantasy_lineup_players lineup_player
  JOIN public.fantasy_lineups lineup ON lineup.id = lineup_player.lineup_id
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  WHERE lineup_player.player_id = OLD.player_id
    AND fantasy_round.round_id = source_callup.round_id
    AND fantasy_round.market_status = 'open'
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  RETURN OLD;
END;
$$;

NOTIFY pgrst, 'reload schema';
