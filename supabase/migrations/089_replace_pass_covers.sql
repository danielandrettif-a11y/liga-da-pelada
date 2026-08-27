-- Nova coleção de capas do Passe BQ. Mantém os IDs das capas já concedidas.
UPDATE public.fantasy_cosmetics SET
  slug = 'banner-campo-domingo', name = 'Campo de Domingo',
  description = 'Gramado, cal e sol de fim de tarde.', asset_key = 'banner-campo-domingo', rarity = 'rare'
WHERE slug = 'banner-campo-noite';

UPDATE public.fantasy_cosmetics SET
  slug = 'banner-arquibancada-concreto', name = 'Arquibancada de Concreto',
  description = 'Grades, cadeiras e luz de jogo noturno.', asset_key = 'banner-arquibancada-concreto', rarity = 'rare'
WHERE slug = 'banner-arquibancada-neon';

UPDATE public.fantasy_cosmetics SET
  slug = 'banner-vestiario-pos-jogo', name = 'Vestiário Pós-Jogo',
  description = 'Armários, camisa dobrada e resenha depois do apito.', asset_key = 'banner-vestiario-pos-jogo', rarity = 'rare'
WHERE slug = 'banner-tunel-estadio';

UPDATE public.fantasy_cosmetics SET
  slug = 'banner-tunel-quadra', name = 'Túnel da Quadra',
  description = 'A passagem escura até a luz do jogo.', asset_key = 'banner-tunel-quadra', rarity = 'rare'
WHERE slug = 'banner-torcida-bq';

UPDATE public.fantasy_cosmetics SET
  slug = 'banner-chuva-campo', name = 'Chuva no Campo',
  description = 'Gramado molhado e refletores no espelho d’água.', asset_key = 'banner-chuva-campo', rarity = 'rare'
WHERE slug = 'banner-concreto-verde';

UPDATE public.fantasy_cosmetics SET
  name = 'Lenda da Várzea', description = 'Taça envelhecida, gramado e fumaça de história.', asset_key = 'banner-lenda-varzea', rarity = 'legendary'
WHERE slug = 'theme-lenda-varzea';

UPDATE public.fantasy_cosmetics SET
  name = 'Rei do Estádio', description = 'LED verde e domínio na noite de decisão.', asset_key = 'banner-rei-estadio', rarity = 'legendary'
WHERE slug = 'theme-rei-estadio';

INSERT INTO public.fantasy_cosmetics (slug, slot, rarity, name, description, asset_key) VALUES
  ('banner-bar-campo', 'banner', 'rare', 'Bar do Campo', 'Cerveja gelada, madeira e jogo rolando ao lado.', 'banner-bar-campo')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, asset_key = EXCLUDED.asset_key, rarity = EXCLUDED.rarity;

DELETE FROM public.fantasy_season_pass_reward_options option_item
USING public.fantasy_season_pass_rewards reward
WHERE option_item.reward_id = reward.id
  AND reward.reward_key IN ('pass-banner-01', 'pass-banner-02', 'pass-banner-03', 'pass-legendary');

INSERT INTO public.fantasy_season_pass_reward_options (reward_id, cosmetic_id)
SELECT reward.id, cosmetic.id
FROM public.fantasy_season_pass_rewards reward
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = ANY (
  CASE reward.reward_key
    WHEN 'pass-banner-01' THEN ARRAY['banner-campo-domingo', 'banner-arquibancada-concreto']
    WHEN 'pass-banner-02' THEN ARRAY['banner-vestiario-pos-jogo', 'banner-tunel-quadra']
    WHEN 'pass-banner-03' THEN ARRAY['banner-chuva-campo', 'banner-bar-campo']
    WHEN 'pass-legendary' THEN ARRAY['theme-lenda-varzea', 'theme-rei-estadio']
    ELSE ARRAY[]::TEXT[]
  END
)
WHERE reward.reward_key IN ('pass-banner-01', 'pass-banner-02', 'pass-banner-03', 'pass-legendary')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
