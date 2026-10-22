-- Corrige a ordenacao deterministica do rateio financeiro. round_players nao
-- possui created_at; attendance_order e a ordem canonica da lista da rodada.
BEGIN;

DO $$
DECLARE
  original_definition text;
  fixed_definition text;
BEGIN
  original_definition := pg_get_functiondef(
    'public.sync_round_payment_plan(uuid,uuid[])'::regprocedure
  );
  fixed_definition := replace(
    replace(
      replace(
        replace(
          original_definition,
          'ORDER BY created_at, player_id',
          'ORDER BY attendance_order NULLS LAST, player_id'
        ),
        'ORDER BY participant.created_at, participant.player_id',
        'ORDER BY participant.attendance_order NULLS LAST, participant.player_id'
      ),
      'JOIN public.league_expense_items expense ON expense.id = installment.expense_item_id',
      'JOIN public.league_expense_items expense_item ON expense_item.id = installment.expense_item_id'
    ),
    $replace$'expense_installment', expense.name || ' · parcela ' || installment.installment_number || '/' || expense.installment_count,$replace$,
    $replace$'expense_installment', expense_item.name || ' · parcela ' || installment.installment_number || '/' || expense_item.installment_count,$replace$
  );

  IF fixed_definition LIKE '%ORDER BY created_at, player_id%'
    OR fixed_definition LIKE '%participant.created_at%'
    OR fixed_definition LIKE '%JOIN public.league_expense_items expense ON expense.id = installment.expense_item_id%'
  THEN
    RAISE EXCEPTION 'Nao foi possivel corrigir sync_round_payment_plan com seguranca';
  END IF;

  IF fixed_definition <> original_definition THEN
    EXECUTE fixed_definition;
  ELSIF original_definition NOT LIKE '%attendance_order NULLS LAST%'
    OR original_definition NOT LIKE '%league_expense_items expense_item%'
  THEN
    RAISE EXCEPTION 'sync_round_payment_plan tem formato desconhecido';
  END IF;
END;
$$;

-- PostgreSQL nao define max(uuid). O recipient_key agrupa linhas do mesmo
-- destinatario, portanto o menor valor textual nao nulo preserva o UUID.
DO $$
DECLARE
  original_definition text;
  fixed_definition text;
BEGIN
  original_definition := pg_get_functiondef(
    'public.refresh_round_payment_obligations(uuid)'::regprocedure
  );
  fixed_definition := replace(
    original_definition,
    'max(line.recipient_id)',
    'min(line.recipient_id::text)::uuid'
  );

  IF fixed_definition LIKE '%max(line.recipient_id)%' THEN
    RAISE EXCEPTION 'Nao foi possivel corrigir refresh_round_payment_obligations com seguranca';
  END IF;

  IF fixed_definition <> original_definition THEN
    EXECUTE fixed_definition;
  ELSIF original_definition NOT LIKE '%min(line.recipient_id::text)::uuid%' THEN
    RAISE EXCEPTION 'refresh_round_payment_obligations tem formato desconhecido';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
