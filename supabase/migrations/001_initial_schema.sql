-- ============================================
-- Liga da Pelada — Schema do Banco de Dados
-- Supabase PostgreSQL Migration
-- ============================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS (administradores de ligas)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- PLAYERS (jogadores)
-- ============================================
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  nickname TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- LEAGUES (ligas independentes)
-- ============================================
CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- LEAGUE_MEMBERS (jogadores dentro de uma liga)
-- ============================================
CREATE TABLE IF NOT EXISTS league_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'player' NOT NULL CHECK (role IN ('admin', 'player')),
  is_active BOOLEAN DEFAULT true NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(league_id, player_id)
);

-- ============================================
-- RANKING_RULES (pontuação configurável por liga)
-- ============================================
CREATE TABLE IF NOT EXISTS ranking_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('goal', 'assist', 'win', 'draw', 'loss')),
  points INTEGER NOT NULL DEFAULT 0,
  UNIQUE(league_id, event_type)
);

-- ============================================
-- ROUNDS (rodadas — cada pelada semanal)
-- ============================================
CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  date DATE NOT NULL,
  status TEXT DEFAULT 'draft' NOT NULL CHECK (status IN ('draft', 'active', 'finished')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(league_id, number)
);

-- ============================================
-- ROUND_PLAYERS (jogadores confirmados na rodada)
-- ============================================
CREATE TABLE IF NOT EXISTS round_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  UNIQUE(round_id, player_id)
);

-- ============================================
-- TEAMS (times montados dentro de uma rodada)
-- ============================================
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

-- ============================================
-- TEAM_PLAYERS (jogadores de cada time)
-- ============================================
CREATE TABLE IF NOT EXISTS team_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  UNIQUE(team_id, player_id)
);

-- ============================================
-- MATCHES (partidas dentro de uma rodada)
-- ============================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  team_a_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team_b_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  score_a INTEGER DEFAULT 0 NOT NULL,
  score_b INTEGER DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'live', 'finished')),
  match_order INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- MATCH_EVENTS (gols e assistências)
-- ============================================
CREATE TABLE IF NOT EXISTS match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('goal')),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  assist_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  minute INTEGER,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- PLAYER_ROUND_STATS (stats por jogador por rodada)
-- ============================================
CREATE TABLE IF NOT EXISTS player_round_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  games INTEGER DEFAULT 0 NOT NULL,
  goals INTEGER DEFAULT 0 NOT NULL,
  assists INTEGER DEFAULT 0 NOT NULL,
  wins INTEGER DEFAULT 0 NOT NULL,
  draws INTEGER DEFAULT 0 NOT NULL,
  losses INTEGER DEFAULT 0 NOT NULL,
  points INTEGER DEFAULT 0 NOT NULL,
  UNIQUE(player_id, round_id)
);

-- ============================================
-- ÍNDICES para performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_league_members_league ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_league_members_player ON league_members(player_id);
CREATE INDEX IF NOT EXISTS idx_rounds_league ON rounds(league_id);
CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);
CREATE INDEX IF NOT EXISTS idx_round_players_round ON round_players(round_id);
CREATE INDEX IF NOT EXISTS idx_teams_round ON teams(round_id);
CREATE INDEX IF NOT EXISTS idx_team_players_team ON team_players(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round_id);
CREATE INDEX IF NOT EXISTS idx_match_events_match ON match_events(match_id);
CREATE INDEX IF NOT EXISTS idx_match_events_player ON match_events(player_id);
CREATE INDEX IF NOT EXISTS idx_player_round_stats_player ON player_round_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_round_stats_round ON player_round_stats(round_id);
CREATE INDEX IF NOT EXISTS idx_player_round_stats_league ON player_round_stats(league_id);

-- ============================================
-- SEED: Ranking Rules padrão (template)
-- Essas regras serão copiadas ao criar uma nova liga
-- ============================================
-- Nota: As regras são inseridas por liga no momento da criação.
-- Aqui está apenas a referência dos valores padrão:
-- goal    = 3 pontos
-- assist  = 2 pontos
-- win     = 2 pontos
-- draw    = 1 ponto
-- loss    = 0 pontos
