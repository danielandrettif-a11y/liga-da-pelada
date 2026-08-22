-- Correção única da primeira rodada do Cartola.
-- Antes de saved_at existir não era possível distinguir, no histórico, o
-- clique em "Salvar escalação" do rascunho preparado automaticamente. Como a
-- rodada já foi encerrada, as escalações persistidas (scored/missed) são a
-- fonte histórica de participação para esta concessão única.
WITH rodada AS (
  SELECT fr.id AS fantasy_round_id, fr.round_id
  FROM public.fantasy_rounds fr
  JOIN public.rounds r ON r.id = fr.round_id
  WHERE r.number = 1
    AND r.round_type = 'official'
    AND r.status = 'finished'
    AND fr.market_status = 'finished'
  ORDER BY r.date DESC, r.created_at DESC
  LIMIT 1
), participantes AS (
  SELECT DISTINCT l.user_id, rodada.round_id
  FROM public.fantasy_lineups l
  JOIN rodada ON rodada.fantasy_round_id = l.fantasy_round_id
  WHERE l.status IN ('scored', 'missed')
)
INSERT INTO public.fantasy_round_packs (user_id, round_id, status, source)
SELECT user_id, round_id, 'available', 'round_reward'
FROM participantes
ON CONFLICT DO NOTHING;
