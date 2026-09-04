-- BQ v5: correção consolidada de paridade, exceção da Rodada 02 e autoridade.
-- Esta migration é idempotente e substitui as funções problemáticas de 129-132.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS suppress_goalkeeper_rewards BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS rounds_formation_mode_check;
ALTER TABLE public.rounds ADD CONSTRAINT rounds_formation_mode_check
  CHECK (formation_mode IN ('manual', 'random', 'balanced', 'speed'));

-- A exceção é identificada por temporada, tipo e número; nunca pelo status da
-- rodada. R03 e as seguintes voltam explicitamente à regra normal.
UPDATE public.rounds r
SET suppress_goalkeeper_rewards = (r.round_type = 'official' AND r.number = 2),
    ignore_goalkeeper_stats = false
FROM public.seasons s
WHERE s.id = r.season_id AND s.status = 'active';

-- Novas rodadas recebem um snapshot uma única vez. UPDATEs posteriores não o
-- substituem; a única exceção é o reprocessamento corretivo explícito abaixo.
CREATE OR REPLACE FUNCTION public.set_bq_scoring_snapshot_on_round_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.scoring_snapshot IS NULL THEN
    NEW.scoring_snapshot := public.snapshot_bq_scoring(NEW.league_id);
    NEW.scoring_version := COALESCE((NEW.scoring_snapshot->>'version')::INTEGER, 5);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_round_bq_scoring_snapshot ON public.rounds;
CREATE TRIGGER zz_round_bq_scoring_snapshot
BEFORE INSERT ON public.rounds FOR EACH ROW
EXECUTE FUNCTION public.set_bq_scoring_snapshot_on_round_insert();

CREATE OR REPLACE FUNCTION public.protect_bq_round_scoring_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.scoring_snapshot IS DISTINCT FROM NEW.scoring_snapshot
     AND COALESCE(current_setting('app.allow_bq_snapshot_rewrite',true),'off') <> 'on' THEN
    RAISE EXCEPTION 'O snapshot de pontuacao da rodada e imutavel.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_round_bq_scoring_snapshot_immutable ON public.rounds;
CREATE TRIGGER zz_round_bq_scoring_snapshot_immutable
BEFORE UPDATE OF scoring_snapshot ON public.rounds FOR EACH ROW
EXECUTE FUNCTION public.protect_bq_round_scoring_snapshot();

-- Propaga a exceção para o snapshot Fantasy no momento da criação. O -1 por
-- gol sofrido não é suprimido em nenhuma rodada.
CREATE OR REPLACE FUNCTION public.set_role_scoring_activation_from_round_two()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_number INTEGER; v_suppress BOOLEAN;
BEGIN
  SELECT number,suppress_goalkeeper_rewards INTO v_number,v_suppress FROM public.rounds WHERE id=NEW.round_id;
  NEW.settings_snapshot:=COALESCE(NEW.settings_snapshot,'{}')||jsonb_build_object(
    'role_scoring_active',COALESCE(v_number,1)>=2,
    'role_scoring_start_round',2,
    'goalkeeper_appearance_points',CASE WHEN v_suppress THEN 0 ELSE COALESCE((NEW.settings_snapshot->>'goalkeeper_appearance_points')::NUMERIC,2) END,
    'goal_conceded_points',COALESCE((NEW.settings_snapshot->>'goal_conceded_points')::NUMERIC,-1),
    'goalkeeper_slot_clean_sheet_points',CASE WHEN v_suppress THEN 0 ELSE 4 END,
    'scoring_version',5);
  RETURN NEW;
END;
$$;

