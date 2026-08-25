-- A Rodada 1 mantém o snapshot e o processamento anteriores. A partir da
-- Rodada 2 entram o bônus de vaga, o rodízio de goleiro e o mercado 65/35.

CREATE OR REPLACE FUNCTION public.set_role_scoring_activation_from_round_two()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE round_number INTEGER;
BEGIN
  SELECT number INTO round_number FROM public.rounds WHERE id = NEW.round_id;
  NEW.settings_snapshot := COALESCE(NEW.settings_snapshot, '{}'::JSONB) || jsonb_build_object(
    'role_scoring_active', COALESCE(round_number, 1) >= 2,
    'role_scoring_start_round', 2
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_fantasy_rounds_role_scoring_from_round_two ON public.fantasy_rounds;
CREATE TRIGGER zz_fantasy_rounds_role_scoring_from_round_two
BEFORE INSERT ON public.fantasy_rounds
FOR EACH ROW EXECUTE FUNCTION public.set_role_scoring_activation_from_round_two();

DROP TRIGGER IF EXISTS zz_fantasy_test_sessions_role_scoring_from_round_two ON public.fantasy_test_sessions;
CREATE TRIGGER zz_fantasy_test_sessions_role_scoring_from_round_two
BEFORE INSERT ON public.fantasy_test_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_role_scoring_activation_from_round_two();

UPDATE public.fantasy_rounds fantasy_round
SET settings_snapshot = fantasy_round.settings_snapshot || jsonb_build_object(
  'role_scoring_active', round_item.number >= 2,
  'role_scoring_start_round', 2
)
FROM public.rounds round_item
WHERE round_item.id = fantasy_round.round_id;

UPDATE public.fantasy_test_sessions session_item
SET settings_snapshot = session_item.settings_snapshot || jsonb_build_object(
  'role_scoring_active', round_item.number >= 2,
  'role_scoring_start_round', 2
)
FROM public.rounds round_item
WHERE round_item.id = session_item.round_id;

-- As snapshots da Rodada 1 voltam aos valores anteriores à regra de vagas.
UPDATE public.fantasy_rounds fantasy_round
SET settings_snapshot = fantasy_round.settings_snapshot || jsonb_build_object(
  'role_scoring_active', false,
  'goalkeeper_loss_points', 0,
  'team_goal_conceded_points', -1
)
FROM public.rounds round_item
WHERE round_item.id = fantasy_round.round_id AND round_item.number = 1;

UPDATE public.fantasy_test_sessions session_item
SET settings_snapshot = session_item.settings_snapshot || jsonb_build_object(
  'role_scoring_active', false,
  'goalkeeper_loss_points', 0,
  'team_goal_conceded_points', -1
)
FROM public.rounds round_item
WHERE round_item.id = session_item.round_id AND round_item.number = 1;

-- A função V074 já empilha o processador anterior. Para a Rodada 1 chamamos
-- diretamente o processador anterior às vagas; da Rodada 2 em diante, usamos
-- toda a cadeia atual (bônus de posição e mercado 65/35).
DO $$
BEGIN
  IF to_regprocedure('public.process_fantasy_round_pre_round_two_gate_075(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_round(UUID) RENAME TO process_fantasy_round_pre_round_two_gate_075;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE round_number INTEGER;
BEGIN
  SELECT round_item.number INTO round_number FROM public.rounds round_item WHERE round_item.id = p_round_id;
  IF COALESCE(round_number, 1) >= 2 THEN
    PERFORM public.process_fantasy_round_pre_round_two_gate_075(p_round_id);
  ELSE
    PERFORM public.process_fantasy_round_pre_slot_position_bonus_073(p_round_id);
  END IF;
  RETURN true;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.process_fantasy_test_round_pre_round_two_gate_075(uuid)') IS NULL THEN
    ALTER FUNCTION public.process_fantasy_test_round(UUID) RENAME TO process_fantasy_test_round_pre_round_two_gate_075;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.process_fantasy_test_round(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE round_number INTEGER;
BEGIN
  SELECT round_item.number INTO round_number FROM public.rounds round_item WHERE round_item.id = p_round_id;
  IF COALESCE(round_number, 1) >= 2 THEN
    PERFORM public.process_fantasy_test_round_pre_round_two_gate_075(p_round_id);
  ELSE
    PERFORM public.process_fantasy_test_round_pre_slot_position_bonus_073(p_round_id);
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_role_scoring_activation_from_round_two() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fantasy_round_pre_round_two_gate_075(UUID), public.process_fantasy_test_round_pre_round_two_gate_075(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_fantasy_round(UUID), public.process_fantasy_test_round(UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
