-- Diferencia convidados permanentes dos perfis efêmeros de uma partida
-- rápida. Ambos continuam jogáveis como member_category = 'guest', mas só os
-- quick_session são removidos junto com a sessão descartável.

BEGIN;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS profile_scope text NOT NULL DEFAULT 'persistent';

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_profile_scope_check;
ALTER TABLE public.players
  ADD CONSTRAINT players_profile_scope_check
  CHECK (profile_scope IN ('persistent', 'quick_session'));

CREATE INDEX IF NOT EXISTS players_quick_session_scope_idx
  ON public.players (created_at, id)
  WHERE profile_scope = 'quick_session';

-- Protege eventuais perfis criados entre a aplicação da 343 e desta migration.
UPDATE public.players player
SET profile_scope = 'quick_session'
WHERE player.member_category = 'guest'
  AND player.profile_scope = 'persistent'
  AND EXISTS (
    SELECT 1
    FROM public.league_members member
    JOIN public.leagues league ON league.id = member.league_id
    WHERE member.player_id = player.id
      AND league.feature_tier = 'quick'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.league_members member
    JOIN public.leagues league ON league.id = member.league_id
    WHERE member.player_id = player.id
      AND league.feature_tier <> 'quick'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.account_profiles profile
    WHERE profile.player_id = player.id
  );

CREATE OR REPLACE FUNCTION public.create_callup_guest(
  p_callup_id uuid,
  p_name text,
  p_player_profile text DEFAULT 'midfield',
  p_is_goalkeeper boolean DEFAULT false
)
RETURNS public.callup_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  guest_player public.players%ROWTYPE;
  created_entry public.callup_entries%ROWTYPE;
  target_feature_tier text;
  target_profile_scope text := 'persistent';
  clean_name text := left(btrim(COALESCE(p_name, '')), 120);
  clean_profile text := COALESCE(p_player_profile, 'midfield');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para contratar um amigo.' USING ERRCODE = '42501';
  END IF;
  IF length(clean_name) < 2 THEN
    RAISE EXCEPTION 'Informe o nome do seu amigo (pelo menos 2 letras).' USING ERRCODE = '22023';
  END IF;
  IF clean_profile NOT IN ('offensive', 'midfield', 'defensive') THEN
    clean_profile := 'midfield';
  END IF;

  SELECT callup.*
    INTO current_callup
  FROM public.callups callup
  JOIN public.leagues league ON league.id = callup.league_id
  WHERE callup.id = p_callup_id
    AND league.is_active
    AND league.archived_at IS NULL
  FOR UPDATE OF callup;
  IF NOT FOUND OR current_callup.status NOT IN ('open', 'converted') THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;
  SELECT league.feature_tier
    INTO target_feature_tier
  FROM public.leagues league
  WHERE league.id = current_callup.league_id;
  IF NOT public.can_access_callup(p_callup_id) THEN
    RAISE EXCEPTION 'Esta convocacao e privada. Use o convite enviado pelo ADM.' USING ERRCODE = '42501';
  END IF;
  IF target_feature_tier = 'quick' AND NOT public.is_league_admin(current_callup.league_id) THEN
    RAISE EXCEPTION 'Somente o responsavel pela partida rapida pode adicionar jogadores.' USING ERRCODE = '42501';
  END IF;
  IF current_callup.status = 'converted' AND current_callup.round_id IS NULL THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;
  IF current_callup.round_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = current_callup.round_id
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
  ) THEN
    RAISE EXCEPTION 'A convocacao foi encerrada porque o primeiro jogo ja comecou.';
  END IF;

  IF target_feature_tier = 'quick' THEN
    target_profile_scope := 'quick_session';
  END IF;

  INSERT INTO public.players (
    name, member_category, is_selectable, is_goalkeeper, player_profile,
    registration_source, created_by_user_id, profile_scope
  ) VALUES (
    clean_name, 'guest', true, COALESCE(p_is_goalkeeper, false), clean_profile,
    'site_signup', auth.uid(), target_profile_scope
  ) RETURNING * INTO guest_player;

  INSERT INTO public.league_members (league_id, player_id, role, is_active)
  VALUES (current_callup.league_id, guest_player.id, 'player', true);

  SELECT * INTO created_entry
  FROM public.add_player_to_callup(p_callup_id, guest_player.id, false);
  RETURN created_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_quick_leagues()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target record;
  deleted_count integer := 0;
  disposable_player_ids uuid[];
BEGIN
  FOR target IN
    SELECT league.id
    FROM public.leagues league
    WHERE league.feature_tier = 'quick'
      AND league.quick_purge_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT COALESCE(array_agg(member.player_id), ARRAY[]::uuid[])
        INTO disposable_player_ids
      FROM public.league_members member
      JOIN public.players player ON player.id = member.player_id
      WHERE member.league_id = target.id
        AND player.profile_scope = 'quick_session'
        AND NOT EXISTS (
          SELECT 1 FROM public.league_members other_member
          WHERE other_member.player_id = member.player_id
            AND other_member.league_id <> target.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.account_profiles profile
          WHERE profile.player_id = member.player_id
        );

      DELETE FROM public.leagues WHERE id = target.id;

      DELETE FROM public.players player
      WHERE player.id = ANY(disposable_player_ids)
        AND player.profile_scope = 'quick_session'
        AND NOT EXISTS (
          SELECT 1 FROM public.league_members member
          WHERE member.player_id = player.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.account_profiles profile
          WHERE profile.player_id = player.id
        );

      deleted_count := deleted_count + 1;
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE WARNING 'Partida rapida % nao foi removida por dependencia sem cascade.', target.id;
    END;
  END LOOP;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_callup_guest(uuid, text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_callup_guest(uuid, text, text, boolean)
  TO authenticated;

REVOKE ALL ON FUNCTION public.cleanup_expired_quick_leagues()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_quick_leagues()
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
