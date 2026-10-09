-- O mercado do Cartola passa a usar a mesma janela de atividade da Ranked:
-- ao menos uma partida disputada nas tres rodadas oficiais finalizadas mais
-- recentes. Sem rodada finalizada, a primeira escalação continua liberada.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure(
    'public.save_fantasy_lineup_with_reserve_pre_activity_251(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb,uuid,text)'
  ) IS NULL THEN
    ALTER FUNCTION public.save_fantasy_lineup_with_reserve(
      UUID,UUID[],UUID,UUID,UUID,UUID,JSONB,UUID,TEXT
    ) RENAME TO save_fantasy_lineup_with_reserve_pre_activity_251;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup_with_reserve_pre_activity_251(
  UUID,UUID[],UUID,UUID,UUID,UUID,JSONB,UUID,TEXT
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup_with_reserve(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID,
  p_top_scorer_player_id UUID,
  p_top_assist_player_id UUID,
  p_challenge_player_id UUID,
  p_lineup_slots JSONB,
  p_reserve_player_id UUID DEFAULT NULL,
  p_reserve_slot_role TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_fantasy_season_id UUID;
  recent_round_count INTEGER;
  selected_count INTEGER;
  active_selected_count INTEGER;
BEGIN
  SELECT fantasy_round.fantasy_season_id
  INTO target_fantasy_season_id
  FROM public.fantasy_rounds fantasy_round
  WHERE fantasy_round.round_id = p_round_id;

  IF target_fantasy_season_id IS NULL THEN
    RAISE EXCEPTION 'Rodada do Cartola não encontrada.';
  END IF;

  WITH recent_rounds AS (
    SELECT fantasy_round.round_id
    FROM public.fantasy_rounds fantasy_round
    JOIN public.rounds ranked_round ON ranked_round.id = fantasy_round.round_id
    WHERE fantasy_round.fantasy_season_id = target_fantasy_season_id
      AND ranked_round.round_type = 'official'
      AND ranked_round.status = 'finished'
    ORDER BY ranked_round.date DESC, ranked_round.number DESC
    LIMIT 3
  )
  SELECT count(*)::INTEGER
  INTO recent_round_count
  FROM recent_rounds;

  IF recent_round_count > 0 THEN
    selected_count := cardinality(COALESCE(p_player_ids, ARRAY[]::UUID[]));

    WITH recent_rounds AS (
      SELECT fantasy_round.round_id
      FROM public.fantasy_rounds fantasy_round
      JOIN public.rounds ranked_round ON ranked_round.id = fantasy_round.round_id
      WHERE fantasy_round.fantasy_season_id = target_fantasy_season_id
        AND ranked_round.round_type = 'official'
        AND ranked_round.status = 'finished'
      ORDER BY ranked_round.date DESC, ranked_round.number DESC
      LIMIT 3
    )
    SELECT count(DISTINCT stat.player_id)::INTEGER
    INTO active_selected_count
    FROM public.player_round_stats stat
    WHERE stat.round_id IN (SELECT round_id FROM recent_rounds)
      AND COALESCE(stat.games, 0) > 0
      AND stat.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]));

    IF active_selected_count <> selected_count THEN
      RAISE EXCEPTION 'A escalação contém jogador fora da Ranked por não atuar nas três rodadas mais recentes.';
    END IF;

    IF p_reserve_player_id IS NOT NULL AND NOT EXISTS (
      WITH recent_rounds AS (
        SELECT fantasy_round.round_id
        FROM public.fantasy_rounds fantasy_round
        JOIN public.rounds ranked_round ON ranked_round.id = fantasy_round.round_id
        WHERE fantasy_round.fantasy_season_id = target_fantasy_season_id
          AND ranked_round.round_type = 'official'
          AND ranked_round.status = 'finished'
        ORDER BY ranked_round.date DESC, ranked_round.number DESC
        LIMIT 3
      )
      SELECT 1
      FROM public.player_round_stats stat
      WHERE stat.round_id IN (SELECT round_id FROM recent_rounds)
        AND stat.player_id = p_reserve_player_id
        AND COALESCE(stat.games, 0) > 0
    ) THEN
      RAISE EXCEPTION 'O reserva está fora da Ranked por não atuar nas três rodadas mais recentes.';
    END IF;
  END IF;

  RETURN public.save_fantasy_lineup_with_reserve_pre_activity_251(
    p_round_id,
    p_player_ids,
    p_captain_player_id,
    p_top_scorer_player_id,
    p_top_assist_player_id,
    p_challenge_player_id,
    p_lineup_slots,
    p_reserve_player_id,
    p_reserve_slot_role
  );
END
$$;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup_with_reserve(
  UUID,UUID[],UUID,UUID,UUID,UUID,JSONB,UUID,TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup_with_reserve(
  UUID,UUID[],UUID,UUID,UUID,UUID,JSONB,UUID,TEXT
) TO authenticated, service_role;

COMMENT ON FUNCTION public.save_fantasy_lineup_with_reserve(
  UUID,UUID[],UUID,UUID,UUID,UUID,JSONB,UUID,TEXT
) IS 'Salva titulares e reserva somente quando todos estão ativos na janela das três rodadas da Ranked.';

NOTIFY pgrst, 'reload schema';

COMMIT;
