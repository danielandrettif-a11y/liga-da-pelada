-- Permite promover contas antigas cujos papeis foram criados antes da
-- padronizacao atual para "admin" e "player".
-- O papel legado e normalizado apenas no historico; a conta recebe o papel
-- atual solicitado normalmente.

CREATE OR REPLACE FUNCTION public.manage_account_admin_role(
  p_target_user_id UUID,
  p_make_admin BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role TEXT;
  normalized_previous_role TEXT;
  desired_role TEXT := CASE WHEN p_make_admin THEN 'admin' ELSE 'player' END;
  admin_count INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar acessos.';
  END IF;

  SELECT profile.role INTO current_role
  FROM public.account_profiles profile
  WHERE profile.user_id = p_target_user_id
  FOR UPDATE;

  IF current_role IS NULL THEN
    RAISE EXCEPTION 'Conta cadastrada nao encontrada.';
  END IF;

  IF current_role = desired_role THEN
    RETURN desired_role;
  END IF;

  normalized_previous_role := CASE
    WHEN current_role = 'admin' THEN 'admin'
    ELSE 'player'
  END;

  IF NOT p_make_admin THEN
    IF p_target_user_id = auth.uid() THEN
      RAISE EXCEPTION 'Voce nao pode remover o proprio acesso de administrador.';
    END IF;

    SELECT count(*)::INTEGER INTO admin_count
    FROM public.account_profiles profile
    WHERE profile.role = 'admin';

    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'O aplicativo precisa manter pelo menos um administrador.';
    END IF;
  END IF;

  UPDATE public.account_profiles
  SET role = desired_role, updated_at = now()
  WHERE account_profiles.user_id = p_target_user_id;

  INSERT INTO public.admin_role_audit (
    target_user_id,
    previous_role,
    new_role,
    changed_by_user_id
  ) VALUES (
    p_target_user_id,
    normalized_previous_role,
    desired_role,
    auth.uid()
  );

  RETURN desired_role;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_account_admin_role(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_account_admin_role(UUID, BOOLEAN) TO authenticated;
