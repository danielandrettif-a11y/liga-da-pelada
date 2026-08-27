-- Reabre pacotes do Passe que foram fechados durante um teste e cria os que
-- ficaram ausentes. O escopo é sempre a conta autenticada e a temporada atual.
CREATE OR REPLACE FUNCTION public.restore_my_pass_card_packs(p_fantasy_season_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_progress INTEGER;
  restored_count INTEGER := 0;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem reativar pacotes de teste.';
  END IF;

  SELECT progress INTO user_progress
  FROM public.fantasy_season_passes
  WHERE user_id = auth.uid() AND fantasy_season_id = p_fantasy_season_id;
  IF user_progress IS NULL THEN
    RAISE EXCEPTION 'Passe da temporada não encontrado para esta conta.';
  END IF;

  INSERT INTO public.fantasy_round_packs (user_id, round_id, status, source, fantasy_season_pass_reward_id, card_tier)
  SELECT auth.uid(), NULL, 'available', 'season_pass', reward.id, reward.card_tier
  FROM public.fantasy_season_pass_rewards reward
  WHERE reward.fantasy_season_id = p_fantasy_season_id
    AND reward.reward_type = 'card_pack'
    AND user_progress >= reward.house
  ON CONFLICT (user_id, fantasy_season_pass_reward_id) WHERE fantasy_season_pass_reward_id IS NOT NULL
  DO UPDATE SET
    status = CASE WHEN fantasy_round_packs.status = 'dismissed' THEN 'available' ELSE fantasy_round_packs.status END,
    card_tier = EXCLUDED.card_tier;

  GET DIAGNOSTICS restored_count = ROW_COUNT;
  RETURN restored_count;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_my_pass_card_packs(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_my_pass_card_packs(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
