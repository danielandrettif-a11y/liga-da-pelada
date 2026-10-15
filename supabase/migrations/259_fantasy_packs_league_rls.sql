-- Pacotes e ativacoes pertencem a rodada da pelada. O catalogo de cartas
-- continua compartilhado; o inventario sem liga sera migrado separadamente.
-- Aplicar depois de 253-258, somente apos testar em banco descartavel.
BEGIN;

-- Pacotes do Passe nao possuem round_id; sua origem e a recompensa da temporada.
CREATE OR REPLACE FUNCTION public.can_manage_fantasy_pack_scope(
  p_round_id uuid, p_reward_id uuid, p_user_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_round_id IS NOT NULL AND p_reward_id IS NULL THEN EXISTS (
      SELECT 1 FROM public.rounds round_item WHERE round_item.id = p_round_id
        AND public.is_league_member(round_item.league_id)
        AND (p_user_id = auth.uid() OR public.is_league_admin(round_item.league_id))
    )
    WHEN p_round_id IS NULL AND p_reward_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.fantasy_season_pass_rewards reward
      JOIN public.fantasy_seasons season_item ON season_item.id = reward.fantasy_season_id
      WHERE reward.id = p_reward_id AND public.is_league_member(season_item.league_id)
        AND (p_user_id = auth.uid() OR public.is_league_admin(season_item.league_id))
    )
    ELSE false
  END;
$$;
CREATE OR REPLACE FUNCTION public.can_manage_fantasy_pack(p_pack_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.fantasy_round_packs pack WHERE pack.id = p_pack_id
    AND public.can_manage_fantasy_pack_scope(pack.round_id, pack.fantasy_season_pass_reward_id, pack.user_id));
$$;
REVOKE ALL ON FUNCTION public.can_manage_fantasy_pack_scope(uuid, uuid, uuid),
  public.can_manage_fantasy_pack(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_fantasy_pack_scope(uuid, uuid, uuid),
  public.can_manage_fantasy_pack(uuid) TO authenticated;

DO $$
DECLARE item record; old_policy record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('fantasy_round_packs'), ('fantasy_pack_offers'), ('fantasy_card_activations')
  ) AS scope(table_name) LOOP
    IF to_regclass(format('public.%I', item.table_name)) IS NULL THEN
      RAISE EXCEPTION 'Tabela obrigatoria ausente: %', item.table_name;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.table_name);
    FOR old_policy IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = item.table_name LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', old_policy.policyname, item.table_name);
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', item.table_name);
  END LOOP;
END $$;

CREATE POLICY fantasy_pack_read ON public.fantasy_round_packs FOR SELECT TO authenticated
  USING (public.can_manage_fantasy_pack_scope(round_id, fantasy_season_pass_reward_id, user_id));
CREATE POLICY fantasy_pack_insert ON public.fantasy_round_packs FOR INSERT TO authenticated
  WITH CHECK (
    (round_id IS NOT NULL AND fantasy_season_pass_reward_id IS NULL AND EXISTS (
      SELECT 1 FROM public.rounds round_item WHERE round_item.id = round_id
        AND public.is_league_admin(round_item.league_id)
    )) OR
    (round_id IS NULL AND fantasy_season_pass_reward_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.fantasy_season_pass_rewards reward
      JOIN public.fantasy_seasons season_item ON season_item.id = reward.fantasy_season_id
      WHERE reward.id = fantasy_season_pass_reward_id
        AND public.is_league_admin(season_item.league_id)
    ))
  );
CREATE POLICY fantasy_pack_update ON public.fantasy_round_packs FOR UPDATE TO authenticated
  USING (public.can_manage_fantasy_pack_scope(round_id, fantasy_season_pass_reward_id, user_id))
  WITH CHECK (public.can_manage_fantasy_pack_scope(round_id, fantasy_season_pass_reward_id, user_id));
CREATE POLICY fantasy_pack_delete ON public.fantasy_round_packs FOR DELETE TO authenticated
  USING (public.can_manage_fantasy_pack_scope(round_id, fantasy_season_pass_reward_id, user_id));

CREATE OR REPLACE FUNCTION public.keep_fantasy_pack_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.round_id IS DISTINCT FROM OLD.round_id
    OR NEW.fantasy_season_pass_reward_id IS DISTINCT FROM OLD.fantasy_season_pass_reward_id
    OR NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'Origem e titular do pacote nao podem ser alterados';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fantasy_pack_scope_guard ON public.fantasy_round_packs;
CREATE TRIGGER fantasy_pack_scope_guard BEFORE UPDATE ON public.fantasy_round_packs
FOR EACH ROW EXECUTE FUNCTION public.keep_fantasy_pack_scope();

