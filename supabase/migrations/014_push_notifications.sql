-- Assinaturas Web Push por usuário e aparelho.
-- Necessária para notificações de partidas encerradas.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  expiration_time BIGINT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can view own push subscriptions"
ON push_subscriptions FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_app_admin());

DROP POLICY IF EXISTS "Users can create own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can create own push subscriptions"
ON push_subscriptions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can update own push subscriptions"
ON push_subscriptions FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users and admins can delete push subscriptions" ON push_subscriptions;
CREATE POLICY "Users and admins can delete push subscriptions"
ON push_subscriptions FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR is_app_admin());

REVOKE ALL ON push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO authenticated;
