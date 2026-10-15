-- Passe, escolhas, loja e loadouts limitados à temporada da pelada.
-- Aplicar após 261-262 em banco de ensaio.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fantasy_season_pass_events event_item
    JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id = event_item.fantasy_season_id
    JOIN public.rounds round_item ON round_item.id = event_item.source_round_id
    WHERE round_item.league_id IS DISTINCT FROM fantasy_season.league_id) THEN
    RAISE EXCEPTION 'Eventos do Passe referenciam rodadas de outra pelada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fantasy_season_pass_shop_items item
    JOIN public.fantasy_season_pass_rewards reward ON reward.id = item.source_reward_id
    WHERE reward.fantasy_season_id IS DISTINCT FROM item.fantasy_season_id) THEN
    RAISE EXCEPTION 'Loja do Passe possui recompensas de outra temporada';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_fantasy_pass_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE expected_league_id uuid; round_league_id uuid; reward_season_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'fantasy_season_pass_events' AND NEW.source_round_id IS NOT NULL THEN
    SELECT league_id INTO expected_league_id FROM public.fantasy_seasons
      WHERE id = NEW.fantasy_season_id;
    SELECT league_id INTO round_league_id FROM public.rounds
      WHERE id = NEW.source_round_id;
    IF expected_league_id IS NULL OR round_league_id IS DISTINCT FROM expected_league_id THEN
      RAISE EXCEPTION 'Evento do Passe referencia rodada de outra pelada';
    END IF;
  ELSIF TG_TABLE_NAME = 'fantasy_season_pass_shop_items' THEN
    SELECT fantasy_season_id INTO reward_season_id
      FROM public.fantasy_season_pass_rewards WHERE id = NEW.source_reward_id;
    IF reward_season_id IS NULL OR reward_season_id IS DISTINCT FROM NEW.fantasy_season_id THEN
      RAISE EXCEPTION 'Oferta do Passe referencia outra temporada';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fantasy_pass_event_league_guard ON public.fantasy_season_pass_events;
CREATE TRIGGER fantasy_pass_event_league_guard BEFORE INSERT OR UPDATE OF fantasy_season_id, source_round_id
ON public.fantasy_season_pass_events FOR EACH ROW EXECUTE FUNCTION public.validate_fantasy_pass_links();
DROP TRIGGER IF EXISTS fantasy_pass_shop_league_guard ON public.fantasy_season_pass_shop_items;
CREATE TRIGGER fantasy_pass_shop_league_guard BEFORE INSERT OR UPDATE OF fantasy_season_id, source_reward_id
ON public.fantasy_season_pass_shop_items FOR EACH ROW EXECUTE FUNCTION public.validate_fantasy_pass_links();

DO $$
DECLARE item record; old_policy record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('fantasy_season_passes'), ('fantasy_season_pass_events'),
    ('fantasy_season_pass_rewards'), ('fantasy_season_pass_reward_options'),
    ('fantasy_season_pass_shop_items'), ('fantasy_user_cosmetic_reward_choices'),
    ('fantasy_user_cosmetic_loadouts')
  ) AS scope(table_name) LOOP
    IF to_regclass(format('public.%I', item.table_name)) IS NULL THEN
      RAISE EXCEPTION 'Tabela obrigatoria do Passe ausente: %', item.table_name;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.table_name);
    FOR old_policy IN SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = item.table_name LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', old_policy.policyname, item.table_name);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', item.table_name);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', item.table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', item.table_name);
  END LOOP;
END $$;

CREATE POLICY fantasy_pass_league_read ON public.fantasy_season_passes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fantasy_seasons fs
    WHERE fs.id = fantasy_season_id AND public.is_league_member(fs.league_id)
      AND (user_id = auth.uid() OR public.is_league_admin(fs.league_id))));
CREATE POLICY fantasy_pass_event_league_read ON public.fantasy_season_pass_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fantasy_seasons fs
    WHERE fs.id = fantasy_season_id AND public.is_league_member(fs.league_id)
      AND (user_id = auth.uid() OR public.is_league_admin(fs.league_id))));
