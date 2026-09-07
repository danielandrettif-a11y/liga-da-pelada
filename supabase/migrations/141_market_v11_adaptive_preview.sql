-- Mercado V11, etapa 1: infraestrutura, diagnóstico e prévia somente leitura.
-- Esta migration NÃO altera preços, patrimônios, escalações ou históricos.

BEGIN;

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS market_version INTEGER NOT NULL DEFAULT 10 CHECK (market_version BETWEEN 1 AND 99),
  ADD COLUMN IF NOT EXISTS market_difficulty_multiplier NUMERIC(7,5) NOT NULL DEFAULT 1 CHECK (market_difficulty_multiplier BETWEEN .94 AND 1.18),
  ADD COLUMN IF NOT EXISTS market_difficulty_min NUMERIC(7,5) NOT NULL DEFAULT .94 CHECK (market_difficulty_min BETWEEN .5 AND 1.5),
  ADD COLUMN IF NOT EXISTS market_difficulty_max NUMERIC(7,5) NOT NULL DEFAULT 1.18 CHECK (market_difficulty_max BETWEEN .5 AND 2),
  ADD COLUMN IF NOT EXISTS market_difficulty_step NUMERIC(7,5) NOT NULL DEFAULT .03 CHECK (market_difficulty_step BETWEEN 0 AND .10),
  ADD COLUMN IF NOT EXISTS market_target_elite_affordability NUMERIC(7,5) NOT NULL DEFAULT .20 CHECK (market_target_elite_affordability BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS market_target_median_elite_ratio NUMERIC(7,5) NOT NULL DEFAULT .86 CHECK (market_target_median_elite_ratio BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS market_recovery_bonus_strength NUMERIC(7,5) NOT NULL DEFAULT 2.40 CHECK (market_recovery_bonus_strength BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS market_expensive_risk_strength NUMERIC(7,5) NOT NULL DEFAULT 1.20 CHECK (market_expensive_risk_strength BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS market_breakout_reprice_strength NUMERIC(7,5) NOT NULL DEFAULT .40 CHECK (market_breakout_reprice_strength BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS market_cheap_percentile NUMERIC(7,5) NOT NULL DEFAULT .35 CHECK (market_cheap_percentile BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS market_elite_percentile NUMERIC(7,5) NOT NULL DEFAULT .80 CHECK (market_elite_percentile BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS market_breakout_round_percentile NUMERIC(7,5) NOT NULL DEFAULT .70 CHECK (market_breakout_round_percentile BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS market_bad_round_percentile NUMERIC(7,5) NOT NULL DEFAULT .35 CHECK (market_bad_round_percentile BETWEEN 0 AND 1);

ALTER TABLE public.fantasy_settings
  DROP CONSTRAINT IF EXISTS fantasy_settings_market_difficulty_range;
ALTER TABLE public.fantasy_settings
  ADD CONSTRAINT fantasy_settings_market_difficulty_range
  CHECK (market_difficulty_min <= 1 AND market_difficulty_max >= 1 AND market_difficulty_min < market_difficulty_max);

CREATE TABLE IF NOT EXISTS public.fantasy_market_difficulty_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  fantasy_season_id UUID NOT NULL REFERENCES public.fantasy_seasons(id) ON DELETE CASCADE,
  fantasy_round_id UUID REFERENCES public.fantasy_rounds(id) ON DELETE SET NULL,
  stage TEXT NOT NULL CHECK (stage IN ('preview', 'calibration', 'close')),
  market_version INTEGER NOT NULL DEFAULT 11,
  players_per_team INTEGER NOT NULL,
  budget_p25 NUMERIC(10,2),
  budget_p50 NUMERIC(10,2),
  budget_p75 NUMERIC(10,2),
  budget_p90 NUMERIC(10,2),
  economy_lineup_cost NUMERIC(10,2),
  competitive_lineup_cost NUMERIC(10,2),
  elite_lineup_cost NUMERIC(10,2),
  economy_affordability_rate NUMERIC(7,5),
  competitive_affordability_rate NUMERIC(7,5),
  elite_affordability_rate NUMERIC(7,5),
  median_elite_ratio NUMERIC(9,5),
  price_p10 NUMERIC(10,2),
  price_p50 NUMERIC(10,2),
  price_p90 NUMERIC(10,2),
  pressure NUMERIC(8,6) NOT NULL DEFAULT 0,
  previous_multiplier NUMERIC(7,5) NOT NULL DEFAULT 1,
  next_multiplier NUMERIC(7,5) NOT NULL DEFAULT 1,
  scenario TEXT NOT NULL DEFAULT 'balanced',
  metrics JSONB NOT NULL DEFAULT '{}'::JSONB,
  calibration_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_market_difficulty_snapshot_round_stage_uq
  ON public.fantasy_market_difficulty_snapshots (fantasy_season_id, fantasy_round_id, stage)
  NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS fantasy_market_difficulty_snapshot_latest_idx
  ON public.fantasy_market_difficulty_snapshots (fantasy_season_id, created_at DESC);

ALTER TABLE public.fantasy_market_difficulty_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fantasy_market_difficulty_snapshots FROM PUBLIC, anon, authenticated;

-- Custo de uma escalação válida. O atleta do slot GOL pode ter qualquer perfil,
-- mas nunca pode repetir um atleta já escolhido nas vagas de linha.
CREATE OR REPLACE FUNCTION public.fantasy_market_v11_lineup_cost(
  p_fantasy_season_id UUID,
  p_formation TEXT,
  p_mode TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  team_size INTEGER;
  attack_slots INTEGER;
  midfield_slots INTEGER;
  defense_slots INTEGER := 2;
  goalkeeper_slots INTEGER;
  selected_ids UUID[] := ARRAY[]::UUID[];
  picked_ids UUID[];
  picked_cost NUMERIC;
  result_cost NUMERIC := 0;
  wanted_percentile NUMERIC := .60;
BEGIN
  IF p_mode NOT IN ('economy', 'competitive', 'elite') THEN
    RAISE EXCEPTION 'Modo de escalação V11 inválido: %', p_mode;
  END IF;
  IF p_formation NOT IN ('2-1-2', '2-2-1') THEN
    RAISE EXCEPTION 'Formação V11 inválida: %', p_formation;
  END IF;

  SELECT league.players_per_team INTO team_size
  FROM public.fantasy_seasons season
  JOIN public.leagues league ON league.id = season.league_id
  WHERE season.id = p_fantasy_season_id;
  IF team_size NOT IN (5, 6) THEN RETURN NULL; END IF;

  attack_slots := CASE WHEN p_formation = '2-1-2' THEN 2 ELSE 1 END;
  midfield_slots := CASE WHEN p_formation = '2-1-2' THEN 1 ELSE 2 END;
  goalkeeper_slots := CASE WHEN team_size = 6 THEN 1 ELSE 0 END;

  -- Escolhe cada bloco posicional preservando os IDs para o slot aberto de GOL.
  WITH candidates AS (
    SELECT price.player_id, price.current_price,
      percent_rank() OVER (ORDER BY price.current_price) price_percentile
    FROM public.fantasy_player_prices price JOIN public.players player ON player.id = price.player_id
    WHERE price.fantasy_season_id = p_fantasy_season_id AND player.player_profile = 'offensive'
  ), chosen AS (
    SELECT * FROM candidates ORDER BY
      CASE WHEN p_mode = 'economy' THEN current_price END ASC,
      CASE WHEN p_mode = 'elite' THEN current_price END DESC,
      CASE WHEN p_mode = 'competitive' THEN abs(price_percentile - wanted_percentile) END ASC,
      player_id LIMIT attack_slots
  ) SELECT array_agg(player_id), sum(current_price) INTO picked_ids, picked_cost FROM chosen;
  IF cardinality(COALESCE(picked_ids, ARRAY[]::UUID[])) <> attack_slots THEN RETURN NULL; END IF;
  selected_ids := selected_ids || picked_ids; result_cost := result_cost + picked_cost;

  WITH candidates AS (
    SELECT price.player_id, price.current_price,
      percent_rank() OVER (ORDER BY price.current_price) price_percentile
    FROM public.fantasy_player_prices price JOIN public.players player ON player.id = price.player_id
    WHERE price.fantasy_season_id = p_fantasy_season_id AND player.player_profile = 'midfield'
  ), chosen AS (
    SELECT * FROM candidates ORDER BY
      CASE WHEN p_mode = 'economy' THEN current_price END ASC,
      CASE WHEN p_mode = 'elite' THEN current_price END DESC,
      CASE WHEN p_mode = 'competitive' THEN abs(price_percentile - wanted_percentile) END ASC,
      player_id LIMIT midfield_slots
  ) SELECT array_agg(player_id), sum(current_price) INTO picked_ids, picked_cost FROM chosen;
  IF cardinality(COALESCE(picked_ids, ARRAY[]::UUID[])) <> midfield_slots THEN RETURN NULL; END IF;
  selected_ids := selected_ids || picked_ids; result_cost := result_cost + picked_cost;

  WITH candidates AS (
    SELECT price.player_id, price.current_price,
      percent_rank() OVER (ORDER BY price.current_price) price_percentile
    FROM public.fantasy_player_prices price JOIN public.players player ON player.id = price.player_id
    WHERE price.fantasy_season_id = p_fantasy_season_id AND player.player_profile = 'defensive'
  ), chosen AS (
    SELECT * FROM candidates ORDER BY
      CASE WHEN p_mode = 'economy' THEN current_price END ASC,
      CASE WHEN p_mode = 'elite' THEN current_price END DESC,
      CASE WHEN p_mode = 'competitive' THEN abs(price_percentile - wanted_percentile) END ASC,
      player_id LIMIT defense_slots
  ) SELECT array_agg(player_id), sum(current_price) INTO picked_ids, picked_cost FROM chosen;
  IF cardinality(COALESCE(picked_ids, ARRAY[]::UUID[])) <> defense_slots THEN RETURN NULL; END IF;
  selected_ids := selected_ids || picked_ids; result_cost := result_cost + picked_cost;

  IF goalkeeper_slots = 1 THEN
    WITH candidates AS (
      SELECT price.player_id, price.current_price,
        percent_rank() OVER (ORDER BY price.current_price) price_percentile
      FROM public.fantasy_player_prices price
      WHERE price.fantasy_season_id = p_fantasy_season_id AND NOT (price.player_id = ANY(selected_ids))
    ) SELECT current_price INTO picked_cost FROM candidates ORDER BY
      CASE WHEN p_mode = 'economy' THEN current_price END ASC,
      CASE WHEN p_mode = 'elite' THEN current_price END DESC,
      CASE WHEN p_mode = 'competitive' THEN abs(price_percentile - wanted_percentile) END ASC,
      player_id LIMIT 1;
    IF picked_cost IS NULL THEN RETURN NULL; END IF;
    result_cost := result_cost + picked_cost;
  END IF;

  RETURN round(result_cost, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.fantasy_market_v11_metrics(p_fantasy_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings public.fantasy_settings%ROWTYPE;
  league_id_value UUID;
  team_size INTEGER;
  previous_multiplier NUMERIC;
  economy_cost NUMERIC;
  competitive_cost NUMERIC;
  elite_cost NUMERIC;
  budget25 NUMERIC; budget50 NUMERIC; budget75 NUMERIC; budget90 NUMERIC;
  price10 NUMERIC; price50 NUMERIC; price90 NUMERIC;
  economy_rate NUMERIC; competitive_rate NUMERIC; elite_rate NUMERIC;
  median_ratio NUMERIC; affordability_gap NUMERIC; median_gap NUMERIC; pressure_value NUMERIC; next_multiplier NUMERIC;
BEGIN
  SELECT season.league_id, league.players_per_team INTO league_id_value, team_size
  FROM public.fantasy_seasons season JOIN public.leagues league ON league.id = season.league_id
  WHERE season.id = p_fantasy_season_id;
  IF league_id_value IS NULL THEN RAISE EXCEPTION 'Temporada do Cartola não encontrada.'; END IF;
  SELECT * INTO settings FROM public.fantasy_settings WHERE league_id = league_id_value;

  SELECT COALESCE(snapshot.next_multiplier, settings.market_difficulty_multiplier, 1) INTO previous_multiplier
  FROM (SELECT 1) seed LEFT JOIN LATERAL (
    SELECT item.next_multiplier FROM public.fantasy_market_difficulty_snapshots item
    WHERE item.fantasy_season_id = p_fantasy_season_id AND item.stage IN ('calibration', 'close')
    ORDER BY item.created_at DESC LIMIT 1
  ) snapshot ON true;

  -- Agregações separadas mantêm a semântica: menor economia, mediana competitiva e maior elite.
  SELECT min(public.fantasy_market_v11_lineup_cost(p_fantasy_season_id, formation, 'economy')) INTO economy_cost
  FROM unnest(ARRAY['2-1-2','2-2-1']) formation;
  SELECT percentile_cont(.5) WITHIN GROUP (ORDER BY public.fantasy_market_v11_lineup_cost(p_fantasy_season_id, formation, 'competitive')) INTO competitive_cost
  FROM unnest(ARRAY['2-1-2','2-2-1']) formation;
  SELECT max(public.fantasy_market_v11_lineup_cost(p_fantasy_season_id, formation, 'elite')) INTO elite_cost
  FROM unnest(ARRAY['2-1-2','2-2-1']) formation;

  SELECT percentile_cont(.25) WITHIN GROUP (ORDER BY current_budget), percentile_cont(.5) WITHIN GROUP (ORDER BY current_budget),
    percentile_cont(.75) WITHIN GROUP (ORDER BY current_budget), percentile_cont(.9) WITHIN GROUP (ORDER BY current_budget)
  INTO budget25, budget50, budget75, budget90 FROM public.fantasy_accounts
  WHERE fantasy_season_id = p_fantasy_season_id AND rounds_played > 0;
  SELECT percentile_cont(.1) WITHIN GROUP (ORDER BY current_price), percentile_cont(.5) WITHIN GROUP (ORDER BY current_price),
    percentile_cont(.9) WITHIN GROUP (ORDER BY current_price)
  INTO price10, price50, price90 FROM public.fantasy_player_prices WHERE fantasy_season_id = p_fantasy_season_id;
  SELECT avg((current_budget >= economy_cost)::INTEGER), avg((current_budget >= competitive_cost)::INTEGER), avg((current_budget >= elite_cost)::INTEGER)
  INTO economy_rate, competitive_rate, elite_rate FROM public.fantasy_accounts
  WHERE fantasy_season_id = p_fantasy_season_id AND rounds_played > 0;

  elite_rate := COALESCE(elite_rate, 0); median_ratio := COALESCE(budget50 / NULLIF(elite_cost, 0), 0);
  affordability_gap := GREATEST(-1, LEAST(1, (elite_rate - settings.market_target_elite_affordability) / .30));
  median_gap := GREATEST(-1, LEAST(1, (median_ratio - settings.market_target_median_elite_ratio) / .20));
  pressure_value := GREATEST(-1, LEAST(1, .65 * affordability_gap + .35 * median_gap));
  next_multiplier := GREATEST(settings.market_difficulty_min, LEAST(settings.market_difficulty_max,
    previous_multiplier + GREATEST(-settings.market_difficulty_step, LEAST(settings.market_difficulty_step, pressure_value * settings.market_difficulty_step))));

  RETURN jsonb_build_object(
    'marketVersion', 11, 'leagueId', league_id_value, 'fantasySeasonId', p_fantasy_season_id,
    'playersPerTeam', team_size, 'budgetP25', round(budget25,2), 'budgetP50', round(budget50,2),
    'budgetP75', round(budget75,2), 'budgetP90', round(budget90,2),
    'economyLineupCost', economy_cost, 'competitiveLineupCost', competitive_cost, 'eliteLineupCost', elite_cost,
    'economyAffordabilityRate', round(economy_rate,5), 'competitiveAffordabilityRate', round(competitive_rate,5),
    'eliteAffordabilityRate', round(elite_rate,5), 'medianEliteRatio', round(median_ratio,5),
    'priceP10', round(price10,2), 'priceP50', round(price50,2), 'priceP90', round(price90,2),
    'affordabilityGap', round(affordability_gap,6), 'medianGap', round(median_gap,6),
    'pressure', round(pressure_value,6), 'previousMultiplier', round(previous_multiplier,5),
    'nextMultiplier', round(next_multiplier,5),
    'level', CASE WHEN pressure_value <= -.20 THEN 'ACCESSIBLE' WHEN pressure_value >= .20 THEN 'COMPETITIVE' ELSE 'BALANCED' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_fantasy_market_v11(p_fantasy_season_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_season UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores.'; END IF;
  SELECT COALESCE(p_fantasy_season_id, season.id) INTO target_season
  FROM public.fantasy_seasons season JOIN public.seasons real_season ON real_season.id = season.season_id
  WHERE p_fantasy_season_id IS NULL OR season.id = p_fantasy_season_id
  ORDER BY real_season.started_at DESC NULLS LAST, season.created_at DESC LIMIT 1;
  RETURN public.fantasy_market_v11_metrics(target_season);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_fantasy_market_v11_status(p_fantasy_season_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores.'; END IF;
  SELECT to_jsonb(item) INTO result FROM public.fantasy_market_difficulty_snapshots item
  WHERE item.fantasy_season_id = p_fantasy_season_id ORDER BY item.created_at DESC LIMIT 1;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_fantasy_market_v11_public_health(p_fantasy_season_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'version', COALESCE(item.market_version, settings.market_version, 10),
    'pressure', COALESCE(item.pressure, 0),
    'difficultyMultiplier', COALESCE(item.next_multiplier, settings.market_difficulty_multiplier, 1),
    'level', CASE WHEN COALESCE(item.pressure, 0) <= -.20 THEN 'ACCESSIBLE'
      WHEN COALESCE(item.pressure, 0) >= .20 THEN 'COMPETITIVE' ELSE 'BALANCED' END,
    'economyLineupCost', item.economy_lineup_cost,
    'competitiveLineupCost', item.competitive_lineup_cost,
    'eliteLineupCost', item.elite_lineup_cost,
    'economyAffordabilityRate', item.economy_affordability_rate,
    'competitiveAffordabilityRate', item.competitive_affordability_rate,
    'eliteAffordabilityRate', item.elite_affordability_rate,
    'medianEliteRatio', item.median_elite_ratio
  )
  FROM public.fantasy_seasons season
  JOIN public.fantasy_settings settings ON settings.league_id = season.league_id
  LEFT JOIN LATERAL (
    SELECT snapshot.* FROM public.fantasy_market_difficulty_snapshots snapshot
    WHERE snapshot.fantasy_season_id = season.id AND snapshot.stage IN ('calibration','close')
    ORDER BY snapshot.created_at DESC LIMIT 1
  ) item ON true
  WHERE season.id = p_fantasy_season_id;
$$;

CREATE OR REPLACE FUNCTION public.update_fantasy_market_v11_settings(p_settings JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores.'; END IF;
  SELECT id INTO target_league FROM public.leagues LIMIT 1;
  IF target_league IS NULL THEN RAISE EXCEPTION 'Liga não encontrada.'; END IF;
  UPDATE public.fantasy_settings SET
    market_difficulty_min = COALESCE((p_settings->>'market_difficulty_min')::NUMERIC, market_difficulty_min),
    market_difficulty_max = COALESCE((p_settings->>'market_difficulty_max')::NUMERIC, market_difficulty_max),
    market_difficulty_step = COALESCE((p_settings->>'market_difficulty_step')::NUMERIC, market_difficulty_step),
    market_target_elite_affordability = COALESCE((p_settings->>'market_target_elite_affordability')::NUMERIC, market_target_elite_affordability),
    market_target_median_elite_ratio = COALESCE((p_settings->>'market_target_median_elite_ratio')::NUMERIC, market_target_median_elite_ratio),
    market_recovery_bonus_strength = COALESCE((p_settings->>'market_recovery_bonus_strength')::NUMERIC, market_recovery_bonus_strength),
    market_expensive_risk_strength = COALESCE((p_settings->>'market_expensive_risk_strength')::NUMERIC, market_expensive_risk_strength),
    market_breakout_reprice_strength = COALESCE((p_settings->>'market_breakout_reprice_strength')::NUMERIC, market_breakout_reprice_strength),
    market_cheap_percentile = COALESCE((p_settings->>'market_cheap_percentile')::NUMERIC, market_cheap_percentile),
    market_elite_percentile = COALESCE((p_settings->>'market_elite_percentile')::NUMERIC, market_elite_percentile),
    market_breakout_round_percentile = COALESCE((p_settings->>'market_breakout_round_percentile')::NUMERIC, market_breakout_round_percentile),
    market_bad_round_percentile = COALESCE((p_settings->>'market_bad_round_percentile')::NUMERIC, market_bad_round_percentile),
    updated_at = now()
  WHERE league_id = target_league;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.fantasy_market_v11_lineup_cost(UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fantasy_market_v11_metrics(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_fantasy_market_v11(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_fantasy_market_v11_status(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_fantasy_market_v11_public_health(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_fantasy_market_v11_settings(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_fantasy_market_v11(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fantasy_market_v11_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fantasy_market_v11_public_health(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_fantasy_market_v11_settings(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
