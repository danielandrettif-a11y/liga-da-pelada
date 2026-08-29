-- Lembretes de escalacao do Cartola por push e e-mail.

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS cartola_reminders_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cartola_email_tested_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  match_push_enabled BOOLEAN NOT NULL DEFAULT true,
  cartola_push_enabled BOOLEAN NOT NULL DEFAULT true,
  cartola_email_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cartola_reminder_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone TEXT NOT NULL CHECK (milestone IN ('opening', '24h', '12h', '1h')),
  channel TEXT NOT NULL CHECK (channel IN ('push', 'email')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'skipped')),
  provider_message_id TEXT,
  error_message TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id, milestone, channel)
);

CREATE INDEX IF NOT EXISTS idx_cartola_reminder_deliveries_round
  ON public.cartola_reminder_deliveries (round_id, milestone, channel, status);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartola_reminder_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notification_preferences_read_own ON public.user_notification_preferences;
CREATE POLICY user_notification_preferences_read_own
  ON public.user_notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_app_admin());

DROP POLICY IF EXISTS user_notification_preferences_insert_own ON public.user_notification_preferences;
CREATE POLICY user_notification_preferences_insert_own
  ON public.user_notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_notification_preferences_update_own ON public.user_notification_preferences;
CREATE POLICY user_notification_preferences_update_own
  ON public.user_notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS cartola_reminder_deliveries_admin_read ON public.cartola_reminder_deliveries;
CREATE POLICY cartola_reminder_deliveries_admin_read
  ON public.cartola_reminder_deliveries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_app_admin());

GRANT SELECT, INSERT, UPDATE ON public.user_notification_preferences TO authenticated;
GRANT SELECT ON public.cartola_reminder_deliveries TO authenticated;

COMMENT ON COLUMN public.leagues.cartola_reminders_enabled IS
  'Trava de rollout: lembretes coletivos so saem depois do teste administrativo.';
