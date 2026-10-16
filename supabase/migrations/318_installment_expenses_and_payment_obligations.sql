-- Caixinha parcelada, cobrancas por destinatario e historico financeiro.
BEGIN;

CREATE TABLE IF NOT EXISTS public.league_expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  description text,
  total_amount numeric(12,2) NOT NULL CHECK (total_amount > 0),
  installment_count integer NOT NULL CHECK (installment_count BETWEEN 1 AND 120),
  recipient_id uuid NOT NULL REFERENCES public.payment_recipients(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS league_expense_items_league_status_idx
  ON public.league_expense_items (league_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.round_expense_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  expense_item_id uuid NOT NULL REFERENCES public.league_expense_items(id) ON DELETE RESTRICT,
  installment_number integer NOT NULL CHECK (installment_number > 0),
  installment_amount numeric(12,2) NOT NULL CHECK (installment_amount > 0),
  recipient_id uuid REFERENCES public.payment_recipients(id) ON DELETE SET NULL,
  recipient_name text NOT NULL,
  recipient_pix text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS round_expense_active_item_idx
  ON public.round_expense_installments (round_id, expense_item_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS round_expense_item_status_idx
  ON public.round_expense_installments (expense_item_id, status, created_at);

CREATE TABLE IF NOT EXISTS public.round_payment_charge_lines (
  id bigserial PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  recipient_key text NOT NULL,
  recipient_id uuid REFERENCES public.payment_recipients(id) ON DELETE SET NULL,
  recipient_name text NOT NULL,
  recipient_pix text NOT NULL,
  charge_type text NOT NULL CHECK (charge_type IN ('base','extra_time','ball_fund','expense_installment')),
  label text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  expense_installment_id uuid REFERENCES public.round_expense_installments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS round_payment_charge_lines_round_player_idx
  ON public.round_payment_charge_lines (round_id, player_id, recipient_key);

CREATE TABLE IF NOT EXISTS public.round_payment_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  recipient_key text NOT NULL,
  recipient_id uuid REFERENCES public.payment_recipients(id) ON DELETE SET NULL,
  recipient_name text NOT NULL,
  recipient_pix text NOT NULL,
  amount_due numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
  amount_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','paid','credit')),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_id, recipient_key)
);
CREATE INDEX IF NOT EXISTS round_payment_obligations_round_status_idx
  ON public.round_payment_obligations (round_id, status, player_id);

CREATE TABLE IF NOT EXISTS public.round_payment_events (
  id bigserial PRIMARY KEY,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  obligation_id uuid REFERENCES public.round_payment_obligations(id) ON DELETE SET NULL,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('plan_created','plan_adjusted','payment_confirmed','payment_reopened','installment_reversed')),
  amount_due_before numeric(12,2),
  amount_due_after numeric(12,2),
  amount_paid_before numeric(12,2),
  amount_paid_after numeric(12,2),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS round_payment_events_round_idx
  ON public.round_payment_events (round_id, id DESC);

ALTER TABLE public.league_expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_expense_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_payment_charge_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_payment_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS league_expense_items_member_read ON public.league_expense_items;
DROP POLICY IF EXISTS league_expense_items_admin_manage ON public.league_expense_items;
DROP POLICY IF EXISTS round_expense_member_read ON public.round_expense_installments;
DROP POLICY IF EXISTS round_charge_member_read ON public.round_payment_charge_lines;
DROP POLICY IF EXISTS round_obligation_member_read ON public.round_payment_obligations;
DROP POLICY IF EXISTS round_events_admin_read ON public.round_payment_events;

CREATE POLICY league_expense_items_member_read ON public.league_expense_items
  FOR SELECT TO authenticated USING (public.is_league_member(league_id));
CREATE POLICY league_expense_items_admin_manage ON public.league_expense_items
  FOR ALL TO authenticated USING (public.is_league_admin(league_id))
  WITH CHECK (public.is_league_admin(league_id));
CREATE POLICY round_expense_member_read ON public.round_expense_installments
  FOR SELECT TO authenticated USING (public.is_league_member(league_id));
CREATE POLICY round_charge_member_read ON public.round_payment_charge_lines
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.rounds item WHERE item.id = round_id AND public.is_league_member(item.league_id)
  ));
CREATE POLICY round_obligation_member_read ON public.round_payment_obligations
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.rounds item WHERE item.id = round_id AND public.is_league_member(item.league_id)
  ));
CREATE POLICY round_events_admin_read ON public.round_payment_events
  FOR SELECT TO authenticated USING (public.is_league_admin(league_id));

GRANT SELECT ON public.league_expense_items, public.round_expense_installments,
  public.round_payment_charge_lines, public.round_payment_obligations,
  public.round_payment_events TO authenticated;
