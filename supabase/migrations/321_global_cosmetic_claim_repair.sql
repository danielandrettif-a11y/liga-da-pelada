-- Alinha os resgates do Passe com o inventario global criado na migration 317.
BEGIN;

DROP TRIGGER IF EXISTS fantasy_cosmetic_global_dedupe ON public.fantasy_user_cosmetics;
DROP FUNCTION IF EXISTS public.keep_global_cosmetic_inventory_unique();

CREATE OR REPLACE FUNCTION public.claim_fantasy_pass_cosmetic(p_reward_id uuid, p_cosmetic_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE reward_row record; user_progress integer; chosen_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para resgatar sua recompensa'; END IF;
  SELECT reward.id, reward.house, reward.fantasy_season_id, reward.bonus_cosmetic_id,
    season_item.league_id INTO reward_row
  FROM public.fantasy_season_pass_rewards reward
  JOIN public.fantasy_seasons season_item ON season_item.id = reward.fantasy_season_id
  WHERE reward.id = p_reward_id AND reward.reward_type = 'cosmetic_choice';
  IF NOT FOUND OR NOT public.is_league_member(reward_row.league_id) THEN
    RAISE EXCEPTION 'Recompensa nao pertence a sua pelada';
  END IF;
  SELECT progress INTO user_progress FROM public.fantasy_season_passes
    WHERE fantasy_season_id = reward_row.fantasy_season_id AND user_id = auth.uid()
    FOR UPDATE;
  IF user_progress IS NULL OR user_progress < reward_row.house THEN
    RAISE EXCEPTION 'Recompensa ainda nao desbloqueada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_season_pass_reward_options
    WHERE reward_id = p_reward_id AND cosmetic_id = p_cosmetic_id) THEN
    RAISE EXCEPTION 'Escolha invalida';
  END IF;

  INSERT INTO public.fantasy_user_cosmetic_reward_choices (user_id, reward_id, cosmetic_id)
  VALUES (auth.uid(), p_reward_id, p_cosmetic_id)
  ON CONFLICT (user_id, reward_id) DO NOTHING;
  SELECT cosmetic_id INTO chosen_id FROM public.fantasy_user_cosmetic_reward_choices
    WHERE user_id = auth.uid() AND reward_id = p_reward_id;
  IF chosen_id IS DISTINCT FROM p_cosmetic_id THEN
    RAISE EXCEPTION 'Esta recompensa ja teve uma escolha permanente';
  END IF;

  INSERT INTO public.fantasy_user_cosmetics (league_id, user_id, cosmetic_id, source_reward_id)
  VALUES (reward_row.league_id, auth.uid(), p_cosmetic_id, p_reward_id)
  ON CONFLICT (user_id, cosmetic_id) DO NOTHING;
  IF reward_row.bonus_cosmetic_id IS NOT NULL THEN
    INSERT INTO public.fantasy_user_cosmetics (league_id, user_id, cosmetic_id, source_reward_id)
    VALUES (reward_row.league_id, auth.uid(), reward_row.bonus_cosmetic_id, p_reward_id)
    ON CONFLICT (user_id, cosmetic_id) DO NOTHING;
  END IF;

  INSERT INTO public.fantasy_season_pass_shop_items
    (fantasy_season_id, user_id, source_reward_id, cosmetic_id, price_points)
  SELECT reward_row.fantasy_season_id, auth.uid(), p_reward_id, option_item.cosmetic_id,
    public.fantasy_pass_shop_price(cosmetic.rarity)
  FROM public.fantasy_season_pass_reward_options option_item
  JOIN public.fantasy_cosmetics cosmetic ON cosmetic.id = option_item.cosmetic_id
  WHERE option_item.reward_id = p_reward_id AND option_item.cosmetic_id <> p_cosmetic_id
    AND NOT EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics owned
      WHERE owned.user_id = auth.uid() AND owned.cosmetic_id = option_item.cosmetic_id)
  ON CONFLICT (user_id, source_reward_id, cosmetic_id) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_fantasy_pass_shop_item(p_shop_item_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE item_row public.fantasy_season_pass_shop_items%ROWTYPE;
  target_league_id uuid; pass_total integer; pass_progress integer;
  bonus_points integer; spent_points integer; available_points integer; cosmetic_slot text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para comprar este item'; END IF;
  SELECT * INTO item_row FROM public.fantasy_season_pass_shop_items
    WHERE id = p_shop_item_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item da loja nao encontrado'; END IF;
  IF item_row.purchased_at IS NOT NULL THEN RETURN true; END IF;
  SELECT league_id INTO target_league_id FROM public.fantasy_seasons
    WHERE id = item_row.fantasy_season_id;
  IF target_league_id IS NULL OR NOT public.is_league_member(target_league_id) THEN
    RAISE EXCEPTION 'Loja nao pertence a sua pelada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_season_pass_rewards
    WHERE id = item_row.source_reward_id AND fantasy_season_id = item_row.fantasy_season_id) THEN
    RAISE EXCEPTION 'Oferta associada a outra temporada';
  END IF;
  SELECT progress, total_progress_points, shop_bonus_points
    INTO pass_progress, pass_total, bonus_points
  FROM public.fantasy_season_passes
  WHERE fantasy_season_id = item_row.fantasy_season_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Passe da temporada nao encontrado'; END IF;
  SELECT slot INTO cosmetic_slot FROM public.fantasy_cosmetics WHERE id = item_row.cosmetic_id;
  IF cosmetic_slot = 'pitch' AND pass_progress < 40 THEN
    RAISE EXCEPTION 'Campo do Cartola liberado somente na casa 40';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics owned
    WHERE owned.user_id = auth.uid() AND owned.cosmetic_id = item_row.cosmetic_id) THEN
    UPDATE public.fantasy_season_pass_shop_items SET purchased_at = now() WHERE id = item_row.id;
    RETURN true;
  END IF;
  SELECT COALESCE(sum(price_points), 0)::integer INTO spent_points
  FROM public.fantasy_season_pass_shop_items
  WHERE user_id = auth.uid() AND fantasy_season_id = item_row.fantasy_season_id
    AND purchased_at IS NOT NULL;
  available_points := greatest(COALESCE(pass_total, 0) - 40, 0)
    + COALESCE(bonus_points, 0) - spent_points;
  IF available_points < item_row.price_points THEN RAISE EXCEPTION 'Pontos extras insuficientes'; END IF;
  INSERT INTO public.fantasy_user_cosmetics (league_id, user_id, cosmetic_id, source_reward_id)
  VALUES (target_league_id, auth.uid(), item_row.cosmetic_id, item_row.source_reward_id)
  ON CONFLICT (user_id, cosmetic_id) DO NOTHING;
  UPDATE public.fantasy_season_pass_shop_items SET purchased_at = now() WHERE id = item_row.id;
  RETURN true;
