-- Correção administrativa pontual: zera somente as estatísticas de um atleta
-- em uma rodada, sem apagar o placar nem alterar os eventos dos demais.

CREATE TABLE IF NOT EXISTS public.player_round_stat_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  override_type TEXT NOT NULL CHECK (override_type IN ('zero_points')),
  reason TEXT NOT NULL DEFAULT 'Jogador não participou da rodada',
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, player_id, override_type)
);

ALTER TABLE public.player_round_stat_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS player_round_stat_overrides_read ON public.player_round_stat_overrides;
CREATE POLICY player_round_stat_overrides_read ON public.player_round_stat_overrides
  FOR SELECT TO authenticated USING (public.is_app_admin());
REVOKE ALL ON public.player_round_stat_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.player_round_stat_overrides TO authenticated;

CREATE OR REPLACE FUNCTION public.zero_player_round_points(
  p_round_id UUID,
  p_player_id UUID,
  p_reason TEXT DEFAULT 'Jogador não participou da rodada'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_round public.rounds%ROWTYPE;
  previous_stats public.player_round_stats%ROWTYPE;
  clean_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem corrigir pontuação.';
  END IF;

  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada não encontrada.'; END IF;
  IF selected_round.status <> 'finished' THEN
    RAISE EXCEPTION 'Finalize a rodada antes de zerar a pontuação.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE round_id = p_round_id AND status = 'live') THEN
    RAISE EXCEPTION 'Encerre as partidas ao vivo antes de corrigir a rodada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.round_players WHERE round_id = p_round_id AND player_id = p_player_id) THEN
    RAISE EXCEPTION 'O jogador não pertence a esta rodada.';
  END IF;

  SELECT * INTO previous_stats
    FROM public.player_round_stats
   WHERE round_id = p_round_id AND player_id = p_player_id
   FOR UPDATE;

  INSERT INTO public.player_round_stat_overrides (round_id, player_id, override_type, reason, changed_by)
  VALUES (p_round_id, p_player_id, 'zero_points', COALESCE(clean_reason, 'Jogador não participou da rodada'), auth.uid())
  ON CONFLICT (round_id, player_id, override_type) DO UPDATE
    SET reason = EXCLUDED.reason, changed_by = EXCLUDED.changed_by, created_at = now();

  INSERT INTO public.player_round_stats (
    player_id, round_id, league_id, games, goals, assists, wins, draws, losses,
    points, goalkeeper_games, clean_sheets, goals_conceded, team_goals_conceded
  ) VALUES (p_player_id, p_round_id, selected_round.league_id, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  ON CONFLICT (player_id, round_id) DO UPDATE SET
    games = 0, goals = 0, assists = 0, wins = 0, draws = 0, losses = 0,
    points = 0, goalkeeper_games = 0, clean_sheets = 0,
    goals_conceded = 0, team_goals_conceded = 0;

  INSERT INTO public.sports_admin_audit (league_id, round_id, action, changed_by, payload)
  VALUES (selected_round.league_id, p_round_id, 'player_round_points_zeroed', auth.uid(), jsonb_build_object(
    'player_id', p_player_id,
    'reason', COALESCE(clean_reason, 'Jogador não participou da rodada'),
    'previous_stats', to_jsonb(previous_stats)
  ));

  RETURN jsonb_build_object('round_id', p_round_id, 'player_id', p_player_id, 'points', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.zero_player_round_points(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zero_player_round_points(UUID, UUID, TEXT) TO authenticated;
