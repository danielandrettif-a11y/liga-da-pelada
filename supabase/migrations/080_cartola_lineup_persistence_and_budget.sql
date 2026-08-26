-- Preserva a vaga tática também no elenco permanente e elimina a soma dupla
-- de C$ 11 no modo de seis atletas.

ALTER TABLE public.fantasy_portfolio_players
  ADD COLUMN IF NOT EXISTS slot_index INTEGER CHECK (slot_index >= 0),
  ADD COLUMN IF NOT EXISTS slot_role TEXT CHECK (slot_role IN ('GOL', 'DEF', 'MEI', 'ATA')),
  ADD COLUMN IF NOT EXISTS player_profile_locked TEXT CHECK (player_profile_locked IN ('defensive', 'midfield', 'offensive')),
  ADD COLUMN IF NOT EXISTS is_position_correct BOOLEAN;

CREATE OR REPLACE FUNCTION public.save_fantasy_portfolio(
  p_fantasy_season_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID,
  p_lineup_slots JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_portfolio_id UUID;
  slot_count INTEGER;
  unique_slot_players INTEGER;
  unique_slot_indexes INTEGER;
  normalized_slots JSONB := '[]'::JSONB;
  max_lineup_players INTEGER := 5;
  available_budget NUMERIC(10,2);
  lineup_cost NUMERIC(10,2);
  official_count INTEGER;
BEGIN
  IF jsonb_typeof(COALESCE(p_lineup_slots, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'As posições da escalação são inválidas.';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'player_id', COALESCE(slot->>'player_id', slot->>'playerId')::UUID,
    'slot_index', COALESCE(slot->>'slot_index', slot->>'slotIndex')::INTEGER,
    'slot_role', COALESCE(slot->>'slot_role', slot->>'slotRole')
  )), '[]'::JSONB)
  INTO normalized_slots
  FROM jsonb_array_elements(COALESCE(p_lineup_slots, '[]'::JSONB)) AS slot;

  SELECT count(*), count(DISTINCT slot.player_id), count(DISTINCT slot.slot_index)
  INTO slot_count, unique_slot_players, unique_slot_indexes
  FROM jsonb_to_recordset(normalized_slots) AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT);

  IF slot_count <> COALESCE(cardinality(p_player_ids), 0)
    OR unique_slot_players <> slot_count
    OR unique_slot_indexes <> slot_count
    OR EXISTS (
      SELECT 1 FROM jsonb_to_recordset(normalized_slots) AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT)
      WHERE slot.player_id IS NULL OR slot.slot_index IS NULL OR slot.slot_index < 0
        OR slot.slot_role NOT IN ('GOL', 'DEF', 'MEI', 'ATA')
        OR NOT (slot.player_id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[])))
    ) THEN
    RAISE EXCEPTION 'As posições da escalação são inválidas.';
  END IF;

  SELECT COALESCE(league.players_per_team, 5)
  INTO max_lineup_players
  FROM public.fantasy_seasons season_item
  JOIN public.seasons season ON season.id = season_item.season_id
  JOIN public.leagues league ON league.id = season.league_id
  WHERE season_item.id = p_fantasy_season_id;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(normalized_slots) AS slot(player_id UUID, slot_index INTEGER, slot_role TEXT)
    WHERE slot.slot_index >= max_lineup_players
  ) THEN
    RAISE EXCEPTION 'As posições da escalação são inválidas.';
  END IF;

  SELECT count(*) INTO official_count
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.member_category = 'player' AND player.is_selectable = true;
  IF official_count <> COALESCE(cardinality(p_player_ids), 0) THEN
    RAISE EXCEPTION 'O mercado do Cartola aceita somente jogadores com perfil oficial ativo.';
  END IF;

  SELECT GREATEST(COALESCE(account.current_budget, 0), max_lineup_players * 11.00)
  INTO available_budget
  FROM public.fantasy_accounts account
  WHERE account.fantasy_season_id = p_fantasy_season_id AND account.user_id = auth.uid();
  available_budget := COALESCE(available_budget, max_lineup_players * 11.00);

  SELECT COALESCE(sum(COALESCE(price.current_price, season_item.initial_player_price)), 0) INTO lineup_cost
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(player_id)
  JOIN public.fantasy_seasons season_item ON season_item.id = p_fantasy_season_id
  LEFT JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = season_item.id AND price.player_id = selected.player_id;
  IF lineup_cost > available_budget THEN
    RAISE EXCEPTION 'As compras ultrapassam o patrimônio disponível.';
  END IF;

  saved_portfolio_id := public.save_fantasy_portfolio_pre_official_market_072(
    p_fantasy_season_id, p_player_ids, p_captain_player_id
  );

  UPDATE public.fantasy_portfolio_players item
  SET slot_index = slot.slot_index,
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
  WHERE item.portfolio_id = saved_portfolio_id AND item.player_id = slot.player_id;

  RETURN saved_portfolio_id;
END;
$$;

-- O wrapper oficial continua aplicando a regra de mercado, mas passa a bloquear
-- compras acima do patrimônio real, sem o acréscimo duplicado do modo 6.
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
  target_fantasy_season_id UUID;
  max_lineup_players INTEGER := 5;
  available_budget NUMERIC(10,2);
  lineup_cost NUMERIC(10,2);
  official_count INTEGER;
  saved_lineup_id UUID;
BEGIN
  SELECT fantasy_round.fantasy_season_id, COALESCE(league.players_per_team, 5)
  INTO target_fantasy_season_id, max_lineup_players
  FROM public.fantasy_rounds fantasy_round
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  JOIN public.leagues league ON league.id = season.league_id
  WHERE fantasy_round.round_id = p_round_id;

  SELECT count(*) INTO official_count
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.member_category = 'player' AND player.is_selectable = true;
  IF official_count <> COALESCE(cardinality(p_player_ids), 0) THEN
    RAISE EXCEPTION 'O mercado do Cartola aceita somente jogadores com perfil oficial ativo.';
  END IF;

  SELECT GREATEST(COALESCE(account.current_budget, 0), max_lineup_players * 11.00)
  INTO available_budget
  FROM public.fantasy_accounts account
  WHERE account.fantasy_season_id = target_fantasy_season_id AND account.user_id = auth.uid();
  available_budget := COALESCE(available_budget, max_lineup_players * 11.00);

  SELECT COALESCE(sum(COALESCE(price.current_price, season_item.initial_player_price)), 0) INTO lineup_cost
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(player_id)
  JOIN public.fantasy_seasons season_item ON season_item.id = target_fantasy_season_id
  LEFT JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = season_item.id AND price.player_id = selected.player_id;
  IF lineup_cost > available_budget THEN
    RAISE EXCEPTION 'A escalação ultrapassa o patrimônio disponível.';
  END IF;

  saved_lineup_id := public.save_fantasy_lineup_pre_official_market_072(
    p_round_id, p_player_ids, p_captain_player_id, p_top_scorer_player_id,
    p_top_assist_player_id, p_challenge_player_id
  );

  UPDATE public.fantasy_lineups lineup
  SET budget_before = available_budget,
      cash_remaining = available_budget - lineup_cost
  WHERE lineup.id = saved_lineup_id;

  RETURN saved_lineup_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_fantasy_portfolio(UUID, UUID[], UUID, JSONB),
  public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
