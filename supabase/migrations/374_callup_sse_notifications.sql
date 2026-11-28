-- Publica uma notificacao pequena depois do commit. O backend escuta este canal
-- e entrega o snapshot autorizado aos navegadores por SSE.
BEGIN;

CREATE OR REPLACE FUNCTION public.notify_callup_sse_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_callup_id uuid;
  target_league_id uuid;
BEGIN
  target_callup_id := CASE
    WHEN TG_TABLE_NAME = 'callups' THEN COALESCE(NEW.id, OLD.id)
    ELSE COALESCE(NEW.callup_id, OLD.callup_id)
  END;

  SELECT callup.league_id INTO target_league_id
  FROM public.callups callup
  WHERE callup.id = target_callup_id;

  IF target_league_id IS NOT NULL THEN
    PERFORM pg_notify('callup_changes', jsonb_build_object(
      'leagueId', target_league_id,
      'callupId', target_callup_id,
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'occurredAt', clock_timestamp()
    )::text);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.notify_callup_sse_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS callup_entries_notify_sse ON public.callup_entries;
CREATE TRIGGER callup_entries_notify_sse
AFTER INSERT OR UPDATE OR DELETE ON public.callup_entries
FOR EACH ROW EXECUTE FUNCTION public.notify_callup_sse_change();

DROP TRIGGER IF EXISTS callups_notify_sse ON public.callups;
CREATE TRIGGER callups_notify_sse
AFTER INSERT OR UPDATE ON public.callups
FOR EACH ROW EXECUTE FUNCTION public.notify_callup_sse_change();

COMMIT;
