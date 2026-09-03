-- Fecha a trilha principal com um conjunto lendario completo e cria o
-- primeiro cosmetico de campo do Cartola, vendido somente apos a casa 40.

BEGIN;

ALTER TABLE public.fantasy_cosmetics
  DROP CONSTRAINT IF EXISTS fantasy_cosmetics_slot_check;
ALTER TABLE public.fantasy_cosmetics
  ADD CONSTRAINT fantasy_cosmetics_slot_check
  CHECK (slot IN ('banner', 'frame', 'title', 'aura', 'nameplate', 'background', 'showcase', 'pitch'));

ALTER TABLE public.fantasy_user_cosmetic_loadouts
  ADD COLUMN IF NOT EXISTS showcase_cosmetic_id UUID REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pitch_cosmetic_id UUID REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL;

INSERT INTO public.fantasy_cosmetics (slug, slot, rarity, name, description, asset_key) VALUES
  ('aura-eco-do-alambrado', 'aura', 'epic', 'Eco do Alambrado', 'O grito da torcida circula a foto como uma onda de energia.', 'aura-eco-alambrado'),
  ('nameplate-portao-do-campinho', 'nameplate', 'epic', 'Portão do Campinho', 'Ferro, tela e a entrada de quem chegou para jogar.', 'nameplate-portao-campinho'),
  ('aura-lenda-campinho', 'aura', 'legendary', 'Aura da Última Luz', 'Refletores dourados anunciam quem completou as quarenta casas.', 'aura-lenda-campinho'),
  ('banner-lenda-campinho', 'banner', 'legendary', 'Capa Lenda do Campinho', 'O campinho aceso, a quebrada ao fundo e a noite reservada aos lendários.', 'banner-lenda-campinho'),
  ('frame-lenda-campinho', 'frame', 'legendary', 'Moldura Lenda do Campinho', 'Traves, rede e ouro envelhecido em volta da sua foto.', 'frame-lenda-campinho'),
  ('nameplate-lenda-campinho', 'nameplate', 'legendary', 'Nameplate Lenda do Campinho', 'Uma placa de ouro e verde para quem concluiu a trilha.', 'nameplate-lenda-campinho'),
  ('background-lenda-campinho', 'background', 'legendary', 'Fundo Lenda do Campinho', 'A última pelada da noite iluminando o perfil inteiro.', 'background-lenda-campinho'),
  ('showcase-lenda-campinho', 'showcase', 'legendary', 'Emblema Casa 40', 'O escudo de conclusão exibido no quadrado de destaque do Elenco.', 'showcase-lenda-campinho'),
  ('pitch-lenda-campinho', 'pitch', 'legendary', 'Campo Lenda do Campinho', 'Campo exclusivo preto, ouro e verde para montar a escalação no Cartola.', 'pitch-lenda-campinho')
ON CONFLICT (slug) DO UPDATE SET
  slot = EXCLUDED.slot,
  rarity = EXCLUDED.rarity,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  asset_key = EXCLUDED.asset_key;

-- As escolhas que dividiam as casas 18 e 22 passam a ocupar casas vazias.
UPDATE public.fantasy_season_pass_rewards SET house = 17 WHERE reward_key = 'pass-aura-02';
UPDATE public.fantasy_season_pass_rewards SET house = 21 WHERE reward_key = 'pass-nameplate-02';

-- Cada uma dessas escolhas ganha uma alternativa nova.
INSERT INTO public.fantasy_season_pass_reward_options (reward_id, cosmetic_id)
SELECT reward.id, cosmetic.id
FROM public.fantasy_season_pass_rewards reward
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = CASE reward.reward_key
  WHEN 'pass-aura-02' THEN 'aura-eco-do-alambrado'
  WHEN 'pass-nameplate-02' THEN 'nameplate-portao-do-campinho'
END
WHERE reward.reward_key IN ('pass-aura-02', 'pass-nameplate-02')
ON CONFLICT (reward_id, cosmetic_id) DO NOTHING;

-- Quem ja escolheu esses premios encontra as novas alternativas na loja.
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
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = CASE reward.reward_key
  WHEN 'pass-aura-02' THEN 'aura-eco-do-alambrado'
  WHEN 'pass-nameplate-02' THEN 'nameplate-portao-do-campinho'
END
WHERE reward.reward_key IN ('pass-aura-02', 'pass-nameplate-02')
  AND choice_item.cosmetic_id <> cosmetic.id
  AND NOT EXISTS (
    SELECT 1 FROM public.fantasy_user_cosmetics owned
    WHERE owned.user_id = choice_item.user_id AND owned.cosmetic_id = cosmetic.id
  )
ON CONFLICT (user_id, source_reward_id, cosmetic_id) DO NOTHING;

