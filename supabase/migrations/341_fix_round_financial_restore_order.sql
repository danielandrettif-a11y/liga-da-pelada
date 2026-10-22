-- O plano so pode ser sincronizado enquanto a rodada esta finalizada. Restaura
-- primeiro os valores, sincroniza o plano e apenas depois devolve o status.
BEGIN;

CREATE OR REPLACE FUNCTION public.restore_round_financials(
  p_round_id uuid,
  p_league_id uuid,
  p_original_state jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restored boolean;
  original_status text;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;

  original_status := coalesce(p_original_state ->> 'status', 'active');
  SELECT EXISTS (
    SELECT 1 FROM public.rounds
    WHERE id = p_round_id AND league_id = p_league_id
    FOR UPDATE
  ) INTO restored;

  IF restored THEN
    -- Mantem temporariamente PIX, total e status produzidos pelo finalize para
    -- que sync_round_payment_plan possa reconstruir o plano anterior.
    PERFORM public.sync_round_payment_plan(
      p_round_id,
      coalesce(ARRAY(
        SELECT item.value::uuid
        FROM jsonb_array_elements_text(
          coalesce(p_original_state -> 'expense_item_ids', '[]'::jsonb)
        ) AS item(value)
      ), ARRAY[]::uuid[])
    );
    UPDATE public.rounds
    SET status = original_status,
        payment_pix = p_original_state ->> 'payment_pix',
        payment_total = nullif(p_original_state ->> 'payment_total', '')::numeric,
        payment_recipient_id = nullif(p_original_state ->> 'payment_recipient_id', '')::uuid,
        payment_recipient_name = p_original_state ->> 'payment_recipient_name'
    WHERE id = p_round_id;
  END IF;

  RETURN restored;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_round_financials(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_round_financials(uuid, uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
