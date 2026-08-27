-- Atualiza os cinco nameplates do Passe sem remover itens já conquistados.
UPDATE public.fantasy_cosmetics SET
  slug = 'nameplate-ficha-vestiario', name = 'Ficha do Vestiário',
  description = 'Madeira, número de armário e fita esportiva.', asset_key = 'nameplate-ficha-vestiario', rarity = 'common'
WHERE slug = 'nameplate-placar';

UPDATE public.fantasy_cosmetics SET
  slug = 'nameplate-placar-quadra', name = 'Placar da Quadra',
  description = 'LED verde e luz de jogo noturno.', asset_key = 'nameplate-placar-quadra', rarity = 'common'
WHERE slug = 'nameplate-faixa';

UPDATE public.fantasy_cosmetics SET
  slug = 'nameplate-faixa-torcida', name = 'Faixa da Torcida',
  description = 'Tecido de arquibancada com costura e presença.', asset_key = 'nameplate-faixa-torcida', rarity = 'rare'
WHERE slug = 'nameplate-retro-90';

UPDATE public.fantasy_cosmetics SET
  slug = 'nameplate-prancheta-tatica', name = 'Prancheta Tática',
  description = 'Setas, ímãs e esquema rabiscado.', asset_key = 'nameplate-prancheta-tatica', rarity = 'rare'
WHERE slug = 'nameplate-prancheta';

UPDATE public.fantasy_cosmetics SET
  slug = 'nameplate-sumula-juiz', name = 'Súmula do Juiz',
  description = 'Papel de jogo, caneta e cartão amarelo.', asset_key = 'nameplate-sumula-juiz', rarity = 'epic'
WHERE slug = 'nameplate-varzea-raiz';

DELETE FROM public.fantasy_season_pass_reward_options option_item
USING public.fantasy_season_pass_rewards reward
WHERE option_item.reward_id = reward.id
  AND reward.reward_key IN ('pass-nameplate-01', 'pass-nameplate-02', 'pass-nameplate-03');

INSERT INTO public.fantasy_season_pass_reward_options (reward_id, cosmetic_id)
SELECT reward.id, cosmetic.id
FROM public.fantasy_season_pass_rewards reward
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = ANY (
  CASE reward.reward_key
    WHEN 'pass-nameplate-01' THEN ARRAY['nameplate-ficha-vestiario', 'nameplate-placar-quadra']
    WHEN 'pass-nameplate-03' THEN ARRAY['nameplate-faixa-torcida', 'nameplate-prancheta-tatica']
    WHEN 'pass-nameplate-02' THEN ARRAY['nameplate-sumula-juiz']
    ELSE ARRAY[]::TEXT[]
  END
)
WHERE reward.reward_key IN ('pass-nameplate-01', 'pass-nameplate-02', 'pass-nameplate-03')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