-- Os oito scouts são atualizados na mesma transação em Ranked e Cartola.
CREATE OR REPLACE FUNCTION public.save_bq_scoring_rules(p_league_id UUID, p_snapshot JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_goal NUMERIC := (p_snapshot->>'goal')::NUMERIC;
  v_assist NUMERIC := (p_snapshot->>'assist')::NUMERIC;
  v_win NUMERIC := (p_snapshot->>'win')::NUMERIC;
  v_draw NUMERIC := (p_snapshot->>'draw')::NUMERIC;
  v_loss NUMERIC := (p_snapshot->>'loss')::NUMERIC;
  v_own_goal NUMERIC := (p_snapshot->>'ownGoal')::NUMERIC;
  v_gk_appearance NUMERIC := (p_snapshot->>'goalkeeperAppearance')::NUMERIC;
  v_gk_conceded NUMERIC := (p_snapshot->>'goalkeeperGoalConceded')::NUMERIC;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem alterar a pontuacao.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leagues WHERE id = p_league_id) THEN RAISE EXCEPTION 'Liga nao encontrada.'; END IF;
  IF v_goal IS NULL OR v_assist IS NULL OR v_win IS NULL OR v_draw IS NULL OR v_loss IS NULL
     OR v_own_goal IS NULL OR v_gk_appearance IS NULL OR v_gk_conceded IS NULL THEN
    RAISE EXCEPTION 'Os oito scouts sao obrigatorios.';
  END IF;
  IF greatest(abs(v_goal), abs(v_assist), abs(v_win), abs(v_draw), abs(v_loss),
              abs(v_own_goal), abs(v_gk_appearance), abs(v_gk_conceded)) > 100 THEN
    RAISE EXCEPTION 'Valor de pontuacao fora do limite.';
  END IF;

  INSERT INTO public.ranking_rules (league_id, event_type, points)
  VALUES
    (p_league_id, 'goal', v_goal), (p_league_id, 'assist', v_assist),
    (p_league_id, 'win', v_win), (p_league_id, 'draw', v_draw),
    (p_league_id, 'loss', v_loss), (p_league_id, 'own_goal', v_own_goal),
    (p_league_id, 'goalkeeper_appearance', v_gk_appearance),
    (p_league_id, 'goal_conceded', v_gk_conceded)
  ON CONFLICT (league_id, event_type) DO UPDATE SET points = EXCLUDED.points;

  UPDATE public.fantasy_settings SET
    goal_points = v_goal, attacker_goal_points = v_goal,
    assist_points = v_assist, win_points = v_win, draw_points = v_draw,
    loss_points = v_loss, goalkeeper_loss_points = v_loss,
    own_goal_points = v_own_goal,
    goalkeeper_appearance_points = v_gk_appearance,
    goal_conceded_points = v_gk_conceded,
    team_goal_conceded_points = 0,
    updated_at = now()
  WHERE league_id = p_league_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configuracao do Cartola nao encontrada para a liga.'; END IF;

  RETURN jsonb_build_object('success', true, 'version', 5);
END;
$$;

-- Base BQ v5: somente os oito scouts. DEF/MEI/ATA/GOL ficam fora daqui.
CREATE OR REPLACE FUNCTION public.calculate_fantasy_role_base_points_v5(
  p_settings JSONB, p_goals INTEGER, p_assists INTEGER, p_wins INTEGER,
  p_draws INTEGER, p_losses INTEGER, p_goalkeeper_games INTEGER,
  p_goals_conceded INTEGER, p_own_goals INTEGER
) RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT round(
    COALESCE(p_goals, 0) * COALESCE((p_settings->>'goal_points')::NUMERIC, 4)
    + COALESCE(p_assists, 0) * COALESCE((p_settings->>'assist_points')::NUMERIC, 2.5)
    + COALESCE(p_wins, 0) * COALESCE((p_settings->>'win_points')::NUMERIC, 3)
    + COALESCE(p_draws, 0) * COALESCE((p_settings->>'draw_points')::NUMERIC, 1)
    + COALESCE(p_losses, 0) * COALESCE((p_settings->>'loss_points')::NUMERIC, -2.5)
    + COALESCE(p_goalkeeper_games, 0) * COALESCE((p_settings->>'goalkeeper_appearance_points')::NUMERIC, 2)
    + COALESCE(p_goals_conceded, 0) * COALESCE((p_settings->>'goal_conceded_points')::NUMERIC, -1)
    + COALESCE(p_own_goals, 0) * COALESCE((p_settings->>'own_goal_points')::NUMERIC, -3), 2);
$$;

-- Compatibilidade com funções históricas: continua sem DEF e encaminha para a
-- base v5. Funções novas usam a assinatura acima, que inclui empates.
CREATE OR REPLACE FUNCTION public.calculate_fantasy_role_base_points(
  p_settings JSONB, p_goals INTEGER, p_assists INTEGER, p_wins INTEGER,
  p_losses INTEGER, p_goalkeeper_games INTEGER, p_goals_conceded INTEGER,
  p_own_goals INTEGER, p_player_profile TEXT,
  p_defensive_clean_games INTEGER, p_defensive_one_goal_games INTEGER
) RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT public.calculate_fantasy_role_base_points_v5(
    p_settings, p_goals, p_assists, p_wins, 0, p_losses,
    p_goalkeeper_games, p_goals_conceded, p_own_goals);
