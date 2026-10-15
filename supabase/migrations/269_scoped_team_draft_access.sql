-- Drafts sao parte das rodadas da pelada, nao um recurso do ADM global.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.team_drafts draft
    JOIN public.rounds round_item ON round_item.id = draft.round_id
    LEFT JOIN public.callups callup ON callup.id = draft.callup_id
    WHERE draft.league_id IS DISTINCT FROM round_item.league_id
      OR (draft.callup_id IS NOT NULL AND draft.league_id IS DISTINCT FROM callup.league_id)
  ) THEN
    RAISE EXCEPTION 'Draft associado a rodada ou convocacao de outra pelada; corrija antes da 269.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_team_draft_league()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rounds round_item
    WHERE round_item.id = NEW.round_id AND round_item.league_id = NEW.league_id
  ) OR (NEW.callup_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.callups callup
    WHERE callup.id = NEW.callup_id AND callup.league_id = NEW.league_id
  )) THEN
    RAISE EXCEPTION 'Draft, rodada e convocacao devem pertencer a mesma pelada.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS team_drafts_validate_league ON public.team_drafts;
CREATE TRIGGER team_drafts_validate_league
BEFORE INSERT OR UPDATE OF league_id, round_id, callup_id ON public.team_drafts
FOR EACH ROW EXECUTE FUNCTION public.validate_team_draft_league();

CREATE OR REPLACE FUNCTION public.can_access_team_draft(p_draft_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_drafts draft
    WHERE draft.id = p_draft_id
      AND public.is_league_member(draft.league_id)
      AND (
        public.is_league_admin(draft.league_id)
        OR (draft.callup_id IS NOT NULL
          AND public.can_access_collective(draft.callup_id))
        OR (draft.callup_id IS NULL AND EXISTS (
          SELECT 1 FROM public.round_players participant
          JOIN public.account_profiles account ON account.player_id = participant.player_id
          WHERE participant.round_id = draft.round_id AND account.user_id = auth.uid()
        ))
      )
  );
$$;

DROP POLICY IF EXISTS team_drafts_admin ON public.team_drafts;
CREATE POLICY team_drafts_admin ON public.team_drafts FOR ALL TO authenticated
USING (public.is_league_admin(league_id))
WITH CHECK (public.is_league_admin(league_id));

DROP POLICY IF EXISTS team_draft_captains_admin ON public.team_draft_captains;
CREATE POLICY team_draft_captains_admin ON public.team_draft_captains FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.team_drafts draft
  WHERE draft.id = draft_id AND public.is_league_admin(draft.league_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.team_drafts draft
  WHERE draft.id = draft_id AND public.is_league_admin(draft.league_id)));

DROP POLICY IF EXISTS team_draft_players_admin ON public.team_draft_players;
CREATE POLICY team_draft_players_admin ON public.team_draft_players FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.team_drafts draft
  WHERE draft.id = draft_id AND public.is_league_admin(draft.league_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.team_drafts draft
  WHERE draft.id = draft_id AND public.is_league_admin(draft.league_id)));

REVOKE ALL ON FUNCTION public.validate_team_draft_league() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_team_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_team_draft(uuid) TO authenticated;

COMMIT;
