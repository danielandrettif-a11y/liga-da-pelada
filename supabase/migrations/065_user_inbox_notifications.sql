CREATE TABLE IF NOT EXISTS public.user_inbox_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  href TEXT NOT NULL DEFAULT '/',
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'resolved')),
  read_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS user_inbox_notifications_user_idx ON public.user_inbox_notifications(user_id, state, read_at, updated_at DESC);
ALTER TABLE public.user_inbox_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_inbox_notifications_own ON public.user_inbox_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY user_inbox_notifications_insert ON public.user_inbox_notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY user_inbox_notifications_update ON public.user_inbox_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, UPDATE ON public.user_inbox_notifications TO authenticated;
