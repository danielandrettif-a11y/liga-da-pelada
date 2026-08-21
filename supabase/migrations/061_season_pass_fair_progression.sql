-- Passe BQ V1.1: uma escalação válida mantém a semana ativa mesmo sem presença.
-- Participações continuam representando somente quem entrou em campo.

ALTER TABLE public.fantasy_season_passes
  ADD COLUMN IF NOT EXISTS active_weeks INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.fantasy_season_pass_events
  DROP CONSTRAINT IF EXISTS fantasy_season_pass_events_event_type_check;

ALTER TABLE public.fantasy_season_pass_events
  ADD CONSTRAINT fantasy_season_pass_events_event_type_check CHECK (event_type IN (
    'participation', 'valid_lineup', 'full_round', 'remote_full_round',
    'goals_assists_cycle', 'participation_streak', 'active_week_streak',
    'lineup_streak'
  ));

CREATE OR REPLACE FUNCTION public.recalculate_fantasy_season_pass(p_fantasy_season_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row RECORD;
  round_row RECORD;
  mode_value TEXT;
  participation_total INTEGER;
  lineup_total INTEGER;
  active_weeks_total INTEGER;
  goals_assists_total INTEGER;
  progress_total INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_seasons WHERE id = p_fantasy_season_id) THEN
    RETURN false;
  END IF;

  DELETE FROM public.fantasy_season_pass_events
  WHERE fantasy_season_id = p_fantasy_season_id;
  DELETE FROM public.fantasy_season_passes
  WHERE fantasy_season_id = p_fantasy_season_id;

  FOR profile_row IN
    SELECT account.user_id, account.player_id, player.member_category
    FROM public.account_profiles account
    JOIN public.players player ON player.id = account.player_id
  LOOP
    mode_value := CASE WHEN profile_row.member_category IN ('wag', 'supporter') THEN 'community' ELSE 'athlete' END;
    participation_total := 0;
    lineup_total := 0;
    active_weeks_total := 0;
    goals_assists_total := 0;

    FOR round_row IN
      SELECT
        round_item.id AS round_id,
        round_item.number AS round_number,
        round_item.date AS round_date,
        COALESCE(stat.games, 0) AS games,
        COALESCE(stat.goals, 0) AS goals,
        COALESCE(stat.assists, 0) AS assists,
        EXISTS (
          SELECT 1
          FROM public.fantasy_lineups lineup
          WHERE lineup.fantasy_round_id = fantasy_round.id
            AND lineup.user_id = profile_row.user_id
            AND lineup.status IN ('locked', 'scored')
            AND (SELECT count(*) FROM public.fantasy_lineup_players item WHERE item.lineup_id = lineup.id) = 5
        ) AS has_valid_lineup
      FROM public.fantasy_rounds fantasy_round
      JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
      LEFT JOIN public.player_round_stats stat
        ON stat.round_id = round_item.id AND stat.player_id = profile_row.player_id
      WHERE fantasy_round.fantasy_season_id = p_fantasy_season_id
        AND fantasy_round.market_status = 'finished'
        AND round_item.status = 'finished'
        AND round_item.round_type = 'official'
      ORDER BY round_item.date, round_item.number
    LOOP
      IF mode_value = 'athlete' THEN
        IF round_row.has_valid_lineup THEN
          lineup_total := lineup_total + 1;
          INSERT INTO public.fantasy_season_pass_events (
            fantasy_season_id, user_id, source_round_id, event_type, houses, metadata
          ) VALUES (
            p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'valid_lineup', 1,
            jsonb_build_object('roundNumber', round_row.round_number, 'roundDate', round_row.round_date)
          );
        END IF;

        IF round_row.games > 0 OR round_row.has_valid_lineup THEN
          active_weeks_total := active_weeks_total + 1;
        END IF;

        IF round_row.games > 0 THEN
          participation_total := participation_total + 1;
          INSERT INTO public.fantasy_season_pass_events (
            fantasy_season_id, user_id, source_round_id, event_type, houses, metadata
          ) VALUES (
            p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'participation', 2,
            jsonb_build_object('roundNumber', round_row.round_number, 'roundDate', round_row.round_date)
          );

          IF round_row.has_valid_lineup THEN
            INSERT INTO public.fantasy_season_pass_events (
              fantasy_season_id, user_id, source_round_id, event_type, houses
            ) VALUES (p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'full_round', 1);
          END IF;

          -- Bônus de gol/assistência permanece exclusivo de quem participou da pelada.
          goals_assists_total := goals_assists_total + round_row.goals + round_row.assists;
          IF goals_assists_total >= 5 THEN
            INSERT INTO public.fantasy_season_pass_events (
              fantasy_season_id, user_id, source_round_id, event_type, houses, metadata
            ) VALUES (
              p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'goals_assists_cycle', 1,
              jsonb_build_object('goals', round_row.goals, 'assists', round_row.assists)
            );
            goals_assists_total := 0;
          END IF;
        ELSIF round_row.has_valid_lineup THEN
          -- Sem presença, mas com escalação válida: mantém os +4 totais da semana.
          INSERT INTO public.fantasy_season_pass_events (
            fantasy_season_id, user_id, source_round_id, event_type, houses
          ) VALUES (p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'remote_full_round', 3);
        END IF;

        IF active_weeks_total = 9 THEN
          INSERT INTO public.fantasy_season_pass_events (
            fantasy_season_id, user_id, source_round_id, event_type, houses
          ) VALUES (p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'active_week_streak', 4);
        END IF;
      ELSIF round_row.has_valid_lineup THEN
        lineup_total := lineup_total + 1;
        active_weeks_total := active_weeks_total + 1;
        INSERT INTO public.fantasy_season_pass_events (
          fantasy_season_id, user_id, source_round_id, event_type, houses, metadata
        ) VALUES (
          p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'valid_lineup', 4,
          jsonb_build_object('roundNumber', round_row.round_number, 'roundDate', round_row.round_date)
        );
        IF active_weeks_total = 9 THEN
          INSERT INTO public.fantasy_season_pass_events (
            fantasy_season_id, user_id, source_round_id, event_type, houses
          ) VALUES (p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'lineup_streak', 4);
        END IF;
      END IF;
    END LOOP;

    SELECT COALESCE(sum(houses), 0)::INTEGER INTO progress_total
    FROM public.fantasy_season_pass_events
    WHERE fantasy_season_id = p_fantasy_season_id AND user_id = profile_row.user_id;

    INSERT INTO public.fantasy_season_passes (
      fantasy_season_id, user_id, progression_mode, progress, participations,
      valid_lineups, active_weeks, goals_assists_remainder, calculated_at, updated_at
    ) VALUES (
      p_fantasy_season_id, profile_row.user_id, mode_value, LEAST(progress_total, 40), participation_total,
      lineup_total, active_weeks_total, LEAST(goals_assists_total, 4), now(), now()
    );
  END LOOP;

  RETURN true;
END;
$$;

SELECT public.recalculate_fantasy_season_pass(id) FROM public.fantasy_seasons;

NOTIFY pgrst, 'reload schema';
