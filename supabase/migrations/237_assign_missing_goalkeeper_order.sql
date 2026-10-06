-- Toda pessoa adicionada a um time precisa participar da fila do gol.
-- Reposicoes antigas podem ter perdido a ordem quando a vaga legada nao
-- guardava goalkeeper_order; nesse caso usamos o menor numero livre do time.

CREATE OR REPLACE FUNCTION public.assign_available_goalkeeper_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  available_order INTEGER;
BEGIN
  -- Serializa entradas no mesmo time para duas pessoas nao receberem a mesma
  -- ordem quando forem adicionadas ao mesmo tempo.
  PERFORM 1
  FROM public.teams team
  WHERE team.id = NEW.team_id
  FOR UPDATE;

  IF NEW.goalkeeper_order IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.team_players team_player
    WHERE team_player.team_id = NEW.team_id
      AND team_player.goalkeeper_order = NEW.goalkeeper_order
      AND (TG_OP = 'INSERT' OR team_player.id <> NEW.id)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT candidate.order_number INTO available_order
  FROM generate_series(1, 10) AS candidate(order_number)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.team_players team_player
    WHERE team_player.team_id = NEW.team_id
      AND team_player.goalkeeper_order = candidate.order_number
      AND (TG_OP = 'INSERT' OR team_player.id <> NEW.id)
  )
  ORDER BY candidate.order_number
  LIMIT 1;

  IF available_order IS NULL THEN
    RAISE EXCEPTION 'Não há número disponível na fila do gol deste time.';
  END IF;

  NEW.goalkeeper_order := available_order;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_available_goalkeeper_order_trigger
  ON public.team_players;

CREATE TRIGGER assign_available_goalkeeper_order_trigger
BEFORE INSERT OR UPDATE OF team_id, goalkeeper_order ON public.team_players
FOR EACH ROW EXECUTE FUNCTION public.assign_available_goalkeeper_order();

-- Quando a ordem precisou ser calculada, salva o numero tambem na vaga. Assim,
-- se a reposicao sair antes do primeiro jogo, a proxima pessoa herda a ordem.
CREATE OR REPLACE FUNCTION public.sync_open_replacement_slot_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.callup_replacement_slots slot
  SET goalkeeper_order = NEW.goalkeeper_order,
      loan_order = COALESCE(slot.loan_order, NEW.loan_order)
  WHERE slot.team_id = NEW.team_id
    AND slot.replacement_player_id IS NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_open_replacement_slot_orders()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_open_replacement_slot_orders_trigger
  ON public.team_players;

CREATE TRIGGER sync_open_replacement_slot_orders_trigger
AFTER INSERT ON public.team_players
FOR EACH ROW EXECUTE FUNCTION public.sync_open_replacement_slot_orders();

-- Corrige imediatamente jogadores de rodadas em andamento que ja entraram sem
-- numero. O trigger acima encontra o menor buraco da sequencia; no caso 1, 3,
-- 4, 5, 6, por exemplo, o novo jogador recebe o numero 2.
DO $$
DECLARE
  missing_order_player RECORD;
BEGIN
  FOR missing_order_player IN
    SELECT team_player.id
    FROM public.team_players team_player
    JOIN public.teams team ON team.id = team_player.team_id
    JOIN public.rounds round_item ON round_item.id = team.round_id
    WHERE team_player.goalkeeper_order IS NULL
      AND round_item.status <> 'finished'
    ORDER BY round_item.date, team.position, team_player.id
  LOOP
    UPDATE public.team_players
    SET goalkeeper_order = NULL
    WHERE id = missing_order_player.id;
  END LOOP;

  UPDATE public.callup_replacement_slots slot
  SET goalkeeper_order = team_player.goalkeeper_order,
      loan_order = COALESCE(slot.loan_order, team_player.loan_order)
  FROM public.team_players team_player
  WHERE slot.team_id = team_player.team_id
    AND slot.replacement_player_id = team_player.player_id
    AND slot.goalkeeper_order IS DISTINCT FROM team_player.goalkeeper_order;
END;
$$;

NOTIFY pgrst, 'reload schema';
