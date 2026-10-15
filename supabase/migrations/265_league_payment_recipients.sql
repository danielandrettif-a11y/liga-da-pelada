-- Destinatarios PIX pertencem exclusivamente a uma pelada.
-- Aplicar depois da 253 e da 255; validar em banco descartavel primeiro.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.rounds round_item
    JOIN public.payment_recipients recipient ON recipient.id = round_item.payment_recipient_id
    WHERE recipient.league_id IS DISTINCT FROM round_item.league_id
  ) THEN
    RAISE EXCEPTION 'Existem rodadas com destinatario PIX de outra pelada; corrija antes da 265.';
  END IF;
END;
$$;

DROP POLICY IF EXISTS payment_recipients_read ON public.payment_recipients;
DROP POLICY IF EXISTS payment_recipients_manage ON public.payment_recipients;

CREATE POLICY league_admins_read_payment_recipients
ON public.payment_recipients FOR SELECT TO authenticated
USING (public.is_league_admin(league_id));

CREATE POLICY league_admins_insert_payment_recipients
ON public.payment_recipients FOR INSERT TO authenticated
WITH CHECK (public.is_league_admin(league_id));

CREATE POLICY league_admins_update_payment_recipients
ON public.payment_recipients FOR UPDATE TO authenticated
USING (public.is_league_admin(league_id))
WITH CHECK (public.is_league_admin(league_id));

CREATE POLICY league_admins_delete_payment_recipients
ON public.payment_recipients FOR DELETE TO authenticated
USING (public.is_league_admin(league_id));

CREATE OR REPLACE FUNCTION public.validate_round_payment_recipient_league()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.payment_recipient_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_recipients recipient
    WHERE recipient.id = NEW.payment_recipient_id AND recipient.league_id = NEW.league_id
  ) THEN
    RAISE EXCEPTION 'O destinatario PIX deve pertencer a pelada da rodada.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rounds_validate_payment_recipient_league ON public.rounds;
CREATE TRIGGER rounds_validate_payment_recipient_league
BEFORE INSERT OR UPDATE OF league_id, payment_recipient_id ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.validate_round_payment_recipient_league();

REVOKE ALL ON FUNCTION public.validate_round_payment_recipient_league() FROM PUBLIC, anon, authenticated;

COMMIT;
