-- A RPC legada era SECURITY DEFINER e aceitava ADM global para qualquer rodada.
-- Mantem a regra financeira existente, mas valida a pelada da rodada no banco.
BEGIN;

CREATE OR REPLACE FUNCTION public.update_round_payment_details_v2(
  p_round_id uuid,
  p_payment_pix text,
  p_payment_total numeric,
  p_extra_time_total numeric,
  p_extra_time_player_ids uuid[],
  p_ball_fund_total numeric,
  p_ball_fund_player_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  original public.rounds%ROWTYPE;
  new_payment_pix text := trim(COALESCE(p_payment_pix, ''));
  new_payment_total numeric := round(COALESCE(p_payment_total, 0), 2);
  new_extra_time_total numeric := round(COALESCE(p_extra_time_total, 0), 2);
  new_ball_fund_total numeric := round(COALESCE(p_ball_fund_total, 0), 2);
  extra_time_ids uuid[];
  ball_fund_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Somente administradores podem editar os valores da rodada.';
  END IF;

  SELECT * INTO original FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_league_admin(original.league_id) THEN
    RAISE EXCEPTION 'Rodada fora da pelada administrada.';
  END IF;
  IF original.status <> 'finished' THEN
    RAISE EXCEPTION 'Rodada finalizada não encontrada.';
  END IF;
  IF new_payment_pix = '' OR length(new_payment_pix) > 200 THEN
    RAISE EXCEPTION 'Informe uma chave PIX válida.';
  END IF;
  IF new_payment_total <= 0 OR new_extra_time_total < 0 OR new_ball_fund_total < 0 THEN
    RAISE EXCEPTION 'Informe valores de pagamento válidos.';
  END IF;

  extra_time_ids := CASE WHEN new_extra_time_total > 0 THEN ARRAY(
    SELECT item.player_id
    FROM unnest(COALESCE(p_extra_time_player_ids, '{}'::uuid[])) WITH ORDINALITY AS item(player_id, position)
    GROUP BY item.player_id ORDER BY min(item.position)
  ) ELSE '{}'::uuid[] END;
  ball_fund_ids := CASE WHEN new_ball_fund_total > 0 THEN ARRAY(
    SELECT item.player_id
    FROM unnest(COALESCE(p_ball_fund_player_ids, '{}'::uuid[])) WITH ORDINALITY AS item(player_id, position)
    GROUP BY item.player_id ORDER BY min(item.position)
  ) ELSE '{}'::uuid[] END;

  IF new_extra_time_total > 0 AND cardinality(extra_time_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione quem ficou no tempo extra.';
  END IF;
  IF new_ball_fund_total > 0 AND cardinality(ball_fund_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione quem participa da caixinha da bola.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(extra_time_ids || ball_fund_ids) AS selected(player_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.round_players participant
      WHERE participant.round_id = p_round_id AND participant.player_id = selected.player_id
    )
  ) THEN
    RAISE EXCEPTION 'A cobrança extra contém alguém que não participou da rodada.';
  END IF;

  UPDATE public.rounds SET
    payment_pix = new_payment_pix,
    payment_total = new_payment_total,
    payment_extra_time_total = new_extra_time_total,
    payment_extra_time_player_ids = extra_time_ids,
    payment_ball_fund_total = new_ball_fund_total,
    payment_ball_fund_player_ids = ball_fund_ids
  WHERE id = p_round_id;

  -- Pagamentos quitados so voltam a pendentes se o valor individual aumentar.
  WITH participant_count AS (
    SELECT count(*)::numeric AS total FROM public.round_players WHERE round_id = p_round_id
  ), amounts AS (
    SELECT payment.id,
      COALESCE(original.payment_total, 0) / NULLIF(participant_count.total, 0)
        + CASE WHEN payment.player_id = ANY(original.payment_extra_time_player_ids)
            THEN original.payment_extra_time_total / NULLIF(cardinality(original.payment_extra_time_player_ids), 0) ELSE 0 END
        + CASE WHEN payment.player_id = ANY(original.payment_ball_fund_player_ids)
            THEN original.payment_ball_fund_total / NULLIF(cardinality(original.payment_ball_fund_player_ids), 0) ELSE 0 END AS old_due,
      new_payment_total / NULLIF(participant_count.total, 0)
        + CASE WHEN payment.player_id = ANY(extra_time_ids)
            THEN new_extra_time_total / NULLIF(cardinality(extra_time_ids), 0) ELSE 0 END
        + CASE WHEN payment.player_id = ANY(ball_fund_ids)
            THEN new_ball_fund_total / NULLIF(cardinality(ball_fund_ids), 0) ELSE 0 END AS new_due
    FROM public.round_payments payment CROSS JOIN participant_count
    WHERE payment.round_id = p_round_id AND payment.paid = true
  )
  UPDATE public.round_payments payment SET paid = false, paid_at = NULL
  FROM amounts
  WHERE payment.id = amounts.id AND amounts.new_due > amounts.old_due;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_round_payment_details_v2(uuid, text, numeric, numeric, uuid[], numeric, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_round_payment_details_v2(uuid, text, numeric, numeric, uuid[], numeric, uuid[])
  TO authenticated;

COMMIT;
