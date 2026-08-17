-- Adiciona as colunas de controle de tempo na tabela de partidas
ALTER TABLE matches ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS timer_accumulated_seconds INTEGER DEFAULT 0 NOT NULL;

-- Ativa o modo Realtime para as tabelas necessárias
-- Nota: Se der erro dizendo que a tabela já está na publicação, pode ignorar!
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE match_events;
