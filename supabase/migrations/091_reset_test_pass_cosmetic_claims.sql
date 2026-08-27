-- Permite ao administrador reabrir somente as escolhas cosméticas feitas no
-- antigo teste do Passe atual. Não toca em itens externos nem em pacotes.
CREATE OR REPLACE FUNCTION public.reset_my_test_pass_cosmetic_claims(p_fantasy_season_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  removed_choices INTEGER := 0;
  removed_cosmetics INTEGER := 0;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem limpar resgates de teste.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fantasy_season_passes
    WHERE user_id = auth.uid() AND fantasy_season_id = p_fantasy_season_id
  ) THEN
    RAISE EXCEPTION 'Passe da temporada não encontrado para esta conta.';
  END IF;

  -- Nunca deixar o perfil apontando para um item que será removido.
  UPDATE public.fantasy_user_cosmetic_loadouts loadout
  SET
    banner_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own JOIN public.fantasy_season_pass_rewards reward ON reward.id = own.source_reward_id WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.banner_cosmetic_id AND reward.fantasy_season_id = p_fantasy_season_id) THEN NULL ELSE banner_cosmetic_id END,
    frame_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own JOIN public.fantasy_season_pass_rewards reward ON reward.id = own.source_reward_id WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.frame_cosmetic_id AND reward.fantasy_season_id = p_fantasy_season_id) THEN NULL ELSE frame_cosmetic_id END,
    title_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own JOIN public.fantasy_season_pass_rewards reward ON reward.id = own.source_reward_id WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.title_cosmetic_id AND reward.fantasy_season_id = p_fantasy_season_id) THEN NULL ELSE title_cosmetic_id END,
    aura_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own JOIN public.fantasy_season_pass_rewards reward ON reward.id = own.source_reward_id WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.aura_cosmetic_id AND reward.fantasy_season_id = p_fantasy_season_id) THEN NULL ELSE aura_cosmetic_id END,
    nameplate_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own JOIN public.fantasy_season_pass_rewards reward ON reward.id = own.source_reward_id WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.nameplate_cosmetic_id AND reward.fantasy_season_id = p_fantasy_season_id) THEN NULL ELSE nameplate_cosmetic_id END,
    background_cosmetic_id = CASE WHEN EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own JOIN public.fantasy_season_pass_rewards reward ON reward.id = own.source_reward_id WHERE own.user_id = auth.uid() AND own.cosmetic_id = loadout.background_cosmetic_id AND reward.fantasy_season_id = p_fantasy_season_id) THEN NULL ELSE background_cosmetic_id END,
    updated_at = now()
  WHERE loadout.user_id = auth.uid() AND loadout.fantasy_season_id = p_fantasy_season_id;

  DELETE FROM public.fantasy_user_cosmetic_reward_choices choice_item
  USING public.fantasy_season_pass_rewards reward
  WHERE choice_item.user_id = auth.uid()
    AND choice_item.reward_id = reward.id
    AND reward.fantasy_season_id = p_fantasy_season_id;
  GET DIAGNOSTICS removed_choices = ROW_COUNT;

  DELETE FROM public.fantasy_user_cosmetics own
  USING public.fantasy_season_pass_rewards reward
  WHERE own.user_id = auth.uid()
    AND own.source_reward_id = reward.id
    AND reward.fantasy_season_id = p_fantasy_season_id;
  GET DIAGNOSTICS removed_cosmetics = ROW_COUNT;

  RETURN removed_choices + removed_cosmetics;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_my_test_pass_cosmetic_claims(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_my_test_pass_cosmetic_claims(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
