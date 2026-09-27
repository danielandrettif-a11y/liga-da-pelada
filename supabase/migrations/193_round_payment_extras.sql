BEGIN;

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS payment_extra_time_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_extra_time_player_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  ADD COLUMN IF NOT EXISTS payment_ball_fund_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_ball_fund_player_ids UUID[] NOT NULL DEFAULT '{}'::UUID[];

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rounds_payment_extra_time_total_check') THEN
    ALTER TABLE public.rounds ADD CONSTRAINT rounds_payment_extra_time_total_check CHECK (payment_extra_time_total >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rounds_payment_ball_fund_total_check') THEN
    ALTER TABLE public.rounds ADD CONSTRAINT rounds_payment_ball_fund_total_check CHECK (payment_ball_fund_total >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_round_payment_details_v2(
  p_round_id UUID,
  p_payment_pix TEXT,
  p_payment_total NUMERIC,
  p_extra_time_total NUMERIC,
  p_extra_time_player_ids UUID[],
  p_ball_fund_total NUMERIC,
  p_ball_fund_player_ids UUID[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  original public.rounds%ROWTYPE;
  new_payment_pix TEXT := trim(COALESCE(p_payment_pix, ''));
  new_payment_total NUMERIC := round(COALESCE(p_payment_total, 0), 2);
  new_extra_time_total NUMERIC := round(COALESCE(p_extra_time_total, 0), 2);
  new_ball_fund_total NUMERIC := round(COALESCE(p_ball_fund_total, 0), 2);
  extra_time_ids UUID[];
  ball_fund_ids UUID[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem editar os valores da rodada.';
  END IF;
  IF new_payment_pix = '' OR length(new_payment_pix) > 200 THEN
    RAISE EXCEPTION 'Informe uma chave PIX válida.';
  END IF;
  IF new_payment_total <= 0 OR new_extra_time_total < 0 OR new_ball_fund_total < 0 THEN
    RAISE EXCEPTION 'Informe valores de pagamento válidos.';
  END IF;

  SELECT * INTO original FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR original.status <> 'finished' THEN
    RAISE EXCEPTION 'Rodada finalizada não encontrada.';
  END IF;

  extra_time_ids := CASE WHEN new_extra_time_total > 0 THEN ARRAY(
    SELECT item.player_id
    FROM unnest(COALESCE(p_extra_time_player_ids, '{}'::UUID[])) WITH ORDINALITY AS item(player_id, position)
    GROUP BY item.player_id ORDER BY min(item.position)
  ) ELSE '{}'::UUID[] END;
  ball_fund_ids := CASE WHEN new_ball_fund_total > 0 THEN ARRAY(
    SELECT item.player_id
    FROM unnest(COALESCE(p_ball_fund_player_ids, '{}'::UUID[])) WITH ORDINALITY AS item(player_id, position)
    GROUP BY item.player_id ORDER BY min(item.position)
  ) ELSE '{}'::UUID[] END;

  IF new_extra_time_total > 0 AND cardinality(extra_time_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione quem ficou no tempo extra.';
  END IF;
  IF new_ball_fund_total > 0 AND cardinality(ball_fund_ids) = 0 THEN
    RAISE EXCEPTION 'Selecione quem participa da caixinha da bola.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(extra_time_ids || ball_fund_ids) AS selected(player_id)
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

  -- Quem já pagou só volta a pendente quando o novo total individual aumentou.
  WITH participant_count AS (
    SELECT count(*)::NUMERIC AS total FROM public.round_players WHERE round_id = p_round_id
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

REVOKE ALL ON FUNCTION public.update_round_payment_details_v2(UUID, TEXT, NUMERIC, NUMERIC, UUID[], NUMERIC, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_round_payment_details_v2(UUID, TEXT, NUMERIC, NUMERIC, UUID[], NUMERIC, UUID[]) TO authenticated;

COMMENT ON COLUMN public.rounds.payment_extra_time_total IS 'Valor total adicional pelo tempo extra, rateado apenas entre quem permaneceu.';
COMMENT ON COLUMN public.rounds.payment_ball_fund_total IS 'Valor total da caixinha semanal da bola, rateado entre os participantes selecionados.';

NOTIFY pgrst, 'reload schema';
COMMIT;
