-- Convocação colaborativa e desfalques que alimentam o Radar Cartola.

-- Qualquer usuário autenticado pode incluir um atleta elegível da mesma liga
-- enquanto a convocação estiver aberta. WAG/torcida continuam fora porque não
-- pertencem às categorias esportivas aceitas.
CREATE OR REPLACE FUNCTION public.add_player_to_callup(
  p_callup_id UUID,
  p_player_id UUID,
  p_admin_only BOOLEAN DEFAULT false
)
RETURNS public.callup_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  created_entry public.callup_entries%ROWTYPE;
  confirmed_count INTEGER;
  next_position INTEGER;
  target_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para participar.';
  END IF;
  IF p_admin_only AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem gerenciar a lista.';
  END IF;

  SELECT * INTO current_callup FROM public.callups WHERE id = p_callup_id FOR UPDATE;
  IF NOT FOUND OR current_callup.status <> 'open' THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.players player
    JOIN public.league_members member ON member.player_id = player.id
    WHERE player.id = p_player_id
      AND member.league_id = current_callup.league_id
      AND member.is_active = true
      AND player.is_selectable = true
      AND player.member_category IN ('player', 'guest')
  ) THEN
    RAISE EXCEPTION 'Esta pessoa nao esta elegivel para jogar nesta liga.';
  END IF;

  SELECT * INTO created_entry
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND player_id = p_player_id;
  IF FOUND THEN RETURN created_entry; END IF;

  PERFORM public.normalize_callup_positions(p_callup_id);
  SELECT count(*) INTO confirmed_count
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND status = 'confirmed';

  target_status := CASE WHEN confirmed_count < current_callup.capacity THEN 'confirmed' ELSE 'waitlist' END;
  SELECT COALESCE(max(position), 0) + 1 INTO next_position
  FROM public.callup_entries
  WHERE callup_id = p_callup_id AND status = target_status;

  INSERT INTO public.callup_entries (callup_id, player_id, status, position, joined_by)
  VALUES (p_callup_id, p_player_id, target_status, next_position, auth.uid())
  RETURNING * INTO created_entry;

  RETURN created_entry;
END;
$$;

-- Cria convidado, vínculo na liga e entrada da convocação de maneira atômica.
CREATE OR REPLACE FUNCTION public.create_callup_guest(
  p_callup_id UUID,
  p_name TEXT,
  p_player_profile TEXT DEFAULT 'midfield',
  p_is_goalkeeper BOOLEAN DEFAULT false
)
RETURNS public.callup_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  guest_player public.players%ROWTYPE;
  created_entry public.callup_entries%ROWTYPE;
  clean_name TEXT := left(trim(COALESCE(p_name, '')), 120);
  clean_profile TEXT := COALESCE(p_player_profile, 'midfield');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para contratar um amigo.'; END IF;
  IF length(clean_name) < 2 THEN RAISE EXCEPTION 'Informe o nome do seu amigo (pelo menos 2 letras).'; END IF;
  IF clean_profile NOT IN ('offensive', 'midfield', 'defensive') THEN clean_profile := 'midfield'; END IF;

  SELECT * INTO current_callup FROM public.callups WHERE id = p_callup_id FOR UPDATE;
  IF NOT FOUND OR current_callup.status <> 'open' THEN RAISE EXCEPTION 'A convocacao nao esta aberta.'; END IF;

  INSERT INTO public.players (
    name, member_category, is_selectable, is_goalkeeper, player_profile,
    registration_source, created_by_user_id
  ) VALUES (
    clean_name, 'guest', true, COALESCE(p_is_goalkeeper, false), clean_profile,
    'site_signup', auth.uid()
  ) RETURNING * INTO guest_player;

  INSERT INTO public.league_members (league_id, player_id, role, is_active)
  VALUES (current_callup.league_id, guest_player.id, 'player', true);

  SELECT * INTO created_entry
  FROM public.add_player_to_callup(p_callup_id, guest_player.id, false);
  RETURN created_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.add_player_to_callup(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_player_to_callup(UUID, UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.create_callup_guest(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_callup_guest(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

CREATE TABLE IF NOT EXISTS public.callup_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  callup_id UUID NOT NULL REFERENCES public.callups(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  player_name TEXT NOT NULL,
  removed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (callup_id, player_id)
);

CREATE INDEX IF NOT EXISTS callup_withdrawals_radar_idx
  ON public.callup_withdrawals (league_id, occurred_at DESC);

ALTER TABLE public.callup_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY callup_withdrawals_league_read ON public.callup_withdrawals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_profiles profile
      JOIN public.league_members member ON member.player_id = profile.player_id
      WHERE profile.user_id = auth.uid()
        AND member.league_id = callup_withdrawals.league_id
        AND member.is_active = true
    )
  );
GRANT SELECT ON public.callup_withdrawals TO authenticated;

CREATE OR REPLACE FUNCTION public.record_callup_withdrawal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_callup public.callups%ROWTYPE;
  removed_player_name TEXT;
  withdrawal_id UUID;
BEGIN
  -- Fila de espera não é desfalque: apenas saídas de confirmados viram notícia.
  IF OLD.status <> 'confirmed' THEN RETURN OLD; END IF;

  SELECT * INTO source_callup FROM public.callups WHERE id = OLD.callup_id;
  IF NOT FOUND THEN RETURN OLD; END IF;
  SELECT name INTO removed_player_name FROM public.players WHERE id = OLD.player_id;

  INSERT INTO public.callup_withdrawals (callup_id, league_id, player_id, player_name, removed_by)
  VALUES (OLD.callup_id, source_callup.league_id, OLD.player_id, COALESCE(removed_player_name, 'Jogador'), auth.uid())
  ON CONFLICT (callup_id, player_id) DO NOTHING
  RETURNING id INTO withdrawal_id;

  -- Evita repetir notícias e Inbox quando uma remoção for repetida.
  IF withdrawal_id IS NULL THEN RETURN OLD; END IF;

  INSERT INTO public.user_inbox_notifications (
    user_id, league_id, notification_type, dedupe_key, title, body, href
  )
  SELECT DISTINCT lineup.user_id,
    source_callup.league_id,
    'callup_withdrawal',
    'callup:withdrawal:' || OLD.callup_id::TEXT || ':' || OLD.player_id::TEXT,
    '🚨 Desfalque no Cartola',
    COALESCE(removed_player_name, 'Um jogador') || ' saiu da convocação. Revise sua escalação antes da rodada.',
    '/cartola'
  FROM public.fantasy_lineup_players lineup_player
  JOIN public.fantasy_lineups lineup ON lineup.id = lineup_player.lineup_id
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id = fantasy_round.fantasy_season_id
  JOIN public.seasons season ON season.id = fantasy_season.season_id
  WHERE lineup_player.player_id = OLD.player_id
    AND fantasy_round.market_status = 'open'
    AND season.league_id = source_callup.league_id
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS record_confirmed_callup_withdrawal ON public.callup_entries;
CREATE TRIGGER record_confirmed_callup_withdrawal
AFTER DELETE ON public.callup_entries
FOR EACH ROW EXECUTE FUNCTION public.record_callup_withdrawal();
