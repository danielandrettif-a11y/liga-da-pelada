-- A posse e o visual equipado passam a pertencer a conta, nao a uma pelada.
BEGIN;

DROP TRIGGER IF EXISTS fantasy_cosmetic_origin_guard ON public.fantasy_user_cosmetics;

-- Preserva uma aquisicao por conta/item antes de trocar a chave primaria.
DELETE FROM public.fantasy_user_cosmetics duplicate
USING public.fantasy_user_cosmetics keeper
WHERE duplicate.user_id = keeper.user_id
  AND duplicate.cosmetic_id = keeper.cosmetic_id
  AND (duplicate.acquired_at, duplicate.league_id, duplicate.ctid)
    > (keeper.acquired_at, keeper.league_id, keeper.ctid);

ALTER TABLE public.fantasy_user_cosmetics DROP CONSTRAINT IF EXISTS fantasy_user_cosmetics_pkey;
ALTER TABLE public.fantasy_user_cosmetics
  ADD CONSTRAINT fantasy_user_cosmetics_pkey PRIMARY KEY (user_id, cosmetic_id);
ALTER TABLE public.fantasy_user_cosmetics DROP CONSTRAINT IF EXISTS fantasy_user_cosmetics_league_origin_unique;
ALTER TABLE public.fantasy_user_cosmetics
  ADD CONSTRAINT fantasy_user_cosmetics_league_origin_unique UNIQUE (league_id, user_id, cosmetic_id);

CREATE OR REPLACE FUNCTION public.keep_global_cosmetic_inventory_unique()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fantasy_user_cosmetics owned
    WHERE owned.user_id = NEW.user_id AND owned.cosmetic_id = NEW.cosmetic_id
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fantasy_cosmetic_global_dedupe ON public.fantasy_user_cosmetics;
CREATE TRIGGER fantasy_cosmetic_global_dedupe
  BEFORE INSERT ON public.fantasy_user_cosmetics
  FOR EACH ROW EXECUTE FUNCTION public.keep_global_cosmetic_inventory_unique();

CREATE TABLE IF NOT EXISTS public.account_cosmetic_loadouts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  banner_cosmetic_id uuid REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  frame_cosmetic_id uuid REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  title_cosmetic_id uuid REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  aura_cosmetic_id uuid REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  nameplate_cosmetic_id uuid REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  background_cosmetic_id uuid REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  showcase_cosmetic_id uuid REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  pitch_cosmetic_id uuid REFERENCES public.fantasy_cosmetics(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.account_cosmetic_loadouts (
  user_id, banner_cosmetic_id, frame_cosmetic_id, title_cosmetic_id,
  aura_cosmetic_id, nameplate_cosmetic_id, background_cosmetic_id,
  showcase_cosmetic_id, pitch_cosmetic_id, updated_at
)
SELECT DISTINCT ON (loadout.user_id)
  loadout.user_id, loadout.banner_cosmetic_id, loadout.frame_cosmetic_id,
  loadout.title_cosmetic_id, loadout.aura_cosmetic_id,
  loadout.nameplate_cosmetic_id, loadout.background_cosmetic_id,
  loadout.showcase_cosmetic_id, loadout.pitch_cosmetic_id, loadout.updated_at
FROM public.fantasy_user_cosmetic_loadouts loadout
ORDER BY loadout.user_id, loadout.updated_at DESC, loadout.fantasy_season_id
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.fantasy_user_cosmetics ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE item record;
BEGIN
  FOR item IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fantasy_user_cosmetics' LOOP
    EXECUTE format('DROP POLICY %I ON public.fantasy_user_cosmetics', item.policyname);
  END LOOP;
END $$;
CREATE POLICY fantasy_user_cosmetics_shared_account_read
  ON public.fantasy_user_cosmetics FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1
      FROM public.league_members viewer
      JOIN public.league_members owner ON owner.league_id = viewer.league_id
      WHERE viewer.user_id = auth.uid() AND viewer.is_active
        AND owner.user_id = fantasy_user_cosmetics.user_id AND owner.is_active
    )
  );

ALTER TABLE public.account_cosmetic_loadouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_cosmetic_loadouts_shared_read
  ON public.account_cosmetic_loadouts FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.league_members viewer
      JOIN public.league_members owner ON owner.league_id = viewer.league_id
      WHERE viewer.user_id = auth.uid() AND viewer.is_active
        AND owner.user_id = account_cosmetic_loadouts.user_id AND owner.is_active
    )
  );
REVOKE INSERT, UPDATE, DELETE ON public.account_cosmetic_loadouts FROM authenticated;
GRANT SELECT ON public.account_cosmetic_loadouts TO authenticated;

CREATE OR REPLACE FUNCTION public.equip_account_cosmetic(p_slot text, p_cosmetic_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE column_name text; item_slot text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para personalizar o perfil'; END IF;
  IF p_slot NOT IN ('banner','frame','title','aura','nameplate','background','showcase','pitch') THEN
    RAISE EXCEPTION 'Slot cosmetico invalido';
  END IF;
  column_name := p_slot || '_cosmetic_id';
  IF p_cosmetic_id IS NOT NULL THEN
    SELECT cosmetic.slot INTO item_slot
    FROM public.fantasy_user_cosmetics owned
    JOIN public.fantasy_cosmetics cosmetic ON cosmetic.id = owned.cosmetic_id
    WHERE owned.user_id = auth.uid() AND owned.cosmetic_id = p_cosmetic_id;
    IF item_slot IS NULL OR item_slot <> p_slot THEN RAISE EXCEPTION 'Cosmetico nao pertence a conta ou ao slot'; END IF;
  END IF;
  INSERT INTO public.account_cosmetic_loadouts (user_id) VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;
  EXECUTE format('UPDATE public.account_cosmetic_loadouts SET %I = $1, updated_at = now() WHERE user_id = $2', column_name)
    USING p_cosmetic_id, auth.uid();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.equip_account_cosmetic(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equip_account_cosmetic(text,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