$$;

CREATE OR REPLACE FUNCTION public.calculate_fantasy_position_bonus_v5(
  p_settings JSONB, p_slot_role TEXT, p_is_position_correct BOOLEAN,
  p_goals INTEGER, p_assists INTEGER, p_goalkeeper_games INTEGER,
  p_clean_sheets INTEGER, p_defensive_clean_games INTEGER,
  p_defensive_one_goal_games INTEGER
) RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT round(CASE
    WHEN p_slot_role = 'GOL' AND COALESCE(p_goalkeeper_games, 0) > 0
      THEN COALESCE(p_clean_sheets, 0) * COALESCE((p_settings->>'goalkeeper_slot_clean_sheet_points')::NUMERIC, 4)
    WHEN p_is_position_correct AND p_slot_role = 'DEF' THEN least(10,
      COALESCE(p_defensive_clean_games, 0) * 1.5
      + COALESCE(p_defensive_one_goal_games, 0) * .5
      + CASE WHEN COALESCE(p_defensive_clean_games, 0) >= 3 THEN 3 ELSE 0 END)
    WHEN p_is_position_correct AND p_slot_role = 'MEI' THEN
      COALESCE(p_assists, 0) + CASE WHEN COALESCE(p_assists, 0) >= 2 THEN 3 ELSE 0 END
    WHEN p_is_position_correct AND p_slot_role = 'ATA' THEN
      CASE WHEN COALESCE(p_goals, 0) >= 2 THEN 3 ELSE 0 END
    ELSE 0 END, 2);
$$;

