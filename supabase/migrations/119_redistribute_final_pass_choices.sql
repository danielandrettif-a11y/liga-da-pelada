-- Redistribui as oito opcoes que estavam concentradas nas casas 37 e 40.
-- Os quatro grupos de escolha passam a cair em semanas diferentes da trilha,
-- aproveitando casas sem premio e evitando acumulo no encerramento.
-- A casa 40 fica livre para receber a recompensa final em uma migration futura.

BEGIN;

UPDATE public.fantasy_season_pass_rewards
SET house = CASE reward_key
  WHEN 'pass-title-03' THEN 3
  WHEN 'pass-banner-03' THEN 15
  WHEN 'pass-title-07' THEN 31
  WHEN 'pass-legendary' THEN 35
  ELSE house
END
WHERE reward_key IN (
  'pass-title-07',
  'pass-banner-03',
  'pass-title-03',
  'pass-legendary'
);

COMMIT;

NOTIFY pgrst, 'reload schema';
