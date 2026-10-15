-- Substitui os atualizadores legados que escolhiam a primeira liga global.
-- A escrita e atomica e exige ADM da pelada indicada.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_fantasy_settings_for_league(
  p_league_id uuid, p_settings jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  setting_item record;
  assignments text[] := ARRAY[]::text[];
  setting_type text;
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente ADM da pelada pode configurar o Cartola.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leagues
    WHERE id = p_league_id AND is_active AND feature_tier = 'complete') THEN
    RAISE EXCEPTION 'O Cartola exige uma pelada Completa e ativa.';
  END IF;
  IF jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR p_settings = '{}'::jsonb THEN
    RAISE EXCEPTION 'Informe ao menos uma configuracao.';
  END IF;

  FOR setting_item IN SELECT key, value FROM jsonb_each_text(p_settings) LOOP
    IF setting_item.key <> ALL (ARRAY[
      'initial_budget','initial_player_price','min_player_price','max_player_price',
      'captain_multiplier','top_scorer_prediction_points','top_assist_prediction_points',
      'king_of_wins_points','mvp_prediction_points','bet_of_round_points',
      'bet_rank_band_1','bet_rank_band_2','bet_rank_band_3','bet_rank_band_4',
      'score_goal_reward_band_1','score_goal_reward_band_2',
      'score_goal_reward_band_3','score_goal_reward_band_4',
      'smoothing_games','recent_weight','win_rate_weight',
      'historical_weight','consistency_weight','max_price_increase',
      'max_price_decrease','competitive_price_floor','competitive_price_ceiling',
      'competitive_price_curve','market_round_weight','market_reprice_strength',
      'market_initial_up_cap','market_initial_down_cap','market_cap_step',
      'market_difficulty_min','market_difficulty_max','market_difficulty_step',
      'market_target_elite_affordability','market_target_median_elite_ratio',
      'market_recovery_bonus_strength','market_expensive_risk_strength',
      'market_breakout_reprice_strength','market_cheap_percentile',
      'market_elite_percentile','market_breakout_round_percentile',
      'market_bad_round_percentile','defender_one_goal_conceded_points',
      'defender_two_goals_conceded_points'
    ]) THEN
      RAISE EXCEPTION 'Configuracao desconhecida: %', setting_item.key;
    END IF;
    IF setting_item.key = ANY (ARRAY[
      'smoothing_games','bet_rank_band_1','bet_rank_band_2',
      'bet_rank_band_3','bet_rank_band_4'
    ]) THEN
      setting_type := 'integer';
      IF setting_item.value !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'A configuracao % exige um numero inteiro.', setting_item.key;
      END IF;
    ELSE
      setting_type := 'numeric';
      IF setting_item.value IS NULL OR length(setting_item.value) > 60
        OR setting_item.value !~ '^-?([0-9]+(\.[0-9]+)?|\.[0-9]+)$' THEN
        RAISE EXCEPTION 'Valor numerico invalido em %.', setting_item.key;
      END IF;
    END IF;
    IF setting_item.key IN ('defender_one_goal_conceded_points', 'defender_two_goals_conceded_points')
      AND setting_item.value::numeric > 0 THEN
      RAISE EXCEPTION 'A penalidade de gols sofridos do DEF deve ser zero ou negativa.';
    END IF;
    assignments := array_append(assignments,
      format('%I = %L::%s', setting_item.key, setting_item.value, setting_type));
  END LOOP;

  INSERT INTO public.fantasy_settings (league_id) VALUES (p_league_id)
  ON CONFLICT (league_id) DO NOTHING;
  EXECUTE format('UPDATE public.fantasy_settings SET %s, updated_at = now() WHERE league_id = $1',
    array_to_string(assignments, ', ')) USING p_league_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_fantasy_settings_for_league(uuid,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_fantasy_settings_for_league(uuid,jsonb)
  TO authenticated;

-- As assinaturas antigas escolhem LIMIT 1 sem pelada. Revogar o acesso direto
-- evita que outro cliente as invoque para alterar a BQ por engano.
REVOKE ALL ON FUNCTION public.update_fantasy_settings(jsonb),
  public.update_fantasy_market_v11_settings(jsonb),
  public.update_fantasy_defender_conceded_points(numeric,numeric),
  public.update_fantasy_attack_and_own_goal_points(numeric,numeric),
  public.update_fantasy_loss_points(numeric),
  public.update_fantasy_goalkeeper_loss_points(numeric),
  public.update_fantasy_goalkeeper_points(numeric,numeric),
  public.update_fantasy_goalkeeper_points(numeric,numeric,numeric)
  FROM PUBLIC, anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
