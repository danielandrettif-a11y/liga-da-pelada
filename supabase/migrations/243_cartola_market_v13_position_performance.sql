-- Mercado V13: desempenho relativo à posição, proteção de rodada boa e
-- reprocessamento integral da temporada preservando as escalações escolhidas.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.apply_fantasy_role_market_v12(uuid)') IS NULL THEN
    ALTER FUNCTION public.apply_fantasy_role_market_v074(UUID)
      RENAME TO apply_fantasy_role_market_v12;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_role_market_v12(UUID)
  FROM PUBLIC,anon,authenticated;

-- O piso de popularidade da V12 podia valorizar quem não entrou em campo e
-- voltar a esconder a relação entre atuação e preço. A V13 usa desempenho.
DROP TRIGGER IF EXISTS fantasy_price_history_demand_floor
  ON public.fantasy_player_price_history;

CREATE OR REPLACE FUNCTION public.apply_fantasy_role_market_v074(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE
  target public.fantasy_rounds%ROWTYPE;
  snapshot JSONB;
  market_version INTEGER;
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
    12
  );
  IF market_version<13 THEN
    RETURN public.apply_fantasy_role_market_v12(p_round_id);
  END IF;

  min_price:=COALESCE((snapshot->>'min_player_price')::NUMERIC,5);
  max_price:=COALESCE((snapshot->>'max_player_price')::NUMERIC,22);

  WITH performance AS (
    SELECT
      history.player_id,
      history.price_before,
      player.player_profile,
      COALESCE(stat.points,0)::NUMERIC base_points,
      COALESCE(stat.games,0)::INTEGER games,
      (
        COALESCE(recent.points_sum,0)+COALESCE(stat.points,0)
      )/GREATEST(1,COALESCE(recent.round_count,0)+1) form_average,
      (
        COALESCE(season.points_sum,0)+COALESCE(stat.points,0)
      )/GREATEST(1,COALESCE(season.round_count,0)+1) season_average
    FROM public.fantasy_player_price_history history
    JOIN public.players player ON player.id=history.player_id
    LEFT JOIN public.player_round_stats stat
      ON stat.round_id=p_round_id AND stat.player_id=history.player_id
    LEFT JOIN LATERAL (
      SELECT sum(sample.round_points)::NUMERIC points_sum,count(*)::INTEGER round_count
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
      SELECT sum(old.round_points)::NUMERIC points_sum,count(*)::INTEGER round_count
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
      (rank() OVER(ORDER BY base_points DESC))::INTEGER global_rank,
      (percent_rank() OVER(PARTITION BY player_profile ORDER BY base_points))::NUMERIC round_quality,
      (percent_rank() OVER(PARTITION BY player_profile ORDER BY form_average))::NUMERIC form_quality,
      (percent_rank() OVER(PARTITION BY player_profile ORDER BY season_average))::NUMERIC season_quality,
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
      GREATEST(-.10,LEAST(.15,(market_quality-.5)*.20+surprise*.06)) raw_variation
    FROM signals
  ), guarded AS (
    SELECT raw_variations.*,
      CASE
        WHEN rq>=.85 THEN GREATEST(raw_variation,.03)
        WHEN base_points>0 AND rq>=.60 THEN GREATEST(raw_variation,0)
        WHEN pq>=.80 AND rq>=.50 THEN GREATEST(raw_variation,0)
        ELSE raw_variation
      END guarded_variation,
      CASE
        WHEN rq>=.85 THEN 'TOP_15'
        WHEN base_points>0 AND rq>=.60 THEN 'GOOD_ROUND'
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
      round(GREATEST(min_price,LEAST(max_price,price_before*(1+variation))),2) next_price
    FROM bounded
  )
  UPDATE public.fantasy_player_price_history history SET
    round_points=value.base_points,
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
      'marketVersion',13,'marketMethod','position-performance-v13',
      'roundQuality',round(value.rq,5),'formQuality',round(value.fq,5),
      'seasonQuality',round(value.sq,5),'marketQuality',round(value.market_quality,5),
      'priceQuality',round(value.pq,5),'surprise',round(value.surprise,5),
      'guardrail',value.guardrail,'rawVariation',round(value.raw_variation,5),
      'appliedVariation',round(value.variation,5)
    )
  FROM applied value
  WHERE history.fantasy_round_id=target.id AND history.player_id=value.player_id;

  UPDATE public.fantasy_player_price_history history SET
    price_after=history.price_before,price_change=0,variation_rate=0,
    market_band='STABLE',round_percentile=NULL,
    metrics=COALESCE(history.metrics,'{}'::JSONB)||jsonb_build_object(
      'marketVersion',13,'marketMethod','position-performance-v13',
      'guardrail','DID_NOT_PLAY'
    )
  WHERE history.fantasy_round_id=target.id AND COALESCE(history.games,0)<=0;

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

  UPDATE public.fantasy_lineup_players item SET
    price_after=COALESCE((SELECT history.price_after
      FROM public.fantasy_player_price_history history
      WHERE history.fantasy_round_id=target.id AND history.player_id=item.player_id),item.price_locked)
  FROM public.fantasy_lineups lineup
  WHERE lineup.id=item.lineup_id AND lineup.fantasy_round_id=target.id;

  WITH raw AS (
    SELECT lineup.id,lineup.cash_remaining+COALESCE(sum(item.price_after),0) budget
    FROM public.fantasy_lineups lineup
    LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id=lineup.id
    WHERE lineup.fantasy_round_id=target.id AND lineup.status='scored'
    GROUP BY lineup.id,lineup.cash_remaining
  )
  UPDATE public.fantasy_lineups lineup SET budget_after=round(raw.budget,2)
  FROM raw WHERE lineup.id=raw.id;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.apply_fantasy_role_market_v074(UUID)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.reprocess_fantasy_market_v13(p_fantasy_season_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE
  target_season public.fantasy_seasons%ROWTYPE;
  loop_item RECORD;
  processed_rounds INTEGER:=0;
  actor_user_id UUID:=auth.uid();
  processing_admin_id UUID;
  previous_jwt_sub TEXT:=current_setting('request.jwt.claim.sub',true);
BEGIN
  SELECT * INTO target_season FROM public.fantasy_seasons
  WHERE id=p_fantasy_season_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Temporada do Cartola não encontrada.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.fantasy_rounds
    WHERE fantasy_season_id=p_fantasy_season_id AND market_status='in_progress'
  ) THEN
    RAISE EXCEPTION 'Não é possível recalcular preços durante uma rodada em andamento.';
  END IF;

  -- A cadeia histórica de fechamento valida is_app_admin() internamente.
  -- Migrations e chamadas service_role não possuem auth.uid(), portanto usamos
  -- um ADM real somente durante esta transação para permitir o reprocessamento.
  IF actor_user_id IS NULL OR NOT public.is_app_admin() THEN
    SELECT profile.user_id INTO processing_admin_id
    FROM public.account_profiles profile
    WHERE profile.role='admin'
    ORDER BY profile.created_at,profile.user_id
    LIMIT 1;
    IF processing_admin_id IS NULL THEN
      RAISE EXCEPTION 'É necessário existir ao menos um administrador para reprocessar o Cartola.';
    END IF;
    PERFORM set_config('request.jwt.claim.sub',processing_admin_id::TEXT,true);
  END IF;

  DELETE FROM public.fantasy_player_price_history
  WHERE fantasy_season_id=p_fantasy_season_id;

  UPDATE public.fantasy_player_prices SET
    current_price=target_season.initial_player_price,
    rounds_played=0,total_points=0,updated_at=now()
  WHERE fantasy_season_id=p_fantasy_season_id;

  UPDATE public.fantasy_lineup_players item SET
    base_points=0,captain_bonus=0,total_points=0,price_after=NULL
  FROM public.fantasy_lineups lineup,public.fantasy_rounds fantasy_round
  WHERE item.lineup_id=lineup.id AND lineup.fantasy_round_id=fantasy_round.id
    AND fantasy_round.fantasy_season_id=p_fantasy_season_id;

  UPDATE public.fantasy_lineup_reserves reserve SET
    base_points=0,price_after=NULL,applied=false,replaced_player_id=NULL,
    replaced_player_points=NULL,points_gain=0,captain_inherited=false,captain_bonus=0,updated_at=now()
  FROM public.fantasy_lineups lineup,public.fantasy_rounds fantasy_round
  WHERE reserve.lineup_id=lineup.id AND lineup.fantasy_round_id=fantasy_round.id
    AND fantasy_round.fantasy_season_id=p_fantasy_season_id;

  UPDATE public.fantasy_lineups lineup SET
    player_points=0,prediction_points=0,total_points=0,budget_after=NULL,round_position=NULL,
    status=CASE WHEN lineup.status IN ('scored','locked') THEN 'locked' ELSE lineup.status END
  FROM public.fantasy_rounds fantasy_round
  WHERE lineup.fantasy_round_id=fantasy_round.id
    AND fantasy_round.fantasy_season_id=p_fantasy_season_id;

  UPDATE public.fantasy_rounds fantasy_round SET
    processed_at=NULL,
    market_status=CASE
      WHEN round_item.status='finished' THEN 'in_progress'
      WHEN EXISTS (SELECT 1 FROM public.matches match_item
        WHERE match_item.round_id=round_item.id AND match_item.started_at IS NOT NULL)
        THEN 'in_progress'
      ELSE 'open'
    END
  FROM public.rounds round_item
  WHERE fantasy_round.round_id=round_item.id
    AND fantasy_round.fantasy_season_id=p_fantasy_season_id;

  FOR loop_item IN
    SELECT round_item.id
    FROM public.fantasy_rounds fantasy_round
    JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
    WHERE fantasy_round.fantasy_season_id=p_fantasy_season_id
      AND round_item.status='finished'
    ORDER BY round_item.date,round_item.number,round_item.created_at
  LOOP
    PERFORM public.process_fantasy_round(loop_item.id);
    processed_rounds:=processed_rounds+1;
  END LOOP;

  FOR loop_item IN
    SELECT DISTINCT ON (fantasy_round.fantasy_season_id,lineup.user_id) lineup.id
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id=fantasy_round.round_id
    WHERE fantasy_round.fantasy_season_id=p_fantasy_season_id AND lineup.status='scored'
    ORDER BY fantasy_round.fantasy_season_id,lineup.user_id,
      round_item.date DESC,round_item.number DESC,lineup.updated_at DESC
  LOOP
    PERFORM public.sync_fantasy_portfolio_from_lineup(loop_item.id);
  END LOOP;

  -- A rodada ainda aberta passa a usar os preços e o patrimônio reconstruídos.
  UPDATE public.fantasy_lineup_players item SET price_locked=price.current_price
  FROM public.fantasy_lineups lineup,public.fantasy_rounds fantasy_round,
    public.fantasy_player_prices price
  WHERE item.lineup_id=lineup.id
    AND lineup.fantasy_round_id=fantasy_round.id
    AND fantasy_round.fantasy_season_id=p_fantasy_season_id
    AND fantasy_round.market_status='open'
    AND price.fantasy_season_id=p_fantasy_season_id
    AND price.player_id=item.player_id;

  UPDATE public.fantasy_lineup_reserves reserve SET
    price_locked=round(price.current_price*.5,2),updated_at=now()
  FROM public.fantasy_lineups lineup,public.fantasy_rounds fantasy_round,
    public.fantasy_player_prices price
  WHERE reserve.lineup_id=lineup.id
    AND lineup.fantasy_round_id=fantasy_round.id
    AND fantasy_round.fantasy_season_id=p_fantasy_season_id
    AND fantasy_round.market_status='open'
    AND price.fantasy_season_id=p_fantasy_season_id
    AND price.player_id=reserve.player_id;

  UPDATE public.fantasy_lineups lineup SET
    budget_before=account.current_budget,
    lineup_cost=COALESCE((SELECT sum(item.price_locked)
      FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0)
      +COALESCE((SELECT reserve.price_locked
        FROM public.fantasy_lineup_reserves reserve WHERE reserve.lineup_id=lineup.id),0),
    cash_remaining=account.current_budget
      -COALESCE((SELECT sum(item.price_locked)
        FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0)
      -COALESCE((SELECT reserve.price_locked
        FROM public.fantasy_lineup_reserves reserve WHERE reserve.lineup_id=lineup.id),0),
    status=CASE WHEN
      COALESCE((SELECT sum(item.price_locked)
        FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0)
      +COALESCE((SELECT reserve.price_locked
        FROM public.fantasy_lineup_reserves reserve WHERE reserve.lineup_id=lineup.id),0)
      > account.current_budget THEN 'needs_review' ELSE 'draft' END,
    updated_at=now()
  FROM public.fantasy_rounds fantasy_round,public.fantasy_accounts account
  WHERE lineup.fantasy_round_id=fantasy_round.id
    AND fantasy_round.fantasy_season_id=p_fantasy_season_id
    AND fantasy_round.market_status='open'
    AND account.fantasy_season_id=p_fantasy_season_id
    AND account.user_id=lineup.user_id;

  PERFORM set_config('request.jwt.claim.sub',COALESCE(previous_jwt_sub,''),true);

  INSERT INTO public.fantasy_audit_log(league_id,user_id,action,payload)
  VALUES(target_season.league_id,actor_user_id,'market_v13_full_reprocess',jsonb_build_object(
    'fantasySeasonId',p_fantasy_season_id,'processedRounds',processed_rounds,
    'lineupsPreserved',true,'pointsRebuiltFromSnapshots',true
  ));

  RETURN jsonb_build_object('success',true,'processedRounds',processed_rounds);
END $$;

REVOKE ALL ON FUNCTION public.reprocess_fantasy_market_v13(UUID)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reprocess_fantasy_market_v13(UUID) TO service_role;

UPDATE public.fantasy_settings
SET market_version=13,updated_at=now();

UPDATE public.fantasy_rounds fantasy_round SET
  settings_snapshot=COALESCE(fantasy_round.settings_snapshot,'{}'::JSONB)||jsonb_build_object(
    'marketVersion',13,'market_version',13,
    'market_round_weight',.60,
    'market_form_weight',.25,
    'market_season_weight',.15,
    'market_good_round_percentile',.60,
    'market_top_round_percentile',.85,
    'market_good_round_floor',0,
    'market_top_round_floor',.03,
    'market_max_increase',.12,
    'market_breakout_max_increase',.15,
    'market_max_decrease',.10
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
    PERFORM public.reprocess_fantasy_market_v13(season_item.id);
  END LOOP;
END $$;

NOTIFY pgrst,'reload schema';

COMMIT;
