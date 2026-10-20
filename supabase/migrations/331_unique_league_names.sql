-- Impede nomes de peladas repetidos, ignorando caixa e espaços excedentes.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS leagues_name_normalized_unique
  ON public.leagues (
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  );

COMMIT;
