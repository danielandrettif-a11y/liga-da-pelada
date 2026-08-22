CREATE TABLE IF NOT EXISTS public.payment_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  pix_key TEXT NOT NULL CHECK (char_length(trim(pix_key)) BETWEEN 1 AND 200),
  pix_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_recipients_league_active_idx ON public.payment_recipients(league_id, is_active, name);
ALTER TABLE public.payment_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_recipients_read ON public.payment_recipients FOR SELECT TO authenticated USING (public.is_app_admin());
CREATE POLICY payment_recipients_manage ON public.payment_recipients FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_recipients TO authenticated;

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS payment_recipient_id UUID REFERENCES public.payment_recipients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_recipient_name TEXT;
