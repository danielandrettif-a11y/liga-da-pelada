-- Avisa os ADMs quando alguém deixa os confirmados ou a fila da convocação.
-- O alerta do Cartola continua restrito às saídas de jogadores confirmados.
BEGIN;

ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS callup_push_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.record_callup_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_callup public.callups%ROWTYPE;
  removed_player_name text;
  withdrawal_id uuid;
  departure_body text;
BEGIN
  SELECT * INTO source_callup
  FROM public.callups
  WHERE id = OLD.callup_id;
  IF NOT FOUND THEN RETURN OLD; END IF;

  SELECT name INTO removed_player_name
  FROM public.players
  WHERE id = OLD.player_id;
  removed_player_name := COALESCE(removed_player_name, 'Um jogador');

  departure_body := CASE OLD.status
    WHEN 'waitlist' THEN removed_player_name || ' saiu da fila de espera da convocação.'
    ELSE removed_player_name || ' saiu da lista de confirmados da convocação.'
  END;

  -- Cada entrada tem um id novo. Assim, se alguém sair, voltar e sair de novo,
  -- o ADM recebe um novo evento sem gerar duplicidade para a mesma exclusão.
  INSERT INTO public.user_inbox_notifications (
    user_id, league_id, notification_type, dedupe_key, title, body, href
  )
  SELECT DISTINCT
    member.user_id,
    source_callup.league_id,
    'callup_withdrawal',
    'callup:admin-withdrawal:' || OLD.id::text,
    'Saída da convocação',
    departure_body,
    '/convocacao?callup=' || OLD.callup_id::text
  FROM public.league_members member
  WHERE member.league_id = source_callup.league_id
    AND member.role = 'admin'
    AND member.is_active
    AND member.user_id IS NOT NULL
    AND member.user_id IS DISTINCT FROM auth.uid()
    AND NOT EXISTS (
      SELECT 1
      FROM public.account_profiles profile
      WHERE profile.user_id = member.user_id
        AND profile.player_id = OLD.player_id
    )
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  -- Sair da fila não afeta escalações do Cartola.
  IF OLD.status <> 'confirmed' THEN RETURN OLD; END IF;

  INSERT INTO public.callup_withdrawals (
    callup_id, league_id, player_id, player_name, removed_by
  )
  VALUES (
    OLD.callup_id, source_callup.league_id, OLD.player_id,
    removed_player_name, auth.uid()
  )
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
    'callup:withdrawal:' || OLD.callup_id::text || ':' || OLD.player_id::text,
    '🚨 Desfalque no Cartola',
    removed_player_name || ' saiu da lista da rodada. Troque esse jogador antes do mercado fechar.',
    '/cartola?substituir=' || OLD.player_id::text
  FROM (
    SELECT lineup_id
    FROM public.fantasy_lineup_players
    WHERE player_id = OLD.player_id
    UNION
    SELECT lineup_id
    FROM public.fantasy_lineup_reserves
    WHERE player_id = OLD.player_id
  ) selected_player
  JOIN public.fantasy_lineups lineup ON lineup.id = selected_player.lineup_id
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  WHERE fantasy_round.round_id = source_callup.round_id
    AND fantasy_round.market_status = 'open'
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  RETURN OLD;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
