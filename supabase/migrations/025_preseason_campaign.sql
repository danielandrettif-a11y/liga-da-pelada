-- Permite que os administradores liguem a campanha visual de pré-temporada.
-- Desligada por padrão para preservar a página inicial já publicada.

ALTER TABLE public.leagues
ADD COLUMN IF NOT EXISTS preseason_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.leagues.preseason_enabled IS
'Exibe o carrossel da campanha de pré-temporada na página inicial.';
