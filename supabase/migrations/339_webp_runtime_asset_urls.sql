-- Mantem dados persistidos apontando para as variantes WebP usadas pelo app.
BEGIN;

UPDATE public.teams
SET crest_url = regexp_replace(crest_url, '\.png$', '.webp')
WHERE crest_url IN (
  '/team-crests/inter-de-meiao.png',
  '/team-crests/meia-boca-juniors.png',
  '/team-crests/patetico-de-madrid.png',
  '/team-crests/milamb.png'
);

UPDATE public.fantasy_cards
SET image_url = regexp_replace(image_url, '\.png$', '.webp')
WHERE slug IN ('emergency_sub', 'safe_prediction', 'extra_credit', 'bargain')
  AND image_url LIKE '%.png';

COMMIT;
