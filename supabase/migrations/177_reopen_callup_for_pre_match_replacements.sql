-- Permite repor uma desistência depois do sorteio, mas antes do primeiro jogo.
-- A vaga guarda o time de origem para que o novo confirmado entre nele automaticamente.
CREATE TABLE IF NOT EXISTS public.callup_replacement_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  callup_id UUID NOT NULL REFERENCES public.callups(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  vacated_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  replacement_player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  goalkeeper_order INTEGER,
  loan_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS callup_replacement_slots_one_open_team_idx
  ON public.callup_replacement_slots (callup_id, team_id)
  WHERE replacement_player_id IS NULL;

ALTER TABLE public.callup_replacement_slots ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.assign_callup_replacement_slot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vacancy public.callup_replacement_slots%ROWTYPE;
  linked_round public.rounds%ROWTYPE;
  next_attendance_order INTEGER;
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;

  SELECT slot.* INTO vacancy
  FROM public.callup_replacement_slots slot
  JOIN public.callups callup ON callup.id = slot.callup_id
  JOIN public.rounds round_item ON round_item.id = slot.round_id
  WHERE slot.callup_id = NEW.callup_id
    AND slot.replacement_player_id IS NULL
    AND round_item.status = 'draft'
    AND NOT EXISTS (
      SELECT 1 FROM public.matches match_item
      WHERE match_item.round_id = slot.round_id
        AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
    )
  ORDER BY slot.created_at, slot.id
  FOR UPDATE OF slot SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO linked_round FROM public.rounds WHERE id = vacancy.round_id FOR UPDATE;
  SELECT COALESCE(MAX(attendance_order), 0) + 1 INTO next_attendance_order
  FROM public.round_players
  WHERE round_id = vacancy.round_id;

  INSERT INTO public.round_players (
    round_id, player_id, availability_status, availability_updated_at,
    attendance_status, attendance_order, attendance_marked_at
  )
  VALUES (
    vacancy.round_id, NEW.player_id, 'available', now(),
    CASE WHEN linked_round.formation_mode = 'manual' THEN 'pending' ELSE 'present' END,
    CASE WHEN linked_round.formation_mode = 'manual' THEN NULL ELSE next_attendance_order END,
    CASE WHEN linked_round.formation_mode = 'manual' THEN NULL ELSE now() END
  )
  ON CONFLICT (round_id, player_id) DO NOTHING;

  INSERT INTO public.team_players (team_id, player_id, goalkeeper_order, loan_order)
  VALUES (vacancy.team_id, NEW.player_id, vacancy.goalkeeper_order, vacancy.loan_order)
  ON CONFLICT (team_id, player_id) DO NOTHING;

  UPDATE public.callup_replacement_slots
  SET replacement_player_id = NEW.player_id,
      resolved_at = now()
  WHERE id = vacancy.id;

  UPDATE public.callups callup
  SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.callup_replacement_slots slot
          WHERE slot.callup_id = callup.id AND slot.replacement_player_id IS NULL
        ) THEN 'open'
        ELSE 'converted'
      END,
      updated_at = now()
  WHERE callup.id = NEW.callup_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_callup_replacement_slot_on_confirmation ON public.callup_entries;
CREATE TRIGGER assign_callup_replacement_slot_on_confirmation
AFTER INSERT OR UPDATE OF status ON public.callup_entries
FOR EACH ROW EXECUTE FUNCTION public.assign_callup_replacement_slot();

CREATE OR REPLACE FUNCTION public.open_callup_replacement_vacancy(
  p_round_id UUID,
  p_out_player_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_round public.rounds%ROWTYPE;
  linked_callup public.callups%ROWTYPE;
  previous_team_player public.team_players%ROWTYPE;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem abrir vagas na convocacao.';
  END IF;

  SELECT * INTO selected_round
  FROM public.rounds
  WHERE id = p_round_id AND status = 'draft'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A vaga só pode ser aberta antes do início da rodada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = p_round_id
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
  ) THEN
    RAISE EXCEPTION 'A vaga só pode ser aberta antes do primeiro jogo.';
  END IF;

  SELECT * INTO linked_callup
  FROM public.callups
  WHERE round_id = p_round_id
    AND status IN ('open', 'locked', 'converted')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta rodada não possui uma convocação vinculada.';
  END IF;

  SELECT team_player.* INTO previous_team_player
  FROM public.team_players team_player
  JOIN public.teams team ON team.id = team_player.team_id
  WHERE team.round_id = p_round_id
    AND team_player.player_id = p_out_player_id
  FOR UPDATE OF team_player;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O jogador não está em um time desta rodada.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.callup_replacement_slots
    WHERE callup_id = linked_callup.id
      AND team_id = previous_team_player.team_id
      AND replacement_player_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Este time já possui uma vaga aberta na convocação.';
  END IF;

  DELETE FROM public.team_players WHERE id = previous_team_player.id;
  DELETE FROM public.round_players
  WHERE round_id = p_round_id AND player_id = p_out_player_id;
  UPDATE public.teams
  SET captain_player_id = NULL
  WHERE id = previous_team_player.team_id
    AND captain_player_id = p_out_player_id;

  INSERT INTO public.callup_replacement_slots (
    callup_id, round_id, team_id, vacated_player_id, goalkeeper_order, loan_order
  )
  VALUES (
    linked_callup.id, p_round_id, previous_team_player.team_id, p_out_player_id,
    previous_team_player.goalkeeper_order, previous_team_player.loan_order
  );

  DELETE FROM public.callup_entries
  WHERE callup_id = linked_callup.id AND player_id = p_out_player_id;
  PERFORM public.normalize_callup_positions(linked_callup.id);

  UPDATE public.callups callup
  SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.callup_replacement_slots slot
          WHERE slot.callup_id = callup.id AND slot.replacement_player_id IS NULL
        ) THEN 'open'
        ELSE 'converted'
      END,
      updated_at = now()
  WHERE callup.id = linked_callup.id;

  RETURN linked_callup.id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_callup_replacement_vacancy(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_callup_replacement_vacancy(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
