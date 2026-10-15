-- Inventario de cartas por pelada. Aplicar apos 259 em banco de teste antes
-- de criar a segunda pelada. O historico sem pacote pertence a BQ original.
BEGIN;

ALTER TABLE public.fantasy_user_cards
  ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE;

UPDATE public.fantasy_user_cards card SET league_id = round_item.league_id
FROM public.fantasy_round_packs pack
JOIN public.rounds round_item ON round_item.id = pack.round_id
WHERE card.source_pack_id = pack.id AND card.league_id IS NULL;

UPDATE public.fantasy_user_cards card SET league_id = season_item.league_id
FROM public.fantasy_round_packs pack
JOIN public.fantasy_season_pass_rewards reward ON reward.id = pack.fantasy_season_pass_reward_id
JOIN public.fantasy_seasons season_item ON season_item.id = reward.fantasy_season_id
WHERE card.source_pack_id = pack.id AND card.league_id IS NULL;

DO $$
DECLARE original_league_id uuid;
BEGIN
  SELECT id INTO original_league_id FROM public.leagues ORDER BY created_at, id LIMIT 1;
  IF original_league_id IS NULL THEN RAISE EXCEPTION 'Pelada original nao encontrada'; END IF;
  IF (SELECT count(*) FROM public.leagues) > 1
    AND EXISTS (SELECT 1 FROM public.fantasy_user_cards WHERE league_id IS NULL) THEN
    RAISE EXCEPTION 'Cartas sem origem precisam de conciliacao antes da segunda pelada';
  END IF;
  UPDATE public.fantasy_user_cards SET league_id = original_league_id WHERE league_id IS NULL;
END $$;

ALTER TABLE public.fantasy_user_cards ALTER COLUMN league_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS fantasy_user_cards_league_user_status
  ON public.fantasy_user_cards (league_id, user_id, status);

CREATE OR REPLACE FUNCTION public.validate_fantasy_card_pack_league()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pack_league_id uuid; pack_user_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.league_id IS DISTINCT FROM OLD.league_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.card_id IS DISTINCT FROM OLD.card_id
      OR (NEW.source_pack_id IS DISTINCT FROM OLD.source_pack_id AND NEW.source_pack_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Origem e titular da carta nao podem ser alterados';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.source_pack_id IS NULL THEN
    RAISE EXCEPTION 'Carta nova deve ter pacote de origem';
  END IF;
  IF NEW.source_pack_id IS NOT NULL THEN
    SELECT COALESCE(round_item.league_id, season_item.league_id), pack.user_id
      INTO pack_league_id, pack_user_id
    FROM public.fantasy_round_packs pack
    LEFT JOIN public.rounds round_item ON round_item.id = pack.round_id
    LEFT JOIN public.fantasy_season_pass_rewards reward ON reward.id = pack.fantasy_season_pass_reward_id
    LEFT JOIN public.fantasy_seasons season_item ON season_item.id = reward.fantasy_season_id
    WHERE pack.id = NEW.source_pack_id;
    IF pack_league_id IS NULL OR pack_league_id <> NEW.league_id OR pack_user_id <> NEW.user_id THEN
      RAISE EXCEPTION 'Pacote de origem pertence a outra pelada ou conta';
    END IF;
    IF TG_OP = 'INSERT' AND NOT EXISTS (
      SELECT 1 FROM public.fantasy_pack_offers offer
      WHERE offer.pack_id = NEW.source_pack_id AND offer.card_id = NEW.card_id
    ) THEN
      RAISE EXCEPTION 'Carta nao foi oferecida neste pacote';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fantasy_card_pack_league_guard ON public.fantasy_user_cards;
CREATE TRIGGER fantasy_card_pack_league_guard BEFORE INSERT OR UPDATE OF league_id, source_pack_id, user_id, card_id
ON public.fantasy_user_cards FOR EACH ROW EXECUTE FUNCTION public.validate_fantasy_card_pack_league();

ALTER TABLE public.fantasy_user_cards ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE old_policy record;
BEGIN
  FOR old_policy IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fantasy_user_cards' LOOP
    EXECUTE format('DROP POLICY %I ON public.fantasy_user_cards', old_policy.policyname);
  END LOOP;
END $$;
REVOKE ALL ON public.fantasy_user_cards FROM anon;
CREATE POLICY fantasy_card_inventory_read ON public.fantasy_user_cards FOR SELECT TO authenticated
  USING (public.is_league_member(league_id)
    AND (user_id = auth.uid() OR public.is_league_admin(league_id)));
CREATE POLICY fantasy_card_inventory_insert ON public.fantasy_user_cards FOR INSERT TO authenticated
  WITH CHECK (public.is_league_member(league_id)
    AND (user_id = auth.uid() OR public.is_league_admin(league_id)));
CREATE POLICY fantasy_card_inventory_update ON public.fantasy_user_cards FOR UPDATE TO authenticated
  USING (public.is_league_member(league_id)
    AND (user_id = auth.uid() OR public.is_league_admin(league_id)))
  WITH CHECK (public.is_league_member(league_id)
    AND (user_id = auth.uid() OR public.is_league_admin(league_id)));
CREATE POLICY fantasy_card_inventory_delete ON public.fantasy_user_cards FOR DELETE TO authenticated
  USING (public.is_league_member(league_id)
    AND (user_id = auth.uid() OR public.is_league_admin(league_id)));

-- A ativacao nao pode referenciar uma carta de outra pelada, mesmo quando a
-- mesma conta participa das duas.
CREATE OR REPLACE FUNCTION public.card_matches_fantasy_round(
  p_user_card_id uuid, p_round_id uuid, p_user_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fantasy_user_cards card
    JOIN public.rounds round_item ON round_item.id = p_round_id
    WHERE card.id = p_user_card_id AND card.user_id = p_user_id
      AND card.league_id = round_item.league_id
      AND public.is_league_member(round_item.league_id)
  );
$$;
REVOKE ALL ON FUNCTION public.card_matches_fantasy_round(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.card_matches_fantasy_round(uuid, uuid, uuid) TO authenticated;
DROP POLICY IF EXISTS fantasy_activation_insert ON public.fantasy_card_activations;
DROP POLICY IF EXISTS fantasy_activation_update ON public.fantasy_card_activations;
CREATE POLICY fantasy_activation_insert ON public.fantasy_card_activations FOR INSERT TO authenticated
  WITH CHECK (public.card_matches_fantasy_round(user_card_id, round_id, user_id)
    AND EXISTS (SELECT 1 FROM public.rounds round_item WHERE round_item.id = round_id
      AND (user_id = auth.uid() OR public.is_league_admin(round_item.league_id))));
CREATE POLICY fantasy_activation_update ON public.fantasy_card_activations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rounds round_item WHERE round_item.id = round_id
    AND public.is_league_member(round_item.league_id)
    AND (user_id = auth.uid() OR public.is_league_admin(round_item.league_id))))
  WITH CHECK (public.card_matches_fantasy_round(user_card_id, round_id, user_id)
    AND EXISTS (SELECT 1 FROM public.rounds round_item WHERE round_item.id = round_id
      AND (user_id = auth.uid() OR public.is_league_admin(round_item.league_id))));

COMMIT;
