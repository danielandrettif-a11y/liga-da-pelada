-- Cartola BQ v7: DEF/VOL e ALA, com vigencia somente em rodadas futuras.
-- Nenhuma rodada existente e alterada: o snapshot imutavel continua sendo a
-- autoridade para a rodada que ja esta aberta e para todo o historico.

BEGIN;

CREATE OR REPLACE FUNCTION public.snapshot_bq_scoring(p_league_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot JSONB;
BEGIN
  SELECT jsonb_build_object(
    'version', 7,
    'goal', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'goal'), 4.0),
    'assist', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'assist'), 2.5),
    'win', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'win'), 3.0),
    'draw', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'draw'), 1.0),
    'loss', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'loss'), -2.5),
    'ownGoal', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'own_goal'), -3.0),
    'goalkeeperAppearance', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'goalkeeper_appearance'), 2.0),
    'goalkeeperGoalConceded', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'goal_conceded'), -1.0),
    'def_clean_sheet_bonus', 1.25,
    'def_one_goal_bonus', 0.50,
    'def_muralha_threshold', 3,
    'def_muralha_bonus', 2.50,
    'def_bonus_cap', 8.0,
    'ala_goal_bonus', 0.50,
    'ala_assist_bonus', 0.75,
    'ala_clean_sheet_bonus', 0.50,
    'ala_one_goal_bonus', 0.25,
    'ala_attack_threshold', 1,
    'ala_defense_threshold', 2,
    'ala_vai_e_volta_bonus', 1.50,
    'ala_bonus_cap', 6.0,
    'ata_artilheiro_threshold', 2,
    'ata_artilheiro_bonus', 2.0
  ) INTO v_snapshot;
  RETURN v_snapshot;
END;
$$;

-- O trigger roda apenas no INSERT. Portanto, a rodada atualmente aberta
-- conserva seu snapshot V5; a proxima rodada ja nasce com o snapshot V7.
CREATE OR REPLACE FUNCTION public.set_bq_scoring_snapshot_on_round_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.scoring_snapshot IS NULL THEN
    NEW.scoring_snapshot := public.snapshot_bq_scoring(NEW.league_id);
    NEW.scoring_version := COALESCE((NEW.scoring_snapshot->>'version')::INTEGER, 7);
  END IF;
  RETURN NEW;
END;
$$;

-- Copia a versao e os parametros da rodada para o snapshot do Cartola. Como
-- os triggers existentes chamam esta funcao somente no INSERT, sessoes ja
-- abertas continuam integralmente no regulamento anterior.
CREATE OR REPLACE FUNCTION public.set_role_scoring_activation_from_round_two()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_number INTEGER;
  v_suppress BOOLEAN;
  v_version INTEGER;
  v_round_snapshot JSONB;
