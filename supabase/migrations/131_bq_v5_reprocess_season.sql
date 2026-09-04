-- ============================================================================
-- Migration 131: Reprocessamento Autorizado BQ v5 da Temporada Ativa
-- ============================================================================
-- 1. preview_reprocess_season: leitura sem alteração que retorna prévia de
--    rodadas, escalações e patrimônios afetados.
-- 2. reprocess_active_season_v5: execução atômica com trava contra rodadas ativas
--    ou mercado em andamento.

CREATE OR REPLACE FUNCTION public.preview_reprocess_season(p_league_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id UUID;
  v_active_round_exists BOOLEAN;
  v_market_in_progress BOOLEAN;
  v_rounds_count INTEGER;
  v_lineups_count INTEGER;
  v_rounds JSONB;
  v_accounts JSONB;
BEGIN
  -- Identificar temporada ativa
  SELECT id INTO v_season_id
  FROM public.fantasy_seasons
  WHERE league_id = p_league_id AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RETURN jsonb_build_object(
      'can_reprocess', false,
      'reason', 'Nenhuma temporada ativa encontrada para esta liga.'
    );
  END IF;

  -- Checar se há rodada em andamento
  SELECT EXISTS (
    SELECT 1 FROM public.rounds
    WHERE league_id = p_league_id AND status = 'active'
  ) INTO v_active_round_exists;

  -- Checar se há mercado em andamento
  SELECT EXISTS (
    SELECT 1 FROM public.fantasy_rounds
    WHERE fantasy_season_id = v_season_id AND market_status = 'in_progress'
  ) INTO v_market_in_progress;

  IF v_active_round_exists OR v_market_in_progress THEN
    RETURN jsonb_build_object(
      'can_reprocess', false,
      'reason', 'Existe rodada ativa ou mercado em andamento. Finalize antes de reprocessar.'
    );
  END IF;

  -- Contar rodadas finalizadas
  SELECT count(*)::INTEGER INTO v_rounds_count
  FROM public.fantasy_rounds fr
  JOIN public.rounds r ON r.id = fr.round_id
  WHERE fr.fantasy_season_id = v_season_id AND r.status = 'finished';

  -- Contar escalações avaliadas
  SELECT count(*)::INTEGER INTO v_lineups_count
  FROM public.fantasy_lineups fl
  JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
  WHERE fr.fantasy_season_id = v_season_id AND fl.status = 'scored';

  -- Detalhes das rodadas
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'round_id', r.id,
    'number', r.number,
    'date', r.date,
    'market_status', fr.market_status,
    'lineups_count', (SELECT count(*) FROM public.fantasy_lineups fl WHERE fl.fantasy_round_id = fr.id)
  ) ORDER BY r.date, r.number), '[]'::JSONB)
  INTO v_rounds
  FROM public.fantasy_rounds fr
  JOIN public.rounds r ON r.id = fr.round_id
  WHERE fr.fantasy_season_id = v_season_id AND r.status = 'finished';

  -- Resumo de contas atuais
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', fa.user_id,
    'current_budget', fa.current_budget,
    'total_points', fa.total_points,
    'rounds_played', fa.rounds_played
  ) ORDER BY fa.total_points DESC), '[]'::JSONB)
  INTO v_accounts
  FROM public.fantasy_accounts fa
  WHERE fa.fantasy_season_id = v_season_id;

  RETURN jsonb_build_object(
    'can_reprocess', true,
    'season_id', v_season_id,
    'rounds_count', v_rounds_count,
    'lineups_count', v_lineups_count,
    'rounds', v_rounds,
    'accounts', v_accounts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reprocess_active_season_v5(p_league_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id UUID;
  v_earliest_round_id UUID;
  v_rounds_count INTEGER;
  v_lineups_count INTEGER;
  v_snapshot JSONB;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem reprocessar a temporada.';
  END IF;

  -- Identificar temporada ativa
  SELECT id INTO v_season_id
  FROM public.fantasy_seasons
  WHERE league_id = p_league_id AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma temporada ativa encontrada para esta liga.';
  END IF;

  -- Guard: nenhuma rodada active ou market in_progress
  IF EXISTS (
    SELECT 1 FROM public.rounds WHERE league_id = p_league_id AND status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.fantasy_rounds WHERE fantasy_season_id = v_season_id AND market_status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'Nao e possivel reprocessar enquanto existe rodada ativa ou mercado em andamento.';
  END IF;

  -- Snapshot BQ v5 canônico
  v_snapshot := public.snapshot_bq_scoring(p_league_id);

  -- Atualizar scoring_snapshot de todas as rodadas da liga
  UPDATE public.rounds
  SET scoring_snapshot = v_snapshot, scoring_version = 5
  WHERE league_id = p_league_id;

  -- Atualizar settings_snapshot em fantasy_rounds
  UPDATE public.fantasy_rounds fr
  SET settings_snapshot = fr.settings_snapshot || jsonb_build_object(
    'goal_points', 4.0,
    'assist_points', 2.5,
    'win_points', 3.0,
    'draw_points', 1.0,
    'loss_points', -2.5,
    'own_goal_points', -3.0,
    'goalkeeper_appearance_points', 2.0,
    'goal_conceded_points', -1.0,
    'scoring_version', 5
  )
  WHERE fr.fantasy_season_id = v_season_id;

  -- Recalcular player_round_stats.points para todos os jogos oficiais
  UPDATE public.player_round_stats AS stats
  SET points =
      (COALESCE(stats.wins, 0) * 3.0)
    + (COALESCE(stats.goals, 0) * 4.0)
    + (COALESCE(stats.assists, 0) * 2.5)
    + (COALESCE(stats.draws, 0) * 1.0)
    - (COALESCE(stats.losses, 0) * 2.5)
    - (COALESCE(stats.own_goals, 0) * 3.0)
    + (COALESCE(stats.goalkeeper_games, 0) * 2.0)
    - (COALESCE(stats.goals_conceded, 0) * 1.0)
  FROM public.rounds AS rounds
  WHERE rounds.id = stats.round_id
    AND rounds.league_id = p_league_id
    AND rounds.round_type <> 'friendly';

  -- Localizar a primeira rodada finalizada da temporada
  SELECT r.id INTO v_earliest_round_id
  FROM public.fantasy_rounds fr
  JOIN public.rounds r ON r.id = fr.round_id
  WHERE fr.fantasy_season_id = v_season_id AND r.status = 'finished'
  ORDER BY r.date ASC, r.number ASC
  LIMIT 1;

  IF v_earliest_round_id IS NOT NULL THEN
    PERFORM public.reprocess_fantasy_from_round(v_earliest_round_id);
  END IF;

  -- Contagem pós-reprocessamento
  SELECT count(*)::INTEGER INTO v_rounds_count
  FROM public.fantasy_rounds fr
  JOIN public.rounds r ON r.id = fr.round_id
  WHERE fr.fantasy_season_id = v_season_id AND r.status = 'finished';

  SELECT count(*)::INTEGER INTO v_lineups_count
  FROM public.fantasy_lineups fl
  JOIN public.fantasy_rounds fr ON fr.id = fl.fantasy_round_id
  WHERE fr.fantasy_season_id = v_season_id AND fl.status = 'scored';

  -- Log de auditoria
  INSERT INTO public.fantasy_audit_log (
    league_id, user_id, action, payload
  ) VALUES (
    p_league_id,
    auth.uid(),
    'season_reprocessed_bq_v5',
    jsonb_build_object(
      'season_id', v_season_id,
      'earliest_round_id', v_earliest_round_id,
      'rounds_reprocessed', v_rounds_count,
      'lineups_reprocessed', v_lineups_count,
      'scoring_version', 5
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'season_id', v_season_id,
    'rounds_reprocessed', v_rounds_count,
    'lineups_reprocessed', v_lineups_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_reprocess_season(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reprocess_active_season_v5(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
