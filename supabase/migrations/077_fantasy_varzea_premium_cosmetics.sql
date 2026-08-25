-- Cosméticos V1 do Passe BQ: inventário, escolhas permanentes e loadout visual.

CREATE TABLE IF NOT EXISTS public.fantasy_cosmetics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  slot TEXT NOT NULL CHECK (slot IN ('banner', 'frame', 'title', 'aura', 'nameplate', 'background')),
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fantasy_season_pass_rewards
  DROP CONSTRAINT IF EXISTS fantasy_season_pass_rewards_house_check;
ALTER TABLE public.fantasy_season_pass_rewards
  ADD CONSTRAINT fantasy_season_pass_rewards_house_check CHECK (house BETWEEN 1 AND 40);
ALTER TABLE public.fantasy_season_pass_rewards
  ADD COLUMN IF NOT EXISTS reward_type TEXT NOT NULL DEFAULT 'cosmetic_choice'
    CHECK (reward_type IN ('cosmetic_choice', 'card_pack')),
  ADD COLUMN IF NOT EXISTS card_tier TEXT CHECK (card_tier IN ('bronze', 'gold'));

CREATE TABLE IF NOT EXISTS public.fantasy_season_pass_reward_options (
  reward_id UUID NOT NULL REFERENCES public.fantasy_season_pass_rewards(id) ON DELETE CASCADE,
  cosmetic_id UUID NOT NULL REFERENCES public.fantasy_cosmetics(id) ON DELETE CASCADE,
  PRIMARY KEY (reward_id, cosmetic_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_user_cosmetics (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cosmetic_id UUID NOT NULL REFERENCES public.fantasy_cosmetics(id) ON DELETE CASCADE,
  source_reward_id UUID REFERENCES public.fantasy_season_pass_rewards(id) ON DELETE SET NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cosmetic_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_user_cosmetic_reward_choices (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.fantasy_season_pass_rewards(id) ON DELETE CASCADE,
  cosmetic_id UUID NOT NULL REFERENCES public.fantasy_cosmetics(id) ON DELETE RESTRICT,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reward_id)
);

CREATE TABLE IF NOT EXISTS public.fantasy_user_cosmetic_loadouts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  banner_cosmetic_id UUID REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  frame_cosmetic_id UUID REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  title_cosmetic_id UUID REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  aura_cosmetic_id UUID REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  nameplate_cosmetic_id UUID REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  background_cosmetic_id UUID REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fantasy_season_id)
);

