-- Loja da trilha extra do Passe BQ.
-- A casa 40 encerra a trilha visual, mas os eventos continuam somando pontos.
-- Somente os pontos acima de 40 podem comprar opcoes recusadas pelo usuario.

ALTER TABLE public.fantasy_season_passes
  ADD COLUMN IF NOT EXISTS total_progress_points INTEGER NOT NULL DEFAULT 0
  CHECK (total_progress_points >= 0);

CREATE TABLE IF NOT EXISTS public.fantasy_season_pass_shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_reward_id UUID NOT NULL REFERENCES public.fantasy_season_pass_rewards(id) ON DELETE CASCADE,
  cosmetic_id UUID NOT NULL REFERENCES public.fantasy_cosmetics(id) ON DELETE CASCADE,
  price_points INTEGER NOT NULL CHECK (price_points BETWEEN 1 AND 20),
  listed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purchased_at TIMESTAMPTZ,
  UNIQUE (user_id, source_reward_id, cosmetic_id)
);

CREATE INDEX IF NOT EXISTS fantasy_season_pass_shop_items_user_lookup_idx
  ON public.fantasy_season_pass_shop_items (user_id, fantasy_season_id, purchased_at, listed_at DESC);

ALTER TABLE public.fantasy_season_pass_shop_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fantasy_season_pass_shop_items_read_own
  ON public.fantasy_season_pass_shop_items;
CREATE POLICY fantasy_season_pass_shop_items_read_own
  ON public.fantasy_season_pass_shop_items
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Precos curtos para que a colecao completa seja uma meta de continuidade,
-- nao uma segunda trilha longa: comum 3, raro 5, epico 7, lendario 9.
CREATE OR REPLACE FUNCTION public.fantasy_pass_shop_price(p_rarity TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(p_rarity, 'common'))
    WHEN 'common' THEN 3
    WHEN 'rare' THEN 5
    WHEN 'epic' THEN 7
    WHEN 'legendary' THEN 9
    ELSE 5
  END;
$$;

-- Mantem a regra de progressao existente e registra tambem o total bruto.
-- Assim, recalcular a temporada continua idempotente e nunca apaga compras.
DO $$
BEGIN
  IF to_regprocedure('public.recalculate_fantasy_season_pass_pre_extra_shop_105(uuid)') IS NULL THEN
    ALTER FUNCTION public.recalculate_fantasy_season_pass(UUID)
      RENAME TO recalculate_fantasy_season_pass_pre_extra_shop_105;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_fantasy_season_pass(p_fantasy_season_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recalculated BOOLEAN;
BEGIN
  recalculated := public.recalculate_fantasy_season_pass_pre_extra_shop_105(p_fantasy_season_id);

  UPDATE public.fantasy_season_passes pass
  SET total_progress_points = COALESCE((
    SELECT sum(event.houses)::INTEGER
    FROM public.fantasy_season_pass_events event
    WHERE event.fantasy_season_id = pass.fantasy_season_id
      AND event.user_id = pass.user_id
  ), 0)
  WHERE pass.fantasy_season_id = p_fantasy_season_id;

  RETURN COALESCE(recalculated, true);
END;
$$;

-- Recupera o total historico imediatamente, inclusive para quem ja concluiu
-- a trilha antes da loja existir.
SELECT public.recalculate_fantasy_season_pass(id)
FROM public.fantasy_seasons;

-- Escolhas feitas antes desta migration tambem ganham seus itens recusados na
-- loja. Itens que o usuario ja recebeu por outro premio nao sao cobrados outra vez.
INSERT INTO public.fantasy_season_pass_shop_items (
  fantasy_season_id, user_id, source_reward_id, cosmetic_id, price_points
)
SELECT
  reward.fantasy_season_id,
  choice_item.user_id,
  choice_item.reward_id,
  option_item.cosmetic_id,
  public.fantasy_pass_shop_price(cosmetic.rarity)
FROM public.fantasy_user_cosmetic_reward_choices choice_item
JOIN public.fantasy_season_pass_rewards reward ON reward.id = choice_item.reward_id
JOIN public.fantasy_season_pass_reward_options option_item ON option_item.reward_id = choice_item.reward_id
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.id = option_item.cosmetic_id
WHERE option_item.cosmetic_id <> choice_item.cosmetic_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.fantasy_user_cosmetics owned
    WHERE owned.user_id = choice_item.user_id
      AND owned.cosmetic_id = option_item.cosmetic_id
  )
