-- Peladas descartáveis: uma sessão privada operada por uma única conta, sem
-- ranking/Cartola, arquivada ao encerrar e excluída automaticamente.
BEGIN;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS quick_purge_at timestamptz;

ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_feature_tier_check;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_feature_tier_check
  CHECK (feature_tier IN ('quick', 'basic', 'complete'));

ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_quick_lifecycle_check;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_quick_lifecycle_check CHECK (
  (feature_tier = 'quick')
  OR (archived_at IS NULL AND quick_purge_at IS NULL)
);

CREATE INDEX IF NOT EXISTS leagues_quick_purge_idx
  ON public.leagues (quick_purge_at)
  WHERE feature_tier = 'quick' AND quick_purge_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_quick_league_privacy()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.feature_tier = 'quick' THEN NEW.visibility := 'private'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS leagues_quick_privacy_guard ON public.leagues;
CREATE TRIGGER leagues_quick_privacy_guard
BEFORE INSERT OR UPDATE OF feature_tier, visibility ON public.leagues
FOR EACH ROW EXECUTE FUNCTION public.enforce_quick_league_privacy();

CREATE OR REPLACE FUNCTION public.enforce_quick_league_single_account()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.leagues league
      WHERE league.id = NEW.league_id AND league.feature_tier = 'quick'
    )
    AND EXISTS (
      SELECT 1 FROM public.league_members member
      WHERE member.league_id = NEW.league_id
        AND member.user_id IS NOT NULL
        AND member.id IS DISTINCT FROM NEW.id
    ) THEN
    RAISE EXCEPTION 'A pelada descartavel aceita somente a conta que a criou.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS league_members_quick_single_account_guard ON public.league_members;
CREATE TRIGGER league_members_quick_single_account_guard
BEFORE INSERT OR UPDATE OF league_id, user_id ON public.league_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_quick_league_single_account();

CREATE OR REPLACE FUNCTION public.enforce_quick_round_as_friendly()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.leagues league
    WHERE league.id = NEW.league_id AND league.feature_tier = 'quick'
  ) THEN NEW.round_type := 'friendly'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS rounds_quick_friendly_guard ON public.rounds;
CREATE TRIGGER rounds_quick_friendly_guard
BEFORE INSERT OR UPDATE OF league_id, round_type ON public.rounds
FOR EACH ROW EXECUTE FUNCTION public.enforce_quick_round_as_friendly();

-- Nomes de sessões já apagadas/arquivadas podem ser reutilizados.
DROP INDEX IF EXISTS public.leagues_name_normalized_unique;
CREATE UNIQUE INDEX leagues_name_normalized_unique
  ON public.leagues (
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  )
  WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_league_feature_upgrade()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.feature_tier = 'quick' AND NEW.feature_tier <> 'quick' THEN
    RAISE EXCEPTION 'Uma pelada descartavel nao pode mudar de modalidade.';
  END IF;
  IF OLD.feature_tier = 'complete' AND NEW.feature_tier <> 'complete' THEN
    RAISE EXCEPTION 'Nao e permitido remover recursos de uma pelada completa.';
  END IF;
  IF OLD.feature_tier = 'basic' AND NEW.feature_tier = 'quick' THEN
    RAISE EXCEPTION 'Uma pelada existente nao pode virar descartavel.';
  END IF;
  IF OLD.feature_tier = 'basic' AND NEW.feature_tier = 'complete' THEN
    NEW.full_enabled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.find_leagues(text);
