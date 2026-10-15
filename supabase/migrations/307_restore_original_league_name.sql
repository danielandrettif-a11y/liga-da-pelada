-- A liga legada é a única com este ID fixo no seed inicial. Mantém o slug
-- existente para não invalidar convites já enviados.
UPDATE public.leagues
SET name = 'Pelada BQ'
WHERE id = 'b0000000-0000-0000-0000-000000000001'
  AND name = 'Liga da Pelada';
