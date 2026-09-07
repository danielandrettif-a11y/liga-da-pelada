-- Mercado V11, etapa 2: ativação gradual.
-- Aplicar somente depois de revisar preview_fantasy_market_v11() no painel ADM.

BEGIN;

DO $$
DECLARE invalid_season RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fantasy_rounds WHERE market_status = 'in_progress') THEN
    RAISE EXCEPTION 'Mercado V11 não pode ser ativado com uma rodada em andamento.';
  END IF;

  SELECT fantasy_season.id, count(fantasy_round.id) finished_rounds INTO invalid_season
  FROM public.fantasy_seasons fantasy_season
  JOIN public.seasons season ON season.id = fantasy_season.season_id AND season.status = 'active'
  LEFT JOIN public.fantasy_rounds fantasy_round ON fantasy_round.fantasy_season_id = fantasy_season.id
  LEFT JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    AND round_item.round_type = 'official' AND round_item.status = 'finished'
  GROUP BY fantasy_season.id HAVING count(round_item.id) < 3 LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'Mercado V11 exige três rodadas oficiais encerradas.'; END IF;
END;
$$;

UPDATE public.fantasy_settings SET
  market_version = 11,
  min_player_price = 5,
  max_player_price = 22,
  competitive_price_floor = 5.75,
  competitive_price_ceiling = 18,
  competitive_price_curve = 1.85,
  market_round_weight = .70,
  market_reprice_strength = .30,
  market_difficulty_min = .94,
  market_difficulty_max = 1.18,
  market_difficulty_step = .03,
  market_target_elite_affordability = .20,
  market_target_median_elite_ratio = .86,
  market_recovery_bonus_strength = 2.40,
  market_expensive_risk_strength = 1.20,
  market_breakout_reprice_strength = .40,
  market_cheap_percentile = .35,
  market_elite_percentile = .80,
  market_breakout_round_percentile = .70,
  market_bad_round_percentile = .35,
  updated_at = now();

-- Calibração única do mercado corrente. Não altera history, lineup ou account.
DO $$
DECLARE
  target RECORD;
  health JSONB;
  calibration_round_id UUID;
  difficulty NUMERIC;
