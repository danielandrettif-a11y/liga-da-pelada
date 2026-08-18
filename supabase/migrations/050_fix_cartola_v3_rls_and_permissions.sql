-- ==============================================================================
-- 050: CORREÇÃO DE PERMISSÕES E RLS DO CARTOLA V3 (PACOTES, CARTAS E ATIVAÇÕES)
-- ==============================================================================

-- 1. Conceder permissões explícitas para as roles authenticated e service_role
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

-- 2. Políticas de RLS para public.fantasy_cards (Catálogo de Cartas)
ALTER TABLE public.fantasy_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cartas visíveis para todos os usuários autenticados" ON public.fantasy_cards;
DROP POLICY IF EXISTS "fantasy_cards_read" ON public.fantasy_cards;
DROP POLICY IF EXISTS "fantasy_cards_admin_write" ON public.fantasy_cards;

CREATE POLICY "fantasy_cards_read"
  ON public.fantasy_cards FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "fantasy_cards_admin_write"
  ON public.fantasy_cards FOR ALL
  TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- 3. Políticas de RLS para public.fantasy_round_packs (Pacotes de Rodada)
ALTER TABLE public.fantasy_round_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário acessa seus próprios pacotes" ON public.fantasy_round_packs;
DROP POLICY IF EXISTS "fantasy_round_packs_select" ON public.fantasy_round_packs;
DROP POLICY IF EXISTS "fantasy_round_packs_insert" ON public.fantasy_round_packs;
DROP POLICY IF EXISTS "fantasy_round_packs_update" ON public.fantasy_round_packs;
DROP POLICY IF EXISTS "fantasy_round_packs_delete" ON public.fantasy_round_packs;

CREATE POLICY "fantasy_round_packs_select"
  ON public.fantasy_round_packs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_app_admin());

CREATE POLICY "fantasy_round_packs_insert"
  ON public.fantasy_round_packs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_app_admin());

CREATE POLICY "fantasy_round_packs_update"
  ON public.fantasy_round_packs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_app_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_app_admin());

CREATE POLICY "fantasy_round_packs_delete"
  ON public.fantasy_round_packs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_app_admin());

-- 4. Políticas de RLS para public.fantasy_pack_offers (Ofertas de Cartas nos Pacotes)
ALTER TABLE public.fantasy_pack_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário vê ofertas dos seus pacotes" ON public.fantasy_pack_offers;
DROP POLICY IF EXISTS "fantasy_pack_offers_select" ON public.fantasy_pack_offers;
DROP POLICY IF EXISTS "fantasy_pack_offers_insert" ON public.fantasy_pack_offers;
DROP POLICY IF EXISTS "fantasy_pack_offers_update" ON public.fantasy_pack_offers;
DROP POLICY IF EXISTS "fantasy_pack_offers_delete" ON public.fantasy_pack_offers;

CREATE POLICY "fantasy_pack_offers_select"
  ON public.fantasy_pack_offers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fantasy_round_packs p
      WHERE p.id = pack_id AND (p.user_id = auth.uid() OR public.is_app_admin())
    )
  );

CREATE POLICY "fantasy_pack_offers_insert"
  ON public.fantasy_pack_offers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.fantasy_round_packs p
      WHERE p.id = pack_id AND (p.user_id = auth.uid() OR public.is_app_admin())
    )
  );

CREATE POLICY "fantasy_pack_offers_update"
  ON public.fantasy_pack_offers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fantasy_round_packs p
      WHERE p.id = pack_id AND (p.user_id = auth.uid() OR public.is_app_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.fantasy_round_packs p
      WHERE p.id = pack_id AND (p.user_id = auth.uid() OR public.is_app_admin())
    )
  );

CREATE POLICY "fantasy_pack_offers_delete"
  ON public.fantasy_pack_offers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fantasy_round_packs p
      WHERE p.id = pack_id AND (p.user_id = auth.uid() OR public.is_app_admin())
    )
  );

-- 5. Políticas de RLS para public.fantasy_user_cards (Inventário de Cartas)
ALTER TABLE public.fantasy_user_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário gerencia seu próprio inventário de cartas" ON public.fantasy_user_cards;
DROP POLICY IF EXISTS "fantasy_user_cards_select" ON public.fantasy_user_cards;
DROP POLICY IF EXISTS "fantasy_user_cards_insert" ON public.fantasy_user_cards;
DROP POLICY IF EXISTS "fantasy_user_cards_update" ON public.fantasy_user_cards;
DROP POLICY IF EXISTS "fantasy_user_cards_delete" ON public.fantasy_user_cards;

CREATE POLICY "fantasy_user_cards_select"
  ON public.fantasy_user_cards FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_app_admin());

CREATE POLICY "fantasy_user_cards_insert"
  ON public.fantasy_user_cards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_app_admin());

CREATE POLICY "fantasy_user_cards_update"
  ON public.fantasy_user_cards FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_app_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_app_admin());

CREATE POLICY "fantasy_user_cards_delete"
  ON public.fantasy_user_cards FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_app_admin());

-- 6. Políticas de RLS para public.fantasy_card_activations (Ativação de Cartas)
ALTER TABLE public.fantasy_card_activations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário acessa suas cartas ativas antes do fechamento" ON public.fantasy_card_activations;
DROP POLICY IF EXISTS "fantasy_card_activations_select" ON public.fantasy_card_activations;
DROP POLICY IF EXISTS "fantasy_card_activations_insert" ON public.fantasy_card_activations;
DROP POLICY IF EXISTS "fantasy_card_activations_update" ON public.fantasy_card_activations;
DROP POLICY IF EXISTS "fantasy_card_activations_delete" ON public.fantasy_card_activations;

CREATE POLICY "fantasy_card_activations_select"
  ON public.fantasy_card_activations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR status IN ('LOCKED', 'RESOLVED') OR public.is_app_admin());

CREATE POLICY "fantasy_card_activations_insert"
  ON public.fantasy_card_activations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_app_admin());

CREATE POLICY "fantasy_card_activations_update"
  ON public.fantasy_card_activations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_app_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_app_admin());

CREATE POLICY "fantasy_card_activations_delete"
  ON public.fantasy_card_activations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_app_admin());
