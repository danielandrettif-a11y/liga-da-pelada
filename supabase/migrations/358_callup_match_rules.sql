-- Cada convocação guarda suas próprias regras de partida. Zero gols representa
-- uma partida que termina apenas pelo tempo ou pela decisão manual do ADM.
BEGIN;

ALTER TABLE public.callups
  ADD COLUMN IF NOT EXISTS match_duration integer,
  ADD COLUMN IF NOT EXISTS goals_to_finish integer;

UPDATE public.callups callup
SET match_duration = COALESCE(callup.match_duration, league.match_duration, 7),
    goals_to_finish = COALESCE(callup.goals_to_finish, league.goals_to_finish, 2)
FROM public.leagues league
WHERE league.id = callup.league_id
  AND (callup.match_duration IS NULL OR callup.goals_to_finish IS NULL);

UPDATE public.callups
SET match_duration = COALESCE(match_duration, 7),
    goals_to_finish = COALESCE(goals_to_finish, 2)
WHERE match_duration IS NULL OR goals_to_finish IS NULL;

ALTER TABLE public.callups
  ALTER COLUMN match_duration DROP DEFAULT,
  ALTER COLUMN match_duration SET NOT NULL,
  ALTER COLUMN goals_to_finish DROP DEFAULT,
  ALTER COLUMN goals_to_finish SET NOT NULL;

ALTER TABLE public.callups DROP CONSTRAINT IF EXISTS callups_match_duration_range;
ALTER TABLE public.callups ADD CONSTRAINT callups_match_duration_range
  CHECK (match_duration BETWEEN 1 AND 90);
ALTER TABLE public.callups DROP CONSTRAINT IF EXISTS callups_goals_to_finish_range;
ALTER TABLE public.callups ADD CONSTRAINT callups_goals_to_finish_range
  CHECK (goals_to_finish BETWEEN 0 AND 20);

CREATE OR REPLACE FUNCTION public.snapshot_callup_match_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  selected_league public.leagues%ROWTYPE;
BEGIN
  SELECT * INTO selected_league
  FROM public.leagues
  WHERE id = NEW.league_id;

  NEW.match_duration := COALESCE(NEW.match_duration, selected_league.match_duration, 7);
  NEW.goals_to_finish := COALESCE(NEW.goals_to_finish, selected_league.goals_to_finish, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_callup_match_rules_on_insert ON public.callups;
CREATE TRIGGER snapshot_callup_match_rules_on_insert
BEFORE INSERT ON public.callups
FOR EACH ROW EXECUTE FUNCTION public.snapshot_callup_match_rules();

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS goals_to_finish integer;

UPDATE public.matches match_item
SET goals_to_finish = COALESCE(
  (
    SELECT callup.goals_to_finish
    FROM public.callups callup
    WHERE callup.round_id = match_item.round_id
    ORDER BY callup.created_at DESC
    LIMIT 1
  ),
  league.goals_to_finish,
  2
)
FROM public.rounds round_item
JOIN public.leagues league ON league.id = round_item.league_id
WHERE round_item.id = match_item.round_id
  AND match_item.goals_to_finish IS NULL;

UPDATE public.matches
SET goals_to_finish = 2
WHERE goals_to_finish IS NULL;

ALTER TABLE public.matches
  ALTER COLUMN goals_to_finish SET DEFAULT 2,
  ALTER COLUMN goals_to_finish SET NOT NULL;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_goals_to_finish_range;
ALTER TABLE public.matches ADD CONSTRAINT matches_goals_to_finish_range
  CHECK (goals_to_finish BETWEEN 0 AND 20);

CREATE OR REPLACE FUNCTION public.snapshot_match_callup_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  callup_duration integer;
  callup_goal_target integer;
  league_duration integer;
  league_goal_target integer;
BEGIN
  SELECT callup.match_duration, callup.goals_to_finish,
         league.match_duration, league.goals_to_finish
  INTO callup_duration, callup_goal_target, league_duration, league_goal_target
  FROM public.rounds round_item
  JOIN public.leagues league ON league.id = round_item.league_id
  LEFT JOIN LATERAL (
    SELECT selected_callup.match_duration, selected_callup.goals_to_finish
    FROM public.callups selected_callup
    WHERE selected_callup.round_id = round_item.id
    ORDER BY selected_callup.created_at DESC
    LIMIT 1
  ) callup ON true
  WHERE round_item.id = NEW.round_id;

  NEW.duration_seconds := COALESCE(callup_duration, league_duration, 7) * 60;
  NEW.goals_to_finish := COALESCE(callup_goal_target, league_goal_target, NEW.goals_to_finish, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_match_callup_rules_on_insert ON public.matches;
CREATE TRIGGER snapshot_match_callup_rules_on_insert
BEFORE INSERT ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.snapshot_match_callup_rules();

CREATE OR REPLACE FUNCTION public.update_callup_match_rules(
  p_callup_id uuid,
  p_match_duration integer,
  p_goals_to_finish integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_callup public.callups%ROWTYPE;
BEGIN
  IF p_match_duration NOT BETWEEN 1 AND 90 THEN
    RAISE EXCEPTION 'A duracao precisa estar entre 1 e 90 minutos.';
  END IF;
  IF p_goals_to_finish NOT BETWEEN 0 AND 20 THEN
    RAISE EXCEPTION 'A meta precisa estar entre 0 e 20 gols.';
  END IF;

  SELECT * INTO selected_callup
  FROM public.callups
  WHERE id = p_callup_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.is_league_admin(selected_callup.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF selected_callup.status NOT IN ('open', 'locked', 'converted') THEN
    RAISE EXCEPTION 'A convocacao nao permite mais alteracoes.';
  END IF;
  IF selected_callup.round_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.matches match_item
    WHERE match_item.round_id = selected_callup.round_id
      AND (
        match_item.started_at IS NOT NULL
        OR match_item.status IN ('live', 'in_progress', 'finished')
      )
  ) THEN
    RAISE EXCEPTION 'As configuracoes foram travadas porque a primeira partida ja comecou.';
  END IF;

  UPDATE public.callups
  SET match_duration = p_match_duration,
      goals_to_finish = p_goals_to_finish,
      updated_at = now()
  WHERE id = selected_callup.id;

  IF selected_callup.round_id IS NOT NULL THEN
    UPDATE public.matches
    SET duration_seconds = p_match_duration * 60,
        goals_to_finish = p_goals_to_finish
    WHERE round_id = selected_callup.round_id
      AND started_at IS NULL
      AND status = 'pending';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_callup_match_rules(uuid, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_callup_match_rules(uuid, integer, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