BEGIN
  SELECT number, suppress_goalkeeper_rewards, scoring_version, scoring_snapshot
  INTO v_number, v_suppress, v_version, v_round_snapshot
  FROM public.rounds
  WHERE id = NEW.round_id;

  v_version := COALESCE(v_version, 5);
  NEW.settings_snapshot := COALESCE(NEW.settings_snapshot, '{}') || jsonb_build_object(
    'role_scoring_active', COALESCE(v_number, 1) >= 2,
    'role_scoring_start_round', 2,
    'goalkeeper_appearance_points', CASE WHEN v_suppress THEN 0 ELSE COALESCE((NEW.settings_snapshot->>'goalkeeper_appearance_points')::NUMERIC, 2) END,
    'goal_conceded_points', COALESCE((NEW.settings_snapshot->>'goal_conceded_points')::NUMERIC, -1),
    'goalkeeper_slot_clean_sheet_points', CASE WHEN v_suppress THEN 0 ELSE 4 END,
    'scoring_version', v_version,
    'def_clean_sheet_bonus', COALESCE((v_round_snapshot->>'def_clean_sheet_bonus')::NUMERIC, 1.25),
    'def_one_goal_bonus', COALESCE((v_round_snapshot->>'def_one_goal_bonus')::NUMERIC, .50),
    'def_muralha_threshold', COALESCE((v_round_snapshot->>'def_muralha_threshold')::INTEGER, 3),
    'def_muralha_bonus', COALESCE((v_round_snapshot->>'def_muralha_bonus')::NUMERIC, 2.50),
    'def_bonus_cap', COALESCE((v_round_snapshot->>'def_bonus_cap')::NUMERIC, 8),
    'ala_goal_bonus', COALESCE((v_round_snapshot->>'ala_goal_bonus')::NUMERIC, .50),
    'ala_assist_bonus', COALESCE((v_round_snapshot->>'ala_assist_bonus')::NUMERIC, .75),
    'ala_clean_sheet_bonus', COALESCE((v_round_snapshot->>'ala_clean_sheet_bonus')::NUMERIC, .50),
    'ala_one_goal_bonus', COALESCE((v_round_snapshot->>'ala_one_goal_bonus')::NUMERIC, .25),
    'ala_attack_threshold', COALESCE((v_round_snapshot->>'ala_attack_threshold')::INTEGER, 1),
    'ala_defense_threshold', COALESCE((v_round_snapshot->>'ala_defense_threshold')::INTEGER, 2),
    'ala_vai_e_volta_bonus', COALESCE((v_round_snapshot->>'ala_vai_e_volta_bonus')::NUMERIC, 1.50),
    'ala_bonus_cap', COALESCE((v_round_snapshot->>'ala_bonus_cap')::NUMERIC, 6),
    'ata_artilheiro_threshold', COALESCE((v_round_snapshot->>'ata_artilheiro_threshold')::INTEGER, 2),
    'ata_artilheiro_bonus', COALESCE((v_round_snapshot->>'ata_artilheiro_bonus')::NUMERIC, 2)
  );
  NEW.scoring_version := v_version;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_fantasy_position_bonus_v7(
  p_settings JSONB, p_slot_role TEXT, p_is_position_correct BOOLEAN,
  p_goals INTEGER, p_assists INTEGER, p_goalkeeper_games INTEGER,
  p_clean_sheets INTEGER, p_defensive_clean_games INTEGER,
  p_defensive_one_goal_games INTEGER
) RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT round(CASE
    WHEN p_slot_role = 'GOL' AND COALESCE(p_goalkeeper_games, 0) > 0
      THEN COALESCE(p_clean_sheets, 0) * COALESCE((p_settings->>'goalkeeper_slot_clean_sheet_points')::NUMERIC, 4)
    WHEN p_is_position_correct AND p_slot_role = 'DEF' THEN least(
      COALESCE((p_settings->>'def_bonus_cap')::NUMERIC, 8),
      COALESCE(p_defensive_clean_games, 0) * COALESCE((p_settings->>'def_clean_sheet_bonus')::NUMERIC, 1.25)
      + COALESCE(p_defensive_one_goal_games, 0) * COALESCE((p_settings->>'def_one_goal_bonus')::NUMERIC, .5)
      + CASE WHEN COALESCE(p_defensive_clean_games, 0) >= COALESCE((p_settings->>'def_muralha_threshold')::INTEGER, 3)
          THEN COALESCE((p_settings->>'def_muralha_bonus')::NUMERIC, 2.5) ELSE 0 END)
    WHEN p_is_position_correct AND p_slot_role = 'MEI' THEN least(
      COALESCE((p_settings->>'ala_bonus_cap')::NUMERIC, 6),
      COALESCE(p_goals, 0) * COALESCE((p_settings->>'ala_goal_bonus')::NUMERIC, .5)
      + COALESCE(p_assists, 0) * COALESCE((p_settings->>'ala_assist_bonus')::NUMERIC, .75)
      + COALESCE(p_defensive_clean_games, 0) * COALESCE((p_settings->>'ala_clean_sheet_bonus')::NUMERIC, .5)
      + COALESCE(p_defensive_one_goal_games, 0) * COALESCE((p_settings->>'ala_one_goal_bonus')::NUMERIC, .25)
      + CASE WHEN COALESCE(p_goals, 0) + COALESCE(p_assists, 0) >= COALESCE((p_settings->>'ala_attack_threshold')::INTEGER, 1)
              AND COALESCE(p_defensive_clean_games, 0) + COALESCE(p_defensive_one_goal_games, 0) >= COALESCE((p_settings->>'ala_defense_threshold')::INTEGER, 2)
          THEN COALESCE((p_settings->>'ala_vai_e_volta_bonus')::NUMERIC, 1.5) ELSE 0 END)
    WHEN p_is_position_correct AND p_slot_role = 'ATA' THEN
      CASE WHEN COALESCE(p_goals, 0) >= COALESCE((p_settings->>'ata_artilheiro_threshold')::INTEGER, 2)
        THEN COALESCE((p_settings->>'ata_artilheiro_bonus')::NUMERIC, 2) ELSE 0 END
    ELSE 0 END, 2);
