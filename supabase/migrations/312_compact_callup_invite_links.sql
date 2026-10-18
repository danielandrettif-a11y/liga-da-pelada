-- O link da convocação usa somente o token. Isso evita que mensageiros
-- quebrem uma URL longa com dois UUIDs e ainda preserva a validação no banco.
CREATE OR REPLACE FUNCTION public.claim_callup_invite_by_token(
  p_invite_token UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_callup_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para abrir este convite.';
  END IF;

  SELECT id
    INTO target_callup_id
  FROM public.callups
  WHERE invite_token = p_invite_token
    AND status IN ('open', 'locked', 'converted');

  IF target_callup_id IS NULL THEN
    RAISE EXCEPTION 'Convite inválido ou convocação indisponível.';
  END IF;

  INSERT INTO public.callup_invite_access (callup_id, user_id)
  VALUES (target_callup_id, auth.uid())
  ON CONFLICT (callup_id, user_id) DO NOTHING;

  RETURN target_callup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_callup_invite_by_token(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_callup_invite_by_token(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
