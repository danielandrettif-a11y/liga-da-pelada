-- Permite que um ADM apague a ultima rodada oficial ligada ao Cartola.
-- A exclusao continua bloqueada para rodadas intermediarias, pois remove-las
-- sem reprocessar tudo que veio depois corromperia precos e patrimonios.

CREATE OR REPLACE FUNCTION public.prevent_locked_fantasy_round_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.allow_fantasy_round_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fantasy_rounds fr
    WHERE fr.round_id = OLD.id
      AND (fr.market_status <> 'open' OR fr.locked_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Esta rodada possui um Cartola bloqueado ou processado. Use a exclusao administrativa para recalcular o Cartola com seguranca.';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_round_cascade(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_round public.rounds%ROWTYPE;
  linked_callup_id UUID;
  linked_callup_status TEXT;
  affected_player_ids UUID[];
  linked_fantasy_round public.fantasy_rounds%ROWTYPE;
  linked_fantasy_season public.fantasy_seasons%ROWTYPE;
  has_fantasy_round BOOLEAN := false;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem excluir rodadas.';
  END IF;

  SELECT *
  INTO current_round
  FROM public.rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rodada nao encontrada.';
  END IF;

  SELECT *
  INTO linked_fantasy_round
  FROM public.fantasy_rounds
  WHERE round_id = p_round_id
  FOR UPDATE;
  has_fantasy_round := FOUND;

  IF has_fantasy_round THEN
    SELECT *
    INTO linked_fantasy_season
    FROM public.fantasy_seasons
    WHERE id = linked_fantasy_round.fantasy_season_id
    FOR UPDATE;

    -- Excluir uma rodada no meio da sequencia exigiria reprocessar rodadas
    -- posteriores e poderia alterar escalacoes ja encerradas. O ADM deve
    -- apagar da mais recente para a mais antiga.
    IF EXISTS (
      SELECT 1
      FROM public.fantasy_rounds later_fantasy
      JOIN public.rounds later_round ON later_round.id = later_fantasy.round_id
      WHERE later_fantasy.fantasy_season_id = linked_fantasy_round.fantasy_season_id
        AND later_fantasy.id <> linked_fantasy_round.id
        AND (later_round.date, later_round.number, later_round.created_at)
          > (current_round.date, current_round.number, current_round.created_at)
    ) THEN
      RAISE EXCEPTION 'Esta nao e a ultima rodada do Cartola. Exclua primeiro as rodadas mais recentes.';
    END IF;
  END IF;

  SELECT id, status
  INTO linked_callup_id, linked_callup_status
  FROM public.callups
  WHERE round_id = p_round_id
  LIMIT 1
  FOR UPDATE;

  SELECT array_agg(player_id)
  INTO affected_player_ids
  FROM public.round_players
  WHERE round_id = p_round_id;

  IF linked_callup_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.callups
    WHERE league_id = current_round.league_id
      AND id <> linked_callup_id
      AND status IN ('open', 'locked')
  ) THEN
    RAISE EXCEPTION 'Encerre a convocacao ativa antes de excluir esta rodada.';
  END IF;

  IF has_fantasy_round THEN
    INSERT INTO public.fantasy_audit_log (
      league_id,
      fantasy_round_id,
      user_id,
      action,
      payload
    ) VALUES (
      current_round.league_id,
      linked_fantasy_round.id,
      auth.uid(),
      'round_deleted_and_fantasy_rebuilt',
      jsonb_build_object(
        'round_id', current_round.id,
        'round_number', current_round.number,
        'market_status', linked_fantasy_round.market_status
      )
    );

    -- O gatilho continua protegendo DELETEs diretos. Somente esta funcao
    -- administrativa libera a exclusao durante a transacao corrente.
    PERFORM set_config('app.allow_fantasy_round_delete', 'on', true);
  END IF;

  DELETE FROM public.rounds WHERE id = p_round_id;

  IF has_fantasy_round THEN
    -- Restaura o preco de cada atleta para o ultimo fechamento que ainda
    -- existe. Se esta era a primeira rodada, todos voltam ao preco inicial.
    UPDATE public.fantasy_player_prices price
    SET current_price = COALESCE(
          (
            SELECT history.price_after
            FROM public.fantasy_player_price_history history
            JOIN public.fantasy_rounds fr ON fr.id = history.fantasy_round_id
            JOIN public.rounds round_item ON round_item.id = fr.round_id
            WHERE history.fantasy_season_id = linked_fantasy_season.id
              AND history.player_id = price.player_id
            ORDER BY round_item.date DESC, round_item.number DESC, history.created_at DESC
            LIMIT 1
          ),
          linked_fantasy_season.initial_player_price
        ),
        rounds_played = (
          SELECT count(*)::INTEGER
          FROM public.fantasy_player_price_history history
          WHERE history.fantasy_season_id = linked_fantasy_season.id
            AND history.player_id = price.player_id
        ),
        total_points = COALESCE((
          SELECT sum(history.round_points)
          FROM public.fantasy_player_price_history history
          WHERE history.fantasy_season_id = linked_fantasy_season.id
            AND history.player_id = price.player_id
        ), 0),
        updated_at = now()
    WHERE price.fantasy_season_id = linked_fantasy_season.id;

    -- Reconstroi pontuacao e patrimonio das contas a partir das escalacoes
    -- pontuadas que restaram. Sem rodadas anteriores, tudo volta ao zero e
    -- ao orcamento inicial da temporada.
    UPDATE public.fantasy_accounts account
    SET current_budget = COALESCE(
          (
            SELECT lineup.budget_after
            FROM public.fantasy_lineups lineup
            JOIN public.fantasy_rounds fr ON fr.id = lineup.fantasy_round_id
            JOIN public.rounds round_item ON round_item.id = fr.round_id
            WHERE fr.fantasy_season_id = linked_fantasy_season.id
              AND lineup.user_id = account.user_id
              AND lineup.status = 'scored'
              AND lineup.budget_after IS NOT NULL
            ORDER BY round_item.date DESC, round_item.number DESC, lineup.updated_at DESC
            LIMIT 1
          ),
          linked_fantasy_season.initial_budget
        ),
        total_points = COALESCE((
          SELECT sum(lineup.total_points)
          FROM public.fantasy_lineups lineup
          JOIN public.fantasy_rounds fr ON fr.id = lineup.fantasy_round_id
          WHERE fr.fantasy_season_id = linked_fantasy_season.id
            AND lineup.user_id = account.user_id
            AND lineup.status = 'scored'
        ), 0),
        rounds_played = (
          SELECT count(*)::INTEGER
          FROM public.fantasy_lineups lineup
          JOIN public.fantasy_rounds fr ON fr.id = lineup.fantasy_round_id
          WHERE fr.fantasy_season_id = linked_fantasy_season.id
            AND lineup.user_id = account.user_id
            AND lineup.status = 'scored'
        ),
        best_round_points = COALESCE((
          SELECT max(lineup.total_points)
          FROM public.fantasy_lineups lineup
          JOIN public.fantasy_rounds fr ON fr.id = lineup.fantasy_round_id
          WHERE fr.fantasy_season_id = linked_fantasy_season.id
            AND lineup.user_id = account.user_id
            AND lineup.status = 'scored'
        ), 0),
        updated_at = now()
    WHERE account.fantasy_season_id = linked_fantasy_season.id;
  END IF;

  IF linked_callup_id IS NOT NULL THEN
    UPDATE public.callups
    SET status = CASE
          WHEN linked_callup_status = 'closed' THEN 'closed'
          WHEN current_round.preparation_stage = 'prelist' THEN 'open'
          ELSE 'locked'
        END,
        round_id = NULL,
        updated_at = now()
    WHERE id = linked_callup_id;
  END IF;

  UPDATE public.players player
  SET is_selectable = true
  WHERE player.member_category = 'guest'
    AND player.id = ANY(COALESCE(affected_player_ids, ARRAY[]::UUID[]))
    AND NOT EXISTS (
      SELECT 1
      FROM public.round_players rp
      JOIN public.rounds round_item ON round_item.id = rp.round_id
      WHERE rp.player_id = player.id
        AND round_item.status = 'finished'
    );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_round_cascade(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_round_cascade(UUID) TO authenticated;