GRANT INSERT, UPDATE ON public.league_expense_items TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_round_payment_obligations(p_round_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league_id uuid;
BEGIN
  SELECT league_id INTO target_league_id FROM public.rounds WHERE id = p_round_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Rodada fora da pelada administrada';
  END IF;

  INSERT INTO public.round_payment_events (
    league_id, round_id, obligation_id, player_id, event_type,
    amount_due_before, amount_due_after, amount_paid_before, amount_paid_after,
    changed_by
  )
  SELECT target_league_id, current_item.round_id, current_item.id, current_item.player_id,
    'plan_adjusted', current_item.amount_due, COALESCE(next_item.amount_due, 0),
    current_item.amount_paid, current_item.amount_paid, auth.uid()
  FROM public.round_payment_obligations current_item
  LEFT JOIN (
    SELECT line.round_id, line.player_id, line.recipient_key, round(sum(line.amount), 2) amount_due
    FROM public.round_payment_charge_lines line WHERE line.round_id = p_round_id
    GROUP BY line.round_id, line.player_id, line.recipient_key
  ) next_item USING (round_id, player_id, recipient_key)
  WHERE current_item.round_id = p_round_id
    AND current_item.amount_due IS DISTINCT FROM COALESCE(next_item.amount_due, 0);

  INSERT INTO public.round_payment_obligations (
    round_id, player_id, recipient_key, recipient_id, recipient_name,
    recipient_pix, amount_due, amount_paid, status, updated_at
  )
  SELECT line.round_id, line.player_id, line.recipient_key,
    max(line.recipient_id), max(line.recipient_name), max(line.recipient_pix),
    round(sum(line.amount), 2), 0, 'pending', now()
  FROM public.round_payment_charge_lines line
  WHERE line.round_id = p_round_id
  GROUP BY line.round_id, line.player_id, line.recipient_key
  ON CONFLICT (round_id, player_id, recipient_key) DO UPDATE SET
    recipient_id = EXCLUDED.recipient_id,
    recipient_name = EXCLUDED.recipient_name,
    recipient_pix = EXCLUDED.recipient_pix,
    amount_due = EXCLUDED.amount_due,
    status = CASE
      WHEN round_payment_obligations.amount_paid > EXCLUDED.amount_due THEN 'credit'
      WHEN round_payment_obligations.amount_paid = EXCLUDED.amount_due AND EXCLUDED.amount_due > 0 THEN 'paid'
      WHEN round_payment_obligations.amount_paid > 0 THEN 'partial'
      ELSE 'pending' END,
    updated_at = now();

  UPDATE public.round_payment_obligations obligation SET
    amount_due = 0,
    status = CASE WHEN obligation.amount_paid > 0 THEN 'credit' ELSE 'pending' END,
    updated_at = now()
  WHERE obligation.round_id = p_round_id
    AND NOT EXISTS (
      SELECT 1 FROM public.round_payment_charge_lines line
      WHERE line.round_id = obligation.round_id AND line.player_id = obligation.player_id
        AND line.recipient_key = obligation.recipient_key
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_round_payment_plan(
  p_round_id uuid,
  p_expense_item_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  round_item public.rounds%ROWTYPE;
  selected_ids uuid[];
  expense record;
  installment_no integer;
  installment_cents bigint;
  participant_count integer;
  base_recipient_key text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre novamente'; END IF;
  SELECT * INTO round_item FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_league_admin(round_item.league_id) THEN RAISE EXCEPTION 'Rodada fora da pelada administrada'; END IF;
  IF round_item.status <> 'finished' THEN RAISE EXCEPTION 'Finalize a rodada antes de liberar pagamentos'; END IF;
  IF trim(COALESCE(round_item.payment_pix, '')) = '' OR COALESCE(round_item.payment_total, 0) <= 0 THEN
    RAISE EXCEPTION 'Informe o PIX e o valor da pelada';
  END IF;

  selected_ids := ARRAY(
    SELECT DISTINCT value FROM unnest(COALESCE(p_expense_item_ids, '{}'::uuid[])) value ORDER BY value
  );
  IF EXISTS (
    SELECT 1 FROM unnest(selected_ids) selected(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.league_expense_items item
      JOIN public.payment_recipients recipient ON recipient.id = item.recipient_id
      WHERE item.id = selected.id AND item.league_id = round_item.league_id
        AND ((item.status = 'active' AND recipient.is_active) OR EXISTS (
          SELECT 1 FROM public.round_expense_installments linked
          WHERE linked.round_id = p_round_id AND linked.expense_item_id = item.id AND linked.status = 'active'
        ))
    )
  ) THEN RAISE EXCEPTION 'Um item extra nao esta disponivel'; END IF;

  UPDATE public.round_expense_installments installment SET
    status = 'reversed', reversed_at = now(), reversed_by = auth.uid()
  WHERE installment.round_id = p_round_id AND installment.status = 'active'
    AND NOT (installment.expense_item_id = ANY(selected_ids));

  FOR expense IN
    SELECT item.*, recipient.name recipient_name, recipient.pix_key recipient_pix
    FROM public.league_expense_items item
    JOIN public.payment_recipients recipient ON recipient.id = item.recipient_id
    WHERE item.id = ANY(selected_ids)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.round_expense_installments installment
      WHERE installment.round_id = p_round_id AND installment.expense_item_id = expense.id
        AND installment.status = 'active'
    ) THEN
      SELECT count(*) + 1 INTO installment_no
      FROM public.round_expense_installments installment
      WHERE installment.expense_item_id = expense.id AND installment.status = 'active';
      IF installment_no > expense.installment_count THEN RAISE EXCEPTION 'Todas as parcelas de % ja foram usadas', expense.name; END IF;
      installment_cents := floor(round(expense.total_amount * 100)::bigint / expense.installment_count)
        + CASE WHEN installment_no <= mod(round(expense.total_amount * 100)::bigint, expense.installment_count) THEN 1 ELSE 0 END;
      INSERT INTO public.round_expense_installments (
        league_id, round_id, expense_item_id, installment_number, installment_amount,
        recipient_id, recipient_name, recipient_pix, created_by
      ) VALUES (
        round_item.league_id, p_round_id, expense.id, installment_no, installment_cents / 100.0,
        expense.recipient_id, expense.recipient_name, expense.recipient_pix, auth.uid()
      );
    END IF;
  END LOOP;

  SELECT count(*) INTO participant_count FROM public.round_players WHERE round_id = p_round_id;
  IF participant_count = 0 THEN RAISE EXCEPTION 'A rodada nao possui participantes'; END IF;
  DELETE FROM public.round_payment_charge_lines WHERE round_id = p_round_id;
  base_recipient_key := COALESCE(round_item.payment_recipient_id::text, 'manual:' || md5(round_item.payment_pix));

  INSERT INTO public.round_payment_charge_lines (
    round_id, player_id, recipient_key, recipient_id, recipient_name,
    recipient_pix, charge_type, label, amount
  )
  SELECT p_round_id, ordered.player_id, base_recipient_key, round_item.payment_recipient_id,
    COALESCE(NULLIF(round_item.payment_recipient_name, ''), 'Pelada'), round_item.payment_pix,
    'base', 'Valor da pelada',
    (floor(round(round_item.payment_total * 100)::bigint / participant_count)
      + CASE WHEN ordered.position <= mod(round(round_item.payment_total * 100)::bigint, participant_count) THEN 1 ELSE 0 END) / 100.0
  FROM (
    SELECT player_id, row_number() OVER (ORDER BY created_at, player_id) position
    FROM public.round_players WHERE round_id = p_round_id
  ) ordered;

  INSERT INTO public.round_payment_charge_lines (
    round_id, player_id, recipient_key, recipient_id, recipient_name,
    recipient_pix, charge_type, label, amount
  )
  SELECT p_round_id, selected.player_id, base_recipient_key, round_item.payment_recipient_id,
    COALESCE(NULLIF(round_item.payment_recipient_name, ''), 'Pelada'), round_item.payment_pix,
    selected.charge_type, selected.label,
    (floor(selected.total_cents / selected.total_players)
      + CASE WHEN selected.position <= mod(selected.total_cents, selected.total_players) THEN 1 ELSE 0 END) / 100.0
  FROM (
    SELECT participant.player_id, source.charge_type, source.label, source.total_cents,
      count(*) OVER (PARTITION BY source.charge_type) total_players,
      row_number() OVER (PARTITION BY source.charge_type ORDER BY participant.player_id) position
    FROM (VALUES
      ('extra_time'::text, 'Tempo extra'::text, round(COALESCE(round_item.payment_extra_time_total,0) * 100)::bigint, round_item.payment_extra_time_player_ids),
      ('ball_fund'::text, 'Caixinha da bola'::text, round(COALESCE(round_item.payment_ball_fund_total,0) * 100)::bigint, round_item.payment_ball_fund_player_ids)
    ) source(charge_type, label, total_cents, player_ids)
    JOIN public.round_players participant ON participant.round_id = p_round_id AND participant.player_id = ANY(source.player_ids)
    WHERE source.total_cents > 0
  ) selected;

  INSERT INTO public.round_payment_charge_lines (
    round_id, player_id, recipient_key, recipient_id, recipient_name,
    recipient_pix, charge_type, label, amount, expense_installment_id
  )
  SELECT p_round_id, participant.player_id, installment.recipient_id::text,
    installment.recipient_id, installment.recipient_name, installment.recipient_pix,
    'expense_installment', expense.name || ' · parcela ' || installment.installment_number || '/' || expense.installment_count,
    (floor(round(installment.installment_amount * 100)::bigint / participant_count)
      + CASE WHEN row_number() OVER (PARTITION BY installment.id ORDER BY participant.created_at, participant.player_id)
        <= mod(round(installment.installment_amount * 100)::bigint, participant_count) THEN 1 ELSE 0 END) / 100.0,
    installment.id
  FROM public.round_expense_installments installment
  JOIN public.league_expense_items expense ON expense.id = installment.expense_item_id
  CROSS JOIN public.round_players participant
  WHERE installment.round_id = p_round_id AND installment.status = 'active'
    AND participant.round_id = p_round_id;

  PERFORM public.refresh_round_payment_obligations(p_round_id);

  UPDATE public.league_expense_items item SET
    status = CASE WHEN (
      SELECT count(*) FROM public.round_expense_installments installment
      WHERE installment.expense_item_id = item.id AND installment.status = 'active'
    ) >= item.installment_count THEN 'completed' ELSE CASE WHEN item.status = 'completed' THEN 'active' ELSE item.status END END,
    updated_at = now()
  WHERE item.league_id = round_item.league_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_round_payment_obligation_paid(
  p_obligation_id uuid, p_amount_paid numeric
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE obligation public.round_payment_obligations%ROWTYPE; target_league_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para confirmar pagamentos'; END IF;
  SELECT * INTO obligation FROM public.round_payment_obligations WHERE id = p_obligation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobranca nao encontrada'; END IF;
  SELECT league_id INTO target_league_id FROM public.rounds WHERE id = obligation.round_id AND status = 'finished';
  IF target_league_id IS NULL OR NOT public.is_league_member(target_league_id) THEN RAISE EXCEPTION 'Cobranca indisponivel'; END IF;
  IF NOT public.is_league_admin(target_league_id)
    AND obligation.player_id IS DISTINCT FROM (SELECT player_id FROM public.account_profiles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Voce so pode confirmar o proprio pagamento';
  END IF;
  IF p_amount_paid < 0 OR p_amount_paid > 99999999.99 THEN
    RAISE EXCEPTION 'Valor pago invalido';
  END IF;
  INSERT INTO public.round_payment_events (
    league_id, round_id, obligation_id, player_id, event_type,
    amount_due_before, amount_due_after, amount_paid_before, amount_paid_after, changed_by
  ) VALUES (
    target_league_id, obligation.round_id, obligation.id, obligation.player_id,
    CASE WHEN p_amount_paid > 0 THEN 'payment_confirmed' ELSE 'payment_reopened' END,
    obligation.amount_due, obligation.amount_due, obligation.amount_paid,
    round(p_amount_paid, 2), auth.uid()
  );
  UPDATE public.round_payment_obligations SET
    amount_paid = round(p_amount_paid, 2),
    status = CASE
      WHEN round(p_amount_paid, 2) > amount_due THEN 'credit'
      WHEN round(p_amount_paid, 2) = amount_due AND amount_due > 0 THEN 'paid'
      WHEN round(p_amount_paid, 2) > 0 THEN 'partial'
      ELSE 'pending' END,
    paid_at = CASE WHEN round(p_amount_paid, 2) >= amount_due AND amount_due > 0 THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_obligation_id;
  INSERT INTO public.round_payments (round_id, player_id, paid, paid_at)
  VALUES (
    obligation.round_id,
    obligation.player_id,
    NOT EXISTS (
      SELECT 1 FROM public.round_payment_obligations pending
      WHERE pending.round_id = obligation.round_id
        AND pending.player_id = obligation.player_id
        AND pending.id <> obligation.id
        AND pending.amount_paid < pending.amount_due
    ) AND round(p_amount_paid, 2) >= obligation.amount_due,
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.round_payment_obligations pending
      WHERE pending.round_id = obligation.round_id
        AND pending.player_id = obligation.player_id
        AND pending.id <> obligation.id
        AND pending.amount_paid < pending.amount_due
    ) AND round(p_amount_paid, 2) >= obligation.amount_due THEN now() ELSE NULL END
  )
  ON CONFLICT (round_id, player_id) DO UPDATE SET
    paid = EXCLUDED.paid,
    paid_at = EXCLUDED.paid_at;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_round_payment_obligations(uuid),
  public.sync_round_payment_plan(uuid,uuid[]),
  public.set_round_payment_obligation_paid(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_round_payment_plan(uuid,uuid[]),
  public.set_round_payment_obligation_paid(uuid,numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