ON CONFLICT (user_id, source_reward_id, cosmetic_id) DO NOTHING;

-- A escolha principal continua sendo validada pela funcao atual; este wrapper
-- apenas lista a outra opcao na loja pessoal de forma idempotente.
DO $$
BEGIN
  IF to_regprocedure('public.claim_fantasy_pass_cosmetic_pre_extra_shop_105(uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.claim_fantasy_pass_cosmetic(UUID, UUID)
      RENAME TO claim_fantasy_pass_cosmetic_pre_extra_shop_105;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_fantasy_pass_cosmetic(p_reward_id UUID, p_cosmetic_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed BOOLEAN;
BEGIN
  claimed := public.claim_fantasy_pass_cosmetic_pre_extra_shop_105(p_reward_id, p_cosmetic_id);
  IF NOT claimed THEN
    RETURN false;
  END IF;

  INSERT INTO public.fantasy_season_pass_shop_items (
    fantasy_season_id, user_id, source_reward_id, cosmetic_id, price_points
  )
  SELECT
    reward.fantasy_season_id,
    auth.uid(),
    reward.id,
    option_item.cosmetic_id,
    public.fantasy_pass_shop_price(cosmetic.rarity)
  FROM public.fantasy_season_pass_rewards reward
  JOIN public.fantasy_season_pass_reward_options option_item ON option_item.reward_id = reward.id
  JOIN public.fantasy_cosmetics cosmetic ON cosmetic.id = option_item.cosmetic_id
  WHERE reward.id = p_reward_id
    AND option_item.cosmetic_id <> p_cosmetic_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.fantasy_user_cosmetics owned
      WHERE owned.user_id = auth.uid()
        AND owned.cosmetic_id = option_item.cosmetic_id
    )
  ON CONFLICT (user_id, source_reward_id, cosmetic_id) DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_fantasy_pass_shop_item(p_shop_item_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_row public.fantasy_season_pass_shop_items%ROWTYPE;
  pass_total INTEGER;
  pass_progress INTEGER;
  spent_points INTEGER;
  available_points INTEGER;
BEGIN
  SELECT * INTO item_row
  FROM public.fantasy_season_pass_shop_items
  WHERE id = p_shop_item_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item da loja não encontrado.';
  END IF;
  IF item_row.purchased_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este item já foi comprado.';
  END IF;

  SELECT progress, total_progress_points
  INTO pass_progress, pass_total
  FROM public.fantasy_season_passes
  WHERE fantasy_season_id = item_row.fantasy_season_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND OR pass_progress < 40 THEN
    RAISE EXCEPTION 'Conclua a trilha principal para liberar a loja.';
  END IF;

  -- Se o mesmo item chegou por um bonus ou premio posterior, remove a oferta
  -- sem gastar saldo para nunca cobrar duas vezes pelo mesmo cosmetico.
  IF EXISTS (
    SELECT 1 FROM public.fantasy_user_cosmetics owned
    WHERE owned.user_id = auth.uid()
      AND owned.cosmetic_id = item_row.cosmetic_id
  ) THEN
    UPDATE public.fantasy_season_pass_shop_items
    SET purchased_at = now()
    WHERE id = item_row.id;
    RETURN true;
  END IF;

  SELECT COALESCE(sum(price_points), 0)::INTEGER
  INTO spent_points
  FROM public.fantasy_season_pass_shop_items
  WHERE user_id = auth.uid()
    AND fantasy_season_id = item_row.fantasy_season_id
    AND purchased_at IS NOT NULL;

  available_points := GREATEST(COALESCE(pass_total, 0) - 40, 0) - spent_points;
  IF available_points < item_row.price_points THEN
    RAISE EXCEPTION 'Pontos extras insuficientes.';
  END IF;

  INSERT INTO public.fantasy_user_cosmetics (user_id, cosmetic_id, source_reward_id)
  VALUES (auth.uid(), item_row.cosmetic_id, item_row.source_reward_id)
  ON CONFLICT DO NOTHING;

  UPDATE public.fantasy_season_pass_shop_items
  SET purchased_at = now()
  WHERE id = item_row.id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_fantasy_pass_cosmetic(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_fantasy_pass_shop_item(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