CREATE POLICY fantasy_offer_read ON public.fantasy_pack_offers FOR SELECT TO authenticated
  USING (public.can_manage_fantasy_pack(pack_id));
CREATE POLICY fantasy_offer_insert ON public.fantasy_pack_offers FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_fantasy_pack(pack_id));
CREATE POLICY fantasy_offer_update ON public.fantasy_pack_offers FOR UPDATE TO authenticated
  USING (public.can_manage_fantasy_pack(pack_id))
  WITH CHECK (public.can_manage_fantasy_pack(pack_id));
CREATE POLICY fantasy_offer_delete ON public.fantasy_pack_offers FOR DELETE TO authenticated
  USING (public.can_manage_fantasy_pack(pack_id));

CREATE POLICY fantasy_activation_read ON public.fantasy_card_activations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rounds round_item WHERE round_item.id = round_id
      AND public.is_league_member(round_item.league_id)
      AND (user_id = auth.uid() OR status IN ('LOCKED', 'RESOLVED')
        OR public.is_league_admin(round_item.league_id))
  ));
CREATE POLICY fantasy_activation_insert ON public.fantasy_card_activations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rounds round_item WHERE round_item.id = round_id
      AND public.is_league_member(round_item.league_id)
      AND (user_id = auth.uid() OR public.is_league_admin(round_item.league_id))
  ));
CREATE POLICY fantasy_activation_update ON public.fantasy_card_activations FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rounds round_item WHERE round_item.id = round_id
      AND public.is_league_member(round_item.league_id)
      AND (user_id = auth.uid() OR public.is_league_admin(round_item.league_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rounds round_item WHERE round_item.id = round_id
      AND public.is_league_member(round_item.league_id)
      AND (user_id = auth.uid() OR public.is_league_admin(round_item.league_id))
  ));
CREATE POLICY fantasy_activation_delete ON public.fantasy_card_activations FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rounds round_item WHERE round_item.id = round_id
      AND public.is_league_member(round_item.league_id)
      AND (user_id = auth.uid() OR public.is_league_admin(round_item.league_id))
  ));

-- Funcoes SECURITY DEFINER ignoram RLS: repetir autorizacao pela pelada.
CREATE OR REPLACE FUNCTION public.ensure_fantasy_round_reward_packs(p_round_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE inserted_count integer := 0; target_league_id uuid;
BEGIN
  SELECT league_id INTO target_league_id FROM public.rounds WHERE id = p_round_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente ADM da pelada pode gerar pacotes desta rodada.';
  END IF;
  INSERT INTO public.fantasy_round_packs (user_id, round_id, status, source)
  SELECT DISTINCT lineup.user_id, p_round_id, 'available', 'round_reward'
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  JOIN public.league_members member ON member.user_id = lineup.user_id
    AND member.league_id = target_league_id AND member.is_active
  WHERE fantasy_round.round_id = p_round_id
    AND lineup.status IN ('scored', 'missed') AND lineup.saved_at IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_my_pass_card_packs(p_fantasy_season_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE user_progress integer; restored_count integer := 0; target_league_id uuid;
BEGIN
  SELECT league_id INTO target_league_id FROM public.fantasy_seasons WHERE id = p_fantasy_season_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente ADM da pelada pode reativar os pacotes desta temporada.';
  END IF;
  SELECT progress INTO user_progress FROM public.fantasy_season_passes
    WHERE user_id = auth.uid() AND fantasy_season_id = p_fantasy_season_id;
  IF user_progress IS NULL THEN RAISE EXCEPTION 'Passe da temporada nao encontrado.'; END IF;
  INSERT INTO public.fantasy_round_packs
    (user_id, round_id, status, source, fantasy_season_pass_reward_id, card_tier)
  SELECT auth.uid(), NULL, 'available', 'season_pass', reward.id, reward.card_tier
  FROM public.fantasy_season_pass_rewards reward
  WHERE reward.fantasy_season_id = p_fantasy_season_id
    AND reward.reward_type = 'card_pack' AND user_progress >= reward.house
  ON CONFLICT (user_id, fantasy_season_pass_reward_id)
    WHERE fantasy_season_pass_reward_id IS NOT NULL
  DO UPDATE SET status = CASE WHEN fantasy_round_packs.status = 'dismissed'
    THEN 'available' ELSE fantasy_round_packs.status END, card_tier = EXCLUDED.card_tier;
  GET DIAGNOSTICS restored_count = ROW_COUNT;
  RETURN restored_count;
END;
$$;

COMMIT;
