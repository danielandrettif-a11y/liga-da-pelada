-- A troca de goleiro precisa preservar quem estava no gol em cada lance.
-- match_goalkeepers continua como registro inicial/legado, sem reescrever o
-- histórico das partidas anteriores a esta migration.
BEGIN;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS fixed_goalkeeper_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_team_fixed_goalkeeper()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.fixed_goalkeeper_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.team_players item
    WHERE item.team_id = NEW.id AND item.player_id = NEW.fixed_goalkeeper_player_id
  ) THEN
    RAISE EXCEPTION 'O goleiro fixo precisa pertencer ao time desta rodada.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teams_validate_fixed_goalkeeper ON public.teams;
CREATE TRIGGER teams_validate_fixed_goalkeeper
BEFORE UPDATE OF fixed_goalkeeper_player_id ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.validate_team_fixed_goalkeeper();

CREATE OR REPLACE FUNCTION public.clear_team_fixed_goalkeeper_on_roster_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.team_id = NEW.team_id AND OLD.player_id = NEW.player_id THEN
      RETURN NEW;
    END IF;
  END IF;
  UPDATE public.teams
  SET fixed_goalkeeper_player_id = NULL
  WHERE id = OLD.team_id AND fixed_goalkeeper_player_id = OLD.player_id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS team_players_clear_fixed_goalkeeper ON public.team_players;
CREATE TRIGGER team_players_clear_fixed_goalkeeper
AFTER DELETE OR UPDATE OF team_id, player_id ON public.team_players
FOR EACH ROW EXECUTE FUNCTION public.clear_team_fixed_goalkeeper_on_roster_change();

CREATE TABLE IF NOT EXISTS public.match_goalkeeper_stints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  entered_elapsed_seconds integer NOT NULL DEFAULT 0 CHECK (entered_elapsed_seconds >= 0),
  left_elapsed_seconds integer CHECK (left_elapsed_seconds IS NULL OR left_elapsed_seconds >= entered_elapsed_seconds),
  selected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  selected_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS match_goalkeeper_stints_one_active_team
  ON public.match_goalkeeper_stints(match_id, team_id)
  WHERE left_elapsed_seconds IS NULL;
CREATE INDEX IF NOT EXISTS match_goalkeeper_stints_match_player
  ON public.match_goalkeeper_stints(match_id, player_id, entered_elapsed_seconds);

CREATE OR REPLACE FUNCTION public.validate_match_goalkeeper_stint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.matches match_item
    JOIN public.match_players participant
      ON participant.match_id = match_item.id
     AND participant.team_id = NEW.team_id
     AND participant.player_id = NEW.player_id
    WHERE match_item.id = NEW.match_id
      AND NEW.team_id IN (match_item.team_a_id, match_item.team_b_id)
  ) THEN
    RAISE EXCEPTION 'O goleiro precisa participar do time nesta partida.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_goalkeeper_stints_validate_participant ON public.match_goalkeeper_stints;
CREATE TRIGGER match_goalkeeper_stints_validate_participant
BEFORE INSERT OR UPDATE OF match_id, team_id, player_id ON public.match_goalkeeper_stints
FOR EACH ROW EXECUTE FUNCTION public.validate_match_goalkeeper_stint();

CREATE OR REPLACE FUNCTION public.protect_active_match_goalkeeper()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active AND EXISTS (
    SELECT 1 FROM public.match_goalkeeper_stints stint
    JOIN public.matches match_item ON match_item.id = stint.match_id
    WHERE stint.match_id = OLD.match_id
      AND stint.player_id = OLD.player_id
      AND stint.team_id = OLD.team_id
      AND stint.left_elapsed_seconds IS NULL
      AND match_item.status = 'live'
  ) THEN
    RAISE EXCEPTION 'Troque o goleiro antes de substituir este jogador.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS match_players_protect_active_goalkeeper ON public.match_players;
CREATE TRIGGER match_players_protect_active_goalkeeper
BEFORE UPDATE OF is_active ON public.match_players
FOR EACH ROW EXECUTE FUNCTION public.protect_active_match_goalkeeper();

