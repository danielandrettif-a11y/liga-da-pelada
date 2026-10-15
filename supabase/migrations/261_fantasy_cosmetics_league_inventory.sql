-- Cosméticos são um catálogo global, mas a posse é independente por pelada.
-- Aplicar após 253-260 em banco de ensaio antes de criar outra pelada.
BEGIN;

ALTER TABLE public.fantasy_user_cosmetics
  ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE;

UPDATE public.fantasy_user_cosmetics own SET league_id = season_item.league_id
FROM public.fantasy_season_pass_rewards reward
JOIN public.fantasy_seasons season_item ON season_item.id = reward.fantasy_season_id
WHERE own.source_reward_id = reward.id AND own.league_id IS NULL;

DO $$
DECLARE original_league_id uuid;
BEGIN
  SELECT id INTO original_league_id FROM public.leagues ORDER BY created_at, id LIMIT 1;
  IF original_league_id IS NULL THEN RAISE EXCEPTION 'Pelada original nao encontrada'; END IF;
  IF (SELECT count(*) FROM public.leagues) > 1
    AND EXISTS (SELECT 1 FROM public.fantasy_user_cosmetics WHERE league_id IS NULL) THEN
    RAISE EXCEPTION 'Cosmeticos sem origem exigem conciliacao antes de outra pelada';
  END IF;
  UPDATE public.fantasy_user_cosmetics SET league_id = original_league_id WHERE league_id IS NULL;
END $$;

ALTER TABLE public.fantasy_user_cosmetics ALTER COLUMN league_id SET NOT NULL;
ALTER TABLE public.fantasy_user_cosmetics DROP CONSTRAINT IF EXISTS fantasy_user_cosmetics_pkey;
ALTER TABLE public.fantasy_user_cosmetics
  ADD CONSTRAINT fantasy_user_cosmetics_pkey PRIMARY KEY (league_id, user_id, cosmetic_id);
CREATE INDEX IF NOT EXISTS fantasy_user_cosmetics_user_league
  ON public.fantasy_user_cosmetics (user_id, league_id);

CREATE OR REPLACE FUNCTION public.validate_fantasy_cosmetic_origin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE source_league_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.league_id IS DISTINCT FROM OLD.league_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.cosmetic_id IS DISTINCT FROM OLD.cosmetic_id THEN
      RAISE EXCEPTION 'Origem e titular do cosmetico nao podem ser alterados';
    END IF;
  END IF;
  IF NEW.source_reward_id IS NOT NULL THEN
    SELECT season_item.league_id INTO source_league_id
    FROM public.fantasy_season_pass_rewards reward
    JOIN public.fantasy_seasons season_item ON season_item.id = reward.fantasy_season_id
    WHERE reward.id = NEW.source_reward_id;
    IF source_league_id IS NULL OR source_league_id <> NEW.league_id THEN
      RAISE EXCEPTION 'Recompensa pertence a outra pelada';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fantasy_cosmetic_origin_guard ON public.fantasy_user_cosmetics;
CREATE TRIGGER fantasy_cosmetic_origin_guard BEFORE INSERT OR UPDATE OF league_id, user_id, cosmetic_id, source_reward_id
ON public.fantasy_user_cosmetics FOR EACH ROW EXECUTE FUNCTION public.validate_fantasy_cosmetic_origin();

ALTER TABLE public.fantasy_user_cosmetics ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE old_policy record;
BEGIN
  FOR old_policy IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fantasy_user_cosmetics' LOOP
    EXECUTE format('DROP POLICY %I ON public.fantasy_user_cosmetics', old_policy.policyname);
  END LOOP;
END $$;
REVOKE ALL ON public.fantasy_user_cosmetics FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fantasy_user_cosmetics FROM authenticated;
GRANT SELECT ON public.fantasy_user_cosmetics TO authenticated;
CREATE POLICY fantasy_user_cosmetics_league_read ON public.fantasy_user_cosmetics
  FOR SELECT TO authenticated USING (public.is_league_member(league_id)
    AND (user_id = auth.uid() OR public.is_league_admin(league_id)));

-- A versão antiga, renomeada pela 105, continua executável se não for
-- revogada explicitamente; ela concede item sem identificar a pelada.
DO $$
BEGIN
  IF to_regprocedure('public.claim_fantasy_pass_cosmetic_pre_extra_shop_105(uuid,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.claim_fantasy_pass_cosmetic_pre_extra_shop_105(uuid,uuid)
      FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

COMMIT;
