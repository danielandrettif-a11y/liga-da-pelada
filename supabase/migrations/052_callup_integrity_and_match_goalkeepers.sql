-- Corrige concorrencia nas posicoes da convocacao e registra o goleiro real de cada partida.

ALTER TABLE public.callup_entries
  DROP CONSTRAINT IF EXISTS callup_entries_callup_id_status_position_key;

ALTER TABLE public.callup_entries
  ADD CONSTRAINT callup_entries_callup_id_status_position_key
  UNIQUE (callup_id, status, position)
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION public.normalize_callup_positions(p_callup_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_callup public.callups%ROWTYPE;
  promote_id UUID;
BEGIN
  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY position, created_at, id)::INTEGER AS new_position
    FROM public.callup_entries
    WHERE callup_id = p_callup_id AND status = 'confirmed'
  )
  UPDATE public.callup_entries entry
  SET position = ordered.new_position
  FROM ordered
  WHERE entry.id = ordered.id;

  WHILE (SELECT count(*) FROM public.callup_entries WHERE callup_id = p_callup_id AND status = 'confirmed') < current_callup.capacity
  LOOP
    SELECT id INTO promote_id
    FROM public.callup_entries
    WHERE callup_id = p_callup_id AND status = 'waitlist'
    ORDER BY position, created_at, id
    LIMIT 1;
    EXIT WHEN promote_id IS NULL;

    UPDATE public.callup_entries
    SET status = 'confirmed',
        position = COALESCE((
          SELECT max(position) + 1
          FROM public.callup_entries
          WHERE callup_id = p_callup_id AND status = 'confirmed'
        ), 1)
    WHERE id = promote_id;
    promote_id := NULL;
  END LOOP;

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY position, created_at, id)::INTEGER AS new_position
    FROM public.callup_entries
    WHERE callup_id = p_callup_id AND status = 'waitlist'
  )
  UPDATE public.callup_entries entry
  SET position = ordered.new_position
  FROM ordered
  WHERE entry.id = ordered.id;
END;
$$;

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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para participar.'; END IF;
  IF p_admin_only AND NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem gerenciar a lista.';
  END IF;

  SELECT * INTO current_callup
  FROM public.callups
  WHERE id = p_callup_id
  FOR UPDATE;
  IF NOT FOUND OR current_callup.status <> 'open' THEN
    RAISE EXCEPTION 'A convocacao nao esta aberta.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.players
    WHERE id = p_player_id
      AND league_id = current_callup.league_id
      AND is_selectable = true
      AND member_category IN ('player', 'guest')
      AND (
        p_admin_only
        OR public.is_app_admin()
        OR created_by_user_id = auth.uid()
        OR id = (SELECT player_id FROM public.account_profiles WHERE user_id = auth.uid())
      )
  ) THEN
    RAISE EXCEPTION 'Este perfil nao pode participar da convocacao.';
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

