-- Permite que qualquer membro autenticado da liga confirme ou reabra pagamentos
-- de outros atletas nas obrigações do Transfermarket (com auditoria em changed_by)
-- e expõe a origem completa dos cadastros no histórico do ADM.

CREATE OR REPLACE FUNCTION public.set_round_payment_obligation_paid(
  p_obligation_id uuid,
  p_amount_paid numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  obligation public.round_payment_obligations%ROWTYPE;
  target_league_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre para confirmar pagamentos';
  END IF;

  SELECT * INTO obligation
  FROM public.round_payment_obligations
  WHERE id = p_obligation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobranca nao encontrada';
  END IF;

  SELECT league_id INTO target_league_id
  FROM public.rounds
  WHERE id = obligation.round_id AND status = 'finished';

  IF target_league_id IS NULL OR NOT public.is_league_member(target_league_id) THEN
    RAISE EXCEPTION 'Cobranca indisponivel';
  END IF;

  IF p_amount_paid < 0 OR p_amount_paid > 99999999.99 THEN
    RAISE EXCEPTION 'Valor pago invalido';
  END IF;

  INSERT INTO public.round_payment_events (
    league_id, round_id, obligation_id, player_id, event_type,
    amount_due_before, amount_due_after, amount_paid_before, amount_paid_after, changed_by
  ) VALUES (
    target_league_id, obligation.round_id, obligation.id, obligation.player_id,
    CASE WHEN p_amount_paid > 0 THEN 'payment_confirmed' ELSE 'payment_reopened' END,
    obligation.amount_due, obligation.amount_due, obligation.amount_paid,
    round(p_amount_paid, 2), auth.uid()
  );

  UPDATE public.round_payment_obligations SET
    amount_paid = round(p_amount_paid, 2),
    status = CASE
      WHEN round(p_amount_paid, 2) > amount_due THEN 'credit'
      WHEN round(p_amount_paid, 2) = amount_due AND amount_due > 0 THEN 'paid'
      WHEN round(p_amount_paid, 2) > 0 THEN 'partial'
      ELSE 'pending'
    END,
    paid_at = CASE
      WHEN round(p_amount_paid, 2) >= amount_due AND amount_due > 0 THEN now()
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = p_obligation_id;

  INSERT INTO public.round_payments (round_id, player_id, paid, paid_at)
  VALUES (
    obligation.round_id,
    obligation.player_id,
    NOT EXISTS (
      SELECT 1 FROM public.round_payment_obligations pending
      WHERE pending.round_id = obligation.round_id
        AND pending.player_id = obligation.player_id
        AND pending.id <> obligation.id
        AND pending.amount_paid < pending.amount_due
    ) AND round(p_amount_paid, 2) >= obligation.amount_due,
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.round_payment_obligations pending
      WHERE pending.round_id = obligation.round_id
        AND pending.player_id = obligation.player_id
        AND pending.id <> obligation.id
        AND pending.amount_paid < pending.amount_due
    ) AND round(p_amount_paid, 2) >= obligation.amount_due THEN now() ELSE NULL END
  )
  ON CONFLICT (round_id, player_id) DO UPDATE SET
    paid = EXCLUDED.paid,
    paid_at = EXCLUDED.paid_at;

  RETURN true;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_league_registration_history(uuid);

CREATE OR REPLACE FUNCTION public.get_league_registration_history(p_league_id uuid)
RETURNS TABLE (
  id bigint,
  player_id uuid,
  player_name text,
  avatar_url text,
  member_category text,
  source text,
  created_by_user_id uuid,
  created_by_name text,
  created_by_avatar_url text,
  origin_type text,
  signup_email text,
  signup_provider text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores da pelada';
  END IF;

  RETURN QUERY
  SELECT
    event.id::bigint,
    event.player_id,
    COALESCE(player.name, event.player_name)::text AS player_name,
    COALESCE(NULLIF(player.avatar_url, ''), event.avatar_url)::text AS avatar_url,
    COALESCE(player.member_category, event.member_category)::text AS member_category,
    event.source::text AS source,
    event.created_by_user_id,
    COALESCE(creator_player.name, NULLIF(split_part(creator_auth.email, '@', 1), ''))::text AS created_by_name,
    NULLIF(creator_player.avatar_url, '')::text AS created_by_avatar_url,
    CASE
      WHEN event.source = 'legacy' OR (event.created_by_user_id IS NULL AND target_profile.user_id IS NULL)
        THEN 'legacy'
      WHEN event.created_by_user_id IS NOT NULL
        AND target_profile.user_id IS NOT NULL
        AND event.created_by_user_id = target_profile.user_id
        THEN 'self_email'
      WHEN event.created_by_user_id IS NOT NULL
        AND (
          event.source = 'admin'
          OR creator_member.role = 'admin'
          OR creator_profile.role = 'admin'
        )
        THEN 'registered_by_admin'
      ELSE 'registered_by_user'
    END::text AS origin_type,
    CASE
      WHEN event.created_by_user_id IS NOT NULL
        AND target_profile.user_id IS NOT NULL
        AND event.created_by_user_id = target_profile.user_id
        THEN NULLIF(target_auth.email, '')::text
      ELSE NULL::text
    END AS signup_email,
    CASE
      WHEN event.created_by_user_id IS NOT NULL
        AND target_profile.user_id IS NOT NULL
        AND event.created_by_user_id = target_profile.user_id
        THEN NULLIF(target_auth.raw_app_meta_data->>'provider', '')::text
      ELSE NULL::text
    END AS signup_provider,
    event.created_at
  FROM public.player_registration_events event
  JOIN public.league_members member
    ON member.player_id = event.player_id
   AND member.league_id = p_league_id
   AND member.is_active
  LEFT JOIN public.players player
    ON player.id = event.player_id
  LEFT JOIN public.account_profiles target_profile
    ON target_profile.player_id = event.player_id
  LEFT JOIN auth.users target_auth
    ON target_auth.id = target_profile.user_id
  LEFT JOIN public.account_profiles creator_profile
    ON creator_profile.user_id = event.created_by_user_id
  LEFT JOIN public.players creator_player
    ON creator_player.id = creator_profile.player_id
  LEFT JOIN public.league_members creator_member
    ON creator_member.league_id = p_league_id
   AND creator_member.user_id = event.created_by_user_id
   AND creator_member.is_active
  LEFT JOIN auth.users creator_auth
    ON creator_auth.id = event.created_by_user_id
  ORDER BY event.created_at DESC, event.id DESC
  LIMIT 1000;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_league_registration_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_league_registration_history(uuid) TO authenticated;
