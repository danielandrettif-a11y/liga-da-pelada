BEGIN;
DO $$
DECLARE definition text;
  old_column constant text := 'item.test_lineup_id = saved_lineup_id';
BEGIN
  SELECT pg_get_functiondef('public.save_fantasy_test_lineup_pre_three_positions_220(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb)'::regprocedure) INTO definition;
  IF position(old_column IN definition)=0 THEN
    RAISE EXCEPTION 'Rotina de escalacao de teste divergiu; revisar antes da migration 360.';
  END IF;
  EXECUTE replace(definition,old_column,'item.lineup_id = saved_lineup_id');
END $$;
REVOKE ALL ON FUNCTION public.save_fantasy_test_lineup_pre_three_positions_220(uuid,uuid[],uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
COMMIT;
