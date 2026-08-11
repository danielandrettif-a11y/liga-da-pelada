-- Biografias curtas para os perfis da comunidade.

ALTER TABLE players
ADD COLUMN IF NOT EXISTS profile_bio TEXT;

ALTER TABLE players
DROP CONSTRAINT IF EXISTS players_profile_bio_length_check;

ALTER TABLE players
ADD CONSTRAINT players_profile_bio_length_check
CHECK (profile_bio IS NULL OR char_length(profile_bio) <= 500);

-- Preenche os perfis pedidos sem substituir textos que um ADM já tenha escrito.
UPDATE players
SET profile_bio = 'Diretamente de Cachoeiro de Itapemirim, Anna é engenheira civil, trabalha no Porto do Açu e forma dupla com Daniel fora das quatro linhas. Na Pelada de Baixa Qualidade, representa as WAGs e fortalece a arquibancada.'
WHERE lower(trim(name)) = 'anna clara'
  AND NULLIF(trim(profile_bio), '') IS NULL;

UPDATE players
SET profile_bio = 'Diretamente de Rio das Ostras, Duda trabalha na Águas do Paraíba, em Campos, e forma dupla com Matheus fora das quatro linhas. Na Pelada de Baixa Qualidade, representa as WAGs e fortalece a arquibancada.'
WHERE lower(trim(name)) = 'duda manteiga'
  AND NULLIF(trim(profile_bio), '') IS NULL;

COMMENT ON COLUMN players.profile_bio IS 'Biografia pública curta, editável por administradores pelo aplicativo.';
