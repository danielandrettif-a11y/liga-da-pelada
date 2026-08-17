-- ============================================================
-- Migration 046: Performance Views and Composite Indexes
-- Liga da Pelada — Performance V1 Parte 2/3
-- ============================================================

-- 1. VIEW: Estatísticas Agregadas por Jogador, Temporada e Tipo de Rodada
-- Substitui loops de agregação no Node.js por cálculo determinístico no PostgreSQL
CREATE OR REPLACE VIEW player_season_stats AS
SELECT
  prs.player_id,
  r.season_id,
  r.round_type,
  p.name AS player_name,
  p.nickname AS player_nickname,
  p.avatar_url AS player_avatar_url,
  p.player_profile AS player_profile,
  p.is_goalkeeper AS player_is_goalkeeper,
  p.member_category AS player_member_category,
  p.is_selectable AS player_is_selectable,
  COUNT(DISTINCT prs.round_id)::INTEGER AS rounds_count,
  COALESCE(SUM(prs.games), 0)::INTEGER AS games,
  COALESCE(SUM(prs.wins), 0)::INTEGER AS wins,
  COALESCE(SUM(prs.draws), 0)::INTEGER AS draws,
  COALESCE(SUM(prs.losses), 0)::INTEGER AS losses,
  COALESCE(SUM(prs.goals), 0)::INTEGER AS goals,
  COALESCE(SUM(prs.assists), 0)::INTEGER AS assists,
  COALESCE(SUM(prs.points), 0)::INTEGER AS points,
  CASE
    WHEN COALESCE(SUM(prs.games), 0) = 0 THEN 0
    ELSE ROUND(((COALESCE(SUM(prs.wins), 0) * 3 + COALESCE(SUM(prs.draws), 0))::NUMERIC / (COALESCE(SUM(prs.games), 0) * 3)::NUMERIC) * 100)::INTEGER
  END AS win_rate
FROM player_round_stats prs
JOIN rounds r ON r.id = prs.round_id
JOIN players p ON p.id = prs.player_id
WHERE r.status = 'finished'
GROUP BY
  prs.player_id,
  r.season_id,
  r.round_type,
  p.name,
  p.nickname,
  p.avatar_url,
  p.player_profile,
  p.is_goalkeeper,
  p.member_category,
  p.is_selectable;

-- 2. ÍNDICES COMPOSTOS para otimização de queries críticas

-- Índice composto para consultas por round_id e player_id em player_round_stats
CREATE INDEX IF NOT EXISTS idx_player_round_stats_round_player
  ON player_round_stats(round_id, player_id);

-- Índice composto para buscar gols e assistências por jogador em match_events
CREATE INDEX IF NOT EXISTS idx_match_events_player_type
  ON match_events(player_id, event_type);

-- Índice para busca reversa de jogadores em times
CREATE INDEX IF NOT EXISTS idx_team_players_player
  ON team_players(player_id);

-- Índice para busca de presença por jogador em rodadas
CREATE INDEX IF NOT EXISTS idx_round_players_player
  ON round_players(player_id);

-- Índice para filtragem de partidas por rodada e status
CREATE INDEX IF NOT EXISTS idx_matches_round_status
  ON matches(round_id, status);