-- Pacotes do Passe usam o mesmo fluxo de abrir e escolher uma carta, sem exigir rodada.
ALTER TABLE public.fantasy_round_packs ALTER COLUMN round_id DROP NOT NULL;
ALTER TABLE public.fantasy_round_packs
  ADD COLUMN IF NOT EXISTS fantasy_season_pass_reward_id UUID REFERENCES public.fantasy_season_pass_rewards(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS card_tier TEXT CHECK (card_tier IN ('bronze', 'gold'));
ALTER TABLE public.fantasy_round_packs DROP CONSTRAINT IF EXISTS fantasy_round_packs_source_check;
ALTER TABLE public.fantasy_round_packs ADD CONSTRAINT fantasy_round_packs_source_check
  CHECK (source IN ('round_reward', 'admin_gift', 'admin_bulk', 'test', 'season_pass'));
CREATE UNIQUE INDEX IF NOT EXISTS fantasy_season_pass_pack_unique
  ON public.fantasy_round_packs (user_id, fantasy_season_pass_reward_id)
  WHERE fantasy_season_pass_reward_id IS NOT NULL;

INSERT INTO public.fantasy_cosmetics (slug, slot, rarity, name, description, asset_key) VALUES
  ('title-rei-da-resenha', 'title', 'common', 'Rei da Resenha', 'A voz mais alta do pós-jogo.', 'title-rei'),
  ('title-so-vim-pela-resenha', 'title', 'common', 'Só Vim Pela Resenha', 'O placar é detalhe; a história é tudo.', 'title-resenha'),
  ('frame-alambrado', 'frame', 'common', 'Alambrado', 'A moldura clássica de toda várzea.', 'frame-alambrado'),
  ('frame-rede-do-gol', 'frame', 'common', 'Rede do Gol', 'Pronta para balançar.', 'frame-rede'),
  ('background-gramado-escuro', 'background', 'common', 'Gramado Escuro', 'Noite de jogo sob a luz da quadra.', 'background-gramado'),
  ('background-vestiario', 'background', 'common', 'Vestiário', 'Concreto, camisa e concentração.', 'background-vestiario'),
  ('aura-energia-bq', 'aura', 'common', 'Energia BQ', 'O verde da pelada em movimento.', 'aura-energia'),
  ('aura-refletores', 'aura', 'common', 'Refletores', 'Todo lance merece luz.', 'aura-refletores'),
  ('nameplate-placar', 'nameplate', 'common', 'Placar Eletrônico', 'Seu nome em noite de decisão.', 'nameplate-placar'),
  ('nameplate-faixa', 'nameplate', 'common', 'Faixa de Capitão', 'Liderança até no perfil.', 'nameplate-faixa'),
  ('banner-campo-noite', 'banner', 'rare', 'Campo à Noite', 'A várzea não para quando a luz baixa.', 'banner-campo-noite'),
  ('banner-arquibancada-neon', 'banner', 'rare', 'Arquibancada Neon', 'Torcida, concreto e energia verde.', 'banner-arquibancada'),
  ('title-xerife', 'title', 'rare', 'Xerife', 'Aqui a área tem dono.', 'title-xerife'),
  ('title-maestro', 'title', 'rare', 'Maestro', 'Toda jogada começa na sua batuta.', 'title-maestro'),
  ('frame-neon-bq', 'frame', 'rare', 'Neon BQ', 'O brilho oficial da resenha.', 'frame-neon'),
  ('frame-faixa-capitao', 'frame', 'rare', 'Faixa de Capitão', 'Braçadeira de responsa.', 'frame-capitao'),
  ('background-chuva-estadio', 'background', 'rare', 'Chuva no Estádio', 'Jogo molhado, estilo intacto.', 'background-chuva'),
  ('background-varzea-noturna', 'background', 'rare', 'Várzea Noturna', 'O gramado raiz depois do pôr do sol.', 'background-varzea'),
  ('aura-fumaca-verde', 'aura', 'rare', 'Fumaça Verde', 'A chegada não passa despercebida.', 'aura-fumaca'),
  ('aura-flash-fotografos', 'aura', 'rare', 'Flash de Fotógrafos', 'Seu melhor ângulo é qualquer um.', 'aura-flash'),
  ('nameplate-retro-90', 'nameplate', 'rare', 'Retrô 90', 'Futebol de botão, camisa larga e raça.', 'nameplate-retro'),
  ('nameplate-prancheta', 'nameplate', 'rare', 'Prancheta do Técnico', 'Estratégia rabiscada na beira do campo.', 'nameplate-prancheta'),
  ('banner-tunel-estadio', 'banner', 'rare', 'Túnel do Estádio', 'A caminhada antes do barulho.', 'banner-tunel'),
  ('banner-torcida-bq', 'banner', 'rare', 'Torcida BQ', 'A bancada joga junto.', 'banner-torcida'),
  ('title-camisa-10', 'title', 'epic', 'Camisa 10', 'A bola procura você.', 'title-camisa10'),
  ('title-bagre-premium', 'title', 'epic', 'Bagre Premium', 'Classe até para errar.', 'title-bagre'),
  ('theme-lenda-varzea', 'banner', 'legendary', 'Lenda da Várzea', 'Ouro envelhecido, grama e história.', 'theme-lenda'),
  ('theme-rei-estadio', 'banner', 'legendary', 'Rei do Estádio', 'LED, refletores e domínio absoluto.', 'theme-rei')
ON CONFLICT (slug) DO NOTHING;

-- Recria os 16 marcos oficiais para todas as temporadas de Cartola.
DELETE FROM public.fantasy_season_pass_rewards;
INSERT INTO public.fantasy_season_pass_rewards (fantasy_season_id, house, reward_key, status, reward_type, card_tier)
SELECT fs.id, reward.house, reward.reward_key, 'development', reward.reward_type, reward.card_tier
FROM public.fantasy_seasons fs
CROSS JOIN (VALUES
  (1, 'pass-pack-bronze', 'card_pack', 'bronze'), (5, 'pass-title-01', 'cosmetic_choice', NULL),
  (10, 'pass-frame-01', 'cosmetic_choice', NULL), (12, 'pass-background-01', 'cosmetic_choice', NULL),
  (16, 'pass-aura-01', 'cosmetic_choice', NULL), (20, 'pass-nameplate-01', 'cosmetic_choice', NULL),
  (24, 'pass-pack-gold', 'card_pack', 'gold'), (25, 'pass-banner-01', 'cosmetic_choice', NULL),
  (29, 'pass-title-02', 'cosmetic_choice', NULL), (31, 'pass-frame-02', 'cosmetic_choice', NULL),
  (33, 'pass-background-02', 'cosmetic_choice', NULL), (34, 'pass-aura-02', 'cosmetic_choice', NULL),
  (36, 'pass-nameplate-02', 'cosmetic_choice', NULL), (37, 'pass-banner-02', 'cosmetic_choice', NULL),
  (39, 'pass-title-03', 'cosmetic_choice', NULL), (40, 'pass-legendary', 'cosmetic_choice', NULL)
) AS reward(house, reward_key, reward_type, card_tier);

INSERT INTO public.fantasy_season_pass_reward_options (reward_id, cosmetic_id)
SELECT reward.id, cosmetic.id
FROM public.fantasy_season_pass_rewards reward
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = ANY (CASE reward.reward_key
  WHEN 'pass-title-01' THEN ARRAY['title-rei-da-resenha', 'title-so-vim-pela-resenha']
  WHEN 'pass-frame-01' THEN ARRAY['frame-alambrado', 'frame-rede-do-gol']
  WHEN 'pass-background-01' THEN ARRAY['background-gramado-escuro', 'background-vestiario']
  WHEN 'pass-aura-01' THEN ARRAY['aura-energia-bq', 'aura-refletores']
  WHEN 'pass-nameplate-01' THEN ARRAY['nameplate-placar', 'nameplate-faixa']
  WHEN 'pass-banner-01' THEN ARRAY['banner-campo-noite', 'banner-arquibancada-neon']
  WHEN 'pass-title-02' THEN ARRAY['title-xerife', 'title-maestro']
  WHEN 'pass-frame-02' THEN ARRAY['frame-neon-bq', 'frame-faixa-capitao']
  WHEN 'pass-background-02' THEN ARRAY['background-chuva-estadio', 'background-varzea-noturna']
  WHEN 'pass-aura-02' THEN ARRAY['aura-fumaca-verde', 'aura-flash-fotografos']
  WHEN 'pass-nameplate-02' THEN ARRAY['nameplate-retro-90', 'nameplate-prancheta']
  WHEN 'pass-banner-02' THEN ARRAY['banner-tunel-estadio', 'banner-torcida-bq']
  WHEN 'pass-title-03' THEN ARRAY['title-camisa-10', 'title-bagre-premium']
  WHEN 'pass-legendary' THEN ARRAY['theme-lenda-varzea', 'theme-rei-estadio']
  ELSE ARRAY[]::TEXT[] END)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_fantasy_pass_cosmetic(p_reward_id UUID, p_cosmetic_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_progress INTEGER;
BEGIN
  SELECT pass.progress INTO user_progress
  FROM public.fantasy_season_passes pass JOIN public.fantasy_season_pass_rewards reward ON reward.fantasy_season_id = pass.fantasy_season_id
  WHERE reward.id = p_reward_id AND pass.user_id = auth.uid();
  IF user_progress IS NULL OR user_progress < (SELECT house FROM public.fantasy_season_pass_rewards WHERE id = p_reward_id) THEN RAISE EXCEPTION 'Recompensa ainda não desbloqueada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_season_pass_reward_options WHERE reward_id = p_reward_id AND cosmetic_id = p_cosmetic_id) THEN RAISE EXCEPTION 'Escolha inválida'; END IF;
  INSERT INTO public.fantasy_user_cosmetic_reward_choices (user_id, reward_id, cosmetic_id) VALUES (auth.uid(), p_reward_id, p_cosmetic_id);
  INSERT INTO public.fantasy_user_cosmetics (user_id, cosmetic_id, source_reward_id) VALUES (auth.uid(), p_cosmetic_id, p_reward_id) ON CONFLICT DO NOTHING;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.equip_fantasy_cosmetic(p_fantasy_season_id UUID, p_slot TEXT, p_cosmetic_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE column_name TEXT;
BEGIN
  IF p_slot NOT IN ('banner', 'frame', 'title', 'aura', 'nameplate', 'background') THEN RAISE EXCEPTION 'Slot inválido'; END IF;
  IF p_cosmetic_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fantasy_user_cosmetics own JOIN public.fantasy_cosmetics cosmetic ON cosmetic.id = own.cosmetic_id
    WHERE own.user_id = auth.uid() AND own.cosmetic_id = p_cosmetic_id AND cosmetic.slot = p_slot
  ) THEN RAISE EXCEPTION 'Cosmético não pertence ao usuário ou ocupa outro slot'; END IF;
  column_name := p_slot || '_cosmetic_id';
  INSERT INTO public.fantasy_user_cosmetic_loadouts (user_id, fantasy_season_id)
  VALUES (auth.uid(), p_fantasy_season_id) ON CONFLICT (user_id, fantasy_season_id) DO NOTHING;
  EXECUTE format('UPDATE public.fantasy_user_cosmetic_loadouts SET %I = $1, updated_at = now() WHERE user_id = auth.uid() AND fantasy_season_id = $2', column_name)
  USING p_cosmetic_id, p_fantasy_season_id;
  RETURN true;
END; $$;

-- Ferramenta de demonstração: disponível apenas para admins e sem alterar a trilha do Passe.
CREATE OR REPLACE FUNCTION public.grant_fantasy_cosmetics_preview(p_fantasy_season_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE granted_count INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem liberar o modo teste.'; END IF;
  INSERT INTO public.fantasy_user_cosmetics (user_id, cosmetic_id)
  SELECT auth.uid(), cosmetic.id FROM public.fantasy_cosmetics cosmetic
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS granted_count = ROW_COUNT;
  RETURN granted_count;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_fantasy_season_pass_card_packs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.fantasy_round_packs (user_id, round_id, status, source, fantasy_season_pass_reward_id, card_tier)
  SELECT NEW.user_id, NULL, 'available', 'season_pass', reward.id, reward.card_tier
  FROM public.fantasy_season_pass_rewards reward
  WHERE reward.fantasy_season_id = NEW.fantasy_season_id AND reward.reward_type = 'card_pack' AND NEW.progress >= reward.house
  ON CONFLICT (user_id, fantasy_season_pass_reward_id) WHERE fantasy_season_pass_reward_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS fantasy_season_pass_card_packs_trigger ON public.fantasy_season_passes;
CREATE TRIGGER fantasy_season_pass_card_packs_trigger AFTER INSERT OR UPDATE OF progress ON public.fantasy_season_passes
FOR EACH ROW EXECUTE FUNCTION public.sync_fantasy_season_pass_card_packs();
INSERT INTO public.fantasy_round_packs (user_id, round_id, status, source, fantasy_season_pass_reward_id, card_tier)
SELECT pass.user_id, NULL, 'available', 'season_pass', reward.id, reward.card_tier
FROM public.fantasy_season_passes pass JOIN public.fantasy_season_pass_rewards reward ON reward.fantasy_season_id = pass.fantasy_season_id
WHERE reward.reward_type = 'card_pack' AND pass.progress >= reward.house
ON CONFLICT (user_id, fantasy_season_pass_reward_id) WHERE fantasy_season_pass_reward_id IS NOT NULL DO NOTHING;

ALTER TABLE public.fantasy_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_season_pass_reward_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_user_cosmetics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_user_cosmetic_reward_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fantasy_user_cosmetic_loadouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY fantasy_cosmetics_read ON public.fantasy_cosmetics FOR SELECT TO authenticated USING (true);
CREATE POLICY fantasy_pass_options_read ON public.fantasy_season_pass_reward_options FOR SELECT TO authenticated USING (true);
CREATE POLICY fantasy_user_cosmetics_read ON public.fantasy_user_cosmetics FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_app_admin());
CREATE POLICY fantasy_cosmetic_choices_read ON public.fantasy_user_cosmetic_reward_choices FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_app_admin());
CREATE POLICY fantasy_loadouts_read ON public.fantasy_user_cosmetic_loadouts FOR SELECT TO authenticated USING (true);
CREATE POLICY fantasy_loadouts_write ON public.fantasy_user_cosmetic_loadouts FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_app_admin()) WITH CHECK (user_id = auth.uid() OR public.is_app_admin());
GRANT SELECT ON public.fantasy_cosmetics, public.fantasy_season_pass_reward_options, public.fantasy_user_cosmetics, public.fantasy_user_cosmetic_loadouts TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fantasy_pass_cosmetic(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equip_fantasy_cosmetic(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_fantasy_cosmetics_preview(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
