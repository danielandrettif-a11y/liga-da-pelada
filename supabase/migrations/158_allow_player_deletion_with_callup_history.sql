-- Quando um perfil é apagado, o ON DELETE CASCADE remove sua entrada da
-- convocação. Nesse contexto não há mais um jogador válido para registrar
-- como desfalque, então a trigger deve apenas encerrar sem criar o histórico.
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
  -- Fila de espera não é desfalque: apenas saídas de confirmados viram notícia.
  IF OLD.status <> 'confirmed' THEN RETURN OLD; END IF;

  SELECT * INTO source_callup FROM public.callups WHERE id = OLD.callup_id;
  IF NOT FOUND THEN RETURN OLD; END IF;

  SELECT name INTO removed_player_name FROM public.players WHERE id = OLD.player_id;
  -- A entrada foi removida em cascata porque o perfil está sendo excluído.
  -- Não registrar uma desistência que referencia um jogador inexistente.
  IF NOT FOUND THEN RETURN OLD; END IF;

  INSERT INTO public.callup_withdrawals (callup_id, league_id, player_id, player_name, removed_by)
  VALUES (OLD.callup_id, source_callup.league_id, OLD.player_id, removed_player_name, auth.uid())
  ON CONFLICT (callup_id, player_id) DO NOTHING
  RETURNING id INTO withdrawal_id;

  -- Evita repetir notícias e Inbox quando uma remoção for repetida.
  IF withdrawal_id IS NULL THEN RETURN OLD; END IF;

  INSERT INTO public.user_inbox_notifications (
    user_id, league_id, notification_type, dedupe_key, title, body, href
  )
  SELECT DISTINCT lineup.user_id,
    source_callup.league_id,
    'callup_withdrawal',
    'callup:withdrawal:' || OLD.callup_id::TEXT || ':' || OLD.player_id::TEXT,
    '🚨 Desfalque no Cartola',
    removed_player_name || ' saiu da convocação. Revise sua escalação antes da rodada.',
    '/cartola'
  FROM public.fantasy_lineup_players lineup_player
  JOIN public.fantasy_lineups lineup ON lineup.id = lineup_player.lineup_id
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id = fantasy_round.fantasy_season_id
  JOIN public.seasons season ON season.id = fantasy_season.season_id
  WHERE lineup_player.player_id = OLD.player_id
    AND fantasy_round.market_status = 'open'
    AND season.league_id = source_callup.league_id
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  RETURN OLD;
END;
$$;