BEGIN
  FOR target IN
    SELECT fantasy_season.id fantasy_season_id, fantasy_season.league_id, league.players_per_team,
      settings.*
    FROM public.fantasy_seasons fantasy_season
    JOIN public.seasons season ON season.id = fantasy_season.season_id AND season.status = 'active'
    JOIN public.leagues league ON league.id = fantasy_season.league_id
    JOIN public.fantasy_settings settings ON settings.league_id = fantasy_season.league_id
  LOOP
    SELECT fantasy_round.id INTO calibration_round_id
    FROM public.fantasy_rounds fantasy_round JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    WHERE fantasy_round.fantasy_season_id = target.fantasy_season_id
      AND round_item.round_type = 'official' AND round_item.status = 'finished'
    ORDER BY round_item.date DESC, round_item.number DESC LIMIT 1;

    IF EXISTS (
      SELECT 1 FROM public.fantasy_market_difficulty_snapshots snapshot
      WHERE snapshot.fantasy_season_id = target.fantasy_season_id AND snapshot.stage = 'calibration'
        AND snapshot.calibration_applied_at IS NOT NULL
    ) THEN CONTINUE; END IF;

    health := public.fantasy_market_v11_metrics(target.fantasy_season_id);
    difficulty := (health->>'nextMultiplier')::NUMERIC;

    INSERT INTO public.fantasy_market_difficulty_snapshots (
      league_id, fantasy_season_id, fantasy_round_id, stage, players_per_team,
      budget_p25, budget_p50, budget_p75, budget_p90,
      economy_lineup_cost, competitive_lineup_cost, elite_lineup_cost,
      economy_affordability_rate, competitive_affordability_rate, elite_affordability_rate,
      median_elite_ratio, price_p10, price_p50, price_p90, pressure,
      previous_multiplier, next_multiplier, metrics, calibration_applied_at
    ) VALUES (
      target.league_id, target.fantasy_season_id, calibration_round_id, 'calibration', target.players_per_team,
      (health->>'budgetP25')::NUMERIC, (health->>'budgetP50')::NUMERIC, (health->>'budgetP75')::NUMERIC, (health->>'budgetP90')::NUMERIC,
      (health->>'economyLineupCost')::NUMERIC, (health->>'competitiveLineupCost')::NUMERIC, (health->>'eliteLineupCost')::NUMERIC,
      (health->>'economyAffordabilityRate')::NUMERIC, (health->>'competitiveAffordabilityRate')::NUMERIC, (health->>'eliteAffordabilityRate')::NUMERIC,
      (health->>'medianEliteRatio')::NUMERIC, (health->>'priceP10')::NUMERIC, (health->>'priceP50')::NUMERIC, (health->>'priceP90')::NUMERIC,
      (health->>'pressure')::NUMERIC, (health->>'previousMultiplier')::NUMERIC, difficulty,
      health || jsonb_build_object('transition', jsonb_build_object('eliteCap',.08,'middleCap',.04,'cheapCap',.03)), now()
    ) ON CONFLICT (fantasy_season_id, fantasy_round_id, stage) DO NOTHING;

    WITH current_market AS (
      SELECT price.player_id, price.current_price,
        percent_rank() OVER (ORDER BY price.current_price) price_quality
      FROM public.fantasy_player_prices price WHERE price.fantasy_season_id = target.fantasy_season_id
    ), latest_quality AS (
      SELECT DISTINCT ON (history.player_id) history.player_id,
        COALESCE((history.metrics->>'marketQuality')::NUMERIC, .5) market_quality,
        COALESCE((history.metrics->>'roundMarketQuality')::NUMERIC, .5) round_quality
      FROM public.fantasy_player_price_history history
      JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = history.fantasy_round_id
      JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
      WHERE history.fantasy_season_id = target.fantasy_season_id
      ORDER BY history.player_id, round_item.date DESC, round_item.number DESC
    ), proposed AS (
      SELECT market.*,
        COALESCE(quality.market_quality,.5) market_quality, COALESCE(quality.round_quality,.5) round_quality,
        5.75 + 12.25 * power(COALESCE(quality.market_quality,.5)::DOUBLE PRECISION,1.85)::NUMERIC base_target
      FROM current_market market LEFT JOIN latest_quality quality ON quality.player_id = market.player_id
    ), targets AS (
      SELECT proposed.*,
        LEAST(22, GREATEST(5,
          base_target * (1 + (difficulty - 1) * power(market_quality::DOUBLE PRECISION,2.20)::NUMERIC)
          + 2.40 * GREATEST(0, round_quality-price_quality) * power((1-price_quality)::DOUBLE PRECISION,1.30)::NUMERIC
          - 1.20 * GREATEST(0, price_quality-round_quality) * price_quality
        )) final_target,
        CASE WHEN price_quality <= .35 THEN .03 WHEN price_quality >= .80 THEN .08 ELSE .04 END transition_cap
      FROM proposed
    ), bounded AS (
      -- percent_rank() retorna double precision; round(valor, casas) exige NUMERIC.
      SELECT targets.*, round((LEAST(current_price*(1+transition_cap), GREATEST(current_price*(1-transition_cap),
        current_price + (final_target-current_price) * CASE WHEN price_quality <= .35 AND round_quality >= .70 THEN .40 ELSE .30 END)))::NUMERIC,2) next_price
      FROM targets
    )
    UPDATE public.fantasy_player_prices price SET current_price = bounded.next_price, updated_at = now()
    FROM bounded WHERE price.fantasy_season_id = target.fantasy_season_id AND price.player_id = bounded.player_id;

    UPDATE public.fantasy_settings SET market_difficulty_multiplier = difficulty, updated_at = now()
    WHERE league_id = target.league_id;

    INSERT INTO public.fantasy_audit_log (league_id, fantasy_round_id, action, payload)
    VALUES (target.league_id, calibration_round_id, 'market_v11_adaptive_calibration', health || jsonb_build_object(
      'historicalPricesPreserved', true, 'historicalBudgetsPreserved', true, 'globalPrices', true));
  END LOOP;
END;
$$;

