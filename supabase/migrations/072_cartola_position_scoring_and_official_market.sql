-- Cartola: pontuação por perfil, gol contra e mercado exclusivo para perfis oficiais.
-- A regra nova vale para rodadas criadas a partir desta migration. Snapshots já
-- fechados permanecem históricos; o ADM pode reprocessar uma rodada quando quiser
-- migrá-la para as regras atuais.

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS attacker_goal_points NUMERIC(8,2) NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS own_goal_points NUMERIC(8,2) NOT NULL DEFAULT -3;

UPDATE public.fantasy_settings
SET attacker_goal_points = COALESCE(attacker_goal_points, 6),
    own_goal_points = COALESCE(own_goal_points, -3),
    updated_at = now();

-- Rodadas e testes ainda editáveis recebem os novos valores no snapshot. O mesmo
-- sorteio preenche desafios antigos que, por algum motivo, ficaram sem tipo.
UPDATE public.fantasy_rounds fantasy_round
SET settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::jsonb)
  || jsonb_build_object(
    'attacker_goal_points', settings.attacker_goal_points,
    'own_goal_points', settings.own_goal_points
  ),
  challenge_type = COALESCE(
    fantasy_round.challenge_type,
    (ARRAY['REI_DAS_VITORIAS', 'MITO_DA_RODADA', 'APOSTA_DA_RODADA', 'VAI_GUARDAR'])[1 + floor(random() * 4)::integer]
  )
FROM public.fantasy_settings settings, public.fantasy_seasons season
WHERE season.id = fantasy_round.fantasy_season_id
  AND settings.league_id = season.league_id
  AND fantasy_round.market_status = 'open';

UPDATE public.fantasy_test_sessions test_session
SET settings_snapshot = COALESCE(test_session.settings_snapshot, '{}'::jsonb)
  || jsonb_build_object(
    'attacker_goal_points', settings.attacker_goal_points,
    'own_goal_points', settings.own_goal_points
  ),
  challenge_type = COALESCE(
    test_session.challenge_type,
    (ARRAY['REI_DAS_VITORIAS', 'MITO_DA_RODADA', 'APOSTA_DA_RODADA', 'VAI_GUARDAR'])[1 + floor(random() * 4)::integer]
  )
FROM public.fantasy_settings settings
WHERE settings.league_id = test_session.league_id
  AND test_session.status = 'open';

