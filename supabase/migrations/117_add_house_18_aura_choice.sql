-- Adiciona uma segunda aura epica a Casa 18 do Passe BQ.
-- A nova opcao usa a mesma recompensa para preservar progresso e escolhas.

BEGIN;

INSERT INTO public.fantasy_cosmetics (
  slug, slot, rarity, name, description, asset_key
)
VALUES (
  'aura-var-da-varzea',
  'aura',
  'epic',
  'VAR da Várzea',
  'Linhas de impedimento atravessam a foto num replay bem duvidoso.',
  'aura-var-da-varzea'
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
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = 'aura-var-da-varzea'
WHERE reward.reward_key = 'pass-aura-02'
ON CONFLICT (reward_id, cosmetic_id) DO NOTHING;

-- Quem ja escolheu a Gloria da Decisao encontra a nova alternativa na loja,
-- pelo mesmo preco epico aplicado as demais opcoes recusadas do Passe.
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
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = 'aura-var-da-varzea'
WHERE reward.reward_key = 'pass-aura-02'
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
