-- O elenco permanente serve como sugestão no campo, nunca como escalação
-- confirmada de uma Ranked. A confirmação só acontece no clique do usuário.

DROP TRIGGER IF EXISTS fantasy_rounds_seed_portfolios ON public.fantasy_rounds;

-- Remove somente rascunhos que foram criados pelo trigger no mesmo instante
-- da criação da rodada. Escalações confirmadas manualmente permanecem intactas.
DELETE FROM public.fantasy_lineups lineup
USING public.fantasy_rounds fantasy_round
WHERE lineup.fantasy_round_id = fantasy_round.id
  AND fantasy_round.market_status = 'open'
  AND lineup.status = 'draft'
  AND lineup.created_at = fantasy_round.created_at
  AND lineup.updated_at = fantasy_round.created_at;
