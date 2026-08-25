-- O pacote de pontuação é ativado pela vaga onde o cartoleiro escalou o atleta.
-- O preço do jogador continua vindo somente do desempenho-base da rodada.

ALTER TABLE public.fantasy_lineup_players
  ADD COLUMN IF NOT EXISTS slot_index INTEGER,
  ADD COLUMN IF NOT EXISTS slot_role TEXT CHECK (slot_role IN ('GOL', 'DEF', 'MEI', 'ATA')),
  ADD COLUMN IF NOT EXISTS player_profile_locked TEXT CHECK (player_profile_locked IN ('defensive', 'midfield', 'offensive')),
  ADD COLUMN IF NOT EXISTS is_position_correct BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS position_bonus NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.fantasy_test_lineup_players
  ADD COLUMN IF NOT EXISTS slot_index INTEGER,
  ADD COLUMN IF NOT EXISTS slot_role TEXT CHECK (slot_role IN ('GOL', 'DEF', 'MEI', 'ATA')),
  ADD COLUMN IF NOT EXISTS player_profile_locked TEXT CHECK (player_profile_locked IN ('defensive', 'midfield', 'offensive')),
  ADD COLUMN IF NOT EXISTS is_position_correct BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS position_bonus NUMERIC(10,2) NOT NULL DEFAULT 0;

-- A nova regra fixa o gol básico em +5 para todos. Atualizamos somente
-- mercados ainda abertos para não reescrever a pontuação de rodadas passadas.
UPDATE public.fantasy_settings
SET attacker_goal_points = goal_points
WHERE attacker_goal_points IS DISTINCT FROM goal_points;

UPDATE public.fantasy_rounds
SET settings_snapshot = settings_snapshot || jsonb_build_object(
  'attacker_goal_points', COALESCE((settings_snapshot->>'goal_points')::NUMERIC, 5)
)
WHERE market_status = 'open';

UPDATE public.fantasy_test_sessions
SET settings_snapshot = settings_snapshot || jsonb_build_object(
  'attacker_goal_points', COALESCE((settings_snapshot->>'goal_points')::NUMERIC, 5)
)
WHERE status = 'open';

-- A posição determina os bônus da rodada e, por isso, não pode ser alterada
-- pelo próprio atleta via REST/API. O administrador continua livre para
-- corrigir perfis oficiais antes do fechamento do mercado.
CREATE OR REPLACE FUNCTION public.protect_fantasy_player_positions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
    AND NOT public.is_app_admin()
    AND (
      NEW.player_profile IS DISTINCT FROM OLD.player_profile
      OR NEW.is_goalkeeper IS DISTINCT FROM OLD.is_goalkeeper
    ) THEN
    RAISE EXCEPTION 'A posição oficial do Cartola só pode ser alterada por um administrador.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_protect_fantasy_positions ON public.players;
CREATE TRIGGER players_protect_fantasy_positions
BEFORE UPDATE OF player_profile, is_goalkeeper ON public.players
FOR EACH ROW EXECUTE FUNCTION public.protect_fantasy_player_positions();

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID,
  p_top_scorer_player_id UUID,
  p_top_assist_player_id UUID,
  p_challenge_player_id UUID,
  p_lineup_slots JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_lineup_id UUID;
  slot_count INTEGER;
  unique_slot_players INTEGER;
  unique_slot_indexes INTEGER;
