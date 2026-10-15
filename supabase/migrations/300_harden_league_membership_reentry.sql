-- Reentrada nunca restaura silenciosamente um antigo papel de ADM.
-- Vinculos ja ativos sao preservados; vinculos inativos voltam como jogador.
BEGIN;

CREATE OR REPLACE FUNCTION public.add_account_to_league(
  p_league_id uuid, p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_player_id uuid;
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  SELECT profile.player_id INTO target_player_id
  FROM public.account_profiles profile
  JOIN public.players player ON player.id = profile.player_id
  WHERE profile.user_id = p_user_id
    AND player.member_category = 'player' AND player.is_selectable;
  IF target_player_id IS NULL THEN
    RAISE EXCEPTION 'Conta sem perfil de jogador disponivel.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.league_members member
    WHERE member.league_id = p_league_id AND member.player_id = target_player_id
      AND member.is_active) THEN
    RETURN false;
  END IF;
  INSERT INTO public.league_members(
    league_id, player_id, user_id, role, is_active, is_favorite
  ) VALUES (
    p_league_id, target_player_id, p_user_id, 'player', true, false
  )
  ON CONFLICT (league_id, player_id) DO UPDATE SET
    user_id = EXCLUDED.user_id, role = 'player', is_active = true,
    is_favorite = false;
  UPDATE public.league_join_requests SET
    status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  WHERE league_id = p_league_id AND user_id = p_user_id AND status = 'pending';
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_league_membership(
  p_request_id uuid, p_approve boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE request_item public.league_join_requests%ROWTYPE; target_player_id uuid;
BEGIN
  SELECT * INTO request_item FROM public.league_join_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR request_item.status <> 'pending' THEN
    RAISE EXCEPTION 'Pedido pendente nao encontrado.';
  END IF;
  IF NOT public.is_league_admin(request_item.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF p_approve THEN
    SELECT profile.player_id INTO target_player_id
    FROM public.account_profiles profile
    JOIN public.players player ON player.id = profile.player_id
    WHERE profile.user_id = request_item.user_id
      AND player.member_category = 'player' AND player.is_selectable;
    IF target_player_id IS NULL THEN
      RAISE EXCEPTION 'A conta ainda nao possui perfil de jogador disponivel.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.league_members member
      WHERE member.league_id = request_item.league_id
        AND member.player_id = target_player_id AND member.is_active) THEN
      INSERT INTO public.league_members(
        league_id, player_id, user_id, role, is_active, is_favorite
      ) VALUES (
        request_item.league_id, target_player_id, request_item.user_id,
        'player', true, false
      )
      ON CONFLICT (league_id, player_id) DO UPDATE SET
        user_id = EXCLUDED.user_id, role = 'player', is_active = true,
        is_favorite = false;
    END IF;
  END IF;
  UPDATE public.league_join_requests SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = p_request_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_open_league(p_league_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_player_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta primeiro.'; END IF;
  PERFORM 1 FROM public.leagues
  WHERE id = p_league_id AND is_active AND visibility = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esta pelada nao esta aberta para entrada.'; END IF;
  SELECT profile.player_id INTO target_player_id
  FROM public.account_profiles profile
  JOIN public.players player ON player.id = profile.player_id
  WHERE profile.user_id = auth.uid()
    AND player.member_category = 'player' AND player.is_selectable;
  IF target_player_id IS NULL THEN
    RAISE EXCEPTION 'Complete seu perfil de jogador antes de entrar.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.league_members member
    WHERE member.league_id = p_league_id AND member.player_id = target_player_id
      AND member.is_active) THEN
    RETURN false;
  END IF;
  INSERT INTO public.league_members(
    league_id, player_id, user_id, role, is_active, is_favorite
  ) VALUES (
    p_league_id, target_player_id, auth.uid(), 'player', true, false
  )
  ON CONFLICT (league_id, player_id) DO UPDATE SET
    user_id = EXCLUDED.user_id, role = 'player', is_active = true,
    is_favorite = false;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.add_account_to_league(uuid,uuid),
  public.review_league_membership(uuid,boolean), public.join_open_league(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_account_to_league(uuid,uuid),
  public.review_league_membership(uuid,boolean), public.join_open_league(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
