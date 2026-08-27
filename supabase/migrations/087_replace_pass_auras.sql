-- Substitui as auras antigas por uma coleção Várzea Premium, preservando os IDs
-- para que quem já possuía uma aura continue com o item equivalente atualizado.
UPDATE public.fantasy_cosmetics SET
  slug = 'aura-fumaca-torcida', name = 'Fumaça da Torcida',
  description = 'Fumaça verde subindo da arquibancada.', asset_key = 'aura-fumaca-torcida', rarity = 'common'
WHERE slug = 'aura-energia-bq';

UPDATE public.fantasy_cosmetics SET
  slug = 'aura-refletores-acesos', name = 'Refletores Acesos',
  description = 'Fachos de luz para noite de jogo.', asset_key = 'aura-refletores-acesos', rarity = 'common'
WHERE slug = 'aura-refletores';

UPDATE public.fantasy_cosmetics SET
  slug = 'aura-chuva-jogo', name = 'Chuva de Jogo',
  description = 'Brilho frio de uma partida molhada.', asset_key = 'aura-chuva-jogo', rarity = 'rare'
WHERE slug = 'aura-fumaca-verde';

UPDATE public.fantasy_cosmetics SET
  slug = 'aura-sinalizador-verde', name = 'Sinalizador Verde',
  description = 'A arquibancada chegou junto com você.', asset_key = 'aura-sinalizador-verde', rarity = 'epic'
WHERE slug = 'aura-flash-fotografos';

UPDATE public.fantasy_cosmetics SET
  slug = 'aura-noite-decisao', name = 'Noite de Decisão',
  description = 'Dourado profundo para jogo que vale tudo.', asset_key = 'aura-noite-decisao', rarity = 'epic'
WHERE slug = 'aura-luz-de-quadra';

-- Mantém as duas primeiras casas como escolhas e transforma a última em aura exclusiva.
DELETE FROM public.fantasy_season_pass_reward_options option_item
USING public.fantasy_season_pass_rewards reward
WHERE option_item.reward_id = reward.id AND reward.reward_key IN ('pass-aura-01', 'pass-aura-02', 'pass-aura-03');

INSERT INTO public.fantasy_season_pass_reward_options (reward_id, cosmetic_id)
SELECT reward.id, cosmetic.id
FROM public.fantasy_season_pass_rewards reward
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = ANY (
  CASE reward.reward_key
    WHEN 'pass-aura-01' THEN ARRAY['aura-fumaca-torcida', 'aura-refletores-acesos']
    WHEN 'pass-aura-03' THEN ARRAY['aura-chuva-jogo', 'aura-sinalizador-verde']
    WHEN 'pass-aura-02' THEN ARRAY['aura-noite-decisao']
    ELSE ARRAY[]::TEXT[]
  END
)
WHERE reward.reward_key IN ('pass-aura-01', 'pass-aura-02', 'pass-aura-03')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
