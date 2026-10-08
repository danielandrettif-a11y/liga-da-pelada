-- Garante que o Mercado V14 seja sempre a última regra de preço aplicada,
-- inclusive na Rodada 01, que historicamente seguia outro caminho de fechamento.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.process_fantasy_round_pre_market_v14_245(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_round(UUID)
      RENAME TO process_fantasy_round_pre_market_v14_245;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.process_fantasy_round_pre_market_v14_245(UUID)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public AS $$
DECLARE
  target_season_id UUID;
  target_market_version INTEGER;
BEGIN
  -- Mantém toda a cadeia existente de pontos, cartas, previsões e banco.
  PERFORM public.process_fantasy_round_pre_market_v14_245(p_round_id);

  SELECT
    fantasy_round.fantasy_season_id,
    COALESCE(
      (fantasy_round.settings_snapshot->>'marketVersion')::INTEGER,
      (fantasy_round.settings_snapshot->>'market_version')::INTEGER,
      13
    )
  INTO target_season_id,target_market_version
  FROM public.fantasy_rounds fantasy_round
  WHERE fantasy_round.round_id=p_round_id;

  IF target_season_id IS NULL THEN
    RETURN true;
  END IF;

  -- A chamada explícita é criada depois da função V14 e, por isso, não fica
  -- presa ao OID da versão antiga que foi renomeada nas migrations anteriores.
  IF target_market_version>=14 THEN
    PERFORM public.apply_fantasy_role_market_v074(p_round_id);
    PERFORM public.reconcile_fantasy_reserve_budget(p_round_id);
    PERFORM public.recalculate_fantasy_season_pass(target_season_id);
  END IF;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.process_fantasy_round(UUID)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(UUID)
  TO authenticated,service_role;

-- Reconstroi todo o mercado ativo. A rotina apaga o histórico calculado,
-- volta ao preço inicial e fecha novamente todas as rodadas em ordem.
DO $$
DECLARE
  season_item RECORD;
BEGIN
  FOR season_item IN
    SELECT fantasy_season.id
    FROM public.fantasy_seasons fantasy_season
    JOIN public.seasons season ON season.id=fantasy_season.season_id
    WHERE season.status='active'
  LOOP
    PERFORM public.reprocess_fantasy_market_v14(season_item.id);
  END LOOP;
END $$;

NOTIFY pgrst,'reload schema';

COMMIT;
