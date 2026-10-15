-- A finished-round score override may only be performed by an administrator
-- of that round's league. Read access to its reason follows the same scope.
CREATE OR REPLACE FUNCTION public.zero_player_round_points(
  p_round_id uuid,
  p_player_id uuid,
  p_reason text DEFAULT 'Jogador não participou da rodada'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_round public.rounds%ROWTYPE;
  previous_stats public.player_round_stats%ROWTYPE;
  clean_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  SELECT * INTO selected_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada não encontrada.'; END IF;
  IF NOT public.is_league_admin(selected_round.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.';
  END IF;
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

ALTER TABLE public.player_round_stat_overrides ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE old_policy record;
BEGIN
  FOR old_policy IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'player_round_stat_overrides'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.player_round_stat_overrides', old_policy.policyname);
  END LOOP;
END $$;
CREATE POLICY player_round_stat_overrides_league_read ON public.player_round_stat_overrides
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.rounds round_item
    WHERE round_item.id = round_id AND public.is_league_admin(round_item.league_id))
);

REVOKE ALL ON FUNCTION public.zero_player_round_points(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zero_player_round_points(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
