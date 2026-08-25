-- Migration 078: Normalização de slots de escalação no Cartola (suporte a camelCase e snake_case)

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
  normalized_slots JSONB := '[]'::JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_lineup_slots, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'As posições da escalação são inválidas.';
  END IF;

  -- Normalizar campos para garantir compatibilidade com camelCase e snake_case
  SELECT jsonb_agg(
    jsonb_build_object(
      'player_id', COALESCE(elem->>'player_id', elem->>'playerId')::UUID,
      'slot_index', COALESCE(elem->>'slot_index', elem->>'slotIndex')::INTEGER,
      'slot_role', COALESCE(elem->>'slot_role', elem->>'slotRole')
    )
  )
  INTO normalized_slots
  FROM jsonb_array_elements(COALESCE(p_lineup_slots, '[]'::JSONB)) AS elem;

  SELECT count(*), count(DISTINCT slot.player_id), count(DISTINCT slot.slot_index)
  INTO slot_count, unique_slot_players, unique_slot_indexes
  FROM jsonb_to_recordset(COALESCE(normalized_slots, '[]'::JSONB))
    AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT);

  IF slot_count <> COALESCE(cardinality(p_player_ids), 0)
    OR unique_slot_players <> slot_count
    OR unique_slot_indexes <> slot_count
    OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(normalized_slots, '[]'::JSONB))
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
  FROM jsonb_to_recordset(normalized_slots) AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT)
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
  normalized_slots JSONB := '[]'::JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_lineup_slots, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'As posições da escalação são inválidas.';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'player_id', COALESCE(elem->>'player_id', elem->>'playerId')::UUID,
      'slot_index', COALESCE(elem->>'slot_index', elem->>'slotIndex')::INTEGER,
      'slot_role', COALESCE(elem->>'slot_role', elem->>'slotRole')
    )
  )
  INTO normalized_slots
  FROM jsonb_array_elements(COALESCE(p_lineup_slots, '[]'::JSONB)) AS elem;

  SELECT count(*), count(DISTINCT slot.player_id), count(DISTINCT slot.slot_index)
  INTO slot_count, unique_slot_players, unique_slot_indexes
  FROM jsonb_to_recordset(COALESCE(normalized_slots, '[]'::JSONB))
    AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT);

  IF slot_count <> COALESCE(cardinality(p_player_ids), 0)
    OR unique_slot_players <> slot_count
    OR unique_slot_indexes <> slot_count
    OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(COALESCE(normalized_slots, '[]'::JSONB))
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
  FROM jsonb_to_recordset(normalized_slots) AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT)
  JOIN public.players player ON player.id = slot.player_id
  WHERE item.test_lineup_id = saved_lineup_id AND item.player_id = slot.player_id;

  RETURN saved_lineup_id;
END;
$$;
