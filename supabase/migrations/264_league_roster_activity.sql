-- Cada ADM acompanha novos cadastros separadamente em cada pelada.
-- Aplicar somente depois da 253 (membros por pelada).
BEGIN;

ALTER TABLE public.admin_roster_reads
  ADD COLUMN IF NOT EXISTS league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE;

-- Preserva a data antiga para todas as peladas que o ADM ja administra.
-- A linha sem pelada nao tem significado depois da separacao.
UPDATE public.admin_roster_reads read_state
SET league_id = (
  SELECT member.league_id FROM public.league_members member
  WHERE member.user_id = read_state.user_id AND member.is_active AND member.role = 'admin'
  ORDER BY member.league_id LIMIT 1
)
WHERE read_state.league_id IS NULL;

DELETE FROM public.admin_roster_reads WHERE league_id IS NULL;

ALTER TABLE public.admin_roster_reads DROP CONSTRAINT admin_roster_reads_pkey;
ALTER TABLE public.admin_roster_reads ALTER COLUMN league_id SET NOT NULL;
ALTER TABLE public.admin_roster_reads
  ADD CONSTRAINT admin_roster_reads_pkey PRIMARY KEY (user_id, league_id);

INSERT INTO public.admin_roster_reads (user_id, league_id, last_seen_at)
SELECT member.user_id, member.league_id, COALESCE(
  (SELECT existing.last_seen_at FROM public.admin_roster_reads existing
   WHERE existing.user_id = member.user_id ORDER BY existing.last_seen_at DESC LIMIT 1),
  now()
)
FROM public.league_members member
WHERE member.user_id IS NOT NULL AND member.is_active AND member.role = 'admin'
ON CONFLICT (user_id, league_id) DO NOTHING;

-- O gatilho antigo era ligado ao papel global da conta; novos ADMs sao
-- identificados pelo vinculo administrativo na pelada especifica.
DROP TRIGGER IF EXISTS account_profiles_initialize_roster_read ON public.account_profiles;
DROP FUNCTION IF EXISTS public.initialize_admin_roster_read();

CREATE OR REPLACE FUNCTION public.initialize_league_admin_roster_read()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.is_active AND NEW.role = 'admin' THEN
    INSERT INTO public.admin_roster_reads (user_id, league_id, last_seen_at)
    VALUES (NEW.user_id, NEW.league_id, now())
    ON CONFLICT (user_id, league_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_members_initialize_roster_read ON public.league_members;
CREATE TRIGGER league_members_initialize_roster_read
AFTER INSERT OR UPDATE OF user_id, role, is_active ON public.league_members
FOR EACH ROW EXECUTE FUNCTION public.initialize_league_admin_roster_read();

-- A assinatura antiga sem pelada nao pode mais atualizar a leitura global.
DROP FUNCTION IF EXISTS public.mark_roster_activity_seen();

CREATE OR REPLACE FUNCTION public.mark_roster_activity_seen_through(
  p_league_id uuid, p_seen_through timestamptz
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
  IF p_seen_through IS NULL THEN
    RAISE EXCEPTION 'Data de leitura invalida.';
  END IF;

  INSERT INTO public.admin_roster_reads (user_id, league_id, last_seen_at)
  VALUES (auth.uid(), p_league_id, LEAST(p_seen_through, now()))
  ON CONFLICT (user_id, league_id) DO UPDATE
    SET last_seen_at = GREATEST(
      public.admin_roster_reads.last_seen_at, EXCLUDED.last_seen_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_roster_activity_seen(p_league_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.mark_roster_activity_seen_through(p_league_id, now());
END;
$$;

-- Um ADM so le eventos de jogadores pertencentes a alguma pelada que
-- administra. A consulta da tela ainda restringe a pelada selecionada.
DROP POLICY IF EXISTS "Admins read registration history" ON public.player_registration_events;
CREATE POLICY league_admins_read_registration_history
ON public.player_registration_events FOR SELECT TO authenticated
USING (
  player_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.league_members member
    WHERE member.player_id = player_registration_events.player_id
      AND member.is_active AND public.is_league_admin(member.league_id)
  )
);

DROP POLICY IF EXISTS "Admins read own roster state" ON public.admin_roster_reads;
DROP POLICY IF EXISTS "Admins insert own roster state" ON public.admin_roster_reads;
DROP POLICY IF EXISTS "Admins update own roster state" ON public.admin_roster_reads;
CREATE POLICY league_admins_read_own_roster_state
ON public.admin_roster_reads FOR SELECT TO authenticated
USING (user_id = auth.uid() AND public.is_league_admin(league_id));

REVOKE ALL ON public.admin_roster_reads FROM anon, authenticated;
GRANT SELECT ON public.admin_roster_reads TO authenticated;
REVOKE ALL ON FUNCTION public.initialize_league_admin_roster_read() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_roster_activity_seen_through(uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_roster_activity_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_roster_activity_seen_through(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_roster_activity_seen(uuid) TO authenticated;

COMMIT;
