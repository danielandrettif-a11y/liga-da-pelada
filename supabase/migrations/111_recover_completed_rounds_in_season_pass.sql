-- Algumas rodadas históricas foram pontuadas, mas permaneceram com o status
-- interno do mercado desatualizado. O Passe deve seguir o encerramento oficial
-- da rodada e a escalação salva, não esse status auxiliar.

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
  progress_total INTEGER;
  shop_bonus_total INTEGER;
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

    FOR round_row IN
      SELECT
        round_item.id AS round_id,
        round_item.number AS round_number,
        round_item.date AS round_date,
        COALESCE(stat.games, 0) AS games,
        EXISTS (
          SELECT 1
          FROM public.fantasy_lineups lineup
          WHERE lineup.fantasy_round_id = fantasy_round.id
            AND lineup.user_id = profile_row.user_id
            AND (
              -- Locked/scored já passou pela validação do tamanho congelado.
              lineup.status IN ('locked', 'scored')
              -- Corrige o legado de uma escalação completa marcada como missed.
              OR (
                lineup.status = 'missed'
                AND lineup.captain_player_id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.fantasy_lineup_players captain_item
                  WHERE captain_item.lineup_id = lineup.id
                    AND captain_item.player_id = lineup.captain_player_id
                )
                AND (
                  (
                    COALESCE(fantasy_round.settings_snapshot, '{}'::jsonb) ? 'players_per_team'
                    AND (
                      SELECT count(*)
                      FROM public.fantasy_lineup_players item
                      WHERE item.lineup_id = lineup.id
                    ) = (fantasy_round.settings_snapshot->>'players_per_team')::INTEGER
                  )
                  OR (
                    NOT (COALESCE(fantasy_round.settings_snapshot, '{}'::jsonb) ? 'players_per_team')
                    AND (
                      SELECT count(*)
                      FROM public.fantasy_lineup_players item
                      WHERE item.lineup_id = lineup.id
                    ) >= 5
                  )
                )
              )
            )
        ) AS has_valid_lineup
      FROM public.fantasy_rounds fantasy_round
      JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
      LEFT JOIN public.player_round_stats stat
        ON stat.round_id = round_item.id AND stat.player_id = profile_row.player_id
      WHERE fantasy_round.fantasy_season_id = p_fantasy_season_id
        AND round_item.status = 'finished'
        AND round_item.round_type = 'official'
      ORDER BY round_item.date, round_item.number
    LOOP
      IF round_row.has_valid_lineup THEN
        lineup_total := lineup_total + 1;
        active_weeks_total := active_weeks_total + 1;
        INSERT INTO public.fantasy_season_pass_events (
          fantasy_season_id, user_id, source_round_id, event_type, houses, metadata
        ) VALUES (
          p_fantasy_season_id, profile_row.user_id, round_row.round_id, 'valid_lineup', 4,
          jsonb_build_object('roundNumber', round_row.round_number, 'roundDate', round_row.round_date)
        );
      END IF;

      IF mode_value = 'athlete' AND round_row.games > 0 THEN
        participation_total := participation_total + 1;
      END IF;
    END LOOP;

    progress_total := lineup_total * 4;
    shop_bonus_total := CASE
      WHEN mode_value = 'athlete' THEN floor(participation_total / 5.0)::INTEGER
      ELSE floor(lineup_total / 5.0)::INTEGER
    END;

    INSERT INTO public.fantasy_season_passes (
      fantasy_season_id, user_id, progression_mode, progress, total_progress_points,
      shop_bonus_points, participations, valid_lineups, active_weeks,
      goals_assists_remainder, calculated_at, updated_at
    ) VALUES (
      p_fantasy_season_id, profile_row.user_id, mode_value, LEAST(progress_total, 40), progress_total,
      shop_bonus_total, participation_total, lineup_total, active_weeks_total,
      0, now(), now()
    );
  END LOOP;

  RETURN true;
END;
$$;

-- Reprocessa de imediato todas as rodadas oficiais encerradas.
SELECT public.recalculate_fantasy_season_pass(id) FROM public.fantasy_seasons;

GRANT EXECUTE ON FUNCTION public.recalculate_fantasy_season_pass(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
