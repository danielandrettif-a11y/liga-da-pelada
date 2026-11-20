-- Custo recorrente do aplicativo cobrado de cada participante em toda rodada.
BEGIN;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS app_fee_per_player numeric(12,2) NOT NULL DEFAULT 0
    CHECK (app_fee_per_player >= 0),
  ADD COLUMN IF NOT EXISTS app_fee_recipient_id uuid
    REFERENCES public.payment_recipients(id) ON DELETE SET NULL;

ALTER TABLE public.round_payment_charge_lines
  DROP CONSTRAINT IF EXISTS round_payment_charge_lines_charge_type_check;
ALTER TABLE public.round_payment_charge_lines
  ADD CONSTRAINT round_payment_charge_lines_charge_type_check
  CHECK (charge_type IN ('base','extra_time','ball_fund','expense_installment','app_fee'));

CREATE OR REPLACE FUNCTION public.set_league_app_fee(
  p_league_id uuid,
  p_amount_per_player numeric,
  p_recipient_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente administradores podem configurar o custo do app';
  END IF;
  IF p_amount_per_player < 0 OR p_amount_per_player > 999999.99 THEN
    RAISE EXCEPTION 'Valor por jogador invalido';
  END IF;
  IF p_amount_per_player > 0 AND NOT EXISTS (
    SELECT 1 FROM public.payment_recipients
    WHERE id = p_recipient_id AND league_id = p_league_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Escolha um PIX ativo desta pelada';
  END IF;

  UPDATE public.leagues SET
    app_fee_per_player = round(p_amount_per_player, 2),
    app_fee_recipient_id = CASE WHEN p_amount_per_player > 0 THEN p_recipient_id ELSE NULL END
  WHERE id = p_league_id;
  RETURN FOUND;
END;
$$;

-- Preserva o rateio existente e acrescenta o custo fixo após cada atualização.
ALTER FUNCTION public.sync_round_payment_plan(uuid, uuid[])
  RENAME TO sync_round_payment_plan_without_app_fee;

CREATE OR REPLACE FUNCTION public.sync_round_payment_plan(
  p_round_id uuid,
  p_expense_item_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_league_id uuid;
  fee numeric(12,2);
  recipient record;
BEGIN
  PERFORM public.sync_round_payment_plan_without_app_fee(p_round_id, p_expense_item_ids);

  SELECT r.league_id, l.app_fee_per_player
    INTO target_league_id, fee
  FROM public.rounds r
  JOIN public.leagues l ON l.id = r.league_id
  WHERE r.id = p_round_id;

  DELETE FROM public.round_payment_charge_lines
  WHERE round_id = p_round_id AND charge_type = 'app_fee';

  IF COALESCE(fee, 0) > 0 THEN
    SELECT pr.id, pr.name, pr.pix_key
      INTO recipient
    FROM public.leagues l
    JOIN public.payment_recipients pr ON pr.id = l.app_fee_recipient_id
    WHERE l.id = target_league_id AND pr.league_id = target_league_id AND pr.is_active;
    IF recipient.id IS NULL THEN RAISE EXCEPTION 'Configure um PIX ativo para o custo do app'; END IF;

    INSERT INTO public.round_payment_charge_lines (
      round_id, player_id, recipient_key, recipient_id, recipient_name,
      recipient_pix, charge_type, label, amount
    )
    SELECT p_round_id, rp.player_id, recipient.id::text, recipient.id,
      recipient.name, recipient.pix_key, 'app_fee', 'Custo do app', fee
    FROM public.round_players rp
    WHERE rp.round_id = p_round_id;
  END IF;

  PERFORM public.refresh_round_payment_obligations(p_round_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_league_app_fee(uuid,numeric,uuid),
  public.sync_round_payment_plan(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_league_app_fee(uuid,numeric,uuid),
  public.sync_round_payment_plan(uuid,uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
