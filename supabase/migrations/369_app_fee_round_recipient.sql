-- O custo do app acompanha o destinatário usado no valor base de cada rodada.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_league_app_fee(
  p_league_id uuid, p_amount_per_player numeric, p_recipient_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente administradores podem configurar o custo do app';
  END IF;
  IF p_amount_per_player IS NULL OR p_amount_per_player = 'NaN'::numeric
    OR p_amount_per_player < 0 OR p_amount_per_player > 999999.99 THEN
    RAISE EXCEPTION 'Valor por jogador invalido';
  END IF;
  UPDATE public.leagues SET app_fee_per_player = round(p_amount_per_player, 2),
    app_fee_recipient_id = NULL WHERE id = p_league_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_round_payment_plan(
  p_round_id uuid, p_expense_item_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fee numeric(12,2);
BEGIN
  PERFORM public.sync_round_payment_plan_without_app_fee(p_round_id, p_expense_item_ids);

  SELECT l.app_fee_per_player INTO fee FROM public.rounds r
  JOIN public.leagues l ON l.id = r.league_id WHERE r.id = p_round_id;

  DELETE FROM public.round_payment_charge_lines
  WHERE round_id = p_round_id AND charge_type = 'app_fee';

  IF COALESCE(fee, 0) > 0 THEN
    INSERT INTO public.round_payment_charge_lines (
      round_id, player_id, recipient_key, recipient_id, recipient_name,
      recipient_pix, charge_type, label, amount
    )
    SELECT round_id, player_id, recipient_key, recipient_id, recipient_name,
      recipient_pix, 'app_fee', 'Custo do app', fee
    FROM public.round_payment_charge_lines
    WHERE round_id = p_round_id AND charge_type = 'base';
  END IF;

  PERFORM public.refresh_round_payment_obligations(p_round_id);
  RETURN true;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
