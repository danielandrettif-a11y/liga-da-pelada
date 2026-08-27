-- Ciclo seguro das cartas:
-- OWNED -> RESERVED (escolhida) -> LOCKED (primeiro jogo iniciou) -> CONSUMED (processada).
-- Reservas removidas antes do início sempre retornam ao inventário.

CREATE OR REPLACE FUNCTION public.restore_reserved_card_on_activation_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'RESERVED' AND OLD.user_card_id IS NOT NULL THEN
    UPDATE public.fantasy_user_cards
    SET status = 'OWNED', consumed_at = NULL
    WHERE id = OLD.user_card_id
      AND status = 'RESERVED';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS fantasy_card_activation_restore_reserved_card
  ON public.fantasy_card_activations;
CREATE TRIGGER fantasy_card_activation_restore_reserved_card
BEFORE DELETE ON public.fantasy_card_activations
FOR EACH ROW
EXECUTE FUNCTION public.restore_reserved_card_on_activation_delete();

-- Preserva o fechamento oficial já consolidado e acrescenta o bloqueio das cartas
-- na mesma transação que fecha o mercado.
DO $$
BEGIN
  IF to_regprocedure('public.lock_fantasy_market_pre_card_lifecycle_093(uuid)') IS NULL THEN
    ALTER FUNCTION public.lock_fantasy_market(UUID)
      RENAME TO lock_fantasy_market_pre_card_lifecycle_093;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.lock_fantasy_market(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  locked_ok BOOLEAN;
BEGIN
  locked_ok := public.lock_fantasy_market_pre_card_lifecycle_093(p_round_id);

  UPDATE public.fantasy_card_activations activation
  SET status = 'LOCKED',
      locked_at = COALESCE(activation.locked_at, now())
  WHERE activation.round_id = p_round_id
    AND activation.status = 'RESERVED';

  UPDATE public.fantasy_user_cards user_card
  SET status = 'LOCKED'
  FROM public.fantasy_card_activations activation
  WHERE activation.round_id = p_round_id
    AND activation.user_card_id = user_card.id
    AND activation.status = 'LOCKED'
    AND user_card.status = 'RESERVED';

  RETURN COALESCE(locked_ok, true);
END;
$$;

-- Regrava o trigger para que instalações que já tenham um plano PL/pgSQL em
-- cache resolvam explicitamente o novo wrapper, e não a função renomeada.
CREATE OR REPLACE FUNCTION public.lock_fantasy_market_on_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.started_at IS NOT NULL OR NEW.status = 'live') AND (
    TG_OP = 'INSERT' OR OLD.started_at IS NULL OR OLD.status IS DISTINCT FROM 'live'
  ) THEN
    PERFORM public.lock_fantasy_market(NEW.round_id);
  END IF;
  RETURN NEW;
END;
$$;

-- O resolvedor histórico continua responsável pelos efeitos. Este wrapper impede
-- consumo de uma reserva se nenhuma partida chegou a começar.
DO $$
BEGIN
  IF to_regprocedure('public.apply_fantasy_card_activations_pre_lifecycle_093(uuid)') IS NULL THEN
    ALTER FUNCTION public.apply_fantasy_card_activations(UUID)
      RENAME TO apply_fantasy_card_activations_pre_lifecycle_093;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_fantasy_card_activations(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.matches match_item
    WHERE match_item.round_id = p_round_id
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
  ) THEN
    RETURN true;
  END IF;

  -- Defesa para rodadas iniciadas antes desta migration.
  UPDATE public.fantasy_card_activations activation
  SET status = 'LOCKED',
      locked_at = COALESCE(activation.locked_at, now())
  WHERE activation.round_id = p_round_id
    AND activation.status = 'RESERVED';

  UPDATE public.fantasy_user_cards user_card
  SET status = 'LOCKED'
  FROM public.fantasy_card_activations activation
  WHERE activation.round_id = p_round_id
    AND activation.user_card_id = user_card.id
    AND activation.status = 'LOCKED'
    AND user_card.status = 'RESERVED';

  RETURN public.apply_fantasy_card_activations_pre_lifecycle_093(p_round_id);
END;
$$;

-- Recuperação solicitada: rodada oficial 2 cancelada e nunca iniciada. Também
-- corrige cartas que uma versão antiga chegou a marcar LOCKED/CONSUMED por engano.
UPDATE public.fantasy_user_cards user_card
SET status = 'OWNED', consumed_at = NULL
FROM public.fantasy_card_activations activation
JOIN public.rounds round_item ON round_item.id = activation.round_id
WHERE activation.user_card_id = user_card.id
  AND round_item.round_type = 'official'
  AND round_item.number = 2
  AND NOT EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = round_item.id
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
  );

DELETE FROM public.fantasy_card_activations activation
USING public.rounds round_item
WHERE activation.round_id = round_item.id
  AND round_item.round_type = 'official'
  AND round_item.number = 2
  AND NOT EXISTS (
    SELECT 1 FROM public.matches match_item
    WHERE match_item.round_id = round_item.id
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
  );

-- Repara reservas órfãs deixadas por exclusões antigas em cascata.
UPDATE public.fantasy_user_cards user_card
SET status = 'OWNED', consumed_at = NULL
WHERE user_card.status = 'RESERVED'
  AND NOT EXISTS (
    SELECT 1
    FROM public.fantasy_card_activations activation
    WHERE activation.user_card_id = user_card.id
  );

REVOKE ALL ON FUNCTION public.restore_reserved_card_on_activation_delete() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lock_fantasy_market(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_fantasy_card_activations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_fantasy_market(UUID),
  public.apply_fantasy_card_activations(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