CREATE POLICY fantasy_pass_reward_league_read ON public.fantasy_season_pass_rewards FOR SELECT TO authenticated
  USING (public.can_access_fantasy_season(fantasy_season_id));
CREATE POLICY fantasy_pass_option_league_read ON public.fantasy_season_pass_reward_options FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fantasy_season_pass_rewards reward
    JOIN public.fantasy_seasons fs ON fs.id = reward.fantasy_season_id
    WHERE reward.id = reward_id AND public.is_league_member(fs.league_id)
      AND (reward.house < 40 OR public.is_league_admin(fs.league_id)
        OR EXISTS (SELECT 1 FROM public.fantasy_season_passes pass
          WHERE pass.fantasy_season_id = fs.id AND pass.user_id = auth.uid()
            AND pass.progress >= 40))
  ));
CREATE POLICY fantasy_pass_shop_league_read ON public.fantasy_season_pass_shop_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fantasy_seasons fs
    WHERE fs.id = fantasy_season_id AND public.is_league_member(fs.league_id)
      AND (user_id = auth.uid() OR public.is_league_admin(fs.league_id))));
CREATE POLICY fantasy_cosmetic_choice_league_read ON public.fantasy_user_cosmetic_reward_choices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fantasy_season_pass_rewards reward
    JOIN public.fantasy_seasons fs ON fs.id = reward.fantasy_season_id
    WHERE reward.id = reward_id AND public.is_league_member(fs.league_id)
      AND (user_id = auth.uid() OR public.is_league_admin(fs.league_id))));
-- O visual equipado é público aos integrantes da própria pelada.
CREATE POLICY fantasy_loadout_league_read ON public.fantasy_user_cosmetic_loadouts FOR SELECT TO authenticated
  USING (public.can_access_fantasy_season(fantasy_season_id));

