-- Corrige a zoeira do título: o "Inimigo da Marcação" é quem evita marcar.
UPDATE public.fantasy_cosmetics
SET description = 'Na marcação, ele nunca quer acompanhar.'
WHERE slug = 'title-inimigo-da-marcacao'
  AND slot = 'title';