CREATE OR REPLACE FUNCTION public.apply_fantasy_slot_position_bonus(
  p_round_id UUID, p_is_test BOOLEAN DEFAULT false
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_snapshot JSONB; target_container UUID;
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
        public.calculate_fantasy_role_base_points_v5(target_snapshot, stat.goals, stat.assists,
          stat.wins, stat.draws, stat.losses, stat.goalkeeper_games, stat.goals_conceded, stat.own_goals) base_points,
        public.calculate_fantasy_position_bonus_v5(target_snapshot, item.slot_role,
          item.is_position_correct, stat.goals, stat.assists, stat.goalkeeper_games,
          stat.clean_sheets, stat.defensive_clean_games, stat.defensive_one_goal_games) position_bonus
      FROM public.fantasy_test_lineup_players item
      JOIN public.fantasy_test_lineups lineup ON lineup.id = item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.test_session_id = target_container AND lineup.status = 'scored'
    ) UPDATE public.fantasy_test_lineup_players item SET
      base_points = calculated.base_points + calculated.position_bonus,
      position_bonus = calculated.position_bonus,
      captain_bonus = CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN round((calculated.base_points + calculated.position_bonus) *
          (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1), 2) ELSE 0 END,
      total_points = CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN round((calculated.base_points + calculated.position_bonus) *
          COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5), 2)
        ELSE calculated.base_points + calculated.position_bonus END
    FROM calculated WHERE item.id = calculated.id;

    UPDATE public.fantasy_test_lineups lineup SET
      player_points = COALESCE((SELECT sum(i.total_points) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id=lineup.id),0),
      total_points = COALESCE((SELECT sum(i.total_points) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id=lineup.id),0)+COALESCE(lineup.prediction_points,0),
      score_breakdown = COALESCE(lineup.score_breakdown,'{}') || jsonb_build_object(
        'playersBase',COALESCE((SELECT sum(i.base_points-i.position_bonus) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id=lineup.id),0),
        'positionBonus',COALESCE((SELECT sum(i.position_bonus) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id=lineup.id),0),
        'captainBonus',COALESCE((SELECT sum(i.captain_bonus) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id=lineup.id),0))
    WHERE lineup.test_session_id=target_container AND lineup.status='scored';
  ELSE
    WITH calculated AS (
      SELECT item.id, item.player_id, lineup.captain_player_id,
        public.calculate_fantasy_role_base_points_v5(target_snapshot, stat.goals, stat.assists,
          stat.wins, stat.draws, stat.losses, stat.goalkeeper_games, stat.goals_conceded, stat.own_goals) base_points,
        public.calculate_fantasy_position_bonus_v5(target_snapshot, item.slot_role,
          item.is_position_correct, stat.goals, stat.assists, stat.goalkeeper_games,
          stat.clean_sheets, stat.defensive_clean_games, stat.defensive_one_goal_games) position_bonus
      FROM public.fantasy_lineup_players item
      JOIN public.fantasy_lineups lineup ON lineup.id = item.lineup_id
      LEFT JOIN public.player_round_stats stat ON stat.round_id = p_round_id AND stat.player_id = item.player_id
      WHERE lineup.fantasy_round_id = target_container AND lineup.status = 'scored'
    ) UPDATE public.fantasy_lineup_players item SET
      base_points = calculated.base_points + calculated.position_bonus,
      position_bonus = calculated.position_bonus,
      captain_bonus = CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN round((calculated.base_points + calculated.position_bonus) *
          (COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5) - 1), 2) ELSE 0 END,
      total_points = CASE WHEN calculated.player_id = calculated.captain_player_id
        THEN round((calculated.base_points + calculated.position_bonus) *
          COALESCE((target_snapshot->>'captain_multiplier')::NUMERIC, 1.5), 2)
        ELSE calculated.base_points + calculated.position_bonus END
    FROM calculated WHERE item.id = calculated.id;

    UPDATE public.fantasy_lineups lineup SET
      player_points = COALESCE((SELECT sum(i.total_points) FROM public.fantasy_lineup_players i WHERE i.lineup_id=lineup.id),0),
      total_points = COALESCE((SELECT sum(i.total_points) FROM public.fantasy_lineup_players i WHERE i.lineup_id=lineup.id),0)
        + COALESCE(lineup.prediction_points,0)+COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC,0),
      score_breakdown = COALESCE(lineup.score_breakdown,'{}') || jsonb_build_object(
        'playersBase',COALESCE((SELECT sum(i.base_points-i.position_bonus) FROM public.fantasy_lineup_players i WHERE i.lineup_id=lineup.id),0),
        'positionBonus',COALESCE((SELECT sum(i.position_bonus) FROM public.fantasy_lineup_players i WHERE i.lineup_id=lineup.id),0),
        'captainBonus',COALESCE((SELECT sum(i.captain_bonus) FROM public.fantasy_lineup_players i WHERE i.lineup_id=lineup.id),0))
    WHERE lineup.fantasy_round_id=target_container AND lineup.status='scored';
  END IF;
  RETURN true;
END;
$$;

