-- Reorganiza os prêmios do Passe sem recriar registros: escolhas e itens já
-- resgatados continuam ligados ao mesmo reward_id.
-- O campo fica com cinco marcos reais: GOL, defesa, meio, ataque e LENDA.

BEGIN;

ALTER TABLE public.fantasy_season_pass_rewards
  DROP CONSTRAINT IF EXISTS fantasy_season_pass_rewards_house_check;
ALTER TABLE public.fantasy_season_pass_rewards
  ADD CONSTRAINT fantasy_season_pass_rewards_house_check CHECK (house BETWEEN 1 AND 140);

-- Libera as casas finais antes de deslocar os registros, evitando colisões na
-- chave única (fantasy_season_id, house).
UPDATE public.fantasy_season_pass_rewards
SET house = house + 100
WHERE reward_key IN (
  'pass-pack-bronze', 'pass-title-01', 'pass-frame-01', 'pass-background-01',
  'pass-aura-01', 'pass-nameplate-01', 'pass-pack-gold', 'pass-banner-01',
  'pass-title-02', 'pass-frame-02', 'pass-background-02', 'pass-aura-02',
  'pass-nameplate-02', 'pass-banner-02', 'pass-title-03', 'pass-legendary',
  'pass-title-04', 'pass-title-05', 'pass-title-06', 'pass-title-07',
  'pass-frame-03', 'pass-background-03', 'pass-aura-03', 'pass-nameplate-03',
  'pass-banner-03'
);

UPDATE public.fantasy_season_pass_rewards
SET house = CASE reward_key
  WHEN 'pass-pack-bronze' THEN 1
  WHEN 'pass-frame-03' THEN 3
  WHEN 'pass-title-01' THEN 5
  WHEN 'pass-background-03' THEN 6
  WHEN 'pass-aura-03' THEN 7
  WHEN 'pass-title-04' THEN 8
  WHEN 'pass-nameplate-03' THEN 9
  WHEN 'pass-frame-01' THEN 10
  WHEN 'pass-title-06' THEN 11
  WHEN 'pass-background-01' THEN 12
  WHEN 'pass-aura-02' THEN 13
  WHEN 'pass-title-05' THEN 14
  WHEN 'pass-banner-02' THEN 15
  WHEN 'pass-aura-01' THEN 16
  WHEN 'pass-nameplate-02' THEN 17
  WHEN 'pass-frame-02' THEN 18
  WHEN 'pass-nameplate-01' THEN 20
  WHEN 'pass-title-02' THEN 21
  WHEN 'pass-background-02' THEN 22
  WHEN 'pass-pack-gold' THEN 24
  WHEN 'pass-banner-01' THEN 25
  WHEN 'pass-title-07' THEN 29
  WHEN 'pass-title-03' THEN 33
  WHEN 'pass-banner-03' THEN 37
  WHEN 'pass-legendary' THEN 40
END
WHERE house BETWEEN 101 AND 140;

ALTER TABLE public.fantasy_season_pass_rewards
  DROP CONSTRAINT IF EXISTS fantasy_season_pass_rewards_house_check;
ALTER TABLE public.fantasy_season_pass_rewards
  ADD CONSTRAINT fantasy_season_pass_rewards_house_check CHECK (house BETWEEN 1 AND 40);

COMMIT;

NOTIFY pgrst, 'reload schema';
