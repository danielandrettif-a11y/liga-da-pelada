-- Migração para adicionar tempo de partida configurável na liga
ALTER TABLE leagues ADD COLUMN match_duration integer DEFAULT 7;
