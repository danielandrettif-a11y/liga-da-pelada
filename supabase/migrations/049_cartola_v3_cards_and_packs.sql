-- ==============================================================================
-- CARTOLA V3: PACOTES, INVENTÁRIO PESSOAL E CARTAS ESPECIAIS
-- ==============================================================================

-- 1. Catálogo de Cartas Especiais
CREATE TABLE IF NOT EXISTS public.fantasy_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  rarity VARCHAR(20) NOT NULL CHECK (rarity IN ('COMMON', 'RARE', 'EPIC', 'LEGENDARY')),
  effect_type VARCHAR(50) NOT NULL,
  effect_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Pacotes de Rodada
CREATE TABLE IF NOT EXISTS public.fantasy_round_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'opened', 'claimed')),
  opened_at TIMESTAMPTZ,
  chosen_card_id UUID REFERENCES public.fantasy_cards(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_fantasy_round_packs_user_round UNIQUE (user_id, round_id)
);

-- 3. Ofertas Sorteadas no Pacote (Exatamente 2 opções por pacote)
CREATE TABLE IF NOT EXISTS public.fantasy_pack_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.fantasy_round_packs(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
  card_id UUID NOT NULL REFERENCES public.fantasy_cards(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_fantasy_pack_offers_pack_slot UNIQUE (pack_id, slot)
);

-- 4. Inventário Pessoal de Cartas do Usuário (Instâncias Individuais)
CREATE TABLE IF NOT EXISTS public.fantasy_user_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.fantasy_cards(id) ON DELETE RESTRICT,
  source_pack_id UUID REFERENCES public.fantasy_round_packs(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OWNED' CHECK (status IN ('OWNED', 'RESERVED', 'LOCKED', 'CONSUMED')),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ
);

-- 5. Ativação de Carta na Rodada (Máximo 1 por rodada por usuário)
CREATE TABLE IF NOT EXISTS public.fantasy_card_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_card_id UUID NOT NULL REFERENCES public.fantasy_user_cards(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.fantasy_cards(id) ON DELETE RESTRICT,
  effect_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'LOCKED', 'RESOLVED')),
  result_bonus NUMERIC NOT NULL DEFAULT 0,
  result_details JSONB,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  CONSTRAINT uq_fantasy_card_activations_round_user UNIQUE (round_id, user_id)
);

-- Conceder permissões para roles authenticated e service_role
GRANT ALL ON TABLE public.fantasy_cards TO authenticated, service_role;
GRANT ALL ON TABLE public.fantasy_round_packs TO authenticated, service_role;
GRANT ALL ON TABLE public.fantasy_pack_offers TO authenticated, service_role;
GRANT ALL ON TABLE public.fantasy_user_cards TO authenticated, service_role;
GRANT ALL ON TABLE public.fantasy_card_activations TO authenticated, service_role;

GRANT SELECT ON TABLE public.fantasy_cards TO anon;
GRANT SELECT ON TABLE public.fantasy_round_packs TO anon;
GRANT SELECT ON TABLE public.fantasy_pack_offers TO anon;
GRANT SELECT ON TABLE public.fantasy_user_cards TO anon;
GRANT SELECT ON TABLE public.fantasy_card_activations TO anon;

-- Políticas de RLS
ALTER TABLE public.fantasy_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_cards_read" ON public.fantasy_cards FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "fantasy_cards_admin_write" ON public.fantasy_cards FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

ALTER TABLE public.fantasy_round_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_round_packs_select" ON public.fantasy_round_packs FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_app_admin());
CREATE POLICY "fantasy_round_packs_insert" ON public.fantasy_round_packs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_app_admin());
CREATE POLICY "fantasy_round_packs_update" ON public.fantasy_round_packs FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_app_admin()) WITH CHECK (auth.uid() = user_id OR public.is_app_admin());
CREATE POLICY "fantasy_round_packs_delete" ON public.fantasy_round_packs FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_app_admin());

ALTER TABLE public.fantasy_pack_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_pack_offers_select" ON public.fantasy_pack_offers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.fantasy_round_packs p WHERE p.id = pack_id AND (p.user_id = auth.uid() OR public.is_app_admin())));
CREATE POLICY "fantasy_pack_offers_insert" ON public.fantasy_pack_offers FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.fantasy_round_packs p WHERE p.id = pack_id AND (p.user_id = auth.uid() OR public.is_app_admin())));
CREATE POLICY "fantasy_pack_offers_update" ON public.fantasy_pack_offers FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.fantasy_round_packs p WHERE p.id = pack_id AND (p.user_id = auth.uid() OR public.is_app_admin()))) WITH CHECK (EXISTS (SELECT 1 FROM public.fantasy_round_packs p WHERE p.id = pack_id AND (p.user_id = auth.uid() OR public.is_app_admin())));
CREATE POLICY "fantasy_pack_offers_delete" ON public.fantasy_pack_offers FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.fantasy_round_packs p WHERE p.id = pack_id AND (p.user_id = auth.uid() OR public.is_app_admin())));

ALTER TABLE public.fantasy_user_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_user_cards_select" ON public.fantasy_user_cards FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_app_admin());
CREATE POLICY "fantasy_user_cards_insert" ON public.fantasy_user_cards FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_app_admin());
CREATE POLICY "fantasy_user_cards_update" ON public.fantasy_user_cards FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_app_admin()) WITH CHECK (auth.uid() = user_id OR public.is_app_admin());
CREATE POLICY "fantasy_user_cards_delete" ON public.fantasy_user_cards FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_app_admin());

