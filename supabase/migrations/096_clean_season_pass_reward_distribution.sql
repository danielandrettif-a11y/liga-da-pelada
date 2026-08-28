-- Distribui os 25 prêmios em 18 das 40 casas. Sete casas entregam dois
-- prêmios; as demais casas continuam sendo progresso visual sem recompensa.

BEGIN;

-- A modelagem original permitia só uma recompensa por casa. A identidade da
-- recompensa passa a ser reward_key por temporada, permitindo dois itens no
-- mesmo marco sem duplicar o mesmo prêmio.
ALTER TABLE public.fantasy_season_pass_rewards
  DROP CONSTRAINT IF EXISTS fantasy_season_pass_rewards_fantasy_season_id_house_key;
DROP INDEX IF EXISTS public.fantasy_season_pass_rewards_fantasy_season_id_house_key;

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_season_pass_rewards_season_reward_key_unique
  ON public.fantasy_season_pass_rewards (fantasy_season_id, reward_key);

UPDATE public.fantasy_season_pass_rewards
SET house = CASE reward_key
  -- Arquibancada: 8 prêmios em 6 casas.
  WHEN 'pass-pack-bronze' THEN 2
  WHEN 'pass-title-01' THEN 4
  WHEN 'pass-frame-03' THEN 6
  WHEN 'pass-background-03' THEN 6
  WHEN 'pass-aura-03' THEN 9
  WHEN 'pass-title-04' THEN 11
  WHEN 'pass-nameplate-03' THEN 11
  WHEN 'pass-frame-01' THEN 12

  -- Banco: 8 prêmios em 6 casas.
  WHEN 'pass-title-06' THEN 14
  WHEN 'pass-background-01' THEN 16
  WHEN 'pass-aura-02' THEN 18
  WHEN 'pass-title-05' THEN 18
  WHEN 'pass-banner-02' THEN 20
  WHEN 'pass-aura-01' THEN 22
  WHEN 'pass-nameplate-02' THEN 22
  WHEN 'pass-frame-02' THEN 24

  -- Campo 4-3-3: 9 prêmios em 6 posições/faixas.
  WHEN 'pass-nameplate-01' THEN 25
  WHEN 'pass-title-02' THEN 27
  WHEN 'pass-background-02' THEN 29
  WHEN 'pass-pack-gold' THEN 29
  WHEN 'pass-banner-01' THEN 33
  WHEN 'pass-title-07' THEN 37
  WHEN 'pass-title-03' THEN 37
  WHEN 'pass-banner-03' THEN 40
  WHEN 'pass-legendary' THEN 40
  ELSE house
END;

COMMIT;

NOTIFY pgrst, 'reload schema';