-- A casa 40 entrega as seis pecas do conjunto, em categorias separadas.
INSERT INTO public.fantasy_season_pass_rewards (
  fantasy_season_id, house, reward_key, status, reward_type, card_tier
)
SELECT season.id, 40, reward.reward_key, 'development', 'cosmetic_choice', NULL
FROM public.fantasy_seasons season
CROSS JOIN (VALUES
  ('pass-house40-aura'),
  ('pass-house40-banner'),
  ('pass-house40-frame'),
  ('pass-house40-nameplate'),
  ('pass-house40-background'),
  ('pass-house40-showcase'),
  ('pass-shop-pitch-40')
) AS reward(reward_key)
ON CONFLICT (fantasy_season_id, reward_key) DO UPDATE SET
  house = EXCLUDED.house,
  status = EXCLUDED.status,
  reward_type = EXCLUDED.reward_type,
  card_tier = EXCLUDED.card_tier;

INSERT INTO public.fantasy_season_pass_reward_options (reward_id, cosmetic_id)
SELECT reward.id, cosmetic.id
FROM public.fantasy_season_pass_rewards reward
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = CASE reward.reward_key
  WHEN 'pass-house40-aura' THEN 'aura-lenda-campinho'
  WHEN 'pass-house40-banner' THEN 'banner-lenda-campinho'
  WHEN 'pass-house40-frame' THEN 'frame-lenda-campinho'
  WHEN 'pass-house40-nameplate' THEN 'nameplate-lenda-campinho'
  WHEN 'pass-house40-background' THEN 'background-lenda-campinho'
  WHEN 'pass-house40-showcase' THEN 'showcase-lenda-campinho'
END
WHERE reward.reward_key IN (
  'pass-house40-aura', 'pass-house40-banner', 'pass-house40-frame',
  'pass-house40-nameplate', 'pass-house40-background', 'pass-house40-showcase'
)
ON CONFLICT (reward_id, cosmetic_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.equip_fantasy_cosmetic(
  p_fantasy_season_id UUID,
  p_slot TEXT,
  p_cosmetic_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE column_name TEXT;
BEGIN
  IF p_slot NOT IN ('banner', 'frame', 'title', 'aura', 'nameplate', 'background', 'showcase', 'pitch') THEN
    RAISE EXCEPTION 'Slot inválido';
  END IF;
  IF p_cosmetic_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.fantasy_user_cosmetics own
    JOIN public.fantasy_cosmetics cosmetic ON cosmetic.id = own.cosmetic_id
    WHERE own.user_id = auth.uid()
      AND own.cosmetic_id = p_cosmetic_id
      AND cosmetic.slot = p_slot
  ) THEN
    RAISE EXCEPTION 'Cosmético não pertence ao usuário ou ocupa outro slot';
  END IF;

  column_name := p_slot || '_cosmetic_id';
  INSERT INTO public.fantasy_user_cosmetic_loadouts (user_id, fantasy_season_id)
  VALUES (auth.uid(), p_fantasy_season_id)
  ON CONFLICT (user_id, fantasy_season_id) DO NOTHING;

  EXECUTE format(
    'UPDATE public.fantasy_user_cosmetic_loadouts SET %I = $1, updated_at = now() WHERE user_id = auth.uid() AND fantasy_season_id = $2',
    column_name
  ) USING p_cosmetic_id, p_fantasy_season_id;
  RETURN true;
END;
$$;

-- Oferta exclusiva: cara o bastante para exigir escolha, mas ainda atingivel
-- com a trilha extra. Nunca aparece antes da conclusao da casa 40.
CREATE OR REPLACE FUNCTION public.sync_fantasy_house_40_pitch_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.progress >= 40 THEN
    INSERT INTO public.fantasy_season_pass_shop_items (
      fantasy_season_id, user_id, source_reward_id, cosmetic_id, price_points
    )
    SELECT NEW.fantasy_season_id, NEW.user_id, reward.id, cosmetic.id, 18
    FROM public.fantasy_season_pass_rewards reward
    JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = 'pitch-lenda-campinho'
    WHERE reward.fantasy_season_id = NEW.fantasy_season_id
      AND reward.reward_key = 'pass-shop-pitch-40'
    ON CONFLICT (user_id, source_reward_id, cosmetic_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fantasy_house_40_pitch_offer_trigger ON public.fantasy_season_passes;
CREATE TRIGGER fantasy_house_40_pitch_offer_trigger
AFTER INSERT OR UPDATE OF progress ON public.fantasy_season_passes
FOR EACH ROW EXECUTE FUNCTION public.sync_fantasy_house_40_pitch_offer();

INSERT INTO public.fantasy_season_pass_shop_items (
  fantasy_season_id, user_id, source_reward_id, cosmetic_id, price_points
)
SELECT pass.fantasy_season_id, pass.user_id, reward.id, cosmetic.id, 18
FROM public.fantasy_season_passes pass
JOIN public.fantasy_season_pass_rewards reward
  ON reward.fantasy_season_id = pass.fantasy_season_id
 AND reward.reward_key = 'pass-shop-pitch-40'
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = 'pitch-lenda-campinho'
WHERE pass.progress >= 40
ON CONFLICT (user_id, source_reward_id, cosmetic_id) DO NOTHING;

GRANT EXECUTE ON FUNCTION public.equip_fantasy_cosmetic(UUID, TEXT, UUID) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
