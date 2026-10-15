-- Criacao atomica de uma pelada vazia. A identidade do criador e global,
-- mas temporada, regras, convite e Cartola (se completo) nascem isolados.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_league_for_admin(
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
  IF auth.uid() IS NULL OR NOT public.is_admin_of_any_league() THEN
    RAISE EXCEPTION 'Somente um ADM de pelada pode criar outra pelada.';
  END IF;
  clean_name := btrim(regexp_replace(COALESCE(p_name, ''), '[[:space:]]+', ' ', 'g'));
  IF char_length(clean_name) NOT BETWEEN 3 AND 80 THEN
    RAISE EXCEPTION 'O nome da pelada precisa ter de 3 a 80 caracteres.';
  END IF;
  IF COALESCE(p_tier, '') NOT IN ('basic', 'complete')
    OR COALESCE(p_visibility, '') NOT IN ('private', 'open') THEN
    RAISE EXCEPTION 'Escolha um modo e uma visibilidade validos.';
  END IF;
  SELECT profile.player_id INTO creator_player_id
  FROM public.account_profiles profile
  JOIN public.players player ON player.id = profile.player_id
  WHERE profile.user_id = auth.uid() AND player.is_selectable
    AND player.member_category IN ('player','guest');
  IF creator_player_id IS NULL THEN
    RAISE EXCEPTION 'Complete seu perfil de jogador antes de criar uma pelada.';
  END IF;

  -- Serializa nomes iguais e evita uma corrida no indice unico de slug.
  LOCK TABLE public.leagues IN SHARE ROW EXCLUSIVE MODE;
  base_slug := btrim(regexp_replace(
    translate(lower(clean_name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+', '-', 'g'), '-');
  IF base_slug = '' THEN base_slug := 'pelada'; END IF;
  candidate_slug := left(base_slug, 70);
  WHILE EXISTS (SELECT 1 FROM public.leagues
    WHERE lower(slug) = lower(candidate_slug)) LOOP
    candidate_slug := left(base_slug,
      greatest(1, 69 - char_length(suffix::text))) || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;

  INSERT INTO public.leagues(name, slug, feature_tier, visibility, full_enabled_at)
  VALUES(clean_name, candidate_slug, p_tier, p_visibility,
    CASE WHEN p_tier = 'complete' THEN now() ELSE NULL END)
  RETURNING id INTO new_league_id;
  INSERT INTO public.seasons(league_id, number, status)
  VALUES(new_league_id, 1, 'active');
  INSERT INTO public.league_members(league_id, player_id, user_id, role, is_active)
  VALUES(new_league_id, creator_player_id, auth.uid(), 'admin', true);
  INSERT INTO public.league_invites(league_id) VALUES(new_league_id);

  INSERT INTO public.ranking_rules(league_id, event_type, points)
  SELECT new_league_id, rules.event_type, rules.points
  FROM (VALUES
    ('goal', 4::numeric), ('assist', 2.5), ('win', 0),
    ('draw', 0), ('loss', 0), ('own_goal', -3),
    ('goalkeeper_appearance', 1), ('goal_conceded', -0.5),
    ('best_goalkeeper', 6)
  ) rules(event_type, points);

  IF p_tier = 'complete' THEN
    INSERT INTO public.fantasy_settings(
      league_id, scoring_version, market_version, goal_points,
      assist_points, win_points, draw_points, loss_points,
      own_goal_points, goalkeeper_appearance_points, goal_conceded_points,
      attacker_goal_points, attacker_assist_points, line_goal_conceded_points
    ) VALUES (
      new_league_id, 14, 15, 4, 2.5, 0, 0, 0,
      -3, 1, -0.5, 4, 2.5, -0.5
    );
  END IF;
  RETURN new_league_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_league_for_admin(text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_league_for_admin(text,text,text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
