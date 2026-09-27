BEGIN;

-- A lista de editores fica sem grants diretos. A função abaixo é a única
-- forma de verificar a permissão e preserva a identidade mesmo se o nome mudar.
CREATE TABLE IF NOT EXISTS public.private_balance_tag_editors (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.private_balance_tag_editors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.private_balance_tag_editors FROM PUBLIC, anon, authenticated;

INSERT INTO public.private_balance_tag_editors (user_id)
SELECT account.user_id
FROM public.account_profiles account
JOIN public.players player ON player.id = account.player_id
WHERE lower(trim(player.name)) = 'daniel andretti'
   OR lower(trim(COALESCE(player.nickname, ''))) = 'daniel andretti'
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_manage_private_balance_tags()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.private_balance_tag_editors editor WHERE editor.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_private_balance_tags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_private_balance_tags() TO authenticated;

CREATE TABLE IF NOT EXISTS public.player_private_balance_tags (
  player_id UUID PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  balance_tag TEXT NOT NULL CHECK (balance_tag IN ('bagre_1', 'bagre_2', 'craque_1', 'craque_2')),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.player_private_balance_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY private_balance_tags_select ON public.player_private_balance_tags
  FOR SELECT USING (public.can_manage_private_balance_tags());
CREATE POLICY private_balance_tags_insert ON public.player_private_balance_tags
  FOR INSERT WITH CHECK (public.can_manage_private_balance_tags());
CREATE POLICY private_balance_tags_update ON public.player_private_balance_tags
  FOR UPDATE USING (public.can_manage_private_balance_tags()) WITH CHECK (public.can_manage_private_balance_tags());
CREATE POLICY private_balance_tags_delete ON public.player_private_balance_tags
  FOR DELETE USING (public.can_manage_private_balance_tags());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_private_balance_tags TO authenticated;

COMMENT ON TABLE public.player_private_balance_tags IS
  'Classificação sigilosa usada apenas pelo equilíbrio completo; visível somente ao editor autorizado.';

NOTIFY pgrst, 'reload schema';
COMMIT;
