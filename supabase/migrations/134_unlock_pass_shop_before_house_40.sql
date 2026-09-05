-- Permite comprar opções não escolhidas assim que houver saldo extra.
-- O campo lendário do Cartola continua exclusivo da casa 40.
CREATE OR REPLACE FUNCTION public.purchase_fantasy_pass_shop_item(p_shop_item_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_row public.fantasy_season_pass_shop_items%ROWTYPE;
  cosmetic_slot TEXT;
  pass_total INTEGER;
  pass_progress INTEGER;
  bonus_points INTEGER;
  spent_points INTEGER;
  available_points INTEGER;
BEGIN
  SELECT * INTO item_row
  FROM public.fantasy_season_pass_shop_items
  WHERE id = p_shop_item_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item da loja não encontrado.'; END IF;
  IF item_row.purchased_at IS NOT NULL THEN RAISE EXCEPTION 'Este item já foi comprado.'; END IF;

  SELECT progress, total_progress_points, shop_bonus_points
  INTO pass_progress, pass_total, bonus_points
  FROM public.fantasy_season_passes
  WHERE fantasy_season_id = item_row.fantasy_season_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Passe da temporada não encontrado.'; END IF;

  SELECT slot INTO cosmetic_slot
  FROM public.fantasy_cosmetics
  WHERE id = item_row.cosmetic_id;
  IF cosmetic_slot = 'pitch' AND pass_progress < 40 THEN
    RAISE EXCEPTION 'O novo campo do Cartola é liberado somente na casa 40.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics owned WHERE owned.user_id = auth.uid() AND owned.cosmetic_id = item_row.cosmetic_id) THEN
    UPDATE public.fantasy_season_pass_shop_items SET purchased_at = now() WHERE id = item_row.id;
    RETURN true;
  END IF;

  SELECT COALESCE(sum(price_points), 0)::INTEGER INTO spent_points
  FROM public.fantasy_season_pass_shop_items
  WHERE user_id = auth.uid() AND fantasy_season_id = item_row.fantasy_season_id AND purchased_at IS NOT NULL;

  available_points := GREATEST(COALESCE(pass_total, 0) - 40, 0) + COALESCE(bonus_points, 0) - spent_points;
  IF available_points < item_row.price_points THEN RAISE EXCEPTION 'Pontos extras insuficientes.'; END IF;

  INSERT INTO public.fantasy_user_cosmetics (user_id, cosmetic_id, source_reward_id)
  VALUES (auth.uid(), item_row.cosmetic_id, item_row.source_reward_id)
  ON CONFLICT DO NOTHING;
  UPDATE public.fantasy_season_pass_shop_items SET purchased_at = now() WHERE id = item_row.id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_fantasy_pass_shop_item(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
