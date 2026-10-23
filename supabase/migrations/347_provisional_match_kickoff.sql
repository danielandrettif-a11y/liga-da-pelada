-- Preserva o instante percebido do primeiro apito sem confiar cegamente no
-- relógio do aparelho. A função de nove argumentos continua disponível para
-- clientes antigos durante o rollout.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_live_match(
  p_round_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_goalkeeper_a_id uuid,
  p_goalkeeper_b_id uuid,
  p_goalkeeper_a_rotation_order integer,
  p_goalkeeper_b_rotation_order integer,
  p_lineup jsonb,
  p_idempotency_key text,
  p_client_started_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt jsonb;
  match_id uuid;
  server_now timestamptz := clock_timestamp();
  official_kickoff_at timestamptz;
BEGIN
  receipt := public.create_live_match(
    p_round_id,
    p_team_a_id,
    p_team_b_id,
    p_goalkeeper_a_id,
    p_goalkeeper_b_id,
    p_goalkeeper_a_rotation_order,
    p_goalkeeper_b_rotation_order,
    p_lineup,
    p_idempotency_key
  );

  -- Uma repetição idempotente nunca altera o relógio de uma partida que já
  -- existe, ainda que o aparelho envie outro horário por engano.
  IF COALESCE((receipt->>'idempotent')::boolean, false) THEN
    RETURN receipt;
  END IF;

  match_id := (receipt->>'match_id')::uuid;
  official_kickoff_at := CASE
    WHEN p_client_started_at IS NULL THEN (receipt->>'kickoff_at')::timestamptz
    ELSE GREATEST(
      server_now - interval '15 seconds',
      LEAST(server_now, p_client_started_at)
    )
  END;

  UPDATE public.matches
  SET started_at = official_kickoff_at,
      timer_started_at = official_kickoff_at
  WHERE id = match_id;

  RETURN jsonb_set(receipt, '{kickoff_at}', to_jsonb(official_kickoff_at), true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_live_match(
  uuid, uuid, uuid, uuid, uuid, integer, integer, jsonb, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_live_match(
  uuid, uuid, uuid, uuid, uuid, integer, integer, jsonb, text, timestamptz
) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
