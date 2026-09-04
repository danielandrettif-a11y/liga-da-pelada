-- ============================================================================
-- Migration 132: Sorteio por Velocidade — Tabela Privada Administrativa
-- ============================================================================
-- Cria a tabela player_admin_attributes com speed_rating (1 a 3 estrelas).
-- Restrita exclusivamente para administradores via RLS.
-- Jogadores comuns nunca têm acesso a estes dados.

CREATE TABLE IF NOT EXISTS public.player_admin_attributes (
  player_id UUID PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  speed_rating SMALLINT CHECK (speed_rating IS NULL OR (speed_rating >= 1 AND speed_rating <= 3)),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.player_admin_attributes ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS exclusivas para administradores
CREATE POLICY admin_only_select ON public.player_admin_attributes
  FOR SELECT USING (public.is_app_admin());

CREATE POLICY admin_only_insert ON public.player_admin_attributes
  FOR INSERT WITH CHECK (public.is_app_admin());

CREATE POLICY admin_only_update ON public.player_admin_attributes
  FOR UPDATE USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

CREATE POLICY admin_only_delete ON public.player_admin_attributes
  FOR DELETE USING (public.is_app_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_admin_attributes TO authenticated;

NOTIFY pgrst, 'reload schema';