CREATE OR REPLACE FUNCTION public.update_fantasy_attack_and_own_goal_points(
  p_attacker_goal_points NUMERIC,
  p_own_goal_points NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE active_league_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem configurar o Cartola.';
  END IF;
  IF p_attacker_goal_points IS NULL OR p_attacker_goal_points NOT BETWEEN -100 AND 100
    OR p_own_goal_points IS NULL OR p_own_goal_points NOT BETWEEN -100 AND 100 THEN
    RAISE EXCEPTION 'Pontuação de ataque ou gol contra inválida.';
  END IF;
  SELECT id INTO active_league_id FROM public.leagues WHERE is_active = true ORDER BY created_at LIMIT 1;
  UPDATE public.fantasy_settings
  SET attacker_goal_points = p_attacker_goal_points,
      own_goal_points = p_own_goal_points,
      updated_at = now()
  WHERE league_id = active_league_id;
  RETURN true;
END;
$$;

-- A proteção de UI não basta: todos os salvamentos passam por este bloqueio.
DO $$
BEGIN
  IF to_regprocedure('public.save_fantasy_portfolio_pre_official_market_072(uuid,uuid[],uuid)') IS NULL THEN
    ALTER FUNCTION public.save_fantasy_portfolio(UUID, UUID[], UUID)
      RENAME TO save_fantasy_portfolio_pre_official_market_072;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_fantasy_portfolio(
  p_fantasy_season_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE official_count INTEGER;
BEGIN
  SELECT count(*) INTO official_count
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.member_category = 'player'
    AND player.is_selectable = true;
  IF official_count <> COALESCE(cardinality(p_player_ids), 0) THEN
    RAISE EXCEPTION 'O mercado do Cartola aceita somente jogadores com perfil oficial ativo.';
  END IF;
  RETURN public.save_fantasy_portfolio_pre_official_market_072(
    p_fantasy_season_id, p_player_ids, p_captain_player_id
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.save_fantasy_lineup_pre_official_market_072(uuid,uuid[],uuid,uuid,uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID)
      RENAME TO save_fantasy_lineup_pre_official_market_072;
  END IF;
END $$;

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
DECLARE official_count INTEGER;
BEGIN
  SELECT count(*) INTO official_count
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.member_category = 'player'
    AND player.is_selectable = true;
  IF official_count <> COALESCE(cardinality(p_player_ids), 0) THEN
    RAISE EXCEPTION 'O mercado do Cartola aceita somente jogadores com perfil oficial ativo.';
  END IF;
  RETURN public.save_fantasy_lineup_pre_official_market_072(
    p_round_id, p_player_ids, p_captain_player_id,
    p_top_scorer_player_id, p_top_assist_player_id, p_challenge_player_id
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.save_fantasy_test_lineup_pre_official_market_072(uuid,uuid[],uuid,uuid,uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID)
      RENAME TO save_fantasy_test_lineup_pre_official_market_072;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_fantasy_test_lineup(
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
DECLARE official_count INTEGER;
BEGIN
  SELECT count(*) INTO official_count
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.member_category = 'player'
    AND player.is_selectable = true;
  IF official_count <> COALESCE(cardinality(p_player_ids), 0) THEN
    RAISE EXCEPTION 'O mercado do Cartola aceita somente jogadores com perfil oficial ativo.';
  END IF;
  RETURN public.save_fantasy_test_lineup_pre_official_market_072(
    p_round_id, p_player_ids, p_captain_player_id,
    p_top_scorer_player_id, p_top_assist_player_id, p_challenge_player_id
  );
END;
$$;

-- Ajuste idempotente aplicado depois do processador e das cartas. A precificação
-- continua com a regra V2 já existente, mas o total e o histórico de pontos passam
-- a refletir ATA +6 e gol contra imediatamente.
CREATE OR REPLACE FUNCTION public.apply_fantasy_position_and_own_goal_scoring(
  p_round_id UUID,
  p_is_test BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_snapshot JSONB;
DECLARE target_container UUID;
DECLARE target_season UUID;
BEGIN
  IF p_is_test THEN
    SELECT id, settings_snapshot INTO target_container, target_snapshot
    FROM public.fantasy_test_sessions WHERE round_id = p_round_id;
  ELSE
    SELECT id, settings_snapshot, fantasy_season_id INTO target_container, target_snapshot, target_season
    FROM public.fantasy_rounds WHERE round_id = p_round_id;
  END IF;
  IF target_container IS NULL THEN RETURN true; END IF;

  IF p_is_test THEN
    WITH changes AS (
      SELECT item.id, item.player_id, lineup.captain_player_id,
        COALESCE(stat.own_goals, 0) * COALESCE((target_snapshot->>'own_goal_points')::NUMERIC, -3)
        + CASE WHEN player.player_profile = 'offensive'
          THEN COALESCE(stat.goals, 0) * (
            COALESCE((target_snapshot->>'attacker_goal_points')::NUMERIC, 6)
            - COALESCE((target_snapshot->>'goal_points')::NUMERIC, 5)
          ) ELSE 0 END AS adjustment
      FROM public.fantasy_test_lineup_players item
      JOIN public.fantasy_test_lineups lineup ON lineup.id = item.lineup_id
      JOIN public.players player ON player.id = item.player_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.test_session_id = target_container AND lineup.status = 'scored'
        AND COALESCE(lineup.score_breakdown->>'positionOwnGoalVersion', '') <> '1'
    )
    UPDATE public.fantasy_test_lineup_players item SET
      base_points = COALESCE(item.base_points, 0) + changes.adjustment,
      captain_bonus = CASE WHEN changes.player_id = changes.captain_player_id
        THEN (COALESCE(item.base_points, 0) + changes.adjustment)
          * (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1) ELSE 0 END,
      total_points = (COALESCE(item.base_points, 0) + changes.adjustment)
        * CASE WHEN changes.player_id = changes.captain_player_id
          THEN COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) ELSE 1 END
    FROM changes WHERE item.id = changes.id;

    UPDATE public.fantasy_test_lineups lineup SET
      player_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      total_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0)
        + COALESCE(lineup.prediction_points, 0),
      score_breakdown = COALESCE(lineup.score_breakdown, '{}'::jsonb) || jsonb_build_object(
        'playersBase', COALESCE((SELECT sum(item.base_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'positionOwnGoalVersion', 1
      )
    WHERE lineup.test_session_id = target_container AND lineup.status = 'scored'
      AND COALESCE(lineup.score_breakdown->>'positionOwnGoalVersion', '') <> '1';
  ELSE
    WITH changes AS (
      SELECT item.id, item.player_id, lineup.captain_player_id,
        COALESCE(stat.own_goals, 0) * COALESCE((target_snapshot->>'own_goal_points')::NUMERIC, -3)
        + CASE WHEN player.player_profile = 'offensive'
          THEN COALESCE(stat.goals, 0) * (
            COALESCE((target_snapshot->>'attacker_goal_points')::NUMERIC, 6)
            - COALESCE((target_snapshot->>'goal_points')::NUMERIC, 5)
          ) ELSE 0 END AS adjustment
      FROM public.fantasy_lineup_players item
      JOIN public.fantasy_lineups lineup ON lineup.id = item.lineup_id
      JOIN public.players player ON player.id = item.player_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.fantasy_round_id = target_container AND lineup.status = 'scored'
        AND COALESCE(lineup.score_breakdown->>'positionOwnGoalVersion', '') <> '1'
    )
    UPDATE public.fantasy_lineup_players item SET
      base_points = COALESCE(item.base_points, 0) + changes.adjustment,
      captain_bonus = CASE WHEN changes.player_id = changes.captain_player_id
        THEN (COALESCE(item.base_points, 0) + changes.adjustment)
          * (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1) ELSE 0 END,
      total_points = (COALESCE(item.base_points, 0) + changes.adjustment)
        * CASE WHEN changes.player_id = changes.captain_player_id
          THEN COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) ELSE 1 END
    FROM changes WHERE item.id = changes.id;

    UPDATE public.fantasy_lineups lineup SET
      player_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      total_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0)
        + COALESCE(lineup.prediction_points, 0)
        + COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0),
      score_breakdown = COALESCE(lineup.score_breakdown, '{}'::jsonb) || jsonb_build_object(
        'playersBase', COALESCE((SELECT sum(item.base_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'positionOwnGoalVersion', 1
      )
    WHERE lineup.fantasy_round_id = target_container AND lineup.status = 'scored'
      AND COALESCE(lineup.score_breakdown->>'positionOwnGoalVersion', '') <> '1';

    UPDATE public.fantasy_accounts account SET
      total_points = totals.total_points,
      rounds_played = totals.rounds_played,
      best_round_points = totals.best_round,
      updated_at = now()
    FROM (
      SELECT lineup.user_id, sum(lineup.total_points) AS total_points,
        count(*)::INTEGER AS rounds_played, max(lineup.total_points) AS best_round
      FROM public.fantasy_lineups lineup
      JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
      WHERE fantasy_round.fantasy_season_id = target_season AND lineup.status = 'scored'
      GROUP BY lineup.user_id
    ) totals
    WHERE account.fantasy_season_id = target_season AND account.user_id = totals.user_id;
  END IF;
  RETURN true;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.process_fantasy_round_pre_position_scoring_072(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_round(UUID) RENAME TO process_fantasy_round_pre_position_scoring_072;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.process_fantasy_round_pre_position_scoring_072(p_round_id);
  PERFORM public.apply_fantasy_position_and_own_goal_scoring(p_round_id, false);
  RETURN true;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.process_fantasy_test_round_pre_position_scoring_072(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_test_round(UUID) RENAME TO process_fantasy_test_round_pre_position_scoring_072;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_test_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.process_fantasy_test_round_pre_position_scoring_072(p_round_id);
  PERFORM public.apply_fantasy_position_and_own_goal_scoring(p_round_id, true);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_fantasy_attack_and_own_goal_points(NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_fantasy_attack_and_own_goal_points(NUMERIC, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION public.save_fantasy_portfolio_pre_official_market_072(UUID, UUID[], UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_fantasy_lineup_pre_official_market_072(UUID, UUID[], UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_fantasy_test_lineup_pre_official_market_072(UUID, UUID[], UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fantasy_round_pre_position_scoring_072(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fantasy_test_round_pre_position_scoring_072(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_fantasy_position_and_own_goal_scoring(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_fantasy_portfolio(UUID, UUID[], UUID),
  public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID),
  public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID),
  public.process_fantasy_round(UUID), public.process_fantasy_test_round(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
