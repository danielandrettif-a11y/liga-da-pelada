-- Execute after fixture.sql and migration 351, with ON_ERROR_STOP=1.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000011', false);
SELECT public.register_goal(
  '00000000-0000-4000-8000-000000000013',
  '00000000-0000-4000-8000-000000000016',
  '00000000-0000-4000-8000-000000000014',
  NULL, 1, 'same-request', false
);
RESET ROLE;

UPDATE public.matches SET status = 'finished'
WHERE id = '00000000-0000-4000-8000-000000000013';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000011', false);
DO $$
DECLARE v_receipt json;
BEGIN
  v_receipt := public.register_goal(
    '00000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000016',
    '00000000-0000-4000-8000-000000000014',
    NULL, 1, 'same-request', false
  );
  IF (v_receipt->>'idempotent')::boolean IS DISTINCT FROM true
    OR (v_receipt->>'score_a')::integer IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Retry não devolveu o recibo original.';
  END IF;

  BEGIN
    PERFORM public.register_goal(
      '00000000-0000-4000-8000-000000000013',
      '00000000-0000-4000-8000-000000000016',
      '00000000-0000-4000-8000-000000000014',
      NULL, 2, 'same-request', false
    );
    RAISE EXCEPTION 'Mudança de payload foi aceita.';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'Chave de idempotência reutilizada%' THEN RAISE; END IF;
  END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT score_a FROM public.matches WHERE id = '00000000-0000-4000-8000-000000000013') <> 1
    OR (SELECT count(*) FROM public.match_events WHERE match_id = '00000000-0000-4000-8000-000000000013') <> 1 THEN
    RAISE EXCEPTION 'Retry alterou placar ou duplicou evento.';
  END IF;
END;
$$;
