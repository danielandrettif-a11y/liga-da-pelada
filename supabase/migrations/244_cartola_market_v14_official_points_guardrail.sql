-- Mercado V14: usa a mesma pontuação oficial exibida pelo Cartola e protege
-- atuações positivas a partir da mediana da posição contra desvalorização.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.apply_fantasy_role_market_v13(uuid)') IS NULL THEN
    ALTER FUNCTION public.apply_fantasy_role_market_v074(UUID)
      RENAME TO apply_fantasy_role_market_v13;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_role_market_v13(UUID)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_fantasy_role_market_v074(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE
  target public.fantasy_rounds%ROWTYPE;
  snapshot JSONB;
  market_version INTEGER;
  scoring_version INTEGER;
  min_price NUMERIC;
  max_price NUMERIC;
BEGIN
  SELECT * INTO target
  FROM public.fantasy_rounds
  WHERE round_id=p_round_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN true; END IF;

  snapshot:=COALESCE(target.settings_snapshot,'{}'::JSONB);
  market_version:=COALESCE(
    (snapshot->>'marketVersion')::INTEGER,
    (snapshot->>'market_version')::INTEGER,
    13
  );
  IF market_version<14 THEN
    RETURN public.apply_fantasy_role_market_v13(p_round_id);
  END IF;

  scoring_version:=COALESCE(
    target.scoring_version,
    (snapshot->>'scoring_version')::INTEGER,
    5
  );
  min_price:=COALESCE((snapshot->>'min_player_price')::NUMERIC,5);
  max_price:=COALESCE((snapshot->>'max_player_price')::NUMERIC,22);

  WITH performance AS (
    SELECT
      history.player_id,
      history.price_before,
      player.player_profile,
      CASE
        WHEN scoring_version>=14
          THEN COALESCE(stat.ranking_points,stat.points,0)::NUMERIC
        ELSE COALESCE(stat.points,0)::NUMERIC
      END official_points,
      COALESCE(stat.games,0)::INTEGER games,
      (
        COALESCE(recent.points_sum,0)
        +CASE WHEN scoring_version>=14
          THEN COALESCE(stat.ranking_points,stat.points,0)
          ELSE COALESCE(stat.points,0)
        END
      )/GREATEST(1,COALESCE(recent.round_count,0)+1) form_average,
      (
        COALESCE(season.points_sum,0)
        +CASE WHEN scoring_version>=14
          THEN COALESCE(stat.ranking_points,stat.points,0)
          ELSE COALESCE(stat.points,0)
        END
      )/GREATEST(1,COALESCE(season.round_count,0)+1) season_average
    FROM public.fantasy_player_price_history history
    JOIN public.players player ON player.id=history.player_id
    LEFT JOIN public.player_round_stats stat
      ON stat.round_id=p_round_id AND stat.player_id=history.player_id
    LEFT JOIN LATERAL (
      SELECT sum(sample.round_points)::NUMERIC points_sum,
        count(*)::INTEGER round_count
      FROM (
        SELECT old.round_points
        FROM public.fantasy_player_price_history old
        JOIN public.fantasy_rounds old_fr ON old_fr.id=old.fantasy_round_id
        JOIN public.rounds old_round ON old_round.id=old_fr.round_id
        JOIN public.rounds current_round ON current_round.id=target.round_id
        WHERE old.fantasy_season_id=target.fantasy_season_id
          AND old.player_id=history.player_id
          AND old.games>0
          AND (old_round.date,old_round.number)<(current_round.date,current_round.number)
        ORDER BY old_round.date DESC,old_round.number DESC
        LIMIT 2
      ) sample
    ) recent ON true
    LEFT JOIN LATERAL (
      SELECT sum(old.round_points)::NUMERIC points_sum,
        count(*)::INTEGER round_count
      FROM public.fantasy_player_price_history old
      JOIN public.fantasy_rounds old_fr ON old_fr.id=old.fantasy_round_id
      JOIN public.rounds old_round ON old_round.id=old_fr.round_id
      JOIN public.rounds current_round ON current_round.id=target.round_id
      WHERE old.fantasy_season_id=target.fantasy_season_id
        AND old.player_id=history.player_id
        AND old.games>0
        AND (old_round.date,old_round.number)<(current_round.date,current_round.number)
    ) season ON true
    WHERE history.fantasy_round_id=target.id
  ), ranked AS (
    SELECT performance.*,
      (rank() OVER(ORDER BY official_points DESC))::INTEGER global_rank,
      (percent_rank() OVER(
        PARTITION BY player_profile ORDER BY official_points
      ))::NUMERIC round_quality,
      (percent_rank() OVER(
        PARTITION BY player_profile ORDER BY form_average
      ))::NUMERIC form_quality,
      (percent_rank() OVER(
        PARTITION BY player_profile ORDER BY season_average
      ))::NUMERIC season_quality,
      (percent_rank() OVER(ORDER BY price_before))::NUMERIC price_quality,
      count(*) OVER(PARTITION BY player_profile) role_count,
      count(*) OVER() player_count
    FROM performance
    WHERE games>0
  ), qualities AS (
    SELECT ranked.*,
      CASE WHEN role_count<=1 THEN .5 ELSE round_quality END rq,
      CASE WHEN role_count<=1 THEN .5 ELSE form_quality END fq,
      CASE WHEN role_count<=1 THEN .5 ELSE season_quality END sq,
      CASE WHEN player_count<=1 THEN .5 ELSE price_quality END pq
    FROM ranked
  ), signals AS (
    SELECT qualities.*,
      .60*rq+.25*fq+.15*sq market_quality,
      rq-pq surprise
    FROM qualities
  ), raw_variations AS (
    SELECT signals.*,
      GREATEST(-.10,LEAST(.15,
        (market_quality-.5)*.20+surprise*.06
      )) raw_variation
    FROM signals
  ), guarded AS (
    SELECT raw_variations.*,
      CASE
        WHEN rq>=.85 THEN GREATEST(raw_variation,.03)
        WHEN official_points>0 AND rq>=.50 THEN GREATEST(raw_variation,0)
        WHEN pq>=.80 AND rq>=.50 THEN GREATEST(raw_variation,0)
        ELSE raw_variation
      END guarded_variation,
      CASE
        WHEN rq>=.85 THEN 'TOP_15'
        WHEN official_points>0 AND rq>=.50 THEN 'POSITIVE_ABOVE_MEDIAN'
        WHEN pq>=.80 AND rq>=.50 THEN 'EXPENSIVE_OK'
        ELSE 'NONE'
      END guardrail
    FROM raw_variations
  ), bounded AS (
    SELECT guarded.*,
      GREATEST(-.10,LEAST(
        CASE WHEN pq<=.35 AND rq>=.85 THEN .15 ELSE .12 END,
        guarded_variation
      )) variation
    FROM guarded
  ), applied AS (
    SELECT bounded.*,
      round(GREATEST(min_price,LEAST(
        max_price,price_before*(1+variation)
      )),2) next_price
    FROM bounded
  )
  UPDATE public.fantasy_player_price_history history SET
    round_points=value.official_points,
    price_after=value.next_price,
    price_change=value.next_price-value.price_before,
    variation_rate=(value.next_price-value.price_before)/NULLIF(value.price_before,0),
    market_band=CASE
      WHEN (value.next_price-value.price_before)/NULLIF(value.price_before,0)>.015 THEN 'UP'
      WHEN (value.next_price-value.price_before)/NULLIF(value.price_before,0)<-.015 THEN 'DOWN'
      ELSE 'STABLE'
    END,
    round_rank=value.global_rank,
    round_percentile=1-value.rq,
    metrics=COALESCE(history.metrics,'{}'::JSONB)||jsonb_build_object(
      'marketVersion',14,'marketMethod','official-points-position-v14',
      'officialPoints',round(value.official_points,2),
      'scoringVersion',scoring_version,
      'roundQuality',round(value.rq,5),'formQuality',round(value.fq,5),
      'seasonQuality',round(value.sq,5),'marketQuality',round(value.market_quality,5),
      'priceQuality',round(value.pq,5),'surprise',round(value.surprise,5),
      'guardrail',value.guardrail,'rawVariation',round(value.raw_variation,5),
      'appliedVariation',round(value.variation,5)
    )
  FROM applied value
  WHERE history.fantasy_round_id=target.id
    AND history.player_id=value.player_id;

  UPDATE public.fantasy_player_prices price SET
    current_price=history.price_after,
    rounds_played=(SELECT count(*) FROM public.fantasy_player_price_history item
      WHERE item.fantasy_season_id=price.fantasy_season_id
        AND item.player_id=price.player_id AND item.games>0),
    total_points=COALESCE((SELECT sum(item.round_points)
      FROM public.fantasy_player_price_history item
      WHERE item.fantasy_season_id=price.fantasy_season_id
        AND item.player_id=price.player_id),0),
    updated_at=now()
  FROM public.fantasy_player_price_history history
  WHERE history.fantasy_round_id=target.id
    AND history.player_id=price.player_id
    AND price.fantasy_season_id=target.fantasy_season_id;

  UPDATE public.fantasy_lineup_players lineup_player SET
    price_after=COALESCE((SELECT history.price_after
      FROM public.fantasy_player_price_history history
      WHERE history.fantasy_round_id=target.id
        AND history.player_id=lineup_player.player_id),lineup_player.price_locked)
  FROM public.fantasy_lineups lineup
  WHERE lineup.id=lineup_player.lineup_id
    AND lineup.fantasy_round_id=target.id;

  WITH raw AS (
    SELECT lineup.id,
      lineup.cash_remaining+COALESCE(sum(lineup_player.price_after),0) budget
    FROM public.fantasy_lineups lineup
    LEFT JOIN public.fantasy_lineup_players lineup_player
      ON lineup_player.lineup_id=lineup.id
    WHERE lineup.fantasy_round_id=target.id AND lineup.status='scored'
    GROUP BY lineup.id,lineup.cash_remaining
  )
  UPDATE public.fantasy_lineups lineup SET budget_after=round(raw.budget,2)
  FROM raw WHERE lineup.id=raw.id;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_role_market_v074(UUID)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.reprocess_fantasy_market_v14(p_fantasy_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE result JSONB;
BEGIN
  result:=public.reprocess_fantasy_market_v13(p_fantasy_season_id);
  RETURN result||jsonb_build_object('marketVersion',14);
END $$;

REVOKE ALL ON FUNCTION public.reprocess_fantasy_market_v14(UUID)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reprocess_fantasy_market_v14(UUID)
  TO service_role;

UPDATE public.fantasy_settings
SET market_version=14,updated_at=now();

UPDATE public.fantasy_rounds fantasy_round SET
  settings_snapshot=COALESCE(fantasy_round.settings_snapshot,'{}'::JSONB)
    ||jsonb_build_object(
      'marketVersion',14,'market_version',14,
      'market_round_weight',.60,'market_form_weight',.25,
      'market_season_weight',.15,'market_good_round_percentile',.50,
      'market_top_round_percentile',.85,'market_good_round_floor',0,
      'market_top_round_floor',.03,'market_max_increase',.12,
      'market_breakout_max_increase',.15,'market_max_decrease',.10
    )
FROM public.fantasy_seasons fantasy_season
JOIN public.seasons season ON season.id=fantasy_season.season_id
WHERE fantasy_season.id=fantasy_round.fantasy_season_id
  AND season.status='active';

DO $$
DECLARE season_item RECORD;
BEGIN
  FOR season_item IN
    SELECT fantasy_season.id
    FROM public.fantasy_seasons fantasy_season
    JOIN public.seasons season ON season.id=fantasy_season.season_id
    WHERE season.status='active'
  LOOP
    PERFORM public.reprocess_fantasy_market_v14(season_item.id);
  END LOOP;
END $$;

NOTIFY pgrst,'reload schema';

COMMIT;
