-- O formato pertence à convocação/rodada, não à configuração global mutável.
-- Rodadas históricas mantêm seu tamanho; uma redução depois de escalações
-- salvas altera apenas a partida física, nunca a escalação do Cartola.
BEGIN;

ALTER TABLE public.callups
  ADD COLUMN IF NOT EXISTS players_per_team integer,
  ADD COLUMN IF NOT EXISTS teams_per_round integer;
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS target_teams_per_round integer;

UPDATE public.callups callup
SET teams_per_round = COALESCE(
      (SELECT round_item.target_teams_per_round FROM public.rounds round_item WHERE round_item.id = callup.round_id),
      league.teams_per_round, 3),
    players_per_team = CASE
      WHEN callup.capacity % GREATEST(COALESCE(
        (SELECT round_item.target_teams_per_round FROM public.rounds round_item WHERE round_item.id = callup.round_id),
        league.teams_per_round, 3), 1) = 0
      THEN callup.capacity / GREATEST(COALESCE(
        (SELECT round_item.target_teams_per_round FROM public.rounds round_item WHERE round_item.id = callup.round_id),
        league.teams_per_round, 3), 1)
      ELSE COALESCE(
        (SELECT round_item.target_players_per_team FROM public.rounds round_item WHERE round_item.id = callup.round_id),
        league.players_per_team, 5)
    END
FROM public.leagues league
WHERE callup.league_id = league.id
  AND (callup.players_per_team IS NULL OR callup.teams_per_round IS NULL);

UPDATE public.rounds round_item
SET target_teams_per_round = COALESCE(
  (SELECT count(*)::integer FROM public.teams team WHERE team.round_id = round_item.id HAVING count(*) > 0),
  (SELECT callup.teams_per_round FROM public.callups callup WHERE callup.round_id = round_item.id LIMIT 1),
  league.teams_per_round,
  3
)
FROM public.leagues league
WHERE league.id = round_item.league_id AND round_item.target_teams_per_round IS NULL;

ALTER TABLE public.callups DROP CONSTRAINT IF EXISTS callups_players_per_team_range;
ALTER TABLE public.callups ADD CONSTRAINT callups_players_per_team_range
  CHECK (players_per_team IS NULL OR players_per_team BETWEEN 1 AND 10);
ALTER TABLE public.callups DROP CONSTRAINT IF EXISTS callups_teams_per_round_range;
ALTER TABLE public.callups ADD CONSTRAINT callups_teams_per_round_range
  CHECK (teams_per_round IS NULL OR teams_per_round BETWEEN 1 AND 10);
ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS rounds_target_teams_per_round_range;
ALTER TABLE public.rounds ADD CONSTRAINT rounds_target_teams_per_round_range
  CHECK (target_teams_per_round IS NULL OR target_teams_per_round BETWEEN 1 AND 10);

CREATE OR REPLACE FUNCTION public.capture_round_format()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE league_size integer; league_teams integer;
BEGIN
  SELECT players_per_team, teams_per_round INTO league_size, league_teams
  FROM public.leagues WHERE id = NEW.league_id;
  NEW.target_players_per_team := COALESCE(NEW.target_players_per_team, league_size, 5);
  NEW.target_teams_per_round := COALESCE(NEW.target_teams_per_round, league_teams, 3);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS rounds_capture_format ON public.rounds;
CREATE TRIGGER rounds_capture_format BEFORE INSERT ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.capture_round_format();

CREATE OR REPLACE FUNCTION public.sync_linked_callup_format()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_fantasy_round_id uuid;
BEGIN
  IF NEW.round_id IS NULL THEN RETURN NEW; END IF;
  UPDATE public.rounds round_item
  SET target_players_per_team = COALESCE(NEW.players_per_team, round_item.target_players_per_team),
      target_teams_per_round = COALESCE(NEW.teams_per_round, round_item.target_teams_per_round)
  WHERE round_item.id = NEW.round_id AND round_item.league_id = NEW.league_id
    AND round_item.status = 'draft';

  SELECT fantasy_round.id INTO target_fantasy_round_id
  FROM public.fantasy_rounds fantasy_round
  WHERE fantasy_round.round_id = NEW.round_id
    AND fantasy_round.market_status = 'open'
    AND NOT EXISTS (
      SELECT 1 FROM public.fantasy_lineups lineup
      WHERE lineup.fantasy_round_id = fantasy_round.id
    );
  IF target_fantasy_round_id IS NOT NULL THEN
    UPDATE public.fantasy_rounds fantasy_round
    SET settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::jsonb)
      || jsonb_build_object('players_per_team', COALESCE(NEW.players_per_team,
        (SELECT round_item.target_players_per_team FROM public.rounds round_item
         WHERE round_item.id = NEW.round_id)))
    WHERE fantasy_round.id = target_fantasy_round_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS callups_sync_linked_format ON public.callups;
