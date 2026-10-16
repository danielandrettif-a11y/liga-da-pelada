-- Identidade visual das peladas e estatisticas globais da conta.
BEGIN;

ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#ccff00';

ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_accent_color_check;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_accent_color_check
  CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$');

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('league-branding', 'league-branding', true, 8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS league_branding_public_read ON storage.objects;
CREATE POLICY league_branding_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'league-branding');

DROP POLICY IF EXISTS league_branding_admin_insert ON storage.objects;
CREATE POLICY league_branding_admin_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'league-branding'
    AND public.is_league_admin(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS league_branding_admin_update ON storage.objects;
CREATE POLICY league_branding_admin_update ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'league-branding'
    AND public.is_league_admin(((storage.foldername(name))[1])::uuid)
  ) WITH CHECK (
    bucket_id = 'league-branding'
    AND public.is_league_admin(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS league_branding_admin_delete ON storage.objects;
CREATE POLICY league_branding_admin_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'league-branding'
    AND public.is_league_admin(((storage.foldername(name))[1])::uuid)
  );

CREATE OR REPLACE FUNCTION public.get_my_account_career_stats()
RETURNS TABLE (
  league_id uuid,
  league_name text,
  round_type text,
  rounds_count integer,
  games integer,
  goals integer,
  assists integer,
  wins integer,
  draws integer,
  losses integer,
  points numeric,
  goalkeeper_games integer,
  goals_conceded integer,
  clean_sheets integer,
  play_seconds bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT profile.player_id
    FROM public.account_profiles profile
    WHERE profile.user_id = auth.uid()
  ), memberships AS (
    SELECT member.league_id, league.name
    FROM public.league_members member
    JOIN public.leagues league ON league.id = member.league_id
    JOIN me ON me.player_id = member.player_id
    WHERE member.user_id = auth.uid() AND member.is_active AND league.is_active
  ), stat_totals AS (
    SELECT membership.league_id, membership.name, round_item.round_type,
      count(DISTINCT stat.round_id)::integer AS rounds_count,
      COALESCE(sum(stat.games), 0)::integer AS games,
      COALESCE(sum(stat.goals), 0)::integer AS goals,
      COALESCE(sum(stat.assists), 0)::integer AS assists,
      COALESCE(sum(stat.wins), 0)::integer AS wins,
      COALESCE(sum(stat.draws), 0)::integer AS draws,
      COALESCE(sum(stat.losses), 0)::integer AS losses,
      COALESCE(sum(stat.points), 0)::numeric AS points,
      COALESCE(sum(stat.goalkeeper_games), 0)::integer AS goalkeeper_games,
      COALESCE(sum(stat.goals_conceded), 0)::integer AS goals_conceded,
      COALESCE(sum(stat.clean_sheets), 0)::integer AS clean_sheets
    FROM memberships membership
    CROSS JOIN me
    JOIN public.rounds round_item ON round_item.league_id = membership.league_id
      AND round_item.status = 'finished'
    JOIN public.player_round_stats stat ON stat.round_id = round_item.id
      AND stat.player_id = me.player_id
    GROUP BY membership.league_id, membership.name, round_item.round_type
  ), time_totals AS (
    SELECT membership.league_id, round_item.round_type,
      COALESCE(sum(GREATEST(0,
        COALESCE(match_player.left_elapsed_seconds,
          CASE WHEN match_item.finished_at IS NOT NULL
            THEN GREATEST(match_item.timer_accumulated_seconds, 0)
            ELSE match_item.timer_accumulated_seconds END,
          0
        ) - COALESCE(match_player.entered_elapsed_seconds, 0)
      )), 0)::bigint AS play_seconds
    FROM memberships membership
    CROSS JOIN me
    JOIN public.rounds round_item ON round_item.league_id = membership.league_id
      AND round_item.status = 'finished'
    JOIN public.matches match_item ON match_item.round_id = round_item.id
    JOIN public.match_players match_player ON match_player.match_id = match_item.id
      AND match_player.player_id = me.player_id
    GROUP BY membership.league_id, round_item.round_type
  )
  SELECT stats.league_id, stats.name, stats.round_type,
    stats.rounds_count, stats.games, stats.goals, stats.assists,
    stats.wins, stats.draws, stats.losses, stats.points,
    stats.goalkeeper_games, stats.goals_conceded, stats.clean_sheets,
    COALESCE(time_item.play_seconds, 0)
  FROM stat_totals stats
  LEFT JOIN time_totals time_item USING (league_id, round_type)
  ORDER BY stats.name, stats.round_type;
$$;

REVOKE ALL ON FUNCTION public.get_my_account_career_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_account_career_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