ALTER TABLE public.fantasy_card_activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_card_activations_select" ON public.fantasy_card_activations FOR SELECT TO authenticated USING (auth.uid() = user_id OR status IN ('LOCKED', 'RESOLVED') OR public.is_app_admin());
CREATE POLICY "fantasy_card_activations_insert" ON public.fantasy_card_activations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_app_admin());
CREATE POLICY "fantasy_card_activations_update" ON public.fantasy_card_activations FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_app_admin()) WITH CHECK (auth.uid() = user_id OR public.is_app_admin());
CREATE POLICY "fantasy_card_activations_delete" ON public.fantasy_card_activations FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_app_admin());

-- Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_fantasy_user_cards_user_status
  ON public.fantasy_user_cards (user_id, status);

CREATE INDEX IF NOT EXISTS idx_fantasy_round_packs_user_status
  ON public.fantasy_round_packs (user_id, status);

CREATE INDEX IF NOT EXISTS idx_fantasy_card_activations_round
  ON public.fantasy_card_activations (round_id, user_id);

-- ==============================================================================
-- POPULAR CATÁLOGO OFICIAL DE CARTAS (10 OFICIAIS + 2 EXPERIMENTAIS)
-- ==============================================================================

INSERT INTO public.fantasy_cards (slug, name, description, rarity, effect_type, effect_config, enabled)
VALUES
  (
    'super_captain',
    'Super Capitão',
    'Seu capitão pontua 3x total na rodada em vez de 2x.',
    'LEGENDARY',
    'CAPTAIN_MULTIPLIER',
    '{"multiplier": 3}'::jsonb,
    true
  ),
  (
    'extra_credit',
    'Crédito Extra',
    '+C$5,00 temporários para montar seu elenco nesta rodada sem alterar o patrimônio.',
    'COMMON',
    'BUDGET_BONUS',
    '{"bonus": 5}'::jsonb,
    true
  ),
  (
    'double_prediction',
    'Palpite Duplo',
    'Dobra a recompensa do palpite selecionado (Artilheiro, Garçom ou Desafio).',
    'RARE',
    'PREDICTION_MULTIPLIER',
    '{"multiplier": 2}'::jsonb,
    true
  ),
  (
    'bargain',
    'Barganha',
    '20% de desconto no preço de 1 jogador escalado para fins de orçamento.',
    'COMMON',
    'PLAYER_DISCOUNT',
    '{"discountPercent": 20}'::jsonb,
    true
  ),
  (
    'vice_captain',
    'Vice-Capitão',
    'Se o seu Capitão oficial não entrar em campo, o Vice-Capitão assume o multiplicador 2x.',
    'RARE',
    'VICE_CAPTAIN',
    '{}'::jsonb,
    true
  ),
  (
    'golden_goal',
    'Gol de Ouro',
    'Se o jogador selecionado marcar 1 ou mais gols, ganhe +3 pontos extras.',
    'COMMON',
    'CONDITIONAL_PLAYER_BONUS',
    '{"metric": "goals", "threshold": 1, "bonus": 3}'::jsonb,
    true
  ),
  (
    'golden_assist',
    'Passe de Ouro',
    'Se o jogador selecionado der 1 ou mais assistências, ganhe +3 pontos extras.',
    'COMMON',
    'CONDITIONAL_PLAYER_BONUS',
    '{"metric": "assists", "threshold": 1, "bonus": 3}'::jsonb,
    true
  ),
  (
    'scout',
    'Caça-Talentos',
    'Ganhe 50% dos pontos base (máx +6 pts) de um atleta escalado abaixo da mediana de preço.',
    'EPIC',
    'CONDITIONAL_PLAYER_BONUS',
    '{"percentage": 0.5, "maxBonus": 6, "belowMedianPrice": true}'::jsonb,
    true
  ),
  (
    'duo',
    'Dobradinha',
    'Escolha 2 jogadores da sua escalação. Se ambos ficarem acima da média da rodada, ganhe +5 pontos.',
    'RARE',
    'CONDITIONAL_DUO_BONUS',
    '{"bonus": 5, "aboveRoundAverage": true}'::jsonb,
    true
  ),
  (
    'all_in',
    'All-In',
    'Escolha um atleta dos 50% mais baratos da rodada. Se ele terminar no TOP 5 da rodada, ganhe +6 pontos.',
    'EPIC',
    'CONDITIONAL_PLAYER_BONUS',
    '{"bonus": 6, "cheapestPercentile": 0.5, "topRank": 5}'::jsonb,
    true
  ),
  (
    'safe_prediction',
    'Palpite Seguro',
    'Escolha 2 jogadores no Desafio da Rodada. Se qualquer um cumprir, ganhe 60% da recompensa.',
    'RARE',
    'SAFE_PREDICTION',
    '{"rewardMultiplier": 0.6}'::jsonb,
    false
  ),
  (
    'emergency_sub',
    'Reserva de Emergência',
    'Um 6º jogador entra no lugar de um titular que não jogou.',
    'EPIC',
    'EMERGENCY_SUB',
    '{}'::jsonb,
    false
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  rarity = EXCLUDED.rarity,
  effect_type = EXCLUDED.effect_type,
  effect_config = EXCLUDED.effect_config,
  enabled = EXCLUDED.enabled;
