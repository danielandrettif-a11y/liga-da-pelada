-- Rebalanceia exclusivamente a Ranked BQ.
-- Os scouts brutos continuam intactos porque o Cartola possui motor próprio e
-- ainda utiliza alguns deles (inclusive os scouts defensivos de jogadores DEF).

INSERT INTO public.ranking_rules (league_id, event_type, points)
SELECT leagues.id, rules.event_type, rules.points
FROM public.leagues
CROSS JOIN (VALUES
  ('win', 4),
  ('goal', 3),
  ('assist', 2),
  ('draw', 1),
  ('loss', -1),
  ('own_goal', -2),
  ('goalkeeper_appearance', 3),
  ('goal_conceded', -1)
) AS rules(event_type, points)
ON CONFLICT (league_id, event_type)
DO UPDATE SET points = EXCLUDED.points;

-- Recalculo retroativo autorizado: usa apenas os scouts já persistidos e não
-- cria eventos, partidas, participações ou registros de histórico adicionais.
-- Amistosos permanecem com zero pontos de Ranked.
UPDATE public.player_round_stats AS stats
SET points =
    (COALESCE(stats.wins, 0) * 4)
  + (COALESCE(stats.goals, 0) * 3)
  + (COALESCE(stats.assists, 0) * 2)
  + (COALESCE(stats.draws, 0) * 1)
  - (COALESCE(stats.losses, 0) * 1)
  - (COALESCE(stats.own_goals, 0) * 2)
  + (COALESCE(stats.goalkeeper_games, 0) * 3)
  - COALESCE(stats.goals_conceded, 0)
FROM public.rounds AS rounds
WHERE rounds.id = stats.round_id
  AND rounds.round_type <> 'friendly';
