-- Execute only in a newly created, disposable database before migration 351.
-- This fixture tests the function, not the entire production schema.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.rounds (id uuid PRIMARY KEY, league_id uuid NOT NULL);
CREATE TABLE public.matches (
  id uuid PRIMARY KEY, status text NOT NULL, team_a_id uuid NOT NULL,
  team_b_id uuid NOT NULL, score_a integer NOT NULL DEFAULT 0,
  score_b integer NOT NULL DEFAULT 0, round_id uuid NOT NULL,
  timer_started_at timestamptz, timer_accumulated_seconds integer,
  eligibility_elapsed_offset_seconds integer
);
CREATE TABLE public.match_players (
  match_id uuid NOT NULL, player_id uuid NOT NULL, team_id uuid NOT NULL,
  is_active boolean NOT NULL
);
CREATE TABLE public.match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_id uuid NOT NULL,
  player_id uuid NOT NULL, assist_player_id uuid, team_id uuid NOT NULL,
  event_type text NOT NULL, minute integer, elapsed_seconds integer,
  idempotency_key text, is_own_goal boolean NOT NULL DEFAULT false,
  UNIQUE (match_id, idempotency_key)
);
CREATE FUNCTION public.is_league_admin(p_league_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p_league_id = '00000000-0000-4000-8000-000000000010'::uuid
     AND auth.uid() = '00000000-0000-4000-8000-000000000011'::uuid
$$;

INSERT INTO public.rounds VALUES
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000010');
INSERT INTO public.matches (id, status, team_a_id, team_b_id, round_id) VALUES
  ('00000000-0000-4000-8000-000000000013', 'live',
   '00000000-0000-4000-8000-000000000014', '00000000-0000-4000-8000-000000000015',
   '00000000-0000-4000-8000-000000000012');
INSERT INTO public.match_players VALUES
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000016',
   '00000000-0000-4000-8000-000000000014', true);