CREATE FUNCTION public.find_leagues(p_query text DEFAULT '')
RETURNS TABLE(
  league_id uuid,
  league_name text,
  league_slug text,
  feature_tier text,
  visibility text,
  logo_url text,
  cover_url text,
  accent_color text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT league.id, league.name, league.slug, league.feature_tier,
    league.visibility, league.logo_url, league.cover_url, league.accent_color
  FROM public.leagues league
  WHERE auth.uid() IS NOT NULL
    AND league.is_active
    AND league.archived_at IS NULL
    AND league.feature_tier <> 'quick'
    AND (
      NULLIF(btrim(p_query), '') IS NULL
      OR league.name ILIKE '%' || replace(
        replace(left(btrim(p_query), 80), '%', '\%'), '_', '\_'
      ) || '%' ESCAPE '\'
    )
  ORDER BY CASE WHEN league.visibility = 'open' THEN 0 ELSE 1 END, league.name;
$$;

CREATE OR REPLACE FUNCTION public.request_league_membership_by_id(p_league_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_visibility text; target_tier text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para solicitar acesso.'; END IF;
  SELECT league.visibility, league.feature_tier
    INTO target_visibility, target_tier
  FROM public.leagues league
  WHERE league.id = p_league_id AND league.is_active AND league.archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelada nao encontrada.'; END IF;
  IF target_tier = 'quick' THEN RAISE EXCEPTION 'Esta sessao e privada e individual.'; END IF;
  IF public.is_league_member(p_league_id) THEN RETURN false; END IF;
  IF target_visibility <> 'private' THEN
    RAISE EXCEPTION 'Esta pelada esta aberta; entre diretamente pelo catalogo.';
  END IF;
  INSERT INTO public.league_join_requests (
    league_id, user_id, status, requested_at, reviewed_at, reviewed_by
  ) VALUES (p_league_id, auth.uid(), 'pending', now(), NULL, NULL)
  ON CONFLICT (league_id, user_id) DO UPDATE SET
    status = 'pending', requested_at = now(), reviewed_at = NULL, reviewed_by = NULL;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_league_visibility(p_league_id uuid, p_visibility text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_tier text;
BEGIN
  IF NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente ADM desta pelada pode mudar a visibilidade.';
  END IF;
  IF p_visibility NOT IN ('private', 'open') THEN RAISE EXCEPTION 'Visibilidade invalida.'; END IF;
  SELECT feature_tier INTO target_tier FROM public.leagues
  WHERE id = p_league_id AND is_active AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelada nao encontrada.'; END IF;
  IF target_tier = 'quick' AND p_visibility <> 'private' THEN
    RAISE EXCEPTION 'Uma pelada descartavel deve permanecer privada.';
  END IF;
  UPDATE public.leagues SET visibility = p_visibility WHERE id = p_league_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_league_for_user(
  p_name text, p_tier text DEFAULT 'basic', p_visibility text DEFAULT 'private'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  creator_player_id uuid;
  clean_name text;
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
  new_league_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para criar uma pelada.'; END IF;
  clean_name := btrim(regexp_replace(COALESCE(p_name, ''), '[[:space:]]+', ' ', 'g'));
  IF char_length(clean_name) NOT BETWEEN 3 AND 80 THEN
    RAISE EXCEPTION 'O nome da pelada precisa ter de 3 a 80 caracteres.';
  END IF;
  IF COALESCE(p_tier, '') NOT IN ('quick', 'basic', 'complete')
    OR COALESCE(p_visibility, '') NOT IN ('private', 'open') THEN
    RAISE EXCEPTION 'Escolha um modo e uma visibilidade validos.';
  END IF;
  IF p_tier = 'quick' THEN p_visibility := 'private'; END IF;

  SELECT profile.player_id INTO creator_player_id
  FROM public.account_profiles profile
  JOIN public.players player ON player.id = profile.player_id
  WHERE profile.user_id = auth.uid()
    AND player.is_selectable
    AND player.member_category IN ('player', 'guest');
  IF creator_player_id IS NULL THEN
    RAISE EXCEPTION 'Complete seu perfil de jogador antes de criar uma pelada.';
  END IF;

  LOCK TABLE public.leagues IN SHARE ROW EXCLUSIVE MODE;
  base_slug := btrim(regexp_replace(
    translate(lower(clean_name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+', '-', 'g'), '-');
  IF base_slug = '' THEN base_slug := 'pelada'; END IF;
  candidate_slug := left(base_slug, 70);
  WHILE EXISTS (SELECT 1 FROM public.leagues WHERE lower(slug) = lower(candidate_slug)) LOOP
    candidate_slug := left(base_slug, greatest(1, 69 - char_length(suffix::text))) || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;

  INSERT INTO public.leagues(name, slug, feature_tier, visibility, full_enabled_at)
  VALUES(clean_name, candidate_slug, p_tier, p_visibility,
    CASE WHEN p_tier = 'complete' THEN now() ELSE NULL END)
  RETURNING id INTO new_league_id;

  INSERT INTO public.seasons(league_id, number, status) VALUES(new_league_id, 1, 'active');
  INSERT INTO public.league_members(
    league_id, player_id, user_id, role, is_active, is_favorite
  ) VALUES(new_league_id, creator_player_id, auth.uid(), 'admin', true, false);

  -- Sessões rápidas nunca emitem convite, pois somente o criador usa o app.
  IF p_tier <> 'quick' THEN
    INSERT INTO public.league_invites(league_id) VALUES(new_league_id);
  END IF;

  INSERT INTO public.ranking_rules(league_id, event_type, points)
  SELECT new_league_id, rules.event_type, rules.points
  FROM (VALUES
    ('goal', 4::numeric), ('assist', 2.5), ('win', 0), ('draw', 0),
    ('loss', 0), ('own_goal', -3), ('goalkeeper_appearance', 1),
    ('goal_conceded', -0.5), ('best_goalkeeper', 6)
  ) rules(event_type, points);

  IF p_tier = 'complete' THEN
    INSERT INTO public.fantasy_settings(
      league_id, scoring_version, market_version, goal_points,
      assist_points, win_points, draw_points, loss_points,
      own_goal_points, goalkeeper_appearance_points, goal_conceded_points,
      attacker_goal_points, attacker_assist_points, line_goal_conceded_points
    ) VALUES (
      new_league_id, 14, 15, 4, 2.5, 0, 0, 0, -3, 1, -0.5, 4, 2.5, -0.5
    );
  END IF;
  RETURN new_league_id;
END;
$$;

-- A API também força amistoso, mesmo se um cliente antigo tentar enviar
-- uma rodada oficial para uma pelada descartável.
CREATE OR REPLACE FUNCTION public.create_league_callup(
  p_league_id uuid,
  p_date date,
  p_start_time time without time zone,
  p_stadium_id uuid DEFAULT NULL,
  p_stadium_name text DEFAULT NULL,
  p_stadium_map_url text DEFAULT NULL,
  p_round_type text DEFAULT 'official',
  p_capacity integer DEFAULT 15,
  p_players_per_team integer DEFAULT 5,
  p_teams_per_round integer DEFAULT 3
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE created_callup_id uuid; target_tier text;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente administradores desta pelada podem abrir convocacoes.' USING ERRCODE = '42501';
  END IF;
  SELECT league.feature_tier INTO target_tier FROM public.leagues league
  WHERE league.id = p_league_id AND league.is_active AND league.archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelada nao encontrada ou encerrada.' USING ERRCODE = 'P0002'; END IF;
  IF target_tier = 'quick' THEN p_round_type := 'friendly'; END IF;
  IF p_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'Informe a data e o horario da convocacao.' USING ERRCODE = '22023';
  END IF;
  IF p_round_type NOT IN ('official', 'friendly') OR p_capacity NOT BETWEEN 1 AND 100
    OR p_players_per_team NOT BETWEEN 1 AND 10 OR p_teams_per_round NOT BETWEEN 2 AND 6 THEN
    RAISE EXCEPTION 'Formato de convocacao invalido.' USING ERRCODE = '22023';
  END IF;
  IF p_stadium_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stadiums stadium
    WHERE stadium.id = p_stadium_id AND stadium.league_id = p_league_id
  ) THEN RAISE EXCEPTION 'Estadio fora da pelada selecionada.' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.callups (
    league_id, date, start_time, stadium_id, stadium_name, stadium_map_url,
    round_type, status, capacity, players_per_team, teams_per_round, created_by,
    is_public
  ) VALUES (
    p_league_id, p_date, p_start_time, p_stadium_id,
    NULLIF(btrim(p_stadium_name), ''), NULLIF(btrim(p_stadium_map_url), ''),
    p_round_type, 'open', p_capacity, p_players_per_team, p_teams_per_round,
    (SELECT auth.uid()), false
  ) RETURNING id INTO created_callup_id;
  RETURN created_callup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_quick_league(p_league_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente o responsavel pode encerrar esta pelada.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.rounds round_item
    WHERE round_item.league_id = p_league_id AND round_item.status = 'finished'
  ) THEN
    RAISE EXCEPTION 'Encerre a rodada antes de arquivar esta pelada.';
  END IF;
  UPDATE public.leagues league SET
    archived_at = COALESCE(league.archived_at, now()),
    quick_purge_at = COALESCE(league.quick_purge_at, now() + interval '7 days'),
    visibility = 'private'
  WHERE league.id = p_league_id AND league.feature_tier = 'quick' AND league.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelada descartavel nao encontrada.'; END IF;
  PERFORM public.refresh_quick_league_purge_at(p_league_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_quick_league_purge_at(p_league_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target public.leagues%ROWTYPE; has_obligations boolean; has_pending boolean;
BEGIN
  SELECT * INTO target FROM public.leagues league
  WHERE league.id = p_league_id AND league.feature_tier = 'quick'
    AND league.archived_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.round_payment_obligations obligation
    JOIN public.rounds round_item ON round_item.id = obligation.round_id
    WHERE round_item.league_id = p_league_id
  ), EXISTS (
    SELECT 1 FROM public.round_payment_obligations obligation
    JOIN public.rounds round_item ON round_item.id = obligation.round_id
    WHERE round_item.league_id = p_league_id
      AND obligation.status NOT IN ('paid', 'credit')
  ) INTO has_obligations, has_pending;

  UPDATE public.leagues SET quick_purge_at = CASE
    WHEN has_obligations AND NOT has_pending THEN
      LEAST(target.archived_at + interval '7 days', COALESCE(target.quick_purge_at, now() + interval '3 days'), now() + interval '3 days')
    ELSE target.archived_at + interval '7 days'
  END WHERE id = p_league_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_quick_league_purge_after_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_round_id uuid; target_league_id uuid;
BEGIN
  target_round_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.round_id ELSE NEW.round_id END;
  SELECT round_item.league_id INTO target_league_id
  FROM public.rounds round_item WHERE round_item.id = target_round_id;
  IF target_league_id IS NOT NULL THEN
    PERFORM public.refresh_quick_league_purge_at(target_league_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS quick_league_payment_retention ON public.round_payment_obligations;
CREATE TRIGGER quick_league_payment_retention
AFTER INSERT OR UPDATE OR DELETE
ON public.round_payment_obligations
FOR EACH ROW EXECUTE FUNCTION public.sync_quick_league_purge_after_payment();

CREATE OR REPLACE FUNCTION public.cleanup_expired_quick_leagues()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target record; deleted_count integer := 0; disposable_guest_ids uuid[];
BEGIN
  FOR target IN
    SELECT league.id FROM public.leagues league
    WHERE league.feature_tier = 'quick' AND league.quick_purge_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT COALESCE(array_agg(member.player_id), ARRAY[]::uuid[])
        INTO disposable_guest_ids
      FROM public.league_members member
      JOIN public.players player ON player.id = member.player_id
      WHERE member.league_id = target.id
        AND player.member_category = 'guest'
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
      WHERE player.id = ANY(disposable_guest_ids)
        AND NOT EXISTS (
          SELECT 1 FROM public.league_members member
          WHERE member.player_id = player.id
        );
      deleted_count := deleted_count + 1;
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE WARNING 'Pelada descartavel % nao foi removida por dependencia sem cascade.', target.id;
    END;
  END LOOP;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.find_leagues(text),
  public.request_league_membership_by_id(uuid),
  public.set_league_visibility(uuid,text),
  public.create_league_for_user(text,text,text),
  public.create_league_callup(uuid,date,time without time zone,uuid,text,text,text,integer,integer,integer),
  public.archive_quick_league(uuid),
  public.refresh_quick_league_purge_at(uuid),
  public.cleanup_expired_quick_leagues()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_leagues(text),
  public.request_league_membership_by_id(uuid),
  public.set_league_visibility(uuid,text),
  public.create_league_for_user(text,text,text),
  public.create_league_callup(uuid,date,time without time zone,uuid,text,text,text,integer,integer,integer),
  public.archive_quick_league(uuid),
  public.cleanup_expired_quick_leagues()
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- O agendamento é opcional: projetos sem pg_cron continuam protegidos pela
-- chamada de cleanup feita ao abrir o lobby/app.
DO $schedule$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron indisponivel; limpeza ocorrera ao abrir o app: %', SQLERRM;
  END;
  IF to_regnamespace('cron') IS NOT NULL THEN
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-disposable-leagues') THEN
        PERFORM cron.schedule(
          'cleanup-disposable-leagues',
          '17 * * * *',
          'SELECT public.cleanup_expired_quick_leagues();'
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Nao foi possivel agendar a limpeza; o app fara a rotina: %', SQLERRM;
    END;
  END IF;
END;
$schedule$;
