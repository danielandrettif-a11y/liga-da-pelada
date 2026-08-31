-- Adiciona um segundo nameplate epico a Casa 22 do Passe BQ.
-- A recompensa existente e preservada para nao alterar progresso ou escolhas.

BEGIN;

INSERT INTO public.fantasy_cosmetics (
  slug, slot, rarity, name, description, asset_key
)
VALUES (
  'nameplate-placa-substituicao',
  'nameplate',
  'epic',
  'Placa de Substituição',
  'Entrou para resolver — ou pedir substituição cinco minutos depois.',
  'nameplate-placa-substituicao'
)
ON CONFLICT (slug) DO UPDATE SET
  slot = EXCLUDED.slot,
  rarity = EXCLUDED.rarity,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  asset_key = EXCLUDED.asset_key;

INSERT INTO public.fantasy_season_pass_reward_options (reward_id, cosmetic_id)
SELECT reward.id, cosmetic.id
FROM public.fantasy_season_pass_rewards reward
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = 'nameplate-placa-substituicao'
WHERE reward.reward_key = 'pass-nameplate-02'
ON CONFLICT (reward_id, cosmetic_id) DO NOTHING;

-- Quem ja escolheu a Sumula do Juiz recebe a nova alternativa na Loja do Passe.
INSERT INTO public.fantasy_season_pass_shop_items (
  fantasy_season_id, user_id, source_reward_id, cosmetic_id, price_points
)
SELECT
  reward.fantasy_season_id,
  choice_item.user_id,
  reward.id,
  cosmetic.id,
  public.fantasy_pass_shop_price(cosmetic.rarity)
FROM public.fantasy_user_cosmetic_reward_choices choice_item
JOIN public.fantasy_season_pass_rewards reward ON reward.id = choice_item.reward_id
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = 'nameplate-placa-substituicao'
WHERE reward.reward_key = 'pass-nameplate-02'
  AND choice_item.cosmetic_id <> cosmetic.id
  AND NOT EXISTS (
    SELECT 1
    FROM public.fantasy_user_cosmetics owned
    WHERE owned.user_id = choice_item.user_id
      AND owned.cosmetic_id = cosmetic.id
  )
ON CONFLICT (user_id, source_reward_id, cosmetic_id) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
