BEGIN;

-- O mercado V12 incorpora procura real sem empilhar um segundo aumento sobre
-- o reajuste de desempenho: a procura apenas estabelece um piso de preço.
CREATE OR REPLACE FUNCTION public.fantasy_demand_price_premium(p_ownership NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_ownership, 0) >= .65 THEN .20
    WHEN COALESCE(p_ownership, 0) >= .50 THEN .15
    WHEN COALESCE(p_ownership, 0) >= .35 THEN .10
    WHEN COALESCE(p_ownership, 0) >= .20 THEN .05
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.apply_fantasy_demand_price_floor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.fantasy_rounds%ROWTYPE;
  current_round public.rounds%ROWTYPE;
  market_version INTEGER;
  ownership NUMERIC := 0;
  premium NUMERIC := 0;
  round_cap NUMERIC := .12;
  max_price NUMERIC := 22;
  demand_floor NUMERIC;
BEGIN
  SELECT * INTO target FROM public.fantasy_rounds WHERE id = NEW.fantasy_round_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  market_version := COALESCE(
    (target.settings_snapshot->>'marketVersion')::INTEGER,
    (target.settings_snapshot->>'market_version')::INTEGER,
    10
  );
  IF market_version < 12 OR NEW.price_before IS NULL OR NEW.price_before <= 0 THEN RETURN NEW; END IF;

  SELECT * INTO current_round FROM public.rounds WHERE id = target.round_id;
  round_cap := COALESCE((target.settings_snapshot->>'market_demand_round_cap')::NUMERIC, .12);
  max_price := COALESCE((target.settings_snapshot->>'max_player_price')::NUMERIC, 22);

  WITH recent_rounds AS (
    SELECT fantasy_round.id
    FROM public.fantasy_rounds fantasy_round
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    WHERE fantasy_round.fantasy_season_id = target.fantasy_season_id
      AND round_item.round_type = 'official'
      AND (round_item.date, round_item.number) <= (current_round.date, current_round.number)
      AND EXISTS (
        SELECT 1 FROM public.fantasy_lineups lineup
        WHERE lineup.fantasy_round_id = fantasy_round.id AND lineup.status = 'scored'
      )
    ORDER BY round_item.date DESC, round_item.number DESC
    LIMIT 2
  ), eligible_lineups AS (
    SELECT lineup.id
    FROM public.fantasy_lineups lineup
    JOIN recent_rounds ON recent_rounds.id = lineup.fantasy_round_id
    WHERE lineup.status = 'scored'
  )
  SELECT COALESCE(
    count(DISTINCT lineup_player.lineup_id) FILTER (WHERE lineup_player.player_id = NEW.player_id)::NUMERIC
      / NULLIF(count(DISTINCT eligible_lineups.id), 0),
    0
  )
  INTO ownership
  FROM eligible_lineups
  LEFT JOIN public.fantasy_lineup_players lineup_player ON lineup_player.lineup_id = eligible_lineups.id;

  premium := public.fantasy_demand_price_premium(ownership);
  IF premium <= 0 THEN
    NEW.metrics := COALESCE(NEW.metrics, '{}'::JSONB) || jsonb_build_object(
      'marketVersion', 12,
      'marketMethod', 'adaptive-global-v12-demand',
      'demandOwnership', round(ownership, 5),
      'demandPremium', 0
    );
    RETURN NEW;
  END IF;

  demand_floor := round(LEAST(max_price, NEW.price_before * (1 + LEAST(round_cap, premium))), 2);
  NEW.price_after := GREATEST(NEW.price_after, demand_floor);
  NEW.price_change := NEW.price_after - NEW.price_before;
  NEW.variation_rate := NEW.price_change / NULLIF(NEW.price_before, 0);
  NEW.market_band := CASE
    WHEN NEW.variation_rate > .015 THEN 'UP'
    WHEN NEW.variation_rate < -.015 THEN 'DOWN'
    ELSE 'STABLE'
  END;
  NEW.metrics := COALESCE(NEW.metrics, '{}'::JSONB) || jsonb_build_object(
    'marketVersion', 12,
    'marketMethod', 'adaptive-global-v12-demand',
    'demandOwnership', round(ownership, 5),
    'demandPremium', premium,
    'demandRoundCap', round_cap,
    'demandPriceFloor', demand_floor
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fantasy_price_history_demand_floor ON public.fantasy_player_price_history;
CREATE TRIGGER fantasy_price_history_demand_floor
BEFORE UPDATE OF price_after ON public.fantasy_player_price_history
FOR EACH ROW
WHEN (NEW.price_after IS NOT NULL)
EXECUTE FUNCTION public.apply_fantasy_demand_price_floor();

UPDATE public.fantasy_settings
SET market_version = GREATEST(COALESCE(market_version, 10), 12), updated_at = now();

UPDATE public.fantasy_rounds
SET settings_snapshot = COALESCE(settings_snapshot, '{}'::JSONB) || jsonb_build_object(
  'marketVersion', 12,
  'market_version', 12,
  'market_demand_round_cap', .12
)
WHERE market_status = 'open';

DO $$
BEGIN
  IF public.fantasy_demand_price_premium(.19) <> 0
    OR public.fantasy_demand_price_premium(.20) <> .05
    OR public.fantasy_demand_price_premium(.35) <> .10
    OR public.fantasy_demand_price_premium(.50) <> .15
    OR public.fantasy_demand_price_premium(.65) <> .20 THEN
    RAISE EXCEPTION 'Faixas de preço por procura inválidas.';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
