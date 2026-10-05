-- A função exibida atualmente no cadastro passa a ser a autoridade da Ranked.
-- O perfil congelado da rodada continua intacto para auditoria e para o Cartola.

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_active_ranked_points_for_current_profile(
  p_player_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.player_round_stats stats SET
    points = CASE WHEN EXISTS (
      SELECT 1
      FROM public.player_round_stat_overrides override_item
      WHERE override_item.round_id = stats.round_id
        AND override_item.player_id = stats.player_id
        AND override_item.override_type = 'zero_points'
    ) THEN 0 ELSE round(
      GREATEST(stats.goals - COALESCE(stats.goalkeeper_goals, 0), 0)
        * CASE WHEN COALESCE(player.player_profile, stats.player_profile_locked) = 'defensive' THEN 5 ELSE 4 END
      + GREATEST(stats.assists - COALESCE(stats.goalkeeper_assists, 0), 0)
        * CASE WHEN COALESCE(player.player_profile, stats.player_profile_locked) = 'defensive' THEN 3 ELSE 2.5 END
      + GREATEST(stats.team_goals_conceded - COALESCE(stats.goals_conceded, 0), 0) * -0.5
      + CASE WHEN COALESCE(player.player_profile, stats.player_profile_locked) = 'defensive'
          THEN COALESCE(stats.ranking_defensive_clean_games, 0) * 2
            + COALESCE(stats.ranking_defensive_one_goal_games, 0) * 1
          ELSE 0
        END
      + GREATEST(stats.own_goals - COALESCE(stats.goalkeeper_own_goals, 0), 0) * -3
      + COALESCE(stats.goalkeeper_games, 0) * 1
      + COALESCE(stats.goalkeeper_goals, 0) * 5
      + COALESCE(stats.goalkeeper_assists, 0) * 3
      + COALESCE(stats.goals_conceded, 0) * -0.5
      + COALESCE(stats.clean_sheets, 0) * 4
      + GREATEST(LEAST(
          COALESCE(stats.goalkeeper_games, 0) - COALESCE(stats.clean_sheets, 0),
          2 * (COALESCE(stats.goalkeeper_games, 0) - COALESCE(stats.clean_sheets, 0))
            - COALESCE(stats.goals_conceded, 0)
        ), 0) * 2
      + COALESCE(stats.goalkeeper_own_goals, 0) * -3
    , 2) END,
    ranking_role_weights = CASE
      WHEN stats.games > 0 AND player.is_competitive_profile_complete = true THEN
        jsonb_build_array(jsonb_build_object(
          'role', CASE WHEN COALESCE(player.player_profile, stats.player_profile_locked) = 'defensive' THEN 'DEF' ELSE 'ATA' END,
          'overall', 0,
          'weight', 1
        ))
      ELSE '[]'::JSONB
    END,
    ranking_position_bonus = 0
  FROM public.players player, public.rounds round_item, public.seasons season
  WHERE player.id = stats.player_id
    AND round_item.id = stats.round_id
    AND season.id = round_item.season_id
    AND season.status = 'active'
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished'
    AND (p_player_id IS NULL OR stats.player_id = p_player_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_active_ranked_points_for_current_profile(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_active_ranked_points_for_current_profile(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sync_ranked_points_after_player_profile_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  PERFORM public.refresh_active_ranked_points_for_current_profile(NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_ranked_points_after_player_profile_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_ranked_points_after_player_profile_change ON public.players;
CREATE TRIGGER sync_ranked_points_after_player_profile_change
AFTER UPDATE OF player_profile ON public.players
FOR EACH ROW
WHEN (OLD.player_profile IS DISTINCT FROM NEW.player_profile)
EXECUTE FUNCTION public.sync_ranked_points_after_player_profile_change();

-- Recalcula de uma vez todas as rodadas oficiais encerradas da temporada ativa.
SELECT public.refresh_active_ranked_points_for_current_profile(NULL);

NOTIFY pgrst, 'reload schema';

COMMIT;