$$;

CREATE OR REPLACE FUNCTION public.apply_fantasy_slot_position_bonus(
  p_round_id UUID, p_is_test BOOLEAN DEFAULT false
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_snapshot JSONB; target_container UUID; target_version INTEGER;
BEGIN
  IF p_is_test THEN
    SELECT id, settings_snapshot, scoring_version INTO target_container, target_snapshot, target_version
    FROM public.fantasy_test_sessions WHERE round_id = p_round_id;
  ELSE
    SELECT id, settings_snapshot, scoring_version INTO target_container, target_snapshot, target_version
    FROM public.fantasy_rounds WHERE round_id = p_round_id;
  END IF;
  IF target_container IS NULL THEN RETURN true; END IF;
  target_version := COALESCE(target_version, (target_snapshot->>'scoring_version')::INTEGER, 5);

  IF p_is_test THEN
    WITH calculated AS (
      SELECT item.id, item.player_id, lineup.captain_player_id,
        public.calculate_fantasy_role_base_points_v5(target_snapshot, stat.goals, stat.assists,
          stat.wins, stat.draws, stat.losses, stat.goalkeeper_games, stat.goals_conceded, stat.own_goals) base_points,
        CASE WHEN target_version >= 7 THEN
          public.calculate_fantasy_position_bonus_v7(target_snapshot, item.slot_role,
            item.is_position_correct, stat.goals, stat.assists, stat.goalkeeper_games,
            stat.clean_sheets, stat.defensive_clean_games, stat.defensive_one_goal_games)
        ELSE public.calculate_fantasy_position_bonus_v5(target_snapshot, item.slot_role,
            item.is_position_correct, stat.goals, stat.assists, stat.goalkeeper_games,
            stat.clean_sheets, stat.defensive_clean_games, stat.defensive_one_goal_games) END position_bonus
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
        CASE WHEN target_version >= 7 THEN
          public.calculate_fantasy_position_bonus_v7(target_snapshot, item.slot_role,
            item.is_position_correct, stat.goals, stat.assists, stat.goalkeeper_games,
            stat.clean_sheets, stat.defensive_clean_games, stat.defensive_one_goal_games)
        ELSE public.calculate_fantasy_position_bonus_v5(target_snapshot, item.slot_role,
            item.is_position_correct, stat.goals, stat.assists, stat.goalkeeper_games,
            stat.clean_sheets, stat.defensive_clean_games, stat.defensive_one_goal_games) END position_bonus
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

REVOKE ALL ON FUNCTION public.calculate_fantasy_position_bonus_v7(JSONB,TEXT,BOOLEAN,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER,INTEGER) FROM PUBLIC, anon;

COMMIT;
