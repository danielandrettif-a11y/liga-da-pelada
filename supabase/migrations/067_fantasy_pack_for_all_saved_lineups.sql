-- Pacote de fim de rodada é recompensa por ter salvo uma escalação.
-- Escalações incompletas (status = missed) também participam; elas apenas não pontuam.
ALTER TABLE public.fantasy_lineups
  ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ;

-- A preparação automática da rodada cria um rascunho, mas não o torna elegível.
-- O wrapper marca somente chamadas explícitas de salvar escalação.
ALTER FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID)
  RENAME TO save_fantasy_lineup_legacy;

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID DEFAULT NULL,
  p_top_scorer_player_id UUID DEFAULT NULL,
  p_top_assist_player_id UUID DEFAULT NULL,
  p_challenge_player_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_lineup_id UUID;
BEGIN
  saved_lineup_id := public.save_fantasy_lineup_legacy(
    p_round_id,
    p_player_ids,
    p_captain_player_id,
    p_top_scorer_player_id,
    p_top_assist_player_id,
    p_challenge_player_id
  );

  UPDATE public.fantasy_lineups
  SET saved_at = now()
  WHERE id = saved_lineup_id;

  RETURN saved_lineup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_fantasy_round_reward_packs(p_round_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem gerar pacotes.';
  END IF;

  INSERT INTO public.fantasy_round_packs (user_id, round_id, status, source)
  SELECT DISTINCT lineup.user_id, p_round_id, 'available', 'round_reward'
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round
    ON fantasy_round.id = lineup.fantasy_round_id
  WHERE fantasy_round.round_id = p_round_id
    AND lineup.status IN ('scored', 'missed')
    AND lineup.saved_at IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_fantasy_round_reward_packs(UUID) TO authenticated;
