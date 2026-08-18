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

-- Habilitar RLS no catálogo de cartas (leitura pública para autenticados)
ALTER TABLE public.fantasy_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cartas visíveis para todos os usuários autenticados"
  ON public.fantasy_cards FOR SELECT
  TO authenticated
  USING (true);

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

ALTER TABLE public.fantasy_round_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário acessa seus próprios pacotes"
  ON public.fantasy_round_packs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Ofertas Sorteadas no Pacote (Exatamente 2 opções por pacote)
CREATE TABLE IF NOT EXISTS public.fantasy_pack_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.fantasy_round_packs(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
  card_id UUID NOT NULL REFERENCES public.fantasy_cards(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_fantasy_pack_offers_pack_slot UNIQUE (pack_id, slot)
);

ALTER TABLE public.fantasy_pack_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário vê ofertas dos seus pacotes"
  ON public.fantasy_pack_offers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fantasy_round_packs p
      WHERE p.id = pack_id AND p.user_id = auth.uid()
    )
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

ALTER TABLE public.fantasy_user_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário gerencia seu próprio inventário de cartas"
  ON public.fantasy_user_cards FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

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

ALTER TABLE public.fantasy_card_activations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário acessa suas cartas ativas antes do fechamento"
  ON public.fantasy_card_activations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR status IN ('LOCKED', 'RESOLVED'));

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
