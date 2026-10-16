-- Campanha versionada para apresentar homepage e lobby uma vez a contas antigas.
BEGIN;

ALTER TABLE public.account_profiles
  ADD COLUMN IF NOT EXISTS entry_flow_version integer NOT NULL DEFAULT 0;

-- Novas contas ja nascem na versao atual; as existentes continuam pendentes.
ALTER TABLE public.account_profiles
  ALTER COLUMN entry_flow_version SET DEFAULT 1;

CREATE OR REPLACE FUNCTION public.complete_my_entry_flow(p_version integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE completed_version integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para concluir a apresentacao'; END IF;
  IF p_version < 1 OR p_version > 1000 THEN RAISE EXCEPTION 'Versao de apresentacao invalida'; END IF;
  UPDATE public.account_profiles
  SET entry_flow_version = greatest(entry_flow_version, p_version), updated_at = now()
  WHERE user_id = auth.uid()
  RETURNING entry_flow_version INTO completed_version;
  IF completed_version IS NULL THEN RAISE EXCEPTION 'Perfil da conta nao encontrado'; END IF;
  RETURN completed_version;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_my_entry_flow(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_my_entry_flow(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
