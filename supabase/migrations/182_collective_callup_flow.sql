-- A Coletiva abre junto da Convocação e só ocupa o menu principal após os times.

CREATE OR REPLACE FUNCTION public.can_access_collective(p_callup_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.is_app_admin() THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.callups callup
      JOIN public.callup_entries entry ON entry.callup_id = callup.id
      LEFT JOIN public.rounds round_item ON round_item.id = callup.round_id
      WHERE callup.id = p_callup_id
        AND entry.player_id = (
          SELECT profile.player_id
          FROM public.account_profiles profile
          WHERE profile.user_id = auth.uid()
        )
        AND callup.status IN ('open', 'locked', 'converted')
        AND (
          round_item.id IS NULL
          OR round_item.status <> 'finished'
          OR (
            round_item.payment_pix IS NOT NULL
            AND round_item.payment_total > 0
            AND EXISTS (
              SELECT 1
              FROM public.round_players participant
              WHERE participant.round_id = round_item.id
                AND NOT EXISTS (
                  SELECT 1
                  FROM public.round_payments payment
                  WHERE payment.round_id = participant.round_id
                    AND payment.player_id = participant.player_id
                    AND payment.paid = true
                )
            )
          )
        )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.collective_is_started(p_callup_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.callups callup
    WHERE callup.id = p_callup_id
      AND callup.status IN ('open', 'locked', 'converted')
  );
$$;

NOTIFY pgrst, 'reload schema';
