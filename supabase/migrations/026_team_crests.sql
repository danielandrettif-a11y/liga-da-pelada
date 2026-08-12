-- Mantém a identidade visual escolhida para cada time em todas as telas da rodada.

ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS crest_url TEXT;

COMMENT ON COLUMN public.teams.crest_url IS
'Caminho público do escudo usado pelo time nesta rodada.';
