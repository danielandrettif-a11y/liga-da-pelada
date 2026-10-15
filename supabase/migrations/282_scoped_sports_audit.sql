-- The sports correction log contains player identities and must be readable
-- only by an administrator of its own league, not every global app admin.
ALTER TABLE public.sports_admin_audit ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE old_policy record;
BEGIN
  FOR old_policy IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sports_admin_audit'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.sports_admin_audit', old_policy.policyname);
  END LOOP;
END $$;

CREATE POLICY sports_admin_audit_league_read ON public.sports_admin_audit
FOR SELECT TO authenticated USING (public.is_league_admin(league_id));

-- Round and match pointers may be cleared on deletion; when present they must
-- refer to the same league as the immutable audit owner.
CREATE OR REPLACE FUNCTION public.validate_sports_admin_audit_league()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.round_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.rounds WHERE id = NEW.round_id)
    AND NOT EXISTS (
    SELECT 1 FROM public.rounds round_item
    WHERE round_item.id = NEW.round_id AND round_item.league_id = NEW.league_id
  ) THEN
    RAISE EXCEPTION 'Auditoria esportiva vinculada a rodada de outra pelada.';
  END IF;
  IF NEW.match_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.matches WHERE id = NEW.match_id)
    AND NOT EXISTS (
    SELECT 1 FROM public.matches match_item
    JOIN public.rounds round_item ON round_item.id = match_item.round_id
    WHERE match_item.id = NEW.match_id AND round_item.league_id = NEW.league_id
      AND (NEW.round_id IS NULL OR NEW.round_id = round_item.id)
  ) THEN
    RAISE EXCEPTION 'Auditoria esportiva vinculada a partida de outra pelada.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sports_admin_audit_validate_league ON public.sports_admin_audit;
CREATE TRIGGER sports_admin_audit_validate_league
BEFORE INSERT OR UPDATE OF league_id, round_id, match_id ON public.sports_admin_audit
FOR EACH ROW EXECUTE FUNCTION public.validate_sports_admin_audit_league();

REVOKE ALL ON FUNCTION public.validate_sports_admin_audit_league()
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
