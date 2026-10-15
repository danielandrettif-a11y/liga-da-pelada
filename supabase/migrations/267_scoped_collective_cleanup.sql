-- A confirmacao de pagamento nao pode limpar mensagens de outras peladas.
BEGIN;

CREATE OR REPLACE FUNCTION public.prune_collective_history_after_payment(p_round_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_league_id uuid;
BEGIN
  SELECT round_item.league_id INTO target_league_id
  FROM public.rounds round_item
  WHERE round_item.id = p_round_id AND round_item.status = 'finished';

  IF target_league_id IS NULL THEN RETURN false; END IF;
  IF NOT public.is_league_member(target_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito aos membros desta pelada.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.round_players participant
    WHERE participant.round_id = p_round_id
      AND NOT EXISTS (
        SELECT 1 FROM public.round_payments payment
        WHERE payment.round_id = participant.round_id
          AND payment.player_id = participant.player_id
          AND payment.paid = true
      )
  ) THEN RETURN false; END IF;

  DELETE FROM public.collective_messages message
  USING public.callups callup
  WHERE callup.id = message.callup_id
    AND callup.league_id = target_league_id
    AND callup.date < CURRENT_DATE - 14;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_collective_history_after_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_collective_history_after_payment(uuid) TO authenticated;

COMMIT;
