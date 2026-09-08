-- Remove a posição ALA independente e restaura o Cartola anterior (BQ v5).
-- A migration 144 permanece no histórico porque já pode ter sido aplicada.

BEGIN;

-- Perfis ALA criados durante a vigência da v6 voltam para a categoria antiga
-- de meio-campo. Escalações salvas continuam válidas na formação equivalente.
UPDATE public.players
SET player_profile = 'midfield'
WHERE player_profile = 'wing';

UPDATE public.fantasy_lineup_players
SET slot_role = CASE WHEN slot_role = 'ALA' THEN 'MEI' ELSE slot_role END,
    player_profile_locked = CASE WHEN player_profile_locked = 'wing' THEN 'midfield' ELSE player_profile_locked END
WHERE slot_role = 'ALA' OR player_profile_locked = 'wing';

UPDATE public.fantasy_test_lineup_players
SET slot_role = CASE WHEN slot_role = 'ALA' THEN 'MEI' ELSE slot_role END,
    player_profile_locked = CASE WHEN player_profile_locked = 'wing' THEN 'midfield' ELSE player_profile_locked END
WHERE slot_role = 'ALA' OR player_profile_locked = 'wing';

UPDATE public.fantasy_portfolio_players
SET slot_role = CASE WHEN slot_role = 'ALA' THEN 'MEI' ELSE slot_role END,
    player_profile_locked = CASE WHEN player_profile_locked = 'wing' THEN 'midfield' ELSE player_profile_locked END
WHERE slot_role = 'ALA' OR player_profile_locked = 'wing';

UPDATE public.fantasy_lineup_players item
SET is_position_correct = CASE item.slot_role
  WHEN 'GOL' THEN true
  WHEN 'DEF' THEN player.player_profile = 'defensive'
  WHEN 'MEI' THEN player.player_profile = 'midfield'
  WHEN 'ATA' THEN player.player_profile = 'offensive'
  ELSE false
END
FROM public.players player
WHERE player.id = item.player_id;

UPDATE public.fantasy_test_lineup_players item
SET is_position_correct = CASE item.slot_role
  WHEN 'GOL' THEN true
  WHEN 'DEF' THEN player.player_profile = 'defensive'
  WHEN 'MEI' THEN player.player_profile = 'midfield'
  WHEN 'ATA' THEN player.player_profile = 'offensive'
  ELSE false
END
FROM public.players player
WHERE player.id = item.player_id;

UPDATE public.fantasy_portfolio_players item
SET is_position_correct = CASE item.slot_role
  WHEN 'GOL' THEN true
  WHEN 'DEF' THEN player.player_profile = 'defensive'
  WHEN 'MEI' THEN player.player_profile = 'midfield'
  WHEN 'ATA' THEN player.player_profile = 'offensive'
  ELSE false
END
FROM public.players player
WHERE player.id = item.player_id;