ALTER TABLE public.match_goalkeeper_stints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS match_goalkeeper_stints_read ON public.match_goalkeeper_stints;
CREATE POLICY match_goalkeeper_stints_read ON public.match_goalkeeper_stints
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.matches match_item
    JOIN public.rounds round_item ON round_item.id = match_item.round_id
    WHERE match_item.id = match_id
      AND public.is_league_member(round_item.league_id)
  )
);
DROP POLICY IF EXISTS match_goalkeeper_stints_admin ON public.match_goalkeeper_stints;
CREATE POLICY match_goalkeeper_stints_admin ON public.match_goalkeeper_stints
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.matches match_item
    JOIN public.rounds round_item ON round_item.id = match_item.round_id
    WHERE match_item.id = match_id
      AND public.is_league_admin(round_item.league_id)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.matches match_item
    JOIN public.rounds round_item ON round_item.id = match_item.round_id
    WHERE match_item.id = match_id
      AND public.is_league_admin(round_item.league_id)
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_goalkeeper_stints TO authenticated;
GRANT ALL ON public.match_goalkeeper_stints TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'match_goalkeeper_stints'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_goalkeeper_stints;
  END IF;
END;
$$;

ALTER TABLE public.match_events
  ADD COLUMN IF NOT EXISTS goalkeeper_a_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS goalkeeper_b_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL;

-- A RPC de gol já bloqueia a linha da partida. O trigger captura o goleiro
-- ativo no mesmo instante transacional; a precisão não depende de arredondar
-- gol e troca para o mesmo segundo do cronômetro.
CREATE OR REPLACE FUNCTION public.snapshot_goalkeepers_on_goal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_match public.matches%ROWTYPE;
BEGIN
  IF NEW.event_type <> 'goal' THEN RETURN NEW; END IF;
  SELECT * INTO current_match FROM public.matches WHERE id = NEW.match_id;
  IF current_match.status = 'live' THEN
    SELECT item.player_id INTO NEW.goalkeeper_a_player_id
    FROM public.match_goalkeeper_stints item
    WHERE item.match_id = NEW.match_id AND item.team_id = current_match.team_a_id
      AND item.left_elapsed_seconds IS NULL
    LIMIT 1;
    SELECT item.player_id INTO NEW.goalkeeper_b_player_id
    FROM public.match_goalkeeper_stints item
    WHERE item.match_id = NEW.match_id AND item.team_id = current_match.team_b_id
      AND item.left_elapsed_seconds IS NULL
    LIMIT 1;
  ELSE
    SELECT item.player_id INTO NEW.goalkeeper_a_player_id
    FROM public.match_goalkeeper_stints item
    WHERE item.match_id = NEW.match_id AND item.team_id = current_match.team_a_id
      AND item.entered_elapsed_seconds <= COALESCE(NEW.elapsed_seconds, 0)
      AND (item.left_elapsed_seconds IS NULL OR item.left_elapsed_seconds > COALESCE(NEW.elapsed_seconds, 0))
    ORDER BY item.entered_elapsed_seconds DESC, item.selected_at DESC LIMIT 1;
    SELECT item.player_id INTO NEW.goalkeeper_b_player_id
    FROM public.match_goalkeeper_stints item
    WHERE item.match_id = NEW.match_id AND item.team_id = current_match.team_b_id
      AND item.entered_elapsed_seconds <= COALESCE(NEW.elapsed_seconds, 0)
      AND (item.left_elapsed_seconds IS NULL OR item.left_elapsed_seconds > COALESCE(NEW.elapsed_seconds, 0))
    ORDER BY item.entered_elapsed_seconds DESC, item.selected_at DESC LIMIT 1;
  END IF;
  IF NEW.goalkeeper_a_player_id IS NULL THEN
    SELECT player_id INTO NEW.goalkeeper_a_player_id FROM public.match_goalkeepers
    WHERE match_id = NEW.match_id AND team_id = current_match.team_a_id;
  END IF;
  IF NEW.goalkeeper_b_player_id IS NULL THEN
    SELECT player_id INTO NEW.goalkeeper_b_player_id FROM public.match_goalkeepers
    WHERE match_id = NEW.match_id AND team_id = current_match.team_b_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS match_events_snapshot_goalkeepers ON public.match_events;
CREATE TRIGGER match_events_snapshot_goalkeepers
BEFORE INSERT ON public.match_events
FOR EACH ROW EXECUTE FUNCTION public.snapshot_goalkeepers_on_goal();

