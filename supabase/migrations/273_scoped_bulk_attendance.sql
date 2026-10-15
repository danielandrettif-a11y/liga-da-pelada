-- A atualizacao em massa e SECURITY DEFINER: RLS nao protege a rodada.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_round_attendance_bulk(
  p_round_id uuid, p_present_player_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE changed_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rounds round_item
    WHERE round_item.id = p_round_id
      AND round_item.status <> 'finished'
      AND public.is_league_admin(round_item.league_id)
  ) THEN
    RAISE EXCEPTION 'Rodada inexistente, encerrada ou fora da pelada administrada.';
  END IF;

  WITH ordered AS (
    SELECT participant.id,
      array_position(COALESCE(p_present_player_ids, ARRAY[]::uuid[]), participant.player_id) AS new_order
    FROM public.round_players participant
    WHERE participant.round_id = p_round_id
  )
  UPDATE public.round_players participant
  SET attendance_status = CASE WHEN ordered.new_order IS NULL THEN 'pending' ELSE 'present' END,
      attendance_order = ordered.new_order,
      attendance_marked_at = CASE WHEN ordered.new_order IS NULL THEN NULL ELSE now() END
  FROM ordered
  WHERE participant.id = ordered.id;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_round_attendance_bulk(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_round_attendance_bulk(uuid, uuid[]) TO authenticated;

COMMIT;