-- Preserva o motor anterior para reprocessamentos de snapshots V10.
ALTER FUNCTION public.apply_fantasy_role_market_v074(UUID)
  RENAME TO apply_fantasy_role_market_v10;

-- O nome histórico é preservado porque process_fantasy_round chama esta função.
CREATE OR REPLACE FUNCTION public.apply_fantasy_role_market_v074(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.fantasy_rounds%ROWTYPE;
  snapshot JSONB;
  health JSONB;
  difficulty NUMERIC;
  round_weight NUMERIC;
  price_floor NUMERIC; price_ceiling NUMERIC; price_curve NUMERIC;
  min_price NUMERIC; max_price NUMERIC; normal_strength NUMERIC; breakout_strength NUMERIC;
  recovery_strength NUMERIC; risk_strength NUMERIC; cheap_percentile NUMERIC;
  elite_percentile NUMERIC; breakout_round_percentile NUMERIC; bad_round_percentile NUMERIC;
BEGIN
  SELECT * INTO target FROM public.fantasy_rounds WHERE round_id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN true; END IF;
  snapshot := COALESCE(target.settings_snapshot, '{}'::JSONB);

  -- Snapshots antigos continuam produzindo exatamente o motor V10.
  IF COALESCE((snapshot->>'marketVersion')::INTEGER, (snapshot->>'market_version')::INTEGER, 10) < 11 THEN
    RETURN public.apply_fantasy_role_market_v10(p_round_id);
  END IF;

  round_weight := COALESCE((snapshot->>'market_round_weight')::NUMERIC,.70);
  price_floor := COALESCE((snapshot->>'competitive_price_floor')::NUMERIC,5.75);
  price_ceiling := COALESCE((snapshot->>'competitive_price_ceiling')::NUMERIC,18);
  price_curve := COALESCE((snapshot->>'competitive_price_curve')::NUMERIC,1.85);
  min_price := COALESCE((snapshot->>'min_player_price')::NUMERIC,5);
  max_price := COALESCE((snapshot->>'max_player_price')::NUMERIC,22);
  normal_strength := COALESCE((snapshot->>'market_reprice_strength')::NUMERIC,.30);
  breakout_strength := COALESCE((snapshot->>'market_breakout_reprice_strength')::NUMERIC,.40);
  recovery_strength := COALESCE((snapshot->>'market_recovery_bonus_strength')::NUMERIC,2.40);
  risk_strength := COALESCE((snapshot->>'market_expensive_risk_strength')::NUMERIC,1.20);
  cheap_percentile := COALESCE((snapshot->>'market_cheap_percentile')::NUMERIC,.35);
  elite_percentile := COALESCE((snapshot->>'market_elite_percentile')::NUMERIC,.80);
  breakout_round_percentile := COALESCE((snapshot->>'market_breakout_round_percentile')::NUMERIC,.70);
  bad_round_percentile := COALESCE((snapshot->>'market_bad_round_percentile')::NUMERIC,.35);
  health := public.fantasy_market_v11_metrics(target.fantasy_season_id);
  difficulty := (health->>'nextMultiplier')::NUMERIC;

  INSERT INTO public.fantasy_market_difficulty_snapshots (
    league_id, fantasy_season_id, fantasy_round_id, stage, players_per_team,
    budget_p25,budget_p50,budget_p75,budget_p90,economy_lineup_cost,competitive_lineup_cost,elite_lineup_cost,
    economy_affordability_rate,competitive_affordability_rate,elite_affordability_rate,median_elite_ratio,
    price_p10,price_p50,price_p90,pressure,previous_multiplier,next_multiplier,metrics
  ) SELECT season.league_id,target.fantasy_season_id,target.id,'close',(health->>'playersPerTeam')::INTEGER,
    (health->>'budgetP25')::NUMERIC,(health->>'budgetP50')::NUMERIC,(health->>'budgetP75')::NUMERIC,(health->>'budgetP90')::NUMERIC,
    (health->>'economyLineupCost')::NUMERIC,(health->>'competitiveLineupCost')::NUMERIC,(health->>'eliteLineupCost')::NUMERIC,
    (health->>'economyAffordabilityRate')::NUMERIC,(health->>'competitiveAffordabilityRate')::NUMERIC,(health->>'eliteAffordabilityRate')::NUMERIC,
    (health->>'medianEliteRatio')::NUMERIC,(health->>'priceP10')::NUMERIC,(health->>'priceP50')::NUMERIC,(health->>'priceP90')::NUMERIC,
    (health->>'pressure')::NUMERIC,(health->>'previousMultiplier')::NUMERIC,difficulty,health
  FROM public.fantasy_seasons season WHERE season.id = target.fantasy_season_id
  ON CONFLICT (fantasy_season_id,fantasy_round_id,stage) DO UPDATE SET
    pressure=EXCLUDED.pressure,previous_multiplier=EXCLUDED.previous_multiplier,next_multiplier=EXCLUDED.next_multiplier,
    metrics=EXCLUDED.metrics,updated_at=now();

  WITH performance AS (
    SELECT history.player_id,history.price_before,player.player_profile,COALESCE(stat.points,0)::NUMERIC base_points,
      (COALESCE(previous.points_sum,0)+COALESCE(stat.points,0))/GREATEST(1,COALESCE(previous.round_count,0)+1) season_average
    FROM public.fantasy_player_price_history history
    JOIN public.player_round_stats stat ON stat.round_id=p_round_id AND stat.player_id=history.player_id
    JOIN public.players player ON player.id=history.player_id
    LEFT JOIN LATERAL (
      SELECT sum(old.round_points)::NUMERIC points_sum,count(*)::INTEGER round_count
      FROM public.fantasy_player_price_history old
      JOIN public.fantasy_rounds old_fr ON old_fr.id=old.fantasy_round_id
      JOIN public.rounds old_round ON old_round.id=old_fr.round_id
      JOIN public.rounds current_round ON current_round.id=target.round_id
      WHERE old.fantasy_season_id=target.fantasy_season_id AND old.player_id=history.player_id AND old.games>0
        AND (old_round.date,old_round.number)<(current_round.date,current_round.number)
    ) previous ON true
    WHERE history.fantasy_round_id=target.id AND stat.games>0
  ), ranked AS (
    SELECT performance.*,
      rank() OVER(ORDER BY base_points DESC) rr,count(*) OVER(PARTITION BY base_points) rt,
      rank() OVER(PARTITION BY player_profile ORDER BY base_points DESC) rpr,count(*) OVER(PARTITION BY player_profile,base_points) rpt,
      rank() OVER(ORDER BY season_average DESC) sr,count(*) OVER(PARTITION BY season_average) st,
      rank() OVER(PARTITION BY player_profile ORDER BY season_average DESC) spr,count(*) OVER(PARTITION BY player_profile,season_average) spt,
      rank() OVER(ORDER BY price_before) pr,count(*) OVER(PARTITION BY price_before) pt,
      count(*) OVER() oc,count(*) OVER(PARTITION BY player_profile) rc
    FROM performance
  ), qualities AS (
    SELECT ranked.*,
      CASE WHEN oc<=1 THEN .5 ELSE 1-(((rr-1)+(rr+rt-2))::NUMERIC/2)/(oc-1) END roq,
      CASE WHEN rc<=1 THEN .5 ELSE 1-(((rpr-1)+(rpr+rpt-2))::NUMERIC/2)/(rc-1) END rpq,
      CASE WHEN oc<=1 THEN .5 ELSE 1-(((sr-1)+(sr+st-2))::NUMERIC/2)/(oc-1) END soq,
      CASE WHEN rc<=1 THEN .5 ELSE 1-(((spr-1)+(spr+spt-2))::NUMERIC/2)/(rc-1) END spq,
      CASE WHEN oc<=1 THEN .5 ELSE (((pr-1)+(pr+pt-2))::NUMERIC/2)/(oc-1) END price_quality
    FROM ranked
  ), mixed AS (
    SELECT qualities.*,
      CASE WHEN player_profile IN('defensive','midfield','offensive') AND rc>=3 THEN .65*rpq+.35*roq ELSE roq END round_quality,
      CASE WHEN player_profile IN('defensive','midfield','offensive') AND rc>=3 THEN .65*spq+.35*soq ELSE soq END season_quality
    FROM qualities
  ), combined AS (
    SELECT mixed.*,round_weight*round_quality+(1-round_weight)*season_quality market_quality FROM mixed
  ), targets AS (
    SELECT combined.*,
      price_floor+(price_ceiling-price_floor)*power(market_quality::DOUBLE PRECISION,price_curve::DOUBLE PRECISION)::NUMERIC base_target,
      CASE WHEN price_quality<=cheap_percentile AND round_quality>=breakout_round_percentile THEN 'CHEAP_BREAKOUT'
        WHEN price_quality>=elite_percentile AND round_quality<=bad_round_percentile THEN 'EXPENSIVE_BAD'
        WHEN price_quality>=elite_percentile THEN 'EXPENSIVE' ELSE 'INTERMEDIATE' END price_profile
    FROM combined
  ), adjusted AS (
    SELECT targets.*,
      LEAST(max_price,GREATEST(min_price,
        base_target*(1+(difficulty-1)*power(market_quality::DOUBLE PRECISION,2.20)::NUMERIC)
        +recovery_strength*GREATEST(0,round_quality-price_quality)*power((1-price_quality)::DOUBLE PRECISION,1.30)::NUMERIC
        -risk_strength*GREATEST(0,price_quality-round_quality)*price_quality)) final_target,
      CASE WHEN price_profile='CHEAP_BREAKOUT' THEN breakout_strength ELSE normal_strength END strength,
      CASE price_profile WHEN 'CHEAP_BREAKOUT' THEN .18 WHEN 'INTERMEDIATE' THEN .15 WHEN 'EXPENSIVE' THEN .10 ELSE .08 END up_cap,
      CASE price_profile WHEN 'CHEAP_BREAKOUT' THEN .08 WHEN 'INTERMEDIATE' THEN .12 WHEN 'EXPENSIVE' THEN .12 ELSE .14 END down_cap
    FROM targets
  ), bounded AS (
    SELECT adjusted.*,round(LEAST(max_price,price_before*(1+up_cap),GREATEST(min_price,price_before*(1-down_cap),price_before+(final_target-price_before)*strength)),2) next_price
    FROM adjusted
  ), applied AS (
    SELECT bounded.*,(next_price-price_before)/NULLIF(price_before,0) variation,
      CASE WHEN (next_price-price_before)/NULLIF(price_before,0)>.015 THEN 'UP'
        WHEN (next_price-price_before)/NULLIF(price_before,0)<-.015 THEN 'DOWN' ELSE 'STABLE' END band
    FROM bounded
  )
  UPDATE public.fantasy_player_price_history history SET
    round_points=value.base_points,variation_rate=value.variation,price_after=value.next_price,
    price_change=value.next_price-value.price_before,market_band=value.band,round_rank=value.rr,round_percentile=1-value.market_quality,
    metrics=COALESCE(history.metrics,'{}'::JSONB)||jsonb_build_object(
      'scoringVersion',5,'marketVersion',11,'marketMethod','adaptive-global-v11','difficultyMultiplier',difficulty,
      'marketPressure',(health->>'pressure')::NUMERIC,'roundMarketQuality',round(value.round_quality,5),
      'seasonMarketQuality',round(value.season_quality,5),'marketQuality',round(value.market_quality,5),
      'priceQuality',round(value.price_quality,5),'baseTarget',round(value.base_target,2),'finalTarget',round(value.final_target,2),
      'priceProfile',value.price_profile,'repriceStrength',value.strength,'upCap',value.up_cap,'downCap',value.down_cap)
  FROM applied value WHERE history.fantasy_round_id=target.id AND history.player_id=value.player_id;

  UPDATE public.fantasy_player_prices price SET current_price=history.price_after,
    rounds_played=(SELECT count(*) FROM public.fantasy_player_price_history item WHERE item.fantasy_season_id=price.fantasy_season_id AND item.player_id=price.player_id AND item.games>0),
    total_points=COALESCE((SELECT sum(item.round_points) FROM public.fantasy_player_price_history item WHERE item.fantasy_season_id=price.fantasy_season_id AND item.player_id=price.player_id),0),updated_at=now()
  FROM public.fantasy_player_price_history history WHERE history.fantasy_round_id=target.id AND history.player_id=price.player_id AND price.fantasy_season_id=target.fantasy_season_id;

  UPDATE public.fantasy_lineup_players item SET price_after=COALESCE((SELECT history.price_after FROM public.fantasy_player_price_history history WHERE history.fantasy_round_id=target.id AND history.player_id=item.player_id),item.price_locked)
  FROM public.fantasy_lineups lineup WHERE lineup.id=item.lineup_id AND lineup.fantasy_round_id=target.id;
  WITH raw AS (SELECT lineup.id,lineup.cash_remaining+COALESCE(sum(item.price_after),0) budget FROM public.fantasy_lineups lineup LEFT JOIN public.fantasy_lineup_players item ON item.lineup_id=lineup.id WHERE lineup.fantasy_round_id=target.id AND lineup.status='scored' GROUP BY lineup.id,lineup.cash_remaining)
  UPDATE public.fantasy_lineups lineup SET budget_after=round(raw.budget,2) FROM raw WHERE lineup.id=raw.id;
  UPDATE public.fantasy_accounts account SET current_budget=latest.budget_after,total_points=totals.total_points,rounds_played=totals.rounds_played,best_round_points=totals.best_round,updated_at=now()
  FROM (SELECT DISTINCT ON(lineup.user_id) lineup.user_id,lineup.budget_after FROM public.fantasy_lineups lineup JOIN public.fantasy_rounds fr ON fr.id=lineup.fantasy_round_id JOIN public.rounds r ON r.id=fr.round_id WHERE fr.fantasy_season_id=target.fantasy_season_id AND lineup.status='scored' AND lineup.budget_after IS NOT NULL ORDER BY lineup.user_id,r.date DESC,r.number DESC) latest
  JOIN (SELECT lineup.user_id,sum(lineup.total_points) total_points,count(*)::INTEGER rounds_played,max(lineup.total_points) best_round FROM public.fantasy_lineups lineup JOIN public.fantasy_rounds fr ON fr.id=lineup.fantasy_round_id WHERE fr.fantasy_season_id=target.fantasy_season_id AND lineup.status='scored' GROUP BY lineup.user_id) totals ON totals.user_id=latest.user_id
  WHERE account.fantasy_season_id=target.fantasy_season_id AND account.user_id=latest.user_id;
  UPDATE public.fantasy_settings settings SET market_difficulty_multiplier=difficulty,updated_at=now()
  FROM public.fantasy_seasons season WHERE season.id=target.fantasy_season_id AND settings.league_id=season.league_id;
  RETURN true;
END;
$$;

-- Somente mercados abertos/futuros recebem a nova regra congelada.
UPDATE public.fantasy_rounds fantasy_round SET settings_snapshot=COALESCE(fantasy_round.settings_snapshot,'{}'::JSONB)||jsonb_build_object(
  'marketVersion',11,'min_player_price',5,'max_player_price',22,'competitive_price_floor',5.75,
  'competitive_price_ceiling',18,'competitive_price_curve',1.85,'market_round_weight',.70,'market_reprice_strength',.30,
  'market_difficulty_multiplier',settings.market_difficulty_multiplier,'market_difficulty_min',.94,'market_difficulty_max',1.18,
  'market_difficulty_step',.03,'market_target_elite_affordability',.20,'market_target_median_elite_ratio',.86,
  'market_recovery_bonus_strength',2.40,'market_expensive_risk_strength',1.20,'market_breakout_reprice_strength',.40,
  'market_cheap_percentile',.35,'market_elite_percentile',.80,'market_breakout_round_percentile',.70,'market_bad_round_percentile',.35)
FROM public.fantasy_seasons fantasy_season JOIN public.fantasy_settings settings ON settings.league_id=fantasy_season.league_id
WHERE fantasy_round.fantasy_season_id=fantasy_season.id AND fantasy_round.market_status='open';

REVOKE ALL ON FUNCTION public.apply_fantasy_role_market_v074(UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apply_fantasy_role_market_v10(UUID) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
