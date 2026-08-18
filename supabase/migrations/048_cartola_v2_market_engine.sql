-- Cartola V2: Mercado Vivo, Valorização, Tendências, Radar e Revelação de Escalações

-- 1. Suporte a parâmetros adicionais no fantasy_settings
ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS min_sample_for_radar INTEGER NOT NULL DEFAULT 3 CHECK (min_sample_for_radar > 0);

-- 2. Atualizar função de update de configurações do Cartola
CREATE OR REPLACE FUNCTION public.update_fantasy_settings(p_settings JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_league_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar configurações do Cartola.';
  END IF;

  SELECT id INTO v_league_id FROM public.leagues LIMIT 1;
  IF v_league_id IS NULL THEN
    RAISE EXCEPTION 'Liga não encontrada.';
  END IF;

  UPDATE public.fantasy_settings
  SET
    currency_name = COALESCE(p_settings->>'currency_name', currency_name),
    initial_budget = COALESCE((p_settings->>'initial_budget')::NUMERIC, initial_budget),
    initial_player_price = COALESCE((p_settings->>'initial_player_price')::NUMERIC, initial_player_price),
    min_player_price = COALESCE((p_settings->>'min_player_price')::NUMERIC, min_player_price),
    max_player_price = COALESCE((p_settings->>'max_player_price')::NUMERIC, max_player_price),
    goal_points = COALESCE((p_settings->>'goal_points')::NUMERIC, goal_points),
    assist_points = COALESCE((p_settings->>'assist_points')::NUMERIC, assist_points),
    win_points = COALESCE((p_settings->>'win_points')::NUMERIC, win_points),
    captain_multiplier = COALESCE((p_settings->>'captain_multiplier')::NUMERIC, captain_multiplier),
    top_scorer_prediction_points = COALESCE((p_settings->>'top_scorer_prediction_points')::NUMERIC, top_scorer_prediction_points),
    top_assist_prediction_points = COALESCE((p_settings->>'top_assist_prediction_points')::NUMERIC, top_assist_prediction_points),
    top_team_prediction_points = COALESCE((p_settings->>'top_team_prediction_points')::NUMERIC, top_team_prediction_points),
    king_of_wins_points = COALESCE((p_settings->>'king_of_wins_points')::NUMERIC, king_of_wins_points),
    mvp_prediction_points = COALESCE((p_settings->>'mvp_prediction_points')::NUMERIC, mvp_prediction_points),
    bet_of_round_points = COALESCE((p_settings->>'bet_of_round_points')::NUMERIC, bet_of_round_points),
    bet_rank_band_1 = COALESCE((p_settings->>'bet_rank_band_1')::INTEGER, bet_rank_band_1),
    bet_rank_band_2 = COALESCE((p_settings->>'bet_rank_band_2')::INTEGER, bet_rank_band_2),
    bet_rank_band_3 = COALESCE((p_settings->>'bet_rank_band_3')::INTEGER, bet_rank_band_3),
    bet_rank_band_4 = COALESCE((p_settings->>'bet_rank_band_4')::INTEGER, bet_rank_band_4),
    score_goal_reward_band_1 = COALESCE((p_settings->>'score_goal_reward_band_1')::NUMERIC, score_goal_reward_band_1),
    score_goal_reward_band_2 = COALESCE((p_settings->>'score_goal_reward_band_2')::NUMERIC, score_goal_reward_band_2),
    score_goal_reward_band_3 = COALESCE((p_settings->>'score_goal_reward_band_3')::NUMERIC, score_goal_reward_band_3),
    score_goal_reward_band_4 = COALESCE((p_settings->>'score_goal_reward_band_4')::NUMERIC, score_goal_reward_band_4),
    recent_weight = COALESCE((p_settings->>'recent_weight')::NUMERIC, recent_weight),
    win_rate_weight = COALESCE((p_settings->>'win_rate_weight')::NUMERIC, win_rate_weight),
    historical_weight = COALESCE((p_settings->>'historical_weight')::NUMERIC, historical_weight),
    consistency_weight = COALESCE((p_settings->>'consistency_weight')::NUMERIC, consistency_weight),
    smoothing_games = COALESCE((p_settings->>'smoothing_games')::INTEGER, smoothing_games),
    max_price_increase = COALESCE((p_settings->>'max_price_increase')::NUMERIC, max_price_increase),
    max_price_decrease = COALESCE((p_settings->>'max_price_decrease')::NUMERIC, max_price_decrease),
    min_sample_for_radar = COALESCE((p_settings->>'min_sample_for_radar')::INTEGER, min_sample_for_radar),
    updated_at = now()
  WHERE league_id = v_league_id;

  RETURN true;
END;
$$;

-- 3. Índices de alta performance para agregações do Radar e Histórico
CREATE INDEX IF NOT EXISTS idx_fantasy_lineups_round_status
  ON public.fantasy_lineups (fantasy_round_id, status);

CREATE INDEX IF NOT EXISTS idx_fantasy_price_history_season_player
  ON public.fantasy_player_price_history (fantasy_season_id, player_id, created_at DESC);
