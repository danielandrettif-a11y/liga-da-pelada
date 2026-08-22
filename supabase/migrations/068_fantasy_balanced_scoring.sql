-- Equilíbrio do Cartola: ações ofensivas valorizadas, vitória relevante e
-- incentivo ao goleiro. Snapshots históricos não são alterados por esta migration.

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS goalkeeper_loss_points NUMERIC(8,2) NOT NULL DEFAULT 0;

-- Esta é a regra para novas rodadas. As rodadas encerradas mantêm o snapshot
-- próprio até o administrador usar “Aplicar regras atuais”.
UPDATE public.fantasy_settings SET
  goal_points = 5,
  assist_points = 3,
  win_points = 4,
  loss_points = -2,
  goalkeeper_loss_points = 0,
  goalkeeper_appearance_points = 3,
  team_goal_conceded_points = -1,
  captain_multiplier = 1.5,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.calculate_fantasy_base_points(
  p_settings JSONB,
  p_goals INTEGER,
  p_assists INTEGER,
  p_wins INTEGER,
  p_losses INTEGER,
  p_goalkeeper_games INTEGER,
  p_team_goals_conceded INTEGER
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(p_goals, 0) * COALESCE((p_settings->>'goal_points')::NUMERIC, 4)
    + COALESCE(p_assists, 0) * COALESCE((p_settings->>'assist_points')::NUMERIC, 2)
    + COALESCE(p_wins, 0) * COALESCE((p_settings->>'win_points')::NUMERIC, 5)
    + COALESCE(p_losses, 0) * CASE
      WHEN COALESCE(p_goalkeeper_games, 0) > 0 THEN COALESCE(
        (p_settings->>'goalkeeper_loss_points')::NUMERIC,
        (p_settings->>'loss_points')::NUMERIC,
        -3
      )
      ELSE COALESCE((p_settings->>'loss_points')::NUMERIC, -3)
    END
    + COALESCE(p_goalkeeper_games, 0) * COALESCE((p_settings->>'goalkeeper_appearance_points')::NUMERIC, 3)
    + COALESCE(p_team_goals_conceded, 0) * COALESCE((p_settings->>'team_goal_conceded_points')::NUMERIC, -1);
$$;

CREATE OR REPLACE FUNCTION public.update_fantasy_goalkeeper_loss_points(p_goalkeeper_loss_points NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE active_league_id UUID;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem configurar o Cartola.';
  END IF;
  IF p_goalkeeper_loss_points IS NULL OR p_goalkeeper_loss_points < -100 OR p_goalkeeper_loss_points > 100 THEN
    RAISE EXCEPTION 'Pontuacao por derrota do goleiro invalida.';
  END IF;
  SELECT id INTO active_league_id FROM public.leagues WHERE is_active = true ORDER BY created_at LIMIT 1;
  UPDATE public.fantasy_settings SET goalkeeper_loss_points = p_goalkeeper_loss_points, updated_at = now()
  WHERE league_id = active_league_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_fantasy_goalkeeper_loss_points(NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_fantasy_goalkeeper_loss_points(NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION public.calculate_fantasy_base_points(JSONB, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_fantasy_base_points(JSONB, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
