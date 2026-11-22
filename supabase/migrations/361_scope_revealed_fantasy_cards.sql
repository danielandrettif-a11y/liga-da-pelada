-- Revela a carta de outros membros somente depois do fechamento do mercado.
-- Qualificar as colunas evita que o status da rodada seja usado no lugar do
-- status da ativação dentro da subconsulta.
BEGIN;

DROP POLICY IF EXISTS fantasy_activation_read ON public.fantasy_card_activations;
CREATE POLICY fantasy_activation_read ON public.fantasy_card_activations
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.rounds r
    WHERE r.id = fantasy_card_activations.round_id
      AND public.is_league_member(r.league_id)
      AND (
        fantasy_card_activations.user_id = auth.uid()
        OR public.is_league_admin(r.league_id)
        OR (
          fantasy_card_activations.status IN ('LOCKED', 'RESOLVED')
          AND (
            r.status = 'finished'
            OR EXISTS (
              SELECT 1 FROM public.fantasy_rounds fr
              WHERE fr.round_id = r.id AND fr.market_status IN ('in_progress', 'finished')
            )
            OR EXISTS (
              SELECT 1 FROM public.fantasy_test_sessions ts
              WHERE ts.round_id = r.id AND ts.league_id = r.league_id
                AND ts.status IN ('in_progress', 'finished')
            )
          )
        )
      )
  )
);

COMMIT;
NOTIFY pgrst, 'reload schema';
