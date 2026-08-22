CREATE OR REPLACE FUNCTION public.ensure_fantasy_round_reward_packs(p_round_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted_count INTEGER := 0;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem gerar pacotes.'; END IF;
  INSERT INTO public.fantasy_round_packs (user_id, round_id, status, source)
  SELECT DISTINCT lineup.user_id, p_round_id, 'available', 'round_reward'
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  WHERE fantasy_round.round_id = p_round_id AND lineup.status = 'scored'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_fantasy_round_reward_packs(UUID) TO authenticated;
