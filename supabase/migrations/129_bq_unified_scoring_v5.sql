-- ============================================================================
-- Migration 129: Scouts Básicos BQ v5 Unificados
-- ============================================================================
-- Unificação dos 8 scouts básicos entre Ranked e Cartola.
-- Altera colunas de pontuação para NUMERIC(12,2), atualiza ranking_rules e
-- fantasy_settings, adiciona snapshot de regras por rodada e recalcula
-- player_round_stats para a temporada ativa.

-- 1. Alterar tipos para NUMERIC(12,2)
ALTER TABLE public.player_round_stats
  ALTER COLUMN points TYPE NUMERIC(12,2) USING points::NUMERIC(12,2);

ALTER TABLE public.ranking_rules
  ALTER COLUMN points TYPE NUMERIC(12,2) USING points::NUMERIC(12,2);

-- 2. Snapshot de pontuação em rounds
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS scoring_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS scoring_version INTEGER NOT NULL DEFAULT 5;

-- 3. Suporte a draw_points em fantasy_settings
ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS draw_points NUMERIC(10,2) NOT NULL DEFAULT 1.0;

-- 4. Atualizar ranking_rules com os novos 8 valores BQ v5
INSERT INTO public.ranking_rules (league_id, event_type, points)
SELECT leagues.id, rules.event_type, rules.points
FROM public.leagues
CROSS JOIN (VALUES
  ('win', 3.0),
  ('goal', 4.0),
  ('assist', 2.5),
  ('draw', 1.0),
  ('loss', -2.5),
  ('own_goal', -3.0),
  ('goalkeeper_appearance', 2.0),
  ('goal_conceded', -1.0)
) AS rules(event_type, points)
ON CONFLICT (league_id, event_type)
DO UPDATE SET points = EXCLUDED.points;

-- 5. Atualizar fantasy_settings com os novos 8 valores BQ v5
UPDATE public.fantasy_settings
SET
  goal_points = 4.0,
  assist_points = 2.5,
  win_points = 3.0,
  draw_points = 1.0,
  loss_points = -2.5,
  own_goal_points = -3.0,
  goalkeeper_appearance_points = 2.0,
  goal_conceded_points = -1.0;

-- 6. Função para capturar snapshot BQ da liga
CREATE OR REPLACE FUNCTION public.snapshot_bq_scoring(p_league_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot JSONB;
BEGIN
  SELECT jsonb_build_object(
    'version', 5,
    'goal', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'goal'), 4.0),
    'assist', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'assist'), 2.5),
    'win', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'win'), 3.0),
    'draw', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'draw'), 1.0),
    'loss', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'loss'), -2.5),
    'ownGoal', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'own_goal'), -3.0),
    'goalkeeperAppearance', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'goalkeeper_appearance'), 2.0),
    'goalkeeperGoalConceded', COALESCE((SELECT points FROM public.ranking_rules WHERE league_id = p_league_id AND event_type = 'goal_conceded'), -1.0)
  ) INTO v_snapshot;

  RETURN v_snapshot;
END;
$$;

-- 7. Preencher scoring_snapshot nas rodadas existentes que ainda não possuam
UPDATE public.rounds r
SET
  scoring_snapshot = public.snapshot_bq_scoring(r.league_id),
  scoring_version = 5
WHERE r.scoring_snapshot IS NULL;

-- 8. Recalcular player_round_stats.points para rodadas não amistosas
UPDATE public.player_round_stats AS stats
SET points =
    (COALESCE(stats.wins, 0) * 3.0)
  + (COALESCE(stats.goals, 0) * 4.0)
  + (COALESCE(stats.assists, 0) * 2.5)
  + (COALESCE(stats.draws, 0) * 1.0)
  - (COALESCE(stats.losses, 0) * 2.5)
  - (COALESCE(stats.own_goals, 0) * 3.0)
  + (COALESCE(stats.goalkeeper_games, 0) * 2.0)
  - (COALESCE(stats.goals_conceded, 0) * 1.0)
FROM public.rounds AS rounds
WHERE rounds.id = stats.round_id
  AND rounds.round_type <> 'friendly';
