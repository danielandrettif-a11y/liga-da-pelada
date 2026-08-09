-- Valor da pelada e confirmacao de pagamentos por qualquer usuario logado.

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS payment_total NUMERIC(10, 2);

DROP POLICY IF EXISTS "Authenticated users can record payments" ON round_payments;
DROP POLICY IF EXISTS "Authenticated users can insert payments" ON round_payments;
CREATE POLICY "Authenticated users can insert payments"
ON round_payments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM rounds
    WHERE rounds.id = round_payments.round_id
      AND rounds.status = 'finished'
  )
);

DROP POLICY IF EXISTS "Authenticated users can update payments" ON round_payments;
CREATE POLICY "Authenticated users can update payments"
ON round_payments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM rounds
    WHERE rounds.id = round_payments.round_id
      AND rounds.status = 'finished'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM rounds
    WHERE rounds.id = round_payments.round_id
      AND rounds.status = 'finished'
  )
);

GRANT SELECT, INSERT, UPDATE ON round_payments TO authenticated;
