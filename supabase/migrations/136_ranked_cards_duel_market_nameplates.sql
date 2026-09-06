-- Rodada 4: novo mercado do Cartola, Duelo Direto no primeiro apito e
-- acabamento 2026 dos nameplates. Rodadas finalizadas não são recalculadas.

BEGIN;

-- Mercado mais competitivo: os destaques encarecem mais rápido e a faixa de
-- estabilidade fica menor. O teto de queda é reduzido para não baratear toda
-- a lista na mesma velocidade.
ALTER TABLE public.fantasy_settings
  ALTER COLUMN max_price_increase SET DEFAULT .18,
  ALTER COLUMN max_price_decrease SET DEFAULT .08,
  ALTER COLUMN market_up_share SET DEFAULT .45,
  ALTER COLUMN market_stable_share SET DEFAULT .20,
  ALTER COLUMN market_min_increase SET DEFAULT .04,
  ALTER COLUMN market_min_decrease SET DEFAULT .015;

UPDATE public.fantasy_settings SET
  max_price_increase = .18,
  max_price_decrease = .08,
  market_up_share = .45,
  market_stable_share = .20,
  market_min_increase = .04,
  market_min_decrease = .015,
  updated_at = now();

-- Uma rodada 4+ já criada recebe a regra nova somente enquanto o mercado
-- ainda está aberto. Histórico e rodada em jogo continuam intactos.
UPDATE public.fantasy_rounds fantasy_round SET
  settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}'::JSONB)
    || jsonb_build_object(
      'max_price_increase', .18,
      'max_price_decrease', .08,
      'market_up_share', .45,
      'market_stable_share', .20,
      'market_min_increase', .04,
      'market_min_decrease', .015,
      'marketVersion', 6
    )
FROM public.rounds round_item
WHERE round_item.id = fantasy_round.round_id
  AND round_item.number >= 4
  AND fantasy_round.market_status = 'open';

UPDATE public.fantasy_cards SET
  description = 'Escolha um escalado. No primeiro apito, o BQ sorteia um adversário entre todos os convocados; se o seu jogador fizer mais pontos-base, ganhe +5 pontos.'
WHERE slug = 'head_to_head';

-- O usuário reserva só o próprio atleta. O adversário passa a existir quando
-- a lista de convocados já está fechada e a rodada realmente começou.
CREATE OR REPLACE FUNCTION public.draw_head_to_head_opponents(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  activation RECORD;
  chosen_player_id UUID;
  opponent_player_id UUID;
  target_round_number INTEGER;
BEGIN
  SELECT number INTO target_round_number FROM public.rounds WHERE id = p_round_id;
  IF COALESCE(target_round_number, 0) < 4 THEN RETURN true; END IF;

  FOR activation IN
    SELECT item.id, item.target_snapshot
    FROM public.fantasy_card_activations item
    JOIN public.fantasy_cards card ON card.id = item.card_id
    WHERE item.round_id = p_round_id
      AND item.status IN ('RESERVED', 'LOCKED')
      AND card.slug = 'head_to_head'
      AND NULLIF(item.target_snapshot->>'targetPlayer2Id', '') IS NULL
    FOR UPDATE OF item
  LOOP
    chosen_player_id := NULLIF(activation.target_snapshot->>'targetPlayerId', '')::UUID;
    opponent_player_id := NULL;

    SELECT participant.player_id INTO opponent_player_id
    FROM public.round_players participant
    WHERE participant.round_id = p_round_id
      AND participant.player_id IS NOT NULL
      AND participant.player_id IS DISTINCT FROM chosen_player_id
    ORDER BY md5(activation.id::TEXT || ':' || participant.player_id::TEXT)
    LIMIT 1;

    IF opponent_player_id IS NOT NULL THEN
      UPDATE public.fantasy_card_activations SET
        target_snapshot = jsonb_set(
          COALESCE(target_snapshot, '{}'::JSONB),
          '{targetPlayer2Id}',
          to_jsonb(opponent_player_id::TEXT),
          true
        )
      WHERE id = activation.id;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.draw_head_to_head_on_match_start()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.started_at IS NOT NULL OR NEW.status = 'live') AND (
    TG_OP = 'INSERT'
    OR OLD.started_at IS NULL
    OR OLD.status IS DISTINCT FROM 'live'
  ) THEN
    PERFORM public.draw_head_to_head_opponents(NEW.round_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_draw_head_to_head_opponents ON public.matches;
CREATE TRIGGER matches_draw_head_to_head_opponents
AFTER INSERT OR UPDATE OF status, started_at ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.draw_head_to_head_on_match_start();

-- Recupera uma eventual Rodada 4+ que tenha começado entre o deploy do app e
-- a aplicação desta migration.
DO $$
DECLARE started_round RECORD;
BEGIN
  FOR started_round IN
    SELECT DISTINCT match_item.round_id
    FROM public.matches match_item
    JOIN public.rounds round_item ON round_item.id = match_item.round_id
    WHERE round_item.number >= 4
      AND (match_item.started_at IS NOT NULL OR match_item.status IN ('live', 'finished'))
  LOOP
    PERFORM public.draw_head_to_head_opponents(started_round.round_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.draw_head_to_head_opponents(UUID), public.draw_head_to_head_on_match_start() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.draw_head_to_head_opponents(UUID), public.draw_head_to_head_on_match_start() TO service_role;

-- Conteúdo revisado dos nameplates; slugs e itens já conquistados permanecem.
UPDATE public.fantasy_cosmetics SET description = CASE slug
  WHEN 'nameplate-ficha-vestiario' THEN 'Sua vaga no vestiário: madeira marcada, etiqueta de atleta e clima de pré-jogo.'
  WHEN 'nameplate-placar-quadra' THEN 'Nome aceso em LED verde, como quem acabou de decidir no último lance.'
  WHEN 'nameplate-faixa-torcida' THEN 'Faixa costurada de arquibancada para quem carrega a resenha junto com a torcida.'
  WHEN 'nameplate-prancheta-tatica' THEN 'Campo, marcações e leitura de jogo em uma placa de comissão técnica.'
  WHEN 'nameplate-sumula-juiz' THEN 'Assinatura de destaque em papel de súmula, com linhas e marcas de uma rodada oficial.'
  WHEN 'nameplate-placa-substituicao' THEN 'Painel eletrônico de entrada e saída para anunciar quem mudou o jogo.'
  ELSE description
END
WHERE slug IN (
  'nameplate-ficha-vestiario',
  'nameplate-placar-quadra',
  'nameplate-faixa-torcida',
  'nameplate-prancheta-tatica',
  'nameplate-sumula-juiz',
  'nameplate-placa-substituicao'
);

COMMIT;

NOTIFY pgrst, 'reload schema';
