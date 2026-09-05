-- Permite ao administrador corrigir a assistência de um gol sem apagar o
-- evento, preservando o placar e registrando a alteração na auditoria.
CREATE OR REPLACE FUNCTION public.correct_finished_goal_assist(
  p_event_id UUID,
  p_assist_player_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_event public.match_events%ROWTYPE;
  selected_match public.matches%ROWTYPE;
  selected_round public.rounds%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Somente administradores podem corrigir assistências.'; END IF;

  SELECT * INTO selected_event FROM public.match_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gol não encontrado.'; END IF;
  SELECT * INTO selected_match FROM public.matches WHERE id = selected_event.match_id FOR UPDATE;
  SELECT * INTO selected_round FROM public.rounds WHERE id = selected_match.round_id FOR UPDATE;
  IF selected_match.status <> 'finished' OR selected_round.status <> 'finished' THEN
    RAISE EXCEPTION 'Esta correção é exclusiva para partidas de rodadas finalizadas.';
  END IF;
  IF selected_event.is_own_goal THEN RAISE EXCEPTION 'Gol contra não pode receber assistência.'; END IF;
  IF p_assist_player_id = selected_event.player_id THEN RAISE EXCEPTION 'O autor do gol não pode dar a própria assistência.'; END IF;
  IF p_assist_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.match_players player_entry
    WHERE player_entry.match_id = selected_event.match_id
      AND player_entry.team_id = selected_event.team_id
      AND player_entry.player_id = p_assist_player_id
  ) THEN
    RAISE EXCEPTION 'O assistente precisa ter participado do mesmo time nesta partida.';
  END IF;

  UPDATE public.match_events SET assist_player_id = p_assist_player_id WHERE id = selected_event.id;

  INSERT INTO public.sports_admin_audit (league_id, round_id, match_id, action, changed_by, payload)
  VALUES (selected_round.league_id, selected_round.id, selected_match.id, 'goal_assist_corrected', auth.uid(), jsonb_build_object(
    'event_id', selected_event.id,
    'player_id', selected_event.player_id,
    'previous_assist_player_id', selected_event.assist_player_id,
    'assist_player_id', p_assist_player_id
  ));

  RETURN jsonb_build_object('round_id', selected_round.id, 'match_id', selected_match.id);
END;
$$;

REVOKE ALL ON FUNCTION public.correct_finished_goal_assist(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_finished_goal_assist(UUID, UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
