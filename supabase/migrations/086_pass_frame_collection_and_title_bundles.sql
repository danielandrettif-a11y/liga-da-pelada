-- Nova coleção de molduras Várzea Premium.
-- Seis ficam nas casas de moldura; três entram como bônus garantido em escolhas de título.

ALTER TABLE public.fantasy_season_pass_rewards
  ADD COLUMN IF NOT EXISTS bonus_cosmetic_id UUID REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL;

INSERT INTO public.fantasy_cosmetics (slug, slot, rarity, name, description, asset_key) VALUES
  ('frame-colete-treino', 'frame', 'common', 'Colete de Treino', 'Tecido fluorescente, costura e sujeira de campo.', 'frame-colete-treino'),
  ('frame-area-tecnica', 'frame', 'common', 'Área Técnica', 'Linha branca, banco e garrafa na beira da quadra.', 'frame-area-tecnica'),
  ('frame-prancheta-tecnico', 'frame', 'rare', 'Prancheta do Técnico', 'Esquema tático, ímãs e rabiscos de quem escala.', 'frame-prancheta-tecnico'),
  ('frame-placar-estadio', 'frame', 'epic', 'Placar de Estádio', 'LED retrô e refletores de noite decisiva.', 'frame-placar-estadio'),
  ('frame-arquibancada', 'frame', 'rare', 'Arquibancada', 'Grades, bandeiras e a torcida no alambrado.', 'frame-arquibancada'),
  ('frame-escanteio', 'frame', 'common', 'Escanteio', 'Bandeirinha, cal levantada e bola no canto.', 'frame-escanteio'),
  ('frame-vestiario-premium', 'frame', 'rare', 'Vestiário', 'Madeira, cabides, fita esportiva e concentração.', 'frame-vestiario'),
  ('frame-apito-arbitro', 'frame', 'rare', 'Apito do Árbitro', 'Cordão preto e apito metálico na borda.', 'frame-apito-arbitro'),
  ('frame-luvas-goleiro', 'frame', 'epic', 'Luvas de Goleiro', 'Palma, fita de punho e rede de gol.', 'frame-luvas-goleiro')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, rarity = EXCLUDED.rarity, asset_key = EXCLUDED.asset_key;

-- Troca somente as escolhas de moldura: itens antigos já conquistados continuam no inventário.
DELETE FROM public.fantasy_season_pass_reward_options option_item
USING public.fantasy_season_pass_rewards reward
WHERE option_item.reward_id = reward.id
  AND reward.reward_key IN ('pass-frame-01', 'pass-frame-02', 'pass-frame-03');

INSERT INTO public.fantasy_season_pass_reward_options (reward_id, cosmetic_id)
SELECT reward.id, cosmetic.id
FROM public.fantasy_season_pass_rewards reward
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = ANY (
  CASE reward.reward_key
    WHEN 'pass-frame-01' THEN ARRAY['frame-colete-treino', 'frame-area-tecnica']
    WHEN 'pass-frame-02' THEN ARRAY['frame-prancheta-tecnico', 'frame-placar-estadio']
    WHEN 'pass-frame-03' THEN ARRAY['frame-arquibancada', 'frame-escanteio']
    ELSE ARRAY[]::TEXT[]
  END
)
WHERE reward.reward_key IN ('pass-frame-01', 'pass-frame-02', 'pass-frame-03')
ON CONFLICT DO NOTHING;

-- As três restantes acompanham escolhas de título, sem reduzir as escolhas de moldura do Passe.
UPDATE public.fantasy_season_pass_rewards reward
SET bonus_cosmetic_id = cosmetic.id
FROM public.fantasy_cosmetics cosmetic
WHERE (reward.reward_key, cosmetic.slug) IN (
  ('pass-title-04', 'frame-vestiario-premium'),
  ('pass-title-05', 'frame-apito-arbitro'),
  ('pass-title-07', 'frame-luvas-goleiro')
);

-- Quem já escolheu esses títulos recebe retroativamente a moldura do pacote.
INSERT INTO public.fantasy_user_cosmetics (user_id, cosmetic_id, source_reward_id)
SELECT choice_item.user_id, reward.bonus_cosmetic_id, reward.id
FROM public.fantasy_user_cosmetic_reward_choices choice_item
JOIN public.fantasy_season_pass_rewards reward ON reward.id = choice_item.reward_id
WHERE reward.bonus_cosmetic_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_fantasy_pass_cosmetic(p_reward_id UUID, p_cosmetic_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_progress INTEGER;
  previous_choice UUID;
  reward_bonus UUID;
BEGIN
  SELECT pass.progress, reward.bonus_cosmetic_id INTO user_progress, reward_bonus
  FROM public.fantasy_season_passes pass
  JOIN public.fantasy_season_pass_rewards reward ON reward.fantasy_season_id = pass.fantasy_season_id
  WHERE reward.id = p_reward_id AND pass.user_id = auth.uid();
  IF user_progress IS NULL OR user_progress < (SELECT house FROM public.fantasy_season_pass_rewards WHERE id = p_reward_id) THEN
    RAISE EXCEPTION 'Recompensa ainda não desbloqueada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_season_pass_reward_options WHERE reward_id = p_reward_id AND cosmetic_id = p_cosmetic_id) THEN
    RAISE EXCEPTION 'Escolha inválida.';
  END IF;
  SELECT cosmetic_id INTO previous_choice FROM public.fantasy_user_cosmetic_reward_choices
  WHERE user_id = auth.uid() AND reward_id = p_reward_id FOR UPDATE;
  IF previous_choice IS NOT NULL AND previous_choice <> p_cosmetic_id THEN
    RAISE EXCEPTION 'Esta recompensa já teve uma escolha permanente.';
  END IF;
  INSERT INTO public.fantasy_user_cosmetic_reward_choices (user_id, reward_id, cosmetic_id)
  VALUES (auth.uid(), p_reward_id, p_cosmetic_id) ON CONFLICT (user_id, reward_id) DO NOTHING;
  INSERT INTO public.fantasy_user_cosmetics (user_id, cosmetic_id, source_reward_id)
  VALUES (auth.uid(), p_cosmetic_id, p_reward_id) ON CONFLICT DO NOTHING;
  IF reward_bonus IS NOT NULL THEN
    INSERT INTO public.fantasy_user_cosmetics (user_id, cosmetic_id, source_reward_id)
    VALUES (auth.uid(), reward_bonus, p_reward_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_fantasy_pass_cosmetic(UUID, UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