-- O mercado recebe a base autoritativa já persistida em player_round_stats;
-- assim empates entram e nenhum bônus DEF é contado duas vezes.
CREATE OR REPLACE FUNCTION public.apply_fantasy_role_market_v074(p_round_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.fantasy_rounds%ROWTYPE; snapshot JSONB;
BEGIN
  SELECT * INTO target FROM public.fantasy_rounds WHERE round_id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN true; END IF;
  snapshot:=target.settings_snapshot;
  WITH performance AS (
    SELECT history.player_id,history.price_before,player.player_profile,COALESCE(stat.points,0)::NUMERIC base_points
    FROM public.fantasy_player_price_history history
    JOIN public.player_round_stats stat ON stat.round_id=p_round_id AND stat.player_id=history.player_id
    JOIN public.players player ON player.id=history.player_id
    WHERE history.fantasy_round_id=target.id AND stat.games>0
  ), ranked0 AS (
    SELECT performance.*,
      rank() OVER (ORDER BY base_points DESC) overall_start_rank,
      count(*) OVER (PARTITION BY base_points) overall_tied_count,count(*) OVER () overall_count,
      rank() OVER (PARTITION BY player_profile ORDER BY base_points DESC) role_start_rank,
      count(*) OVER (PARTITION BY player_profile,base_points) role_tied_count,
      count(*) OVER (PARTITION BY player_profile) role_count FROM performance
  ), percentiles AS (
    SELECT ranked0.*,
      CASE WHEN overall_count<=1 THEN .5 ELSE (((overall_start_rank-1)+(overall_start_rank+overall_tied_count-2))::NUMERIC/2)/(overall_count-1) END overall_percentile,
      CASE WHEN role_count<=1 THEN .5 ELSE (((role_start_rank-1)+(role_start_rank+role_tied_count-2))::NUMERIC/2)/(role_count-1) END role_percentile FROM ranked0
  ), mixed AS (
    SELECT percentiles.*,CASE WHEN player_profile IN ('defensive','midfield','offensive') AND role_count>=3
      THEN .65*role_percentile+.35*overall_percentile ELSE overall_percentile END market_percentile FROM percentiles
  ), classified0 AS (
    SELECT mixed.*,rank() OVER(ORDER BY market_percentile)::INTEGER start_rank,
      count(*) OVER(PARTITION BY market_percentile)::INTEGER tied_count,
      min(market_percentile) OVER () min_percentile,max(market_percentile) OVER () max_percentile FROM mixed
  ), classified AS (
    SELECT classified0.*,CASE WHEN min_percentile=max_percentile THEN 'STABLE'
      WHEN market_percentile<COALESCE((snapshot->>'market_up_share')::NUMERIC,.30) THEN 'UP'
      WHEN market_percentile<COALESCE((snapshot->>'market_up_share')::NUMERIC,.30)+COALESCE((snapshot->>'market_stable_share')::NUMERIC,.30) THEN 'STABLE'
      ELSE 'DOWN' END market_band FROM classified0
  ), ranges AS (
    SELECT classified.*,min(market_percentile) FILTER(WHERE market_band='UP') OVER() up_min,
      max(market_percentile) FILTER(WHERE market_band='UP') OVER() up_max,
      min(market_percentile) FILTER(WHERE market_band='DOWN') OVER() down_min,
      max(market_percentile) FILTER(WHERE market_band='DOWN') OVER() down_max FROM classified
  ), values_to_apply AS (
    SELECT ranges.*,CASE market_band
      WHEN 'UP' THEN CASE WHEN up_min=up_max THEN COALESCE((snapshot->>'max_price_increase')::NUMERIC,.12)
        ELSE COALESCE((snapshot->>'max_price_increase')::NUMERIC,.12)-((market_percentile-up_min)/(up_max-up_min))*(COALESCE((snapshot->>'max_price_increase')::NUMERIC,.12)-COALESCE((snapshot->>'market_min_increase')::NUMERIC,.03)) END
      WHEN 'DOWN' THEN CASE WHEN down_min=down_max THEN -COALESCE((snapshot->>'max_price_decrease')::NUMERIC,.10)
        ELSE -(COALESCE((snapshot->>'market_min_decrease')::NUMERIC,.02)+((market_percentile-down_min)/(down_max-down_min))*(COALESCE((snapshot->>'max_price_decrease')::NUMERIC,.10)-COALESCE((snapshot->>'market_min_decrease')::NUMERIC,.02))) END
      ELSE 0 END variation_rate FROM ranges
  ) UPDATE public.fantasy_player_price_history h SET
    round_points=v.base_points,variation_rate=v.variation_rate,
    price_after=round(greatest(COALESCE((snapshot->>'min_player_price')::NUMERIC,5),least(COALESCE((snapshot->>'max_player_price')::NUMERIC,25),v.price_before*(1+v.variation_rate))),2),
    market_band=v.market_band,round_rank=v.start_rank,round_percentile=v.market_percentile,
    metrics=COALESCE(h.metrics,'{}')||jsonb_build_object('scoringVersion',5,'marketMethod','65% posicao / 35% geral')
  FROM values_to_apply v WHERE h.fantasy_round_id=target.id AND h.player_id=v.player_id;

  UPDATE public.fantasy_player_price_history SET price_change=price_after-price_before WHERE fantasy_round_id=target.id;
  UPDATE public.fantasy_player_prices price SET current_price=h.price_after,
    rounds_played=(SELECT count(*) FROM public.fantasy_player_price_history x WHERE x.fantasy_season_id=price.fantasy_season_id AND x.player_id=price.player_id AND x.games>0),
    total_points=COALESCE((SELECT sum(x.round_points) FROM public.fantasy_player_price_history x WHERE x.fantasy_season_id=price.fantasy_season_id AND x.player_id=price.player_id),0),updated_at=now()
  FROM public.fantasy_player_price_history h WHERE h.fantasy_round_id=target.id AND h.player_id=price.player_id AND price.fantasy_season_id=target.fantasy_season_id;
  UPDATE public.fantasy_lineup_players item SET price_after=COALESCE((SELECT h.price_after FROM public.fantasy_player_price_history h WHERE h.fantasy_round_id=target.id AND h.player_id=item.player_id),item.price_locked)
  FROM public.fantasy_lineups lineup WHERE lineup.id=item.lineup_id AND lineup.fantasy_round_id=target.id;
  UPDATE public.fantasy_lineups lineup SET budget_after=lineup.cash_remaining+COALESCE((SELECT sum(item.price_after) FROM public.fantasy_lineup_players item WHERE item.lineup_id=lineup.id),0)
  WHERE lineup.fantasy_round_id=target.id AND lineup.status='scored';
  UPDATE public.fantasy_accounts account SET current_budget=latest.budget_after,
    total_points=totals.total_points,rounds_played=totals.rounds_played,
    best_round_points=totals.best_round,updated_at=now()
  FROM (
    SELECT DISTINCT ON(l.user_id) l.user_id,l.budget_after FROM public.fantasy_lineups l
    JOIN public.fantasy_rounds fr ON fr.id=l.fantasy_round_id JOIN public.rounds r ON r.id=fr.round_id
    WHERE fr.fantasy_season_id=target.fantasy_season_id AND l.status='scored' AND l.budget_after IS NOT NULL
    ORDER BY l.user_id,r.date DESC,r.number DESC
  ) latest JOIN (
    SELECT l.user_id,sum(l.total_points) total_points,count(*)::INTEGER rounds_played,max(l.total_points) best_round
    FROM public.fantasy_lineups l JOIN public.fantasy_rounds fr ON fr.id=l.fantasy_round_id
    WHERE fr.fantasy_season_id=target.fantasy_season_id AND l.status='scored' GROUP BY l.user_id
  ) totals ON totals.user_id=latest.user_id
  WHERE account.fantasy_season_id=target.fantasy_season_id AND account.user_id=latest.user_id;
  RETURN true;
END;
$$;

-- Prévia protegida no próprio banco e temporada ativa resolvida pela tabela
-- seasons, que é a fonte real do status.
CREATE OR REPLACE FUNCTION public.preview_reprocess_season(p_league_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fs_id UUID; v_rounds JSONB; v_accounts JSONB; v_rounds_count INTEGER; v_lineups_count INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem consultar o reprocessamento.'; END IF;
  SELECT fs.id INTO v_fs_id FROM public.fantasy_seasons fs
  JOIN public.seasons s ON s.id=fs.season_id
  WHERE fs.league_id=p_league_id AND s.status='active' ORDER BY fs.created_at DESC LIMIT 1;
  IF v_fs_id IS NULL THEN RETURN jsonb_build_object('can_reprocess',false,'reason','Nenhuma temporada ativa encontrada.'); END IF;
  IF EXISTS(SELECT 1 FROM public.rounds WHERE league_id=p_league_id AND status='active')
     OR EXISTS(SELECT 1 FROM public.fantasy_rounds WHERE fantasy_season_id=v_fs_id AND market_status='in_progress') THEN
    RETURN jsonb_build_object('can_reprocess',false,'reason','Existe rodada ativa ou mercado em andamento. Finalize antes de reprocessar.');
  END IF;
  SELECT count(*)::INTEGER INTO v_rounds_count FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id=fr.round_id WHERE fr.fantasy_season_id=v_fs_id AND r.status='finished';
  SELECT count(*)::INTEGER INTO v_lineups_count FROM public.fantasy_lineups l JOIN public.fantasy_rounds fr ON fr.id=l.fantasy_round_id WHERE fr.fantasy_season_id=v_fs_id AND l.status='scored';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('round_id',r.id,'number',r.number,'date',r.date,'market_status',fr.market_status,'lineups_count',(SELECT count(*) FROM public.fantasy_lineups l WHERE l.fantasy_round_id=fr.id)) ORDER BY r.date,r.number),'[]') INTO v_rounds
  FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id=fr.round_id WHERE fr.fantasy_season_id=v_fs_id AND r.status='finished';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id',a.user_id,'current_budget',a.current_budget,'total_points',a.total_points,'rounds_played',a.rounds_played) ORDER BY a.total_points DESC),'[]') INTO v_accounts
  FROM public.fantasy_accounts a WHERE a.fantasy_season_id=v_fs_id;
  RETURN jsonb_build_object('can_reprocess',true,'season_id',v_fs_id,'rounds_count',v_rounds_count,'lineups_count',v_lineups_count,'rounds',v_rounds,'accounts',v_accounts);
