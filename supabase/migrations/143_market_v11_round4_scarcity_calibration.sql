-- Mercado V11, rodada 4: calibração única de escassez.
-- Objetivo: manter a base acessível e tornar a escalação de maior teto uma decisão.
-- Não altera patrimônio, escalações travadas nem histórico de preço das rodadas anteriores.

BEGIN;

DO $$
DECLARE
  target RECORD;
  before_health JSONB;
  after_health JSONB;
  open_round_id UUID;
  affected_players INTEGER;
BEGIN
  -- A migration é deliberadamente restrita a uma temporada ativa já no V11 e
  -- com a rodada 4 aberta. Isso impede uma reaplicação acidental no futuro.
  FOR target IN
    SELECT fantasy_season.id AS fantasy_season_id,
      fantasy_season.league_id,
      settings.max_player_price
    FROM public.fantasy_seasons fantasy_season
    JOIN public.seasons season
      ON season.id = fantasy_season.season_id
      AND season.status = 'active'
    JOIN public.fantasy_settings settings
      ON settings.league_id = fantasy_season.league_id
      AND settings.market_version >= 11
  LOOP
    SELECT fantasy_round.id
      INTO open_round_id
    FROM public.fantasy_rounds fantasy_round
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    WHERE fantasy_round.fantasy_season_id = target.fantasy_season_id
      AND round_item.round_type = 'official'
      AND round_item.number = 4
      AND fantasy_round.market_status = 'open'
    LIMIT 1;

    -- Não há uma rodada 4 aberta nesta liga: não há nada a calibrar.
    IF open_round_id IS NULL THEN
      CONTINUE;
    END IF;

    -- O registro de auditoria torna a operação idempotente, mesmo se este SQL
    -- for colado novamente no painel do Supabase.
    IF EXISTS (
      SELECT 1
      FROM public.fantasy_audit_log audit
      WHERE audit.league_id = target.league_id
        AND audit.fantasy_round_id = open_round_id
        AND audit.action = 'market_v11_round4_scarcity_calibration'
    ) THEN
      CONTINUE;
    END IF;

    before_health := public.fantasy_market_v11_metrics(target.fantasy_season_id);

    WITH ranked_prices AS (
      SELECT price.player_id,
        price.current_price,
        percent_rank() OVER (ORDER BY price.current_price, price.player_id) AS price_percentile
      FROM public.fantasy_player_prices price
      WHERE price.fantasy_season_id = target.fantasy_season_id
    ), adjusted_prices AS (
      SELECT ranked_prices.player_id,
        ranked_prices.current_price AS price_before,
        CASE
          -- Base econômica: não sobe agora; continua sendo a rota de recuperação.
          WHEN ranked_prices.price_percentile <= .35 THEN 1.00::NUMERIC
          -- Faixa intermediária: aumento leve.
          WHEN ranked_prices.price_percentile <= .60 THEN 1.02::NUMERIC
          -- Faixa competitiva: aumento perceptível, mas gradual.
          WHEN ranked_prices.price_percentile <= .80 THEN 1.06::NUMERIC
          -- Elite: passa a exigir orçamento e escolhas melhores.
          ELSE 1.10::NUMERIC
        END AS scarcity_multiplier
      FROM ranked_prices
    )
    UPDATE public.fantasy_player_prices price
    SET current_price = round(
          LEAST(target.max_player_price, adjusted_prices.price_before * adjusted_prices.scarcity_multiplier)::NUMERIC,
          2
        ),
        updated_at = now()
    FROM adjusted_prices
    WHERE price.fantasy_season_id = target.fantasy_season_id
      AND price.player_id = adjusted_prices.player_id;

    GET DIAGNOSTICS affected_players = ROW_COUNT;

    -- Com os saldos atuais concentrados entre C$ 66 e C$ 70, .86 faria a meta
    -- de elite ficar acima do orçamento real. .97 mira cerca do P80 de saldo.
    UPDATE public.fantasy_settings
    SET market_target_median_elite_ratio = .97,
        updated_at = now()
    WHERE league_id = target.league_id;

    -- A rodada já aberta tem suas configurações congeladas: atualiza somente
    -- este parâmetro de meta, sem trocar o motor nem reescrever histórico.
    UPDATE public.fantasy_rounds fantasy_round
    SET settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::JSONB)
        || jsonb_build_object('market_target_median_elite_ratio', .97)
    WHERE fantasy_round.id = open_round_id;

    after_health := public.fantasy_market_v11_metrics(target.fantasy_season_id);

    INSERT INTO public.fantasy_audit_log (
      league_id,
      fantasy_round_id,
      action,
      payload
    ) VALUES (
      target.league_id,
      open_round_id,
      'market_v11_round4_scarcity_calibration',
      jsonb_build_object(
        'marketVersion', 11,
        'reason', 'round_4_controlled_scarcity',
        'playersAffected', affected_players,
        'tiers', jsonb_build_object(
          'economyP0ToP35', 1.00,
          'intermediateP35ToP60', 1.02,
          'competitiveP60ToP80', 1.06,
          'eliteP80ToP100', 1.10
        ),
        'targetMedianEliteRatioBefore', .86,
        'targetMedianEliteRatioAfter', .97,
        'historicalPricesPreserved', true,
        'historicalBudgetsPreserved', true,
        'lineupsPreserved', true,
        'before', before_health,
        'after', after_health
      )
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