-- Restaura os CHECKs anteriores, com apenas DEF, MEI e ATA como perfis de linha.
DO $$
DECLARE item RECORD;
BEGIN
  FOR item IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN (
        'public.players'::regclass,
        'public.fantasy_lineup_players'::regclass,
        'public.fantasy_test_lineup_players'::regclass,
        'public.fantasy_portfolio_players'::regclass
      )
      AND (
        pg_get_constraintdef(oid) ILIKE '%player_profile%'
        OR pg_get_constraintdef(oid) ILIKE '%slot_role%'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', item.table_name, item.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.players ADD CONSTRAINT players_player_profile_check
  CHECK (player_profile IN ('offensive', 'midfield', 'defensive'));
ALTER TABLE public.fantasy_lineup_players ADD CONSTRAINT fantasy_lineup_players_slot_role_check
  CHECK (slot_role IS NULL OR slot_role IN ('GOL', 'DEF', 'MEI', 'ATA'));
ALTER TABLE public.fantasy_lineup_players ADD CONSTRAINT fantasy_lineup_players_profile_check
  CHECK (player_profile_locked IS NULL OR player_profile_locked IN ('defensive', 'midfield', 'offensive'));
ALTER TABLE public.fantasy_test_lineup_players ADD CONSTRAINT fantasy_test_lineup_players_slot_role_check
  CHECK (slot_role IS NULL OR slot_role IN ('GOL', 'DEF', 'MEI', 'ATA'));
ALTER TABLE public.fantasy_test_lineup_players ADD CONSTRAINT fantasy_test_lineup_players_profile_check
  CHECK (player_profile_locked IS NULL OR player_profile_locked IN ('defensive', 'midfield', 'offensive'));
ALTER TABLE public.fantasy_portfolio_players ADD CONSTRAINT fantasy_portfolio_players_slot_role_check
  CHECK (slot_role IS NULL OR slot_role IN ('GOL', 'DEF', 'MEI', 'ATA'));
ALTER TABLE public.fantasy_portfolio_players ADD CONSTRAINT fantasy_portfolio_players_profile_check
  CHECK (player_profile_locked IS NULL OR player_profile_locked IN ('defensive', 'midfield', 'offensive'));

-- Restaura exatamente os RPCs de persistência que a migration 144 preservou.
DO $$
BEGIN
  IF to_regprocedure('public.save_fantasy_lineup_pre_bq_v6_144(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION IF EXISTS public.save_fantasy_lineup(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)';
    ALTER FUNCTION public.save_fantasy_lineup_pre_bq_v6_144(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB)
      RENAME TO save_fantasy_lineup;
  END IF;

  IF to_regprocedure('public.save_fantasy_test_lineup_pre_bq_v6_144(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION IF EXISTS public.save_fantasy_test_lineup(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)';
    ALTER FUNCTION public.save_fantasy_test_lineup_pre_bq_v6_144(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB)
      RENAME TO save_fantasy_test_lineup;
  END IF;

  IF to_regprocedure('public.save_fantasy_portfolio_pre_bq_v6_144(uuid,uuid[],uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION IF EXISTS public.save_fantasy_portfolio(uuid,uuid[],uuid,jsonb)';
    ALTER FUNCTION public.save_fantasy_portfolio_pre_bq_v6_144(UUID,UUID[],UUID,JSONB)
      RENAME TO save_fantasy_portfolio;
  END IF;
END;
$$;

-- Novas rodadas e novos snapshots voltam a congelar a versão BQ v5.
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

CREATE OR REPLACE FUNCTION public.set_role_scoring_activation_from_round_two()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_number INTEGER; v_suppress BOOLEAN;
BEGIN
  SELECT number, suppress_goalkeeper_rewards
  INTO v_number, v_suppress
  FROM public.rounds
  WHERE id = NEW.round_id;

  NEW.settings_snapshot := COALESCE(NEW.settings_snapshot, '{}') || jsonb_build_object(
    'role_scoring_active', COALESCE(v_number, 1) >= 2,
    'role_scoring_start_round', 2,
    'goalkeeper_appearance_points', CASE WHEN v_suppress THEN 0 ELSE COALESCE((NEW.settings_snapshot->>'goalkeeper_appearance_points')::NUMERIC, 2) END,
    'goal_conceded_points', COALESCE((NEW.settings_snapshot->>'goal_conceded_points')::NUMERIC, -1),
    'goalkeeper_slot_clean_sheet_points', CASE WHEN v_suppress THEN 0 ELSE 4 END,
    'scoring_version', 5
  );
  NEW.scoring_version := 5;
  RETURN NEW;
END;
$$;

-- Remove as chaves v6 somente dos snapshots que a migration 144 marcou como v6.
SELECT set_config('app.allow_bq_snapshot_rewrite', 'on', true);

UPDATE public.rounds
SET scoring_snapshot = (
      COALESCE(scoring_snapshot, '{}')
      - ARRAY[
        'scoring_version',
        'def_clean_sheet_bonus', 'def_one_goal_bonus', 'def_muralha_threshold',
        'def_muralha_bonus', 'def_bonus_cap', 'mei_assist_bonus',
        'mei_maestro_threshold', 'mei_maestro_bonus', 'mei_bonus_cap',
        'ala_goal_bonus', 'ala_assist_bonus', 'ala_clean_sheet_bonus',
        'ala_one_goal_bonus', 'ala_attack_threshold', 'ala_defense_threshold',
        'ala_vai_e_volta_bonus', 'ala_bonus_cap', 'ata_goal_bonus',
        'ata_artilheiro_threshold', 'ata_artilheiro_bonus', 'ata_bonus_cap'
      ]::TEXT[]
    ) || jsonb_build_object('version', 5),
    scoring_version = 5
WHERE scoring_version = 6;

UPDATE public.fantasy_rounds
SET settings_snapshot = (
      COALESCE(settings_snapshot, '{}')
      - ARRAY[
        'scoring_version',
        'def_clean_sheet_bonus', 'def_one_goal_bonus', 'def_muralha_threshold',
        'def_muralha_bonus', 'def_bonus_cap', 'mei_assist_bonus',
        'mei_maestro_threshold', 'mei_maestro_bonus', 'mei_bonus_cap',
        'ala_goal_bonus', 'ala_assist_bonus', 'ala_clean_sheet_bonus',
        'ala_one_goal_bonus', 'ala_attack_threshold', 'ala_defense_threshold',
        'ala_vai_e_volta_bonus', 'ala_bonus_cap', 'ata_goal_bonus',
        'ata_artilheiro_threshold', 'ata_artilheiro_bonus', 'ata_bonus_cap'
      ]::TEXT[]
    ) || jsonb_build_object('scoring_version', 5),
    scoring_version = 5
WHERE scoring_version = 6;

UPDATE public.fantasy_test_sessions
SET settings_snapshot = (
      COALESCE(settings_snapshot, '{}')
      - ARRAY[
        'scoring_version',
        'def_clean_sheet_bonus', 'def_one_goal_bonus', 'def_muralha_threshold',
        'def_muralha_bonus', 'def_bonus_cap', 'mei_assist_bonus',
        'mei_maestro_threshold', 'mei_maestro_bonus', 'mei_bonus_cap',
        'ala_goal_bonus', 'ala_assist_bonus', 'ala_clean_sheet_bonus',
        'ala_one_goal_bonus', 'ala_attack_threshold', 'ala_defense_threshold',
        'ala_vai_e_volta_bonus', 'ala_bonus_cap', 'ata_goal_bonus',
        'ata_artilheiro_threshold', 'ata_artilheiro_bonus', 'ata_bonus_cap'
      ]::TEXT[]
    ) || jsonb_build_object('scoring_version', 5),
    scoring_version = 5
WHERE scoring_version = 6;

-- Reinstala o cálculo posicional BQ v5 (GOL, DEF, MEI e ATA).
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
      player_points = COALESCE((SELECT sum(i.total_points) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id = lineup.id), 0),
      total_points = COALESCE((SELECT sum(i.total_points) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id = lineup.id), 0) + COALESCE(lineup.prediction_points, 0),
      score_breakdown = COALESCE(lineup.score_breakdown, '{}') || jsonb_build_object(
        'playersBase', COALESCE((SELECT sum(i.base_points - i.position_bonus) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id = lineup.id), 0),
        'positionBonus', COALESCE((SELECT sum(i.position_bonus) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id = lineup.id), 0),
        'captainBonus', COALESCE((SELECT sum(i.captain_bonus) FROM public.fantasy_test_lineup_players i WHERE i.lineup_id = lineup.id), 0))
    WHERE lineup.test_session_id = target_container AND lineup.status = 'scored';
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
      player_points = COALESCE((SELECT sum(i.total_points) FROM public.fantasy_lineup_players i WHERE i.lineup_id = lineup.id), 0),
      total_points = COALESCE((SELECT sum(i.total_points) FROM public.fantasy_lineup_players i WHERE i.lineup_id = lineup.id), 0)
        + COALESCE(lineup.prediction_points, 0) + COALESCE((lineup.score_breakdown->>'cardBonus')::NUMERIC, 0),
      score_breakdown = COALESCE(lineup.score_breakdown, '{}') || jsonb_build_object(
        'playersBase', COALESCE((SELECT sum(i.base_points - i.position_bonus) FROM public.fantasy_lineup_players i WHERE i.lineup_id = lineup.id), 0),
        'positionBonus', COALESCE((SELECT sum(i.position_bonus) FROM public.fantasy_lineup_players i WHERE i.lineup_id = lineup.id), 0),
        'captainBonus', COALESCE((SELECT sum(i.captain_bonus) FROM public.fantasy_lineup_players i WHERE i.lineup_id = lineup.id), 0))
    WHERE lineup.fantasy_round_id = target_container AND lineup.status = 'scored';
  END IF;
  RETURN true;
END;
$$;

-- O próprio atleta volta a poder escolher somente seu perfil antigo.
CREATE OR REPLACE FUNCTION public.protect_fantasy_player_positions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_app_admin() THEN
    IF NEW.is_goalkeeper IS DISTINCT FROM OLD.is_goalkeeper THEN
      RAISE EXCEPTION 'GOL não é uma tag de perfil e não pode ser alterada aqui.';
    END IF;
    IF NEW.player_profile IS DISTINCT FROM OLD.player_profile
      AND NOT EXISTS (
        SELECT 1 FROM public.account_profiles profile
        WHERE profile.user_id = auth.uid() AND profile.player_id = OLD.id
      ) THEN
      RAISE EXCEPTION 'Você só pode alterar a posição do seu próprio perfil.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Restaura o cálculo de custo do Mercado V11 para as duas formações antigas.
CREATE OR REPLACE FUNCTION public.fantasy_market_v11_lineup_cost(
  p_fantasy_season_id UUID, p_formation TEXT, p_mode TEXT
) RETURNS NUMERIC LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  team_size INTEGER; attack_slots INTEGER; midfield_slots INTEGER;
  defense_slots INTEGER := 2; goalkeeper_slots INTEGER;
  selected_ids UUID[] := ARRAY[]::UUID[]; picked_ids UUID[];
  picked_cost NUMERIC; result_cost NUMERIC := 0; wanted_percentile NUMERIC := .60;
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

  WITH candidates AS (
    SELECT price.player_id, price.current_price,
      percent_rank() OVER (ORDER BY price.current_price) price_percentile
    FROM public.fantasy_player_prices price
    JOIN public.players player ON player.id = price.player_id
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
    FROM public.fantasy_player_prices price
    JOIN public.players player ON player.id = price.player_id
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
    FROM public.fantasy_player_prices price
    JOIN public.players player ON player.id = price.player_id
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
      WHERE price.fantasy_season_id = p_fantasy_season_id
        AND NOT (price.player_id = ANY(selected_ids))
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

-- Desfaz apenas as substituições textuais que a migration 144 fez no V11 e
-- no reparo de cadastro da migration 145.
DO $$
DECLARE definition TEXT;
BEGIN
  definition := pg_get_functiondef('public.apply_fantasy_role_market_v074(uuid)'::regprocedure);
  definition := replace(definition,
    'player_profile IN(''defensive'',''midfield'',''wing'',''offensive'')',
    'player_profile IN(''defensive'',''midfield'',''offensive'')');
  definition := replace(definition,
    'player_profile IN (''defensive'', ''midfield'', ''wing'', ''offensive'')',
    'player_profile IN (''defensive'', ''midfield'', ''offensive'')');
  EXECUTE definition;

  definition := pg_get_functiondef('public.fantasy_market_v11_metrics(uuid)'::regprocedure);
  definition := replace(definition,
    'ARRAY[''balanced'',''classic'',''wide'',''offensive'']',
    'ARRAY[''2-1-2'',''2-2-1'']');
  definition := replace(definition,
    'ARRAY[''balanced'', ''classic'', ''wide'', ''offensive'']',
    'ARRAY[''2-1-2'', ''2-2-1'']');
  EXECUTE definition;

  definition := pg_get_functiondef('public.ensure_player_account_for_user(uuid)'::regprocedure);
  definition := replace(definition,
    '''offensive'', ''wing'', ''midfield'', ''defensive''',
    '''offensive'', ''midfield'', ''defensive''');
  definition := replace(definition,
    '''offensive'',''wing'',''midfield'',''defensive''',
    '''offensive'',''midfield'',''defensive''');
  EXECUTE definition;
END;
$$;

-- Remove travas e helpers exclusivos da posição independente.
DROP TRIGGER IF EXISTS players_sync_fantasy_profile_lock_v6 ON public.players;
DROP TRIGGER IF EXISTS fantasy_round_four_profile_lock_v6 ON public.fantasy_rounds;
DROP FUNCTION IF EXISTS public.sync_fantasy_player_profile_lock_v6();
DROP FUNCTION IF EXISTS public.lock_fantasy_profiles_on_round_four_close_v6();
DROP TABLE IF EXISTS public.fantasy_player_profile_locks;

DROP FUNCTION IF EXISTS public.is_valid_fantasy_formation_v6(JSONB, INTEGER);
DROP FUNCTION IF EXISTS public.calculate_fantasy_position_bonus_v6(
  JSONB, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER
);
DROP FUNCTION IF EXISTS public.fantasy_position_rules_v6(UUID);

ALTER TABLE public.fantasy_settings
  DROP COLUMN IF EXISTS def_clean_sheet_bonus,
  DROP COLUMN IF EXISTS def_one_goal_bonus,
  DROP COLUMN IF EXISTS def_muralha_threshold,
  DROP COLUMN IF EXISTS def_muralha_bonus,
  DROP COLUMN IF EXISTS def_bonus_cap,
  DROP COLUMN IF EXISTS mei_assist_bonus,
  DROP COLUMN IF EXISTS mei_maestro_threshold,
  DROP COLUMN IF EXISTS mei_maestro_bonus,
  DROP COLUMN IF EXISTS mei_bonus_cap,
  DROP COLUMN IF EXISTS ala_goal_bonus,
  DROP COLUMN IF EXISTS ala_assist_bonus,
  DROP COLUMN IF EXISTS ala_clean_sheet_bonus,
  DROP COLUMN IF EXISTS ala_one_goal_bonus,
  DROP COLUMN IF EXISTS ala_attack_threshold,
  DROP COLUMN IF EXISTS ala_defense_threshold,
  DROP COLUMN IF EXISTS ala_vai_e_volta_bonus,
  DROP COLUMN IF EXISTS ala_bonus_cap,
  DROP COLUMN IF EXISTS ata_goal_bonus,
  DROP COLUMN IF EXISTS ata_artilheiro_threshold,
  DROP COLUMN IF EXISTS ata_artilheiro_bonus,
  DROP COLUMN IF EXISTS ata_bonus_cap;

REVOKE ALL ON FUNCTION public.save_fantasy_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_fantasy_test_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_fantasy_portfolio(UUID,UUID[],UUID,JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB),
  public.save_fantasy_test_lineup(UUID,UUID[],UUID,UUID,UUID,UUID,JSONB),
  public.save_fantasy_portfolio(UUID,UUID[],UUID,JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