-- As duas limpezas sem ID de temporada eram globais. Revogar a assinatura
-- antiga e publicar uma versão com temporada explícita.
REVOKE ALL ON FUNCTION public.cleanup_my_cosmetics_preview(),
  public.dismiss_my_unopened_bronze_pass_pack() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_my_cosmetics_preview(p_fantasy_season_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target_league_id uuid; changed integer; column_name text;
BEGIN
  SELECT league_id INTO target_league_id FROM public.fantasy_seasons WHERE id = p_fantasy_season_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente ADM da pelada pode limpar a previa';
  END IF;
  FOREACH column_name IN ARRAY ARRAY[
    'banner_cosmetic_id', 'frame_cosmetic_id', 'title_cosmetic_id',
    'aura_cosmetic_id', 'nameplate_cosmetic_id', 'background_cosmetic_id',
    'showcase_cosmetic_id', 'pitch_cosmetic_id'
  ] LOOP
    EXECUTE format('UPDATE public.fantasy_user_cosmetic_loadouts loadout SET %I = NULL, updated_at = now() WHERE loadout.user_id = $1 AND loadout.fantasy_season_id IN (SELECT id FROM public.fantasy_seasons WHERE league_id = $2) AND EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own WHERE own.league_id = $2 AND own.user_id = $1 AND own.cosmetic_id = loadout.%I AND own.source_reward_id IS NULL)', column_name, column_name)
      USING auth.uid(), target_league_id;
  END LOOP;
  DELETE FROM public.fantasy_user_cosmetics
    WHERE league_id = target_league_id AND user_id = auth.uid() AND source_reward_id IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_my_unopened_bronze_pass_pack(p_fantasy_season_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target_league_id uuid; changed integer;
BEGIN
  SELECT league_id INTO target_league_id FROM public.fantasy_seasons WHERE id = p_fantasy_season_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente ADM da pelada pode limpar pacotes';
  END IF;
  UPDATE public.fantasy_round_packs pack SET status = 'dismissed'
  FROM public.fantasy_season_pass_rewards reward
  WHERE pack.fantasy_season_pass_reward_id = reward.id
    AND reward.fantasy_season_id = p_fantasy_season_id
    AND pack.user_id = auth.uid() AND pack.source = 'season_pass'
    AND pack.card_tier = 'bronze' AND pack.status = 'available';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_my_test_pass_cosmetic_claims(p_fantasy_season_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target_league_id uuid; removed_choices integer; removed_cosmetics integer; column_name text;
BEGIN
  SELECT league_id INTO target_league_id FROM public.fantasy_seasons WHERE id = p_fantasy_season_id;
  IF target_league_id IS NULL OR NOT public.is_league_admin(target_league_id) THEN
    RAISE EXCEPTION 'Somente ADM da pelada pode limpar resgates de teste';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fantasy_season_passes
    WHERE user_id = auth.uid() AND fantasy_season_id = p_fantasy_season_id) THEN
    RAISE EXCEPTION 'Passe da temporada nao encontrado';
  END IF;
  FOREACH column_name IN ARRAY ARRAY[
    'banner_cosmetic_id', 'frame_cosmetic_id', 'title_cosmetic_id',
    'aura_cosmetic_id', 'nameplate_cosmetic_id', 'background_cosmetic_id',
    'showcase_cosmetic_id', 'pitch_cosmetic_id'
  ] LOOP
    EXECUTE format('UPDATE public.fantasy_user_cosmetic_loadouts loadout SET %I = NULL, updated_at = now() WHERE loadout.user_id = $1 AND loadout.fantasy_season_id IN (SELECT id FROM public.fantasy_seasons WHERE league_id = $2) AND EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics own JOIN public.fantasy_season_pass_rewards reward ON reward.id = own.source_reward_id WHERE own.league_id = $2 AND own.user_id = $1 AND own.cosmetic_id = loadout.%I AND reward.fantasy_season_id = $3 AND NOT EXISTS (SELECT 1 FROM public.fantasy_season_pass_shop_items bought JOIN public.fantasy_seasons bought_season ON bought_season.id = bought.fantasy_season_id WHERE bought_season.league_id = $2 AND bought.user_id = $1 AND bought.cosmetic_id = own.cosmetic_id AND bought.purchased_at IS NOT NULL))', column_name, column_name)
      USING auth.uid(), target_league_id, p_fantasy_season_id;
  END LOOP;
  DELETE FROM public.fantasy_user_cosmetic_reward_choices choice_item
  USING public.fantasy_season_pass_rewards reward
  WHERE choice_item.user_id = auth.uid() AND choice_item.reward_id = reward.id
    AND reward.fantasy_season_id = p_fantasy_season_id;
  GET DIAGNOSTICS removed_choices = ROW_COUNT;
  DELETE FROM public.fantasy_user_cosmetics own
  USING public.fantasy_season_pass_rewards reward
  WHERE own.league_id = target_league_id AND own.user_id = auth.uid()
    AND own.source_reward_id = reward.id AND reward.fantasy_season_id = p_fantasy_season_id
    AND NOT EXISTS (SELECT 1 FROM public.fantasy_season_pass_shop_items bought
      JOIN public.fantasy_seasons bought_season ON bought_season.id = bought.fantasy_season_id
      WHERE bought_season.league_id = target_league_id
        AND bought.user_id = auth.uid() AND bought.cosmetic_id = own.cosmetic_id
        AND bought.purchased_at IS NOT NULL);
  GET DIAGNOSTICS removed_cosmetics = ROW_COUNT;
  RETURN removed_choices + removed_cosmetics;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_my_cosmetics_preview(uuid),
  public.dismiss_my_unopened_bronze_pass_pack(uuid),
  public.reset_my_test_pass_cosmetic_claims(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_my_cosmetics_preview(uuid),
  public.dismiss_my_unopened_bronze_pass_pack(uuid),
  public.reset_my_test_pass_cosmetic_claims(uuid) TO authenticated;

-- Recalcular o Passe por ID arbitrário é uma operação de manutenção elevada.
-- Triggers e rotinas internas continuam podendo invocá-la pelo proprietário.
REVOKE ALL ON FUNCTION public.recalculate_fantasy_season_pass(uuid)
  FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF to_regprocedure('public.recalculate_fantasy_season_pass_pre_extra_shop_105(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.recalculate_fantasy_season_pass_pre_extra_shop_105(uuid)
      FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.recalculate_fantasy_season_pass_pre_participation_cycle_112(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.recalculate_fantasy_season_pass_pre_participation_cycle_112(uuid)
      FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
