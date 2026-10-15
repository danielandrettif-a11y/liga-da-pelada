-- Pacotes e inventário: idempotência contra duplo toque/reenvio e índices para
-- o painel do Cartola. Aplicar depois da 311.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.fantasy_user_cards
    WHERE source_pack_id IS NOT NULL
    GROUP BY source_pack_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem pacotes com mais de uma carta no inventario; execute a auditoria antes da migration 312.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_user_cards_one_per_pack_uq
  ON public.fantasy_user_cards (source_pack_id)
  WHERE source_pack_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fantasy_round_packs_user_created_idx
  ON public.fantasy_round_packs (user_id, created_at DESC)
  INCLUDE (status, round_id, fantasy_season_pass_reward_id, card_tier, source);

CREATE INDEX IF NOT EXISTS fantasy_user_cards_league_user_acquired_idx
  ON public.fantasy_user_cards (league_id, user_id, acquired_at DESC)
  INCLUDE (status, card_id, source_pack_id);

CREATE INDEX IF NOT EXISTS fantasy_card_activations_user_round_idx
  ON public.fantasy_card_activations (user_id, round_id)
  INCLUDE (status, user_card_id, card_id);

ANALYZE public.fantasy_round_packs;
ANALYZE public.fantasy_pack_offers;
ANALYZE public.fantasy_user_cards;
ANALYZE public.fantasy_card_activations;

COMMIT;
