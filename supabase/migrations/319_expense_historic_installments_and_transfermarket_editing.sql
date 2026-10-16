-- Parcelas quitadas antes do app e ajuste da caixinha no Transfermarket.
BEGIN;

ALTER TABLE public.league_expense_items
  ADD COLUMN IF NOT EXISTS paid_installments_before_app integer NOT NULL DEFAULT 0;

ALTER TABLE public.league_expense_items
  DROP CONSTRAINT IF EXISTS league_expense_items_paid_before_app_check;
ALTER TABLE public.league_expense_items
  ADD CONSTRAINT league_expense_items_paid_before_app_check
  CHECK (paid_installments_before_app BETWEEN 0 AND installment_count);

-- A parcela gravada em uma rodada sempre considera as parcelas já quitadas
-- fora do sistema. Ex.: 3 pagas de 4 => a próxima rodada recebe a parcela 4.
CREATE OR REPLACE FUNCTION public.prepare_round_expense_installment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item public.league_expense_items%ROWTYPE;
  registered_count integer;
  total_cents bigint;
BEGIN
  SELECT * INTO item
  FROM public.league_expense_items
  WHERE id = NEW.expense_item_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item da caixinha nao encontrado'; END IF;

  SELECT count(*) INTO registered_count
  FROM public.round_expense_installments
  WHERE expense_item_id = NEW.expense_item_id AND status = 'active';

  NEW.installment_number := item.paid_installments_before_app + registered_count + 1;
  IF NEW.installment_number > item.installment_count THEN
    RAISE EXCEPTION 'Todas as parcelas de % ja foram usadas', item.name;
  END IF;

  total_cents := round(item.total_amount * 100)::bigint;
  NEW.installment_amount := (
    floor(total_cents / item.installment_count)
    + CASE WHEN NEW.installment_number <= mod(total_cents, item.installment_count) THEN 1 ELSE 0 END
  ) / 100.0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS round_expense_installment_prepare ON public.round_expense_installments;
CREATE TRIGGER round_expense_installment_prepare
  BEFORE INSERT ON public.round_expense_installments
  FOR EACH ROW EXECUTE FUNCTION public.prepare_round_expense_installment();

-- Mantém o status coerente mesmo quando uma parcela é adicionada, revertida
-- ou quando o ADM informa parcelas antigas que já estavam pagas.
CREATE OR REPLACE FUNCTION public.keep_expense_item_completion_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE registered_count integer;
BEGIN
  IF NEW.status = 'archived' THEN RETURN NEW; END IF;
  SELECT count(*) INTO registered_count
  FROM public.round_expense_installments
  WHERE expense_item_id = NEW.id AND status = 'active';

  IF NEW.paid_installments_before_app + registered_count >= NEW.installment_count THEN
    NEW.status := 'completed';
  ELSIF NEW.status = 'completed' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_expense_item_completion_status ON public.league_expense_items;
CREATE TRIGGER league_expense_item_completion_status
  BEFORE INSERT OR UPDATE OF status, paid_installments_before_app, installment_count
  ON public.league_expense_items
  FOR EACH ROW EXECUTE FUNCTION public.keep_expense_item_completion_status();

-- Quando a cobrança é alterada no Transfermarket, o indicador legado de
-- pagamento também acompanha o novo total para não marcar jogador como pago
-- enquanto ainda houver saldo em algum PIX.
CREATE OR REPLACE FUNCTION public.sync_legacy_round_payment_from_obligation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_round_id uuid; target_player_id uuid; fully_paid boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_round_id := OLD.round_id;
    target_player_id := OLD.player_id;
  ELSE
    target_round_id := NEW.round_id;
    target_player_id := NEW.player_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rounds WHERE id = target_round_id AND status = 'finished') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.round_payment_obligations obligation
    WHERE obligation.round_id = target_round_id
      AND obligation.player_id = target_player_id
      AND obligation.amount_paid < obligation.amount_due
  ) INTO fully_paid;

  INSERT INTO public.round_payments (round_id, player_id, paid, paid_at)
  VALUES (target_round_id, target_player_id, fully_paid, CASE WHEN fully_paid THEN now() ELSE NULL END)
  ON CONFLICT (round_id, player_id) DO UPDATE SET
    paid = EXCLUDED.paid,
    paid_at = EXCLUDED.paid_at;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS round_obligation_sync_legacy_payment ON public.round_payment_obligations;
CREATE TRIGGER round_obligation_sync_legacy_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.round_payment_obligations
  FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_round_payment_from_obligation();

NOTIFY pgrst, 'reload schema';
COMMIT;
