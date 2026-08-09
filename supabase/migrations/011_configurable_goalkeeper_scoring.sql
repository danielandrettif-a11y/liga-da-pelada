-- Permite configurar os pontos do premio de melhor goleiro.

ALTER TABLE ranking_rules
  DROP CONSTRAINT IF EXISTS ranking_rules_event_type_check;

ALTER TABLE ranking_rules
  ADD CONSTRAINT ranking_rules_event_type_check
  CHECK (event_type IN ('goal', 'assist', 'win', 'draw', 'loss', 'best_goalkeeper'));

INSERT INTO ranking_rules (league_id, event_type, points)
SELECT id, 'best_goalkeeper', 6
FROM leagues
ON CONFLICT (league_id, event_type) DO NOTHING;