END;
$$;

-- Repara escolhas que foram gravadas antes da falha de inventario.
INSERT INTO public.fantasy_user_cosmetics (league_id, user_id, cosmetic_id, source_reward_id)
SELECT season_item.league_id, choice_item.user_id, choice_item.cosmetic_id, choice_item.reward_id
FROM public.fantasy_user_cosmetic_reward_choices choice_item
JOIN public.fantasy_season_pass_rewards reward ON reward.id = choice_item.reward_id
JOIN public.fantasy_seasons season_item ON season_item.id = reward.fantasy_season_id
ON CONFLICT (user_id, cosmetic_id) DO NOTHING;

INSERT INTO public.fantasy_user_cosmetics (league_id, user_id, cosmetic_id, source_reward_id)
SELECT season_item.league_id, choice_item.user_id, reward.bonus_cosmetic_id, choice_item.reward_id
FROM public.fantasy_user_cosmetic_reward_choices choice_item
JOIN public.fantasy_season_pass_rewards reward ON reward.id = choice_item.reward_id
JOIN public.fantasy_seasons season_item ON season_item.id = reward.fantasy_season_id
WHERE reward.bonus_cosmetic_id IS NOT NULL
ON CONFLICT (user_id, cosmetic_id) DO NOTHING;

REVOKE ALL ON FUNCTION public.claim_fantasy_pass_cosmetic(uuid,uuid),
  public.purchase_fantasy_pass_shop_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_fantasy_pass_cosmetic(uuid,uuid),
  public.purchase_fantasy_pass_shop_item(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