BEGIN
  IF jsonb_typeof(COALESCE(p_lineup_slots, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'As posições da escalação são inválidas.';
  END IF;

  SELECT count(*), count(DISTINCT slot.player_id), count(DISTINCT slot.slot_index)
  INTO slot_count, unique_slot_players, unique_slot_indexes
  FROM jsonb_to_recordset(COALESCE(p_lineup_slots, '[]'::JSONB))
    AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT);

  IF slot_count <> COALESCE(cardinality(p_player_ids), 0)
    OR unique_slot_players <> slot_count
    OR unique_slot_indexes <> slot_count
    OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_lineup_slots, '[]'::JSONB))
        AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT)
      WHERE slot.player_id IS NULL
        OR slot.slot_index IS NULL
        OR slot.slot_index < 0
        OR slot.slot_role NOT IN ('GOL', 'DEF', 'MEI', 'ATA')
        OR NOT (slot.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])))
    ) THEN
    RAISE EXCEPTION 'As posições da escalação são inválidas.';
  END IF;

  saved_lineup_id := public.save_fantasy_lineup(
    p_round_id, p_player_ids, p_captain_player_id, p_top_scorer_player_id,
    p_top_assist_player_id, p_challenge_player_id
  );

  UPDATE public.fantasy_lineup_players item
  SET
    slot_index = slot.slot_index,
    slot_role = slot.slot_role,
    player_profile_locked = player.player_profile,
    is_position_correct = CASE slot.slot_role
      WHEN 'GOL' THEN true
      WHEN 'DEF' THEN player.player_profile = 'defensive'
      WHEN 'MEI' THEN player.player_profile = 'midfield'
      WHEN 'ATA' THEN player.player_profile = 'offensive'
      ELSE false
    END
  FROM jsonb_to_recordset(p_lineup_slots) AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT)
  JOIN public.players player ON player.id = slot.player_id
  WHERE item.lineup_id = saved_lineup_id AND item.player_id = slot.player_id;

  RETURN saved_lineup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_fantasy_test_lineup(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID,
  p_top_scorer_player_id UUID,
  p_top_assist_player_id UUID,
  p_challenge_player_id UUID,
  p_lineup_slots JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_lineup_id UUID;
  slot_count INTEGER;
  unique_slot_players INTEGER;
  unique_slot_indexes INTEGER;
BEGIN
  IF jsonb_typeof(COALESCE(p_lineup_slots, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'As posições da escalação são inválidas.';
  END IF;

  SELECT count(*), count(DISTINCT slot.player_id), count(DISTINCT slot.slot_index)
  INTO slot_count, unique_slot_players, unique_slot_indexes
  FROM jsonb_to_recordset(COALESCE(p_lineup_slots, '[]'::JSONB))
    AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT);

  IF slot_count <> COALESCE(cardinality(p_player_ids), 0)
    OR unique_slot_players <> slot_count
    OR unique_slot_indexes <> slot_count
    OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_lineup_slots, '[]'::JSONB))
        AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT)
      WHERE slot.player_id IS NULL
        OR slot.slot_index IS NULL
        OR slot.slot_index < 0
        OR slot.slot_role NOT IN ('GOL', 'DEF', 'MEI', 'ATA')
        OR NOT (slot.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])))
    ) THEN
    RAISE EXCEPTION 'As posições da escalação são inválidas.';
  END IF;

  saved_lineup_id := public.save_fantasy_test_lineup(
    p_round_id, p_player_ids, p_captain_player_id, p_top_scorer_player_id,
    p_top_assist_player_id, p_challenge_player_id
  );

  UPDATE public.fantasy_test_lineup_players item
  SET
    slot_index = slot.slot_index,
    slot_role = slot.slot_role,
    player_profile_locked = player.player_profile,
    is_position_correct = CASE slot.slot_role
      WHEN 'GOL' THEN true
      WHEN 'DEF' THEN player.player_profile = 'defensive'
      WHEN 'MEI' THEN player.player_profile = 'midfield'
      WHEN 'ATA' THEN player.player_profile = 'offensive'
      ELSE false
    END
  FROM jsonb_to_recordset(p_lineup_slots) AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT)
  JOIN public.players player ON player.id = slot.player_id
  WHERE item.lineup_id = saved_lineup_id AND item.player_id = slot.player_id;

  RETURN saved_lineup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_fantasy_slot_position_bonus(
  p_round_id UUID,
  p_is_test BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_snapshot JSONB;
  target_container UUID;
BEGIN
  IF p_is_test THEN
    SELECT id, settings_snapshot INTO target_container, target_snapshot
    FROM public.fantasy_test_sessions WHERE round_id = p_round_id;
  ELSE
    SELECT id, settings_snapshot INTO target_container, target_snapshot
    FROM public.fantasy_rounds WHERE round_id = p_round_id;
  END IF;
  IF target_container IS NULL THEN RETURN true; END IF;

  IF p_is_test THEN
    WITH calculated AS (
      SELECT item.id, item.player_id, lineup.captain_player_id,
        public.calculate_fantasy_base_points(
          target_snapshot, stat.goals, stat.assists, stat.wins, stat.losses,
          0, stat.team_goals_conceded
        ) + COALESCE(stat.own_goals, 0) * COALESCE((target_snapshot->>'own_goal_points')::NUMERIC, -3) AS base_points,
        CASE
          -- GOL é definido pela escalação: qualquer atleta participante nessa
          -- vaga recebe o pacote e +4 quando seu time não sofre gol.
          WHEN item.slot_role = 'GOL' AND COALESCE(stat.games, 0) > 0
            THEN COALESCE(stat.games, 0) * COALESCE((target_snapshot->>'goalkeeper_appearance_points')::NUMERIC, 3)
              + COALESCE(stat.losses, 0) * (COALESCE((target_snapshot->>'goalkeeper_loss_points')::NUMERIC, 0) - COALESCE((target_snapshot->>'loss_points')::NUMERIC, -2))
              + CASE WHEN COALESCE(stat.team_goals_conceded, 0) = 0 THEN 4 ELSE 0 END
          WHEN item.is_position_correct AND item.slot_role = 'DEF'
            THEN CASE WHEN COALESCE(stat.team_goals_conceded, 0) = 0 THEN 4 WHEN COALESCE(stat.team_goals_conceded, 0) = 1 THEN 2 ELSE 0 END
          WHEN item.is_position_correct AND item.slot_role = 'MEI'
            THEN COALESCE(stat.assists, 0) * (4 - COALESCE((target_snapshot->>'assist_points')::NUMERIC, 3))
              + CASE WHEN COALESCE(stat.assists, 0) >= 2 THEN 3 ELSE 0 END
          WHEN item.is_position_correct AND item.slot_role = 'ATA'
            THEN CASE WHEN COALESCE(stat.goals, 0) >= 2 THEN 3 ELSE 0 END
          ELSE 0
        END AS position_bonus
      FROM public.fantasy_test_lineup_players item
      JOIN public.fantasy_test_lineups lineup ON lineup.id = item.lineup_id
      JOIN public.players player ON player.id = item.player_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.test_session_id = target_container AND lineup.status = 'scored'
    )
    UPDATE public.fantasy_test_lineup_players item SET
      base_points = calculated.base_points + calculated.position_bonus,
      position_bonus = calculated.position_bonus,
      captain_bonus = CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN (calculated.base_points + calculated.position_bonus) * (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1) ELSE 0 END,
      total_points = (calculated.base_points + calculated.position_bonus) * CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) ELSE 1 END
    FROM calculated WHERE item.id = calculated.id;

    UPDATE public.fantasy_test_lineups lineup SET
      player_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      total_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0) + COALESCE(lineup.prediction_points, 0),
      score_breakdown = COALESCE(lineup.score_breakdown, '{}'::JSONB) || jsonb_build_object(
        'playersBase', COALESCE((SELECT sum(item.base_points - item.position_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'positionBonus', COALESCE((SELECT sum(item.position_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_test_lineup_players item WHERE item.lineup_id = lineup.id), 0)
      )
    WHERE lineup.test_session_id = target_container AND lineup.status = 'scored';
  ELSE
    WITH calculated AS (
      SELECT item.id, item.player_id, lineup.captain_player_id,
        public.calculate_fantasy_base_points(
          target_snapshot, stat.goals, stat.assists, stat.wins, stat.losses,
          0, stat.team_goals_conceded
        ) + COALESCE(stat.own_goals, 0) * COALESCE((target_snapshot->>'own_goal_points')::NUMERIC, -3) AS base_points,
        CASE
          WHEN item.slot_role = 'GOL' AND COALESCE(stat.games, 0) > 0
            THEN COALESCE(stat.games, 0) * COALESCE((target_snapshot->>'goalkeeper_appearance_points')::NUMERIC, 3)
              + COALESCE(stat.losses, 0) * (COALESCE((target_snapshot->>'goalkeeper_loss_points')::NUMERIC, 0) - COALESCE((target_snapshot->>'loss_points')::NUMERIC, -2))
              + CASE WHEN COALESCE(stat.team_goals_conceded, 0) = 0 THEN 4 ELSE 0 END
          WHEN item.is_position_correct AND item.slot_role = 'DEF'
            THEN CASE WHEN COALESCE(stat.team_goals_conceded, 0) = 0 THEN 4 WHEN COALESCE(stat.team_goals_conceded, 0) = 1 THEN 2 ELSE 0 END
          WHEN item.is_position_correct AND item.slot_role = 'MEI'
            THEN COALESCE(stat.assists, 0) * (4 - COALESCE((target_snapshot->>'assist_points')::NUMERIC, 3))
              + CASE WHEN COALESCE(stat.assists, 0) >= 2 THEN 3 ELSE 0 END
          WHEN item.is_position_correct AND item.slot_role = 'ATA'
            THEN CASE WHEN COALESCE(stat.goals, 0) >= 2 THEN 3 ELSE 0 END
          ELSE 0
        END AS position_bonus
      FROM public.fantasy_lineup_players item
      JOIN public.fantasy_lineups lineup ON lineup.id = item.lineup_id
      JOIN public.players player ON player.id = item.player_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.fantasy_round_id = target_container AND lineup.status = 'scored'
    )
    UPDATE public.fantasy_lineup_players item SET
      base_points = calculated.base_points + calculated.position_bonus,
      position_bonus = calculated.position_bonus,
      captain_bonus = CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN (calculated.base_points + calculated.position_bonus) * (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1) ELSE 0 END,
      total_points = (calculated.base_points + calculated.position_bonus) * CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) ELSE 1 END
    FROM calculated WHERE item.id = calculated.id;

    UPDATE public.fantasy_lineups lineup SET
      player_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
      total_points = COALESCE((SELECT sum(item.total_points) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0)
        + COALESCE(lineup.prediction_points, 0)
        + COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0),
      score_breakdown = COALESCE(lineup.score_breakdown, '{}'::JSONB) || jsonb_build_object(
        'playersBase', COALESCE((SELECT sum(item.base_points - item.position_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'positionBonus', COALESCE((SELECT sum(item.position_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0),
        'captainBonus', COALESCE((SELECT sum(item.captain_bonus) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id), 0)
      )
    WHERE lineup.fantasy_round_id = target_container AND lineup.status = 'scored';
  END IF;

  RETURN true;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.process_fantasy_round_pre_slot_position_bonus_073(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_round(UUID) RENAME TO process_fantasy_round_pre_slot_position_bonus_073;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.process_fantasy_round_pre_slot_position_bonus_073(p_round_id);
  PERFORM public.apply_fantasy_slot_position_bonus(p_round_id, false);
  RETURN true;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.process_fantasy_test_round_pre_slot_position_bonus_073(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_test_round(UUID) RENAME TO process_fantasy_test_round_pre_slot_position_bonus_073;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_test_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.process_fantasy_test_round_pre_slot_position_bonus_073(p_round_id);
  PERFORM public.apply_fantasy_slot_position_bonus(p_round_id, true);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_fantasy_slot_position_bonus(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fantasy_round_pre_slot_position_bonus_073(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fantasy_test_round_pre_slot_position_bonus_073(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_fantasy_test_lineup(UUID, UUID[], UUID, UUID, UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(UUID), public.process_fantasy_test_round(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
