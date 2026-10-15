-- Player IDs are global. A reference from a callup, round, team, match,
-- payment, goalkeeper scout or ranking stat may only point to an enrolled player
-- in that object's league. This protects direct table writes as well as RPCs;
-- historical rows are not rewritten.
CREATE OR REPLACE FUNCTION public.validate_league_participant_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_league_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'callup_entries' THEN
    SELECT callup.league_id INTO target_league_id
    FROM public.callups callup WHERE callup.id = NEW.callup_id;
  ELSIF TG_TABLE_NAME IN ('round_players', 'round_payments', 'player_round_stats') THEN
    SELECT round_item.league_id INTO target_league_id
    FROM public.rounds round_item WHERE round_item.id = NEW.round_id;
    IF TG_TABLE_NAME = 'player_round_stats' THEN
      IF NEW.league_id IS DISTINCT FROM target_league_id THEN
        RAISE EXCEPTION 'Estatistica vinculada a liga diferente da rodada.';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'team_players' THEN
    SELECT round_item.league_id INTO target_league_id
    FROM public.teams team
    JOIN public.rounds round_item ON round_item.id = team.round_id
    WHERE team.id = NEW.team_id;
  ELSIF TG_TABLE_NAME IN ('match_goalkeepers', 'match_players', 'match_events') THEN
    SELECT round_item.league_id INTO target_league_id
    FROM public.matches match_item
    JOIN public.rounds round_item ON round_item.id = match_item.round_id
    WHERE match_item.id = NEW.match_id;
    IF NOT EXISTS (
      SELECT 1 FROM public.teams team
      JOIN public.matches match_item ON match_item.round_id = team.round_id
      WHERE team.id = NEW.team_id AND match_item.id = NEW.match_id
        AND NEW.team_id IN (match_item.team_a_id, match_item.team_b_id)
    ) THEN
      RAISE EXCEPTION 'Time fora da partida.';
    END IF;
    IF TG_TABLE_NAME = 'match_players' THEN
      IF NEW.original_team_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.teams original_team
        JOIN public.matches match_item ON match_item.round_id = original_team.round_id
        WHERE original_team.id = NEW.original_team_id
          AND match_item.id = NEW.match_id
      ) THEN
        RAISE EXCEPTION 'Time de origem fora da rodada da partida.';
      END IF;
    ELSIF TG_TABLE_NAME = 'match_events' THEN
      IF NEW.assist_player_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.league_members member
        WHERE member.league_id = target_league_id
          AND member.player_id = NEW.assist_player_id
      ) THEN
        RAISE EXCEPTION 'Assistente sem vinculo com esta pelada.';
      END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Tabela de participante nao suportada: %', TG_TABLE_NAME;
  END IF;

  IF target_league_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.league_members member
    WHERE member.league_id = target_league_id
      AND member.player_id = NEW.player_id
  ) THEN
    RAISE EXCEPTION 'Jogador sem vinculo com a pelada desta convocacao, rodada ou time.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS callup_entries_validate_league_participant ON public.callup_entries;
CREATE TRIGGER callup_entries_validate_league_participant
BEFORE INSERT OR UPDATE OF callup_id, player_id ON public.callup_entries
FOR EACH ROW EXECUTE FUNCTION public.validate_league_participant_ref();

DROP TRIGGER IF EXISTS round_players_validate_league_participant ON public.round_players;
CREATE TRIGGER round_players_validate_league_participant
BEFORE INSERT OR UPDATE OF round_id, player_id ON public.round_players
FOR EACH ROW EXECUTE FUNCTION public.validate_league_participant_ref();

DROP TRIGGER IF EXISTS team_players_validate_league_participant ON public.team_players;
CREATE TRIGGER team_players_validate_league_participant
BEFORE INSERT OR UPDATE OF team_id, player_id ON public.team_players
FOR EACH ROW EXECUTE FUNCTION public.validate_league_participant_ref();

DROP TRIGGER IF EXISTS round_payments_validate_league_participant ON public.round_payments;
CREATE TRIGGER round_payments_validate_league_participant
BEFORE INSERT OR UPDATE OF round_id, player_id ON public.round_payments
FOR EACH ROW EXECUTE FUNCTION public.validate_league_participant_ref();

DROP TRIGGER IF EXISTS player_round_stats_validate_league_participant ON public.player_round_stats;
CREATE TRIGGER player_round_stats_validate_league_participant
BEFORE INSERT OR UPDATE OF round_id, league_id, player_id ON public.player_round_stats
FOR EACH ROW EXECUTE FUNCTION public.validate_league_participant_ref();

DROP TRIGGER IF EXISTS match_goalkeepers_validate_league_participant ON public.match_goalkeepers;
CREATE TRIGGER match_goalkeepers_validate_league_participant
BEFORE INSERT OR UPDATE OF match_id, team_id, player_id ON public.match_goalkeepers
FOR EACH ROW EXECUTE FUNCTION public.validate_league_participant_ref();

DROP TRIGGER IF EXISTS match_players_validate_league_participant ON public.match_players;
CREATE TRIGGER match_players_validate_league_participant
BEFORE INSERT OR UPDATE OF match_id, team_id, original_team_id, player_id ON public.match_players
FOR EACH ROW EXECUTE FUNCTION public.validate_league_participant_ref();

DROP TRIGGER IF EXISTS match_events_validate_league_participant ON public.match_events;
CREATE TRIGGER match_events_validate_league_participant
BEFORE INSERT OR UPDATE OF match_id, team_id, player_id, assist_player_id ON public.match_events
FOR EACH ROW EXECUTE FUNCTION public.validate_league_participant_ref();

REVOKE ALL ON FUNCTION public.validate_league_participant_ref() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
