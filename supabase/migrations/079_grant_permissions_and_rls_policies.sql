-- Migration 079: Garantir permissões completas (GRANTs) e políticas de RLS para round_players e tabelas essenciais

-- 1. Habilitar RLS e criar políticas de leitura pública para round_players
ALTER TABLE public.round_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "round_players_public_read" ON public.round_players;
DROP POLICY IF EXISTS "Public read" ON public.round_players;
DROP POLICY IF EXISTS "Allow public read round_players" ON public.round_players;
DROP POLICY IF EXISTS "Allow authenticated manage round_players" ON public.round_players;
DROP POLICY IF EXISTS "Allow service role all round_players" ON public.round_players;

CREATE POLICY "Allow public read round_players"
  ON public.round_players
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated manage round_players"
  ON public.round_players
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Garantir permissões GRANT explícitas para round_players
GRANT SELECT ON public.round_players TO anon;
GRANT ALL ON public.round_players TO authenticated, service_role;

-- 3. Garantir permissões para tabelas de partidas e eventos
GRANT SELECT ON public.matches TO anon;
GRANT ALL ON public.matches TO authenticated, service_role;

GRANT SELECT ON public.match_players TO anon;
GRANT ALL ON public.match_players TO authenticated, service_role;

GRANT SELECT ON public.match_events TO anon;
GRANT ALL ON public.match_events TO authenticated, service_role;

GRANT SELECT ON public.match_substitutions TO anon;
GRANT ALL ON public.match_substitutions TO authenticated, service_role;

GRANT SELECT ON public.match_goalkeepers TO anon;
GRANT ALL ON public.match_goalkeepers TO authenticated, service_role;

GRANT SELECT ON public.teams TO anon;
GRANT ALL ON public.teams TO authenticated, service_role;

GRANT SELECT ON public.team_players TO anon;
GRANT ALL ON public.team_players TO authenticated, service_role;

GRANT SELECT ON public.players TO anon;
GRANT ALL ON public.players TO authenticated, service_role;

GRANT SELECT ON public.rounds TO anon;
GRANT ALL ON public.rounds TO authenticated, service_role;

-- 4. Políticas RLS de leitura pública para tabelas relacionadas
DO $$
BEGIN
  -- match_players
  ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "match_players_public_read" ON public.match_players;
  CREATE POLICY "match_players_public_read" ON public.match_players FOR SELECT TO anon, authenticated USING (true);
  DROP POLICY IF EXISTS "match_players_auth_all" ON public.match_players;
  CREATE POLICY "match_players_auth_all" ON public.match_players FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- match_events
  ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "match_events_public_read" ON public.match_events;
  CREATE POLICY "match_events_public_read" ON public.match_events FOR SELECT TO anon, authenticated USING (true);
  DROP POLICY IF EXISTS "match_events_auth_all" ON public.match_events;
  CREATE POLICY "match_events_auth_all" ON public.match_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- match_substitutions
  ALTER TABLE public.match_substitutions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "match_substitutions_public_read" ON public.match_substitutions;
  CREATE POLICY "match_substitutions_public_read" ON public.match_substitutions FOR SELECT TO anon, authenticated USING (true);
  DROP POLICY IF EXISTS "match_substitutions_auth_all" ON public.match_substitutions;
  CREATE POLICY "match_substitutions_auth_all" ON public.match_substitutions FOR ALL TO authenticated USING (true) WITH CHECK (true);

  -- match_goalkeepers
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'match_goalkeepers') THEN
    ALTER TABLE public.match_goalkeepers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "match_goalkeepers_public_read" ON public.match_goalkeepers;
    CREATE POLICY "match_goalkeepers_public_read" ON public.match_goalkeepers FOR SELECT TO anon, authenticated USING (true);
    DROP POLICY IF EXISTS "match_goalkeepers_auth_all" ON public.match_goalkeepers;
    CREATE POLICY "match_goalkeepers_auth_all" ON public.match_goalkeepers FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- team_players
  ALTER TABLE public.team_players ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "team_players_public_read" ON public.team_players;
  CREATE POLICY "team_players_public_read" ON public.team_players FOR SELECT TO anon, authenticated USING (true);
  DROP POLICY IF EXISTS "team_players_auth_all" ON public.team_players;
  CREATE POLICY "team_players_auth_all" ON public.team_players FOR ALL TO authenticated USING (true) WITH CHECK (true);
END $$;
