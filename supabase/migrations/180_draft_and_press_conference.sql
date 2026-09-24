-- Draft de times e Coletiva de imprensa.

ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS rounds_formation_mode_check;
ALTER TABLE public.rounds ADD CONSTRAINT rounds_formation_mode_check
  CHECK (formation_mode IN ('manual', 'random', 'balanced', 'speed', 'adaptive', 'draft'));

CREATE TABLE IF NOT EXISTS public.team_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  callup_id UUID NOT NULL UNIQUE REFERENCES public.callups(id) ON DELETE CASCADE,
  round_id UUID NOT NULL UNIQUE REFERENCES public.rounds(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'paused', 'completed', 'confirmed', 'cancelled')),
  current_pick INTEGER NOT NULL DEFAULT 1 CHECK (current_pick > 0),
  pause_reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_draft_captains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.team_drafts(id) ON DELETE CASCADE,
  team_slot SMALLINT NOT NULL CHECK (team_slot BETWEEN 1 AND 3),
  captain_player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  win_rate_snapshot NUMERIC(6,2) NOT NULL DEFAULT 0,
  official_rounds_snapshot INTEGER NOT NULL DEFAULT 0,
  selection_order SMALLINT CHECK (selection_order BETWEEN 1 AND 3),
  UNIQUE (draft_id, team_slot),
  UNIQUE (draft_id, captain_player_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS team_draft_captains_selection_order_idx
  ON public.team_draft_captains (draft_id, selection_order)
  WHERE selection_order IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.team_draft_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.team_drafts(id) ON DELETE CASCADE,
  team_slot SMALLINT NOT NULL CHECK (team_slot BETWEEN 1 AND 3),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  pick_number INTEGER NOT NULL CHECK (pick_number > 0),
  picked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_id, player_id),
  UNIQUE (draft_id, pick_number)
);

CREATE INDEX IF NOT EXISTS team_draft_picks_draft_slot_idx
  ON public.team_draft_picks (draft_id, team_slot, pick_number);

CREATE TABLE IF NOT EXISTS public.team_draft_players (
  draft_id UUID NOT NULL REFERENCES public.team_drafts(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  overall_snapshot NUMERIC(6,2),
  speed_rating_snapshot SMALLINT CHECK (speed_rating_snapshot IS NULL OR speed_rating_snapshot BETWEEN 1 AND 3),
  profile_snapshot TEXT CHECK (profile_snapshot IS NULL OR profile_snapshot IN ('defensive', 'midfield', 'offensive')),
  PRIMARY KEY (draft_id, player_id)
);

CREATE TABLE IF NOT EXISTS public.collective_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  callup_id UUID NOT NULL REFERENCES public.callups(id) ON DELETE CASCADE,
  round_id UUID REFERENCES public.rounds(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  sender_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'image', 'audio', 'system')),
  body TEXT,
  media_path TEXT,
  media_mime TEXT,
  media_size INTEGER CHECK (media_size IS NULL OR media_size BETWEEN 0 AND 8388608),
  audio_duration_seconds INTEGER CHECK (audio_duration_seconds IS NULL OR audio_duration_seconds BETWEEN 1 AND 60),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind IN ('text', 'system') AND body IS NOT NULL AND length(body) BETWEEN 1 AND 1000)
    OR (kind IN ('image', 'audio') AND media_path IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS collective_messages_callup_created_idx
  ON public.collective_messages (callup_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.collective_reads (
  callup_id UUID NOT NULL REFERENCES public.callups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (callup_id, user_id)
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'collective-media',
  'collective-media',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.can_access_collective(p_callup_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.is_app_admin() THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.callups c
      JOIN public.callup_entries ce ON ce.callup_id = c.id
      LEFT JOIN public.rounds r ON r.id = c.round_id
      WHERE c.id = p_callup_id
        AND ce.player_id = (SELECT ap.player_id FROM public.account_profiles ap WHERE ap.user_id = auth.uid())
        AND (c.status = 'converted' OR EXISTS (SELECT 1 FROM public.team_drafts d WHERE d.callup_id = c.id AND d.status <> 'cancelled'))
        AND (
          r.id IS NULL
          OR r.status <> 'finished'
          OR (
            r.payment_pix IS NOT NULL AND r.payment_total > 0
            AND EXISTS (
              SELECT 1 FROM public.round_players participant
              WHERE participant.round_id = r.id
                AND NOT EXISTS (
                  SELECT 1 FROM public.round_payments payment
                  WHERE payment.round_id = participant.round_id AND payment.player_id = participant.player_id AND payment.paid = true
                )
            )
          )
        )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.collective_is_started(p_callup_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.callups c
    WHERE c.id = p_callup_id
      AND (c.status = 'converted' OR EXISTS (SELECT 1 FROM public.team_drafts d WHERE d.callup_id = c.id AND d.status <> 'cancelled'))
  );
$$;

ALTER TABLE public.team_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_draft_captains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_draft_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collective_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collective_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_drafts_read ON public.team_drafts FOR SELECT TO authenticated
  USING (public.can_access_collective(callup_id));
CREATE POLICY team_drafts_admin ON public.team_drafts FOR ALL TO authenticated
  USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY team_draft_captains_read ON public.team_draft_captains FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_drafts d WHERE d.id = draft_id AND public.can_access_collective(d.callup_id)));
CREATE POLICY team_draft_captains_admin ON public.team_draft_captains FOR ALL TO authenticated
  USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY team_draft_picks_read ON public.team_draft_picks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_drafts d WHERE d.id = draft_id AND public.can_access_collective(d.callup_id)));