CREATE OR REPLACE FUNCTION public.change_match_goalkeeper(
  p_match_id uuid,
  p_team_id uuid,
  p_player_id uuid,
  p_elapsed_seconds integer DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_match public.matches%ROWTYPE;
DECLARE current_stint public.match_goalkeeper_stints%ROWTYPE;
DECLARE target_league_id uuid;
DECLARE elapsed integer;
BEGIN
  SELECT * INTO current_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR current_match.status <> 'live' THEN
    RAISE EXCEPTION 'A partida não está em andamento.';
  END IF;
  SELECT league_id INTO target_league_id FROM public.rounds WHERE id = current_match.round_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF p_team_id NOT IN (current_match.team_a_id, current_match.team_b_id) THEN
    RAISE EXCEPTION 'Time fora desta partida.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.match_players participant
    WHERE participant.match_id = p_match_id
      AND participant.team_id = p_team_id
      AND participant.player_id = p_player_id
      AND participant.is_active
  ) THEN
    RAISE EXCEPTION 'O novo goleiro precisa estar em campo pelo time.';
  END IF;

  -- O segundo passado pelo navegador é apenas informativo. O servidor é a
  -- autoridade do tempo, inclusive após pausa ou reinício do cronômetro.
  elapsed := GREATEST(0,
    COALESCE(current_match.eligibility_elapsed_offset_seconds, 0)
    + COALESCE(current_match.timer_accumulated_seconds, 0)
    + CASE WHEN current_match.timer_started_at IS NULL THEN 0 ELSE
      GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - current_match.timer_started_at)))::integer)
    END
  );

  SELECT * INTO current_stint FROM public.match_goalkeeper_stints
  WHERE match_id = p_match_id AND team_id = p_team_id AND left_elapsed_seconds IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.match_goalkeeper_stints(match_id, team_id, player_id, entered_elapsed_seconds, left_elapsed_seconds)
    SELECT p_match_id, p_team_id, legacy.player_id, 0, elapsed
    FROM public.match_goalkeepers legacy
    WHERE legacy.match_id = p_match_id AND legacy.team_id = p_team_id
    RETURNING * INTO current_stint;
    IF NOT FOUND THEN RAISE EXCEPTION 'Goleiro inicial não encontrado.'; END IF;
  ELSE
    IF current_stint.player_id = p_player_id THEN
      RETURN json_build_object('player_id', p_player_id, 'entered_elapsed_seconds', current_stint.entered_elapsed_seconds);
    END IF;
    UPDATE public.match_goalkeeper_stints
    SET left_elapsed_seconds = GREATEST(elapsed, current_stint.entered_elapsed_seconds)
    WHERE id = current_stint.id;
  END IF;

  -- Um reset administrativo do cronômetro não pode fazer o próximo período
  -- começar antes do anterior no histórico.
  elapsed := GREATEST(elapsed, current_stint.entered_elapsed_seconds);

  INSERT INTO public.match_goalkeeper_stints(match_id, team_id, player_id, entered_elapsed_seconds)
  VALUES (p_match_id, p_team_id, p_player_id, elapsed);
  RETURN json_build_object(
    'player_id', p_player_id,
    'previous_player_id', current_stint.player_id,
    'entered_elapsed_seconds', elapsed
  );
END;
$$;
REVOKE ALL ON FUNCTION public.change_match_goalkeeper(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.change_match_goalkeeper(uuid,uuid,uuid,integer)
  TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.close_match_goalkeeper_stints()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
    UPDATE public.match_goalkeeper_stints
    SET left_elapsed_seconds = GREATEST(
      entered_elapsed_seconds,
      COALESCE(NEW.eligibility_elapsed_offset_seconds,0)
        + COALESCE(NEW.timer_accumulated_seconds,0)
    )
    WHERE match_id = NEW.id AND left_elapsed_seconds IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS matches_close_goalkeeper_stints ON public.matches;
CREATE TRIGGER matches_close_goalkeeper_stints
AFTER UPDATE OF status ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.close_match_goalkeeper_stints();

-- Uma implantação com partida ao vivo mantém o goleiro inicial até uma
-- eventual troca, sem alterar partidas antigas já encerradas.
INSERT INTO public.match_goalkeeper_stints(match_id,team_id,player_id,entered_elapsed_seconds)
SELECT legacy.match_id,legacy.team_id,legacy.player_id,0
FROM public.match_goalkeepers legacy
JOIN public.matches match_item ON match_item.id=legacy.match_id AND match_item.status='live'
WHERE NOT EXISTS (
  SELECT 1 FROM public.match_goalkeeper_stints stint
  WHERE stint.match_id=legacy.match_id AND stint.team_id=legacy.team_id
);

NOTIFY pgrst, 'reload schema';
COMMIT;