CREATE OR REPLACE FUNCTION public.join_callup(p_callup_id UUID)
RETURNS public.callup_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE current_player_id UUID;
BEGIN
  SELECT player_id INTO current_player_id
  FROM public.account_profiles
  WHERE user_id = auth.uid();
  IF current_player_id IS NULL THEN RAISE EXCEPTION 'Sua conta nao esta vinculada a um jogador.'; END IF;
  RETURN public.add_player_to_callup(p_callup_id, current_player_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_callup_player(p_callup_id UUID, p_player_id UUID)
RETURNS public.callup_entries
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.add_player_to_callup(p_callup_id, p_player_id, true);
$$;

REVOKE ALL ON FUNCTION public.add_player_to_callup(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_player_to_callup(UUID, UUID, BOOLEAN) TO authenticated;

CREATE TABLE IF NOT EXISTS public.match_goalkeepers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  selected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, team_id),
  UNIQUE (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS match_goalkeepers_player_idx
  ON public.match_goalkeepers (player_id, match_id);

ALTER TABLE public.match_goalkeepers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read match goalkeepers" ON public.match_goalkeepers;
CREATE POLICY "Public read match goalkeepers" ON public.match_goalkeepers
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage match goalkeepers" ON public.match_goalkeepers;
CREATE POLICY "Admins manage match goalkeepers" ON public.match_goalkeepers
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
GRANT SELECT ON public.match_goalkeepers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.match_goalkeepers TO authenticated;

ALTER TABLE public.player_round_stats
  ADD COLUMN IF NOT EXISTS goalkeeper_games INTEGER NOT NULL DEFAULT 0 CHECK (goalkeeper_games >= 0),
  ADD COLUMN IF NOT EXISTS clean_sheets INTEGER NOT NULL DEFAULT 0 CHECK (clean_sheets >= 0),
  ADD COLUMN IF NOT EXISTS goals_conceded INTEGER NOT NULL DEFAULT 0 CHECK (goals_conceded >= 0);

ALTER TABLE public.ranking_rules DROP CONSTRAINT IF EXISTS ranking_rules_event_type_check;
ALTER TABLE public.ranking_rules ADD CONSTRAINT ranking_rules_event_type_check
  CHECK (event_type IN (
    'goal', 'assist', 'win', 'draw', 'loss', 'best_goalkeeper',
    'goalkeeper_appearance', 'goal_conceded'
  ));

INSERT INTO public.ranking_rules (league_id, event_type, points)
SELECT id, 'goalkeeper_appearance', 3 FROM public.leagues
ON CONFLICT (league_id, event_type) DO NOTHING;
INSERT INTO public.ranking_rules (league_id, event_type, points)
SELECT id, 'goal_conceded', -1 FROM public.leagues
ON CONFLICT (league_id, event_type) DO NOTHING;

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS goalkeeper_appearance_points NUMERIC(8,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS goal_conceded_points NUMERIC(8,2) NOT NULL DEFAULT -1;

CREATE OR REPLACE FUNCTION public.update_fantasy_goalkeeper_points(
  p_goalkeeper_appearance_points NUMERIC,
  p_goal_conceded_points NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE active_league_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem configurar o Cartola.'; END IF;
  IF p_goalkeeper_appearance_points NOT BETWEEN -100 AND 100 OR p_goal_conceded_points NOT BETWEEN -100 AND 100 THEN
    RAISE EXCEPTION 'Pontuacao de goleiro invalida.';
  END IF;
  SELECT id INTO active_league_id FROM public.leagues WHERE is_active = true ORDER BY created_at LIMIT 1;
  UPDATE public.fantasy_settings SET
    goalkeeper_appearance_points = p_goalkeeper_appearance_points,
    goal_conceded_points = p_goal_conceded_points,
    updated_at = now()
  WHERE league_id = active_league_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.update_fantasy_goalkeeper_points(NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_fantasy_goalkeeper_points(NUMERIC, NUMERIC) TO authenticated;

CREATE OR REPLACE VIEW public.player_season_stats AS
SELECT
  prs.player_id, r.season_id, r.round_type,
  p.name AS player_name, p.nickname AS player_nickname, p.avatar_url AS player_avatar_url,
  p.player_profile, p.is_goalkeeper AS player_is_goalkeeper,
  p.member_category AS player_member_category, p.is_selectable AS player_is_selectable,
  COUNT(DISTINCT prs.round_id)::INTEGER AS rounds_count,
  COALESCE(SUM(prs.games), 0)::INTEGER AS games,
  COALESCE(SUM(prs.wins), 0)::INTEGER AS wins,
  COALESCE(SUM(prs.draws), 0)::INTEGER AS draws,
  COALESCE(SUM(prs.losses), 0)::INTEGER AS losses,
  COALESCE(SUM(prs.goals), 0)::INTEGER AS goals,
  COALESCE(SUM(prs.assists), 0)::INTEGER AS assists,
  COALESCE(SUM(prs.points), 0)::INTEGER AS points,
  CASE WHEN COALESCE(SUM(prs.games), 0) = 0 THEN 0
    ELSE ROUND(((COALESCE(SUM(prs.wins), 0) * 3 + COALESCE(SUM(prs.draws), 0))::NUMERIC /
      (COALESCE(SUM(prs.games), 0) * 3)::NUMERIC) * 100)::INTEGER END AS win_rate,
  -- Novas colunas ficam no fim para preservar a ordem da view existente.
  COALESCE(SUM(prs.goalkeeper_games), 0)::INTEGER AS goalkeeper_games,
  COALESCE(SUM(prs.clean_sheets), 0)::INTEGER AS clean_sheets,
  COALESCE(SUM(prs.goals_conceded), 0)::INTEGER AS goals_conceded
FROM public.player_round_stats prs
JOIN public.rounds r ON r.id = prs.round_id
JOIN public.players p ON p.id = prs.player_id
WHERE r.status = 'finished'
GROUP BY prs.player_id, r.season_id, r.round_type, p.name, p.nickname, p.avatar_url,
  p.player_profile, p.is_goalkeeper, p.member_category, p.is_selectable;

-- Acrescenta goleiro ao calculo-base do processador atual do Cartola sem reescrever
-- toda a engine historica. A migration falha claramente se a assinatura mudou.
DO $$
DECLARE function_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.process_fantasy_round_legacy_v0(uuid)'::regprocedure)
  INTO function_definition;

  function_definition := replace(
    function_definition,
    'COALESCE(round_stat.losses, 0) * COALESCE((settings_snapshot->>''loss_points'')::NUMERIC, 0) AS base_points',
    'COALESCE(round_stat.losses, 0) * COALESCE((settings_snapshot->>''loss_points'')::NUMERIC, 0) + COALESCE(round_stat.goalkeeper_games, 0) * COALESCE((settings_snapshot->>''goalkeeper_appearance_points'')::NUMERIC, 3) + COALESCE(round_stat.goals_conceded, 0) * COALESCE((settings_snapshot->>''goal_conceded_points'')::NUMERIC, -1) AS base_points'
  );
  function_definition := replace(
    function_definition,
    'COALESCE(round_stat.losses, 0) * COALESCE((settings_snapshot->>''loss_points'')::NUMERIC, 0) AS round_points',
    'COALESCE(round_stat.losses, 0) * COALESCE((settings_snapshot->>''loss_points'')::NUMERIC, 0) + COALESCE(round_stat.goalkeeper_games, 0) * COALESCE((settings_snapshot->>''goalkeeper_appearance_points'')::NUMERIC, 3) + COALESCE(round_stat.goals_conceded, 0) * COALESCE((settings_snapshot->>''goal_conceded_points'')::NUMERIC, -1) AS round_points'
  );

  IF function_definition NOT LIKE '%round_stat.goalkeeper_games%goalkeeper_appearance_points%' THEN
    RAISE EXCEPTION 'Nao foi possivel integrar a pontuacao de goleiro ao Cartola atual.';
  END IF;
  EXECUTE function_definition;
END;
$$;

-- Mantem o catalogo persistido alinhado às artes aprovadas.
UPDATE public.fantasy_cards SET
  description = 'Seu capitão passa de 2x para 3x. O bônus adicional da carta é limitado a +8 pontos.',
  effect_config = '{"multiplier":3,"maxBonus":8}'::JSONB
WHERE slug = 'super_captain';

UPDATE public.fantasy_cards SET
  description = 'Faça um palpite de gol e outro de assistência. Se os dois acontecerem, ganhe +6 pontos.',
  effect_config = '{"bonus":6}'::JSONB
WHERE slug = 'double_prediction';

UPDATE public.fantasy_cards SET
  description = 'Se o Vice-Capitão fizer mais pontos-base que o Capitão, ele assume o multiplicador 2x. Bônus limitado a +8 pontos.',
  effect_config = '{"maxBonus":8}'::JSONB
WHERE slug = 'vice_captain';