CREATE POLICY team_draft_players_read ON public.team_draft_players FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_drafts d WHERE d.id = draft_id AND public.can_access_collective(d.callup_id)));
CREATE POLICY team_draft_players_admin ON public.team_draft_players FOR ALL TO authenticated
  USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

CREATE POLICY collective_messages_read ON public.collective_messages FOR SELECT TO authenticated
  USING (public.can_access_collective(callup_id));
CREATE POLICY collective_messages_insert ON public.collective_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_collective(callup_id)
    AND sender_user_id = auth.uid()
    AND sender_player_id = (SELECT ap.player_id FROM public.account_profiles ap WHERE ap.user_id = auth.uid())
    AND kind IN ('text', 'image', 'audio')
  );
CREATE POLICY collective_messages_update ON public.collective_messages FOR UPDATE TO authenticated
  USING (sender_user_id = auth.uid() OR public.is_app_admin())
  WITH CHECK (sender_user_id = auth.uid() OR public.is_app_admin());
CREATE POLICY collective_reads_own ON public.collective_reads FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.can_access_collective(callup_id))
  WITH CHECK (user_id = auth.uid() AND public.can_access_collective(callup_id));

CREATE POLICY collective_media_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'collective-media' AND public.can_access_collective(((storage.foldername(name))[1])::UUID));
CREATE POLICY collective_media_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'collective-media' AND public.can_access_collective(((storage.foldername(name))[1])::UUID));
CREATE POLICY collective_media_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'collective-media'
    AND (
      public.is_app_admin()
      OR EXISTS (
        SELECT 1 FROM public.collective_messages message
        WHERE message.media_path = name AND message.sender_user_id = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION public.create_team_draft(
  p_callup_id UUID,
  p_round_id UUID,
  p_captain_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_id UUID;
  selected_round public.rounds%ROWTYPE;
  captain_id UUID;
  captain_index INTEGER := 0;
  captain_stats RECORD;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem iniciar o Draft.'; END IF;
  IF cardinality(p_captain_ids) <> 3 OR (SELECT count(DISTINCT value) FROM unnest(p_captain_ids) value) <> 3 THEN
    RAISE EXCEPTION 'Escolha três capitães diferentes.';
  END IF;

  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND OR selected_round.status <> 'draft' OR selected_round.preparation_stage <> 'prelist' THEN
    RAISE EXCEPTION 'A pré-rodada precisa estar pronta e ainda sem times.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.callups c
    WHERE c.id = p_callup_id AND c.round_id = p_round_id AND c.status IN ('open', 'locked')
  ) THEN RAISE EXCEPTION 'Convocação vinculada não encontrada.'; END IF;
  IF (SELECT count(*) FROM public.callup_entries WHERE callup_id = p_callup_id AND status = 'confirmed') < 6 THEN
    RAISE EXCEPTION 'A lista não possui jogadores suficientes para o Draft.';
  END IF;

  FOREACH captain_id IN ARRAY p_captain_ids LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.callup_entries ce
      JOIN public.players p ON p.id = ce.player_id
      JOIN public.player_season_stats stats ON stats.player_id = p.id
        AND stats.season_id = selected_round.season_id AND stats.round_type = 'official'
      WHERE ce.callup_id = p_callup_id AND ce.status = 'confirmed' AND ce.player_id = captain_id
        AND p.member_category = 'player' AND p.is_selectable = true AND stats.rounds_count >= 3
    ) THEN RAISE EXCEPTION 'Um dos capitães não possui três rodadas oficiais nesta temporada.'; END IF;
  END LOOP;

  INSERT INTO public.team_drafts (league_id, callup_id, round_id, status)
  VALUES (selected_round.league_id, p_callup_id, p_round_id, 'setup')
  ON CONFLICT (callup_id) DO UPDATE SET status = 'setup', pause_reason = NULL, current_pick = 1, updated_at = now()
  RETURNING id INTO created_id;

  DELETE FROM public.team_draft_picks WHERE draft_id = created_id;
  DELETE FROM public.team_draft_captains WHERE draft_id = created_id;
  DELETE FROM public.team_draft_players WHERE draft_id = created_id;
  INSERT INTO public.team_draft_players (draft_id, player_id, overall_snapshot, speed_rating_snapshot, profile_snapshot)
  SELECT created_id, ce.player_id, overall.overall, attributes.speed_rating, player.player_profile
  FROM public.callup_entries ce
  JOIN public.players player ON player.id = ce.player_id
  LEFT JOIN public.player_admin_attributes attributes ON attributes.player_id = ce.player_id
  LEFT JOIN public.get_latest_player_card_overalls() overall ON overall.player_id = ce.player_id
  WHERE ce.callup_id = p_callup_id AND ce.status = 'confirmed';
  FOREACH captain_id IN ARRAY p_captain_ids LOOP
    captain_index := captain_index + 1;
    SELECT stats.win_rate, stats.rounds_count INTO captain_stats
    FROM public.player_season_stats stats
    WHERE stats.player_id = captain_id AND stats.season_id = selected_round.season_id AND stats.round_type = 'official';
    INSERT INTO public.team_draft_captains (draft_id, team_slot, captain_player_id, win_rate_snapshot, official_rounds_snapshot)
    VALUES (created_id, captain_index, captain_id, COALESCE(captain_stats.win_rate, 0), COALESCE(captain_stats.rounds_count, 0));
  END LOOP;

  UPDATE public.rounds SET formation_mode = 'draft' WHERE id = p_round_id;
  RETURN created_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_team_draft(p_draft_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem iniciar o Draft.'; END IF;
  PERFORM 1 FROM public.team_drafts WHERE id = p_draft_id AND status IN ('setup', 'paused') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft indisponível para iniciar.'; END IF;

  UPDATE public.team_draft_captains SET selection_order = NULL WHERE draft_id = p_draft_id;
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY win_rate_snapshot ASC, random()) AS order_number
    FROM public.team_draft_captains WHERE draft_id = p_draft_id
  )
  UPDATE public.team_draft_captains captain SET selection_order = ordered.order_number
  FROM ordered WHERE captain.id = ordered.id;

  UPDATE public.team_drafts SET status = 'active', pause_reason = NULL, updated_at = now() WHERE id = p_draft_id;
  INSERT INTO public.collective_messages (callup_id, round_id, kind, body, metadata)
  SELECT callup_id, round_id, 'system', 'O Draft começou. Boa escolha aos capitães!', jsonb_build_object('draft_id', id, 'event', 'draft_started')
  FROM public.team_drafts WHERE id = p_draft_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_team_draft_captain(
  p_draft_id UUID,
  p_team_slot INTEGER,
  p_player_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_draft public.team_drafts%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
  stats RECORD;
  previous_order INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem trocar capitães.'; END IF;
  SELECT * INTO selected_draft FROM public.team_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR selected_draft.status NOT IN ('setup', 'paused') THEN RAISE EXCEPTION 'Pause ou reinicie o Draft antes de trocar capitães.'; END IF;
  SELECT * INTO selected_round FROM public.rounds WHERE id = selected_draft.round_id;
  SELECT win_rate, rounds_count INTO stats FROM public.player_season_stats
  WHERE player_id = p_player_id AND season_id = selected_round.season_id AND round_type = 'official' AND rounds_count >= 3;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.callup_entries ce JOIN public.players p ON p.id = ce.player_id
    WHERE ce.callup_id = selected_draft.callup_id AND ce.status = 'confirmed' AND ce.player_id = p_player_id
      AND p.member_category = 'player' AND p.is_selectable = true
  ) THEN RAISE EXCEPTION 'Novo capitão não elegível.'; END IF;

  SELECT selection_order INTO previous_order FROM public.team_draft_captains WHERE draft_id = p_draft_id AND team_slot = p_team_slot;
  DELETE FROM public.team_draft_picks WHERE draft_id = p_draft_id AND player_id = p_player_id;
  UPDATE public.team_draft_captains SET captain_player_id = p_player_id,
    win_rate_snapshot = COALESCE(stats.win_rate, 0), official_rounds_snapshot = COALESCE(stats.rounds_count, 0), selection_order = previous_order
  WHERE draft_id = p_draft_id AND team_slot = p_team_slot;
  UPDATE public.team_draft_picks SET pick_number = pick_number + 1000 WHERE draft_id = p_draft_id;
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY pick_number, created_at, id) AS next_number
    FROM public.team_draft_picks WHERE draft_id = p_draft_id
  )
  UPDATE public.team_draft_picks pick SET pick_number = ordered.next_number
  FROM ordered WHERE pick.id = ordered.id;
  UPDATE public.team_drafts SET status = CASE WHEN status = 'paused' THEN CASE
      WHEN previous_order IS NULL THEN 'setup'
      WHEN (SELECT count(*) FROM public.team_draft_picks WHERE draft_id = p_draft_id)
        >= (SELECT count(*) - 3 FROM public.callup_entries WHERE callup_id = selected_draft.callup_id AND status = 'confirmed')
        THEN 'completed'
      ELSE 'active'
    END ELSE status END,
    current_pick = (SELECT count(*) + 1 FROM public.team_draft_picks WHERE draft_id = p_draft_id),
    pause_reason = NULL, updated_at = now()
  WHERE id = p_draft_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.make_team_draft_pick(p_draft_id UUID, p_player_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_draft public.team_drafts%ROWTYPE;
  pick_number INTEGER;
  total_available INTEGER;
  expected_order INTEGER;
  expected_slot INTEGER;
  captain_id UUID;
  picked_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre para escolher.'; END IF;
  SELECT * INTO selected_draft FROM public.team_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR selected_draft.status <> 'active' THEN RAISE EXCEPTION 'O Draft não está ativo.'; END IF;

  SELECT count(*) + 1 INTO pick_number FROM public.team_draft_picks WHERE draft_id = p_draft_id;
  expected_order := (ARRAY[1,2,3,3,2,1])[((pick_number - 1) % 6) + 1];
  SELECT team_slot, captain_player_id INTO expected_slot, captain_id
  FROM public.team_draft_captains WHERE draft_id = p_draft_id AND selection_order = expected_order;
  IF NOT public.is_app_admin() AND captain_id IS DISTINCT FROM (SELECT player_id FROM public.account_profiles WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Agora é a vez de outro capitão.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.team_draft_captains WHERE draft_id = p_draft_id AND captain_player_id = p_player_id)
    OR EXISTS (SELECT 1 FROM public.team_draft_picks WHERE draft_id = p_draft_id AND player_id = p_player_id)
    OR NOT EXISTS (SELECT 1 FROM public.callup_entries WHERE callup_id = selected_draft.callup_id AND status = 'confirmed' AND player_id = p_player_id)
  THEN RAISE EXCEPTION 'Este jogador não está disponível.'; END IF;

  INSERT INTO public.team_draft_picks (draft_id, team_slot, player_id, pick_number)
  VALUES (p_draft_id, expected_slot, p_player_id, pick_number);
  SELECT name INTO picked_name FROM public.players WHERE id = p_player_id;
  INSERT INTO public.collective_messages (callup_id, round_id, kind, body, metadata)
  VALUES (selected_draft.callup_id, selected_draft.round_id, 'system',
    COALESCE(picked_name, 'Jogador') || ' foi escolhido no Draft.',
    jsonb_build_object('draft_id', p_draft_id, 'pick_number', pick_number, 'team_slot', expected_slot, 'player_id', p_player_id));

  SELECT count(*) - 3 INTO total_available FROM public.callup_entries WHERE callup_id = selected_draft.callup_id AND status = 'confirmed';
  UPDATE public.team_drafts SET current_pick = pick_number + 1,
    status = CASE WHEN pick_number >= total_available THEN 'completed' ELSE 'active' END,
    updated_at = now() WHERE id = p_draft_id;
  RETURN jsonb_build_object('pick_number', pick_number, 'team_slot', expected_slot, 'completed', pick_number >= total_available);
END;
$$;

CREATE OR REPLACE FUNCTION public.swap_team_draft_picks(p_draft_id UUID, p_player_a UUID, p_player_b UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE a_slot INTEGER; b_slot INTEGER;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem aplicar a sugestão.'; END IF;
  SELECT team_slot INTO a_slot FROM public.team_draft_picks WHERE draft_id = p_draft_id AND player_id = p_player_a FOR UPDATE;
  SELECT team_slot INTO b_slot FROM public.team_draft_picks WHERE draft_id = p_draft_id AND player_id = p_player_b FOR UPDATE;
  IF a_slot IS NULL OR b_slot IS NULL OR a_slot = b_slot THEN RAISE EXCEPTION 'Escolha jogadores não capitães de times diferentes.'; END IF;
  UPDATE public.team_draft_picks SET team_slot = CASE WHEN player_id = p_player_a THEN b_slot ELSE a_slot END
  WHERE draft_id = p_draft_id AND player_id IN (p_player_a, p_player_b);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.restart_team_draft(p_draft_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem reiniciar o Draft.'; END IF;
  DELETE FROM public.team_draft_picks WHERE draft_id = p_draft_id;
  UPDATE public.team_draft_captains SET selection_order = NULL WHERE draft_id = p_draft_id;
  UPDATE public.team_drafts SET status = 'setup', current_pick = 1, pause_reason = NULL, updated_at = now() WHERE id = p_draft_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_team_draft(p_draft_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_draft public.team_drafts%ROWTYPE;
  slot INTEGER;
  created_team UUID;
  captain_id UUID;
  expected_players INTEGER;
  materialized_players INTEGER;
  colors TEXT[] := ARRAY['#ef4444', '#2563eb', '#eab308'];
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem confirmar o Draft.'; END IF;
  SELECT * INTO selected_draft FROM public.team_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR selected_draft.status <> 'completed' THEN RAISE EXCEPTION 'Complete todas as escolhas antes de confirmar.'; END IF;
  SELECT count(*) INTO expected_players FROM public.callup_entries WHERE callup_id = selected_draft.callup_id AND status = 'confirmed';
  SELECT count(*) + 3 INTO materialized_players FROM public.team_draft_picks WHERE draft_id = p_draft_id;
  IF materialized_players <> expected_players THEN RAISE EXCEPTION 'A lista mudou. Preencha novamente as vagas abertas.'; END IF;
  IF EXISTS (SELECT 1 FROM public.teams WHERE round_id = selected_draft.round_id) THEN RAISE EXCEPTION 'A rodada já possui times.'; END IF;

  DELETE FROM public.round_players participant
  WHERE participant.round_id = selected_draft.round_id
    AND NOT EXISTS (
      SELECT 1 FROM public.callup_entries entry
      WHERE entry.callup_id = selected_draft.callup_id AND entry.status = 'confirmed' AND entry.player_id = participant.player_id
    );
  INSERT INTO public.round_players (round_id, player_id)
  SELECT selected_draft.round_id, entry.player_id
  FROM public.callup_entries entry
  WHERE entry.callup_id = selected_draft.callup_id AND entry.status = 'confirmed'
  ON CONFLICT (round_id, player_id) DO NOTHING;

  FOR slot IN 1..3 LOOP
    SELECT captain_player_id INTO captain_id FROM public.team_draft_captains WHERE draft_id = p_draft_id AND team_slot = slot;
    INSERT INTO public.teams (round_id, name, color, position, captain_player_id)
    VALUES (selected_draft.round_id, 'Time ' || slot, colors[slot], slot, captain_id)
    RETURNING id INTO created_team;
    INSERT INTO public.team_players (team_id, player_id, goalkeeper_order)
    SELECT created_team, player_id, row_number() OVER (ORDER BY pick_order, player_id)
    FROM (
      SELECT captain_id AS player_id, 0 AS pick_order
      UNION ALL
      SELECT player_id, pick_number FROM public.team_draft_picks WHERE draft_id = p_draft_id AND team_slot = slot
    ) roster;
  END LOOP;

  UPDATE public.rounds SET formation_mode = 'draft', preparation_stage = 'teams_ready', arrival_order_enabled = false
  WHERE id = selected_draft.round_id;
  UPDATE public.callups SET status = 'converted', round_id = selected_draft.round_id, updated_at = now()
  WHERE id = selected_draft.callup_id;
  UPDATE public.team_drafts SET status = 'confirmed', updated_at = now() WHERE id = p_draft_id;
  INSERT INTO public.collective_messages (callup_id, round_id, kind, body, metadata)
  VALUES (selected_draft.callup_id, selected_draft.round_id, 'system', 'Times do Draft confirmados.', jsonb_build_object('draft_id', p_draft_id, 'event', 'draft_confirmed'));
  RETURN selected_draft.round_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_active_team_draft_from_callup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_callup UUID; removed_player UUID; target_draft UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_callup := OLD.callup_id;
    removed_player := OLD.player_id;
  ELSE
    target_callup := NEW.callup_id;
    removed_player := CASE WHEN TG_OP = 'UPDATE' THEN OLD.player_id ELSE NEW.player_id END;
  END IF;
  SELECT id INTO target_draft FROM public.team_drafts
  WHERE callup_id = target_callup AND status IN ('setup', 'active', 'paused', 'completed') LIMIT 1;
  IF target_draft IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status <> 'confirmed') THEN
    IF EXISTS (SELECT 1 FROM public.team_draft_captains WHERE draft_id = target_draft AND captain_player_id = removed_player) THEN
      UPDATE public.team_drafts SET status = 'paused', pause_reason = 'Um capitão saiu da convocação.', updated_at = now() WHERE id = target_draft;
    ELSE
      DELETE FROM public.team_draft_picks WHERE draft_id = target_draft AND player_id = removed_player;
      UPDATE public.team_draft_picks SET pick_number = pick_number + 1000 WHERE draft_id = target_draft;
      WITH ordered AS (
        SELECT id, row_number() OVER (ORDER BY pick_number, created_at, id) AS next_number
        FROM public.team_draft_picks WHERE draft_id = target_draft
      )
      UPDATE public.team_draft_picks pick SET pick_number = ordered.next_number
      FROM ordered WHERE pick.id = ordered.id;
      UPDATE public.team_drafts SET status = CASE WHEN status = 'completed' THEN 'active' ELSE status END,
        current_pick = (SELECT count(*) + 1 FROM public.team_draft_picks WHERE draft_id = target_draft), updated_at = now()
      WHERE id = target_draft;
    END IF;
    DELETE FROM public.team_draft_players WHERE draft_id = target_draft AND player_id = removed_player;
  ELSIF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'confirmed' AND NEW.status = 'confirmed') THEN
    INSERT INTO public.team_draft_players (draft_id, player_id, overall_snapshot, speed_rating_snapshot, profile_snapshot)
    SELECT target_draft, NEW.player_id, overall.overall, attributes.speed_rating, player.player_profile
    FROM public.players player
    LEFT JOIN public.player_admin_attributes attributes ON attributes.player_id = player.id
    LEFT JOIN public.get_latest_player_card_overalls() overall ON overall.player_id = player.id
    WHERE player.id = NEW.player_id
    ON CONFLICT (draft_id, player_id) DO UPDATE SET
      overall_snapshot = EXCLUDED.overall_snapshot,
      speed_rating_snapshot = EXCLUDED.speed_rating_snapshot,
      profile_snapshot = EXCLUDED.profile_snapshot;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS sync_active_team_draft_callup_trigger ON public.callup_entries;
CREATE TRIGGER sync_active_team_draft_callup_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.callup_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_active_team_draft_from_callup();

CREATE OR REPLACE FUNCTION public.prune_collective_history_after_payment(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rounds WHERE id = p_round_id AND status = 'finished') THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.round_players participant
    WHERE participant.round_id = p_round_id
      AND NOT EXISTS (
        SELECT 1 FROM public.round_payments payment
        WHERE payment.round_id = participant.round_id AND payment.player_id = participant.player_id AND payment.paid = true
      )
  ) THEN RETURN false; END IF;

  DELETE FROM storage.objects object
  WHERE object.bucket_id = 'collective-media'
    AND EXISTS (
      SELECT 1 FROM public.collective_messages message
      JOIN public.callups callup ON callup.id = message.callup_id
      WHERE message.media_path = object.name AND callup.round_id IS DISTINCT FROM p_round_id
    );
  DELETE FROM public.collective_messages message
  USING public.callups callup
  WHERE callup.id = message.callup_id AND callup.round_id IS DISTINCT FROM p_round_id;
  RETURN true;
END;
$$;

GRANT SELECT ON public.team_drafts, public.team_draft_captains, public.team_draft_picks, public.team_draft_players, public.collective_messages, public.collective_reads TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.collective_messages, public.collective_reads TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_collective(UUID), public.collective_is_started(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_team_draft(UUID, UUID, UUID[]), public.start_team_draft(UUID), public.replace_team_draft_captain(UUID, INTEGER, UUID), public.make_team_draft_pick(UUID, UUID), public.swap_team_draft_picks(UUID, UUID, UUID), public.restart_team_draft(UUID), public.finalize_team_draft(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prune_collective_history_after_payment(UUID) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_draft_captains;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_draft_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collective_messages;

NOTIFY pgrst, 'reload schema';
