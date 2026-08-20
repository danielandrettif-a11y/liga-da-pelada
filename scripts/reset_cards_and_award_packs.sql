-- ==============================================================================
-- SCRIPT ADMIN: ZERAR CARTAS DE CONTA ESPECÍFICA & DISTRIBUIR PACOTES PARA QUEM ESCALOU
-- ==============================================================================

-- 1. IDENTIFICAÇÃO DA CONTA ADMINISTRADOR / USUÁRIO ALVO
-- Substitua pelo ID ou execute dentro da sessão autenticada.
-- Para zerar as cartas do seu próprio usuário:
DO $$
DECLARE
  v_user_id UUID;
  v_round_id UUID;
  v_user_record RECORD;
  v_count_awarded INT := 0;
BEGIN
  -- Buscar o ID da rodada mais recente
  SELECT id INTO v_round_id
  FROM public.rounds
  ORDER BY created_at DESC
  LIMIT 1;

  RAISE NOTICE 'Rodada alvo identificada: %', v_round_id;

  -- 2. DISTRIBUIR 1 PACOTE 'AVAILABLE' PARA TODOS OS USUÁRIOS QUE JÁ ESCALARAM
  FOR v_user_record IN (
    SELECT DISTINCT user_id
    FROM public.fantasy_lineups
    WHERE user_id IS NOT NULL
  ) LOOP
    -- Limpar ofertas e pacote anterior desta rodada se existirem
    DELETE FROM public.fantasy_pack_offers
    WHERE pack_id IN (
      SELECT id FROM public.fantasy_round_packs
      WHERE user_id = v_user_record.user_id AND round_id = v_round_id
    );

    DELETE FROM public.fantasy_round_packs
    WHERE user_id = v_user_record.user_id AND round_id = v_round_id;

    -- Inserir novo pacote disponível
    INSERT INTO public.fantasy_round_packs (user_id, round_id, status)
    VALUES (v_user_record.user_id, v_round_id, 'available');

    v_count_awarded := v_count_awarded + 1;
  END LOOP;

  RAISE NOTICE 'Pacotes distribuídos com sucesso para % usuários escalados.', v_count_awarded;
END $$;