END;
$$;

CREATE OR REPLACE FUNCTION public.reprocess_active_season_v5(p_league_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fs_id UUID; v_season_id UUID; v_first_round UUID; v_rounds_count INTEGER; v_lineups_count INTEGER; v_snapshot JSONB;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem reprocessar a temporada.'; END IF;
  SELECT fs.id,fs.season_id INTO v_fs_id,v_season_id FROM public.fantasy_seasons fs
  JOIN public.seasons s ON s.id=fs.season_id
  WHERE fs.league_id=p_league_id AND s.status='active' ORDER BY fs.created_at DESC LIMIT 1;
  IF v_fs_id IS NULL THEN RAISE EXCEPTION 'Nenhuma temporada ativa encontrada.'; END IF;
  IF EXISTS(SELECT 1 FROM public.rounds WHERE league_id=p_league_id AND status='active')
     OR EXISTS(SELECT 1 FROM public.fantasy_rounds WHERE fantasy_season_id=v_fs_id AND market_status='in_progress') THEN
    RAISE EXCEPTION 'Nao e possivel reprocessar enquanto existe rodada ativa ou mercado em andamento.';
  END IF;

  v_snapshot:=public.snapshot_bq_scoring(p_league_id);
  PERFORM set_config('app.allow_bq_snapshot_rewrite','on',true);
  UPDATE public.rounds r SET scoring_snapshot=v_snapshot,scoring_version=5,
    suppress_goalkeeper_rewards=(r.round_type='official' AND r.number=2),ignore_goalkeeper_stats=false
  WHERE r.season_id=v_season_id;

  -- Restaura os scouts de goleiro apagados pela migration 104, sem alterar os
  -- demais scouts. A punição por gol sofrido continua auditável e pontuando.
  INSERT INTO public.player_round_stats(player_id,round_id,league_id)
  SELECT DISTINCT mg.player_id,r.id,r.league_id FROM public.rounds r
  JOIN public.matches m ON m.round_id=r.id AND m.status='finished'
  JOIN public.match_goalkeepers mg ON mg.match_id=m.id
  WHERE r.season_id=v_season_id AND r.round_type='official' AND r.number=2
  ON CONFLICT(player_id,round_id) DO NOTHING;
  WITH rebuilt AS (
    SELECT r.id round_id,mg.player_id,count(*)::INTEGER goalkeeper_games,
      count(*) FILTER(WHERE CASE WHEN mg.team_id=m.team_a_id THEN m.score_b ELSE m.score_a END=0)::INTEGER clean_sheets,
      sum(CASE WHEN mg.team_id=m.team_a_id THEN m.score_b ELSE m.score_a END)::INTEGER goals_conceded
    FROM public.rounds r JOIN public.matches m ON m.round_id=r.id AND m.status='finished'
    JOIN public.match_goalkeepers mg ON mg.match_id=m.id
    WHERE r.season_id=v_season_id AND r.round_type='official' AND r.number=2 GROUP BY r.id,mg.player_id
  ) UPDATE public.player_round_stats s SET goalkeeper_games=rebuilt.goalkeeper_games,
    clean_sheets=rebuilt.clean_sheets,goals_conceded=rebuilt.goals_conceded
  FROM rebuilt WHERE s.round_id=rebuilt.round_id AND s.player_id=rebuilt.player_id;

  UPDATE public.fantasy_rounds fr SET settings_snapshot=fr.settings_snapshot||jsonb_build_object(
    'goal_points',COALESCE((v_snapshot->>'goal')::NUMERIC,4),'attacker_goal_points',COALESCE((v_snapshot->>'goal')::NUMERIC,4),'assist_points',COALESCE((v_snapshot->>'assist')::NUMERIC,2.5),
    'win_points',COALESCE((v_snapshot->>'win')::NUMERIC,3),'draw_points',COALESCE((v_snapshot->>'draw')::NUMERIC,1),
    'loss_points',COALESCE((v_snapshot->>'loss')::NUMERIC,-2.5),'goalkeeper_loss_points',COALESCE((v_snapshot->>'loss')::NUMERIC,-2.5),'own_goal_points',COALESCE((v_snapshot->>'ownGoal')::NUMERIC,-3),
    'goalkeeper_appearance_points',CASE WHEN r.suppress_goalkeeper_rewards THEN 0 ELSE COALESCE((v_snapshot->>'goalkeeperAppearance')::NUMERIC,2) END,
    'goal_conceded_points',COALESCE((v_snapshot->>'goalkeeperGoalConceded')::NUMERIC,-1),
    'team_goal_conceded_points',0,
    'goalkeeper_slot_clean_sheet_points',CASE WHEN r.suppress_goalkeeper_rewards THEN 0 ELSE 4 END,
    'role_scoring_active',true,'scoring_version',5)
  FROM public.rounds r WHERE r.id=fr.round_id AND fr.fantasy_season_id=v_fs_id;

  UPDATE public.player_round_stats s SET points=round(
    COALESCE(s.goals,0)*COALESCE((r.scoring_snapshot->>'goal')::NUMERIC,4)
    +COALESCE(s.assists,0)*COALESCE((r.scoring_snapshot->>'assist')::NUMERIC,2.5)
    +COALESCE(s.wins,0)*COALESCE((r.scoring_snapshot->>'win')::NUMERIC,3)
    +COALESCE(s.draws,0)*COALESCE((r.scoring_snapshot->>'draw')::NUMERIC,1)
    +COALESCE(s.losses,0)*COALESCE((r.scoring_snapshot->>'loss')::NUMERIC,-2.5)
    +COALESCE(s.own_goals,0)*COALESCE((r.scoring_snapshot->>'ownGoal')::NUMERIC,-3)
    +COALESCE(s.goalkeeper_games,0)*CASE WHEN r.suppress_goalkeeper_rewards THEN 0 ELSE COALESCE((r.scoring_snapshot->>'goalkeeperAppearance')::NUMERIC,2) END
    +COALESCE(s.goals_conceded,0)*COALESCE((r.scoring_snapshot->>'goalkeeperGoalConceded')::NUMERIC,-1),2)
  FROM public.rounds r WHERE r.id=s.round_id AND r.season_id=v_season_id AND r.round_type='official' AND r.status='finished';

  SELECT r.id INTO v_first_round FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id=fr.round_id
  WHERE fr.fantasy_season_id=v_fs_id AND r.status='finished' ORDER BY r.date,r.number LIMIT 1;
  IF v_first_round IS NOT NULL THEN PERFORM public.reprocess_fantasy_from_round(v_first_round); END IF;
  SELECT count(*)::INTEGER INTO v_rounds_count FROM public.fantasy_rounds fr JOIN public.rounds r ON r.id=fr.round_id WHERE fr.fantasy_season_id=v_fs_id AND r.status='finished';
  SELECT count(*)::INTEGER INTO v_lineups_count FROM public.fantasy_lineups l JOIN public.fantasy_rounds fr ON fr.id=l.fantasy_round_id WHERE fr.fantasy_season_id=v_fs_id AND l.status='scored';
  INSERT INTO public.fantasy_audit_log(league_id,user_id,action,payload) VALUES(p_league_id,auth.uid(),'season_reprocessed_bq_v5',jsonb_build_object('season_id',v_season_id,'rounds_reprocessed',v_rounds_count,'lineups_reprocessed',v_lineups_count,'round_2_goalkeeper_rewards_suppressed',true));
  RETURN jsonb_build_object('success',true,'season_id',v_fs_id,'rounds_reprocessed',v_rounds_count,'lineups_reprocessed',v_lineups_count);
END;
$$;

REVOKE ALL ON FUNCTION public.set_bq_scoring_snapshot_on_round_insert() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.protect_bq_round_scoring_snapshot() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_bq_scoring_rules(UUID,JSONB) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.calculate_fantasy_role_base_points_v5(JSONB,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.calculate_fantasy_position_bonus_v5(JSONB,TEXT,BOOLEAN,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.preview_reprocess_season(UUID),public.reprocess_active_season_v5(UUID) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_bq_scoring_rules(UUID,JSONB),public.preview_reprocess_season(UUID),public.reprocess_active_season_v5(UUID) TO authenticated;

NOTIFY pgrst,'reload schema';
