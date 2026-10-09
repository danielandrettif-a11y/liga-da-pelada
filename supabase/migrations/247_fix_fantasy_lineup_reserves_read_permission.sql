-- Garante que as reservas históricas possam ser exibidas junto das escalações
-- após o fechamento do mercado. A política continua escondendo times alheios
-- enquanto a rodada está aberta.

GRANT SELECT ON TABLE public.fantasy_lineup_reserves
TO authenticated, service_role;

ALTER TABLE public.fantasy_lineup_reserves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fantasy_lineup_reserves_read
ON public.fantasy_lineup_reserves;

CREATE POLICY fantasy_lineup_reserves_read
ON public.fantasy_lineup_reserves
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round
      ON fantasy_round.id = lineup.fantasy_round_id
    WHERE lineup.id = fantasy_lineup_reserves.lineup_id
      AND (
        lineup.user_id = auth.uid()
        OR public.is_app_admin()
        OR fantasy_round.market_status <> 'open'
      )
  )
);

NOTIFY pgrst, 'reload schema';