CREATE TRIGGER callups_sync_linked_format
AFTER INSERT OR UPDATE OF round_id, players_per_team, teams_per_round ON public.callups
FOR EACH ROW EXECUTE FUNCTION public.sync_linked_callup_format();

CREATE OR REPLACE FUNCTION public.set_callup_format(
  p_callup_id uuid, p_players_per_team integer, p_teams_per_round integer
)
RETURNS TABLE (fantasy_lineup_size integer, fantasy_size_preserved boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_callup public.callups%ROWTYPE;
  confirmed_count integer; saved_lineups boolean := false;
  target_fantasy_round public.fantasy_rounds%ROWTYPE;
BEGIN
  IF p_players_per_team IS NULL OR p_teams_per_round IS NULL
    OR p_players_per_team NOT BETWEEN 5 AND 7 OR p_teams_per_round NOT BETWEEN 2 AND 6 THEN
    RAISE EXCEPTION 'Escolha 5 a 7 jogadores e 2 a 6 times.';
  END IF;
  SELECT * INTO target_callup FROM public.callups callup
  WHERE callup.id = p_callup_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_league_admin(target_callup.league_id)
    OR target_callup.status <> 'open' THEN
    RAISE EXCEPTION 'Somente o ADM pode alterar uma convocacao aberta desta pelada.';
  END IF;
  SELECT count(*) INTO confirmed_count FROM public.callup_entries entry
  WHERE entry.callup_id = p_callup_id AND entry.status = 'confirmed';
  IF confirmed_count > p_players_per_team * p_teams_per_round THEN
    RAISE EXCEPTION 'Ha % confirmados, acima das % vagas. Remova os excedentes antes.',
      confirmed_count, p_players_per_team * p_teams_per_round;
  END IF;
  IF target_callup.round_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.teams team WHERE team.round_id = target_callup.round_id)
    OR EXISTS (SELECT 1 FROM public.matches match_item WHERE match_item.round_id = target_callup.round_id)
    OR EXISTS (SELECT 1 FROM public.rounds round_item WHERE round_item.id = target_callup.round_id
      AND (round_item.status <> 'draft' OR round_item.preparation_stage <> 'prelist'))
  ) THEN
    RAISE EXCEPTION 'Os times desta rodada ja foram montados. O formato nao pode mais mudar.';
  END IF;

  SELECT * INTO target_fantasy_round FROM public.fantasy_rounds fantasy_round
  WHERE fantasy_round.round_id = target_callup.round_id FOR UPDATE;
  IF FOUND THEN
    SELECT EXISTS (SELECT 1 FROM public.fantasy_lineups lineup
      WHERE lineup.fantasy_round_id = target_fantasy_round.id) INTO saved_lineups;
    IF target_fantasy_round.market_status <> 'open' THEN
      RAISE EXCEPTION 'O Cartola desta rodada ja fechou; nao altere o formato.';
    END IF;
  END IF;

  UPDATE public.callups callup SET
    players_per_team = p_players_per_team,
    teams_per_round = p_teams_per_round,
    capacity = p_players_per_team * p_teams_per_round,
    updated_at = now()
  WHERE callup.id = p_callup_id;
  PERFORM public.normalize_callup_positions(p_callup_id);

  fantasy_lineup_size := CASE WHEN saved_lineups
    THEN COALESCE((target_fantasy_round.settings_snapshot->>'players_per_team')::integer,
      target_callup.players_per_team, p_players_per_team)
    ELSE p_players_per_team END;
  fantasy_size_preserved := saved_lineups AND fantasy_lineup_size <> p_players_per_team;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.set_callup_format(uuid,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_callup_format(uuid,integer,integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
