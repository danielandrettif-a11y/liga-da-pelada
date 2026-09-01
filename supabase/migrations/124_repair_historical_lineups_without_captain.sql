-- Exceção histórica: antes desta migration, times completos sem capitão foram
-- marcados como missed. Recuperamos apenas rodadas encerradas; para as novas,
-- capitão continua obrigatório e o tamanho segue a configuração da liga.

CREATE OR REPLACE FUNCTION public.save_fantasy_lineup(
  p_round_id UUID,
  p_player_ids UUID[],
  p_captain_player_id UUID DEFAULT NULL,
  p_top_scorer_player_id UUID DEFAULT NULL,
  p_top_assist_player_id UUID DEFAULT NULL,
  p_challenge_player_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_fantasy_season_id UUID;
  max_lineup_players INTEGER := 5;
  available_budget NUMERIC(10,2);
  calculated_lineup_cost NUMERIC(10,2);
  official_count INTEGER;
  saved_lineup_id UUID;
BEGIN
  SELECT fantasy_round.fantasy_season_id, COALESCE(league.players_per_team, 5)
  INTO target_fantasy_season_id, max_lineup_players
  FROM public.fantasy_rounds fantasy_round
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  JOIN public.seasons season ON season.id = round_item.season_id
  JOIN public.leagues league ON league.id = season.league_id
  WHERE fantasy_round.round_id = p_round_id;

  IF COALESCE(cardinality(p_player_ids), 0) <> max_lineup_players THEN
    RAISE EXCEPTION 'A escalação precisa ter exatamente % jogadores.', max_lineup_players;
  END IF;
  IF p_captain_player_id IS NULL OR NOT (p_captain_player_id = ANY(p_player_ids)) THEN
    RAISE EXCEPTION 'Escolha um capitão entre os jogadores escalados.';
  END IF;

  SELECT count(*) INTO official_count
  FROM public.players player
  WHERE player.id = ANY(COALESCE(p_player_ids, ARRAY[]::UUID[]))
    AND player.member_category = 'player' AND player.is_selectable = true;
  IF official_count <> COALESCE(cardinality(p_player_ids), 0) THEN
    RAISE EXCEPTION 'O mercado do Cartola aceita somente jogadores com perfil oficial ativo.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[p_top_scorer_player_id, p_top_assist_player_id, p_challenge_player_id]) chosen(player_id)
    LEFT JOIN public.players player ON player.id = chosen.player_id
    WHERE chosen.player_id IS NOT NULL AND (player.id IS NULL OR player.member_category <> 'player' OR NOT player.is_selectable)
  ) THEN
    RAISE EXCEPTION 'Os palpites do Cartola aceitam somente jogadores com perfil oficial ativo.';
  END IF;

  SELECT GREATEST(COALESCE(account.current_budget, 0), max_lineup_players * 11.00)
  INTO available_budget
  FROM public.fantasy_accounts account
  WHERE account.fantasy_season_id = target_fantasy_season_id AND account.user_id = auth.uid();
  available_budget := COALESCE(available_budget, max_lineup_players * 11.00);

  SELECT COALESCE(sum(COALESCE(price.current_price, season_item.initial_player_price)), 0)
  INTO calculated_lineup_cost
  FROM unnest(COALESCE(p_player_ids, ARRAY[]::UUID[])) selected(player_id)
  JOIN public.fantasy_seasons season_item ON season_item.id = target_fantasy_season_id
  LEFT JOIN public.fantasy_player_prices price
    ON price.fantasy_season_id = season_item.id AND price.player_id = selected.player_id;
  IF calculated_lineup_cost > available_budget THEN
    RAISE EXCEPTION 'A escalação ultrapassa o patrimônio disponível.';
  END IF;

  saved_lineup_id := public.save_fantasy_lineup_pre_official_market_072(
    p_round_id, p_player_ids, p_captain_player_id, p_top_scorer_player_id,
    p_top_assist_player_id, p_challenge_player_id
  );
  UPDATE public.fantasy_lineups lineup
  SET budget_before = available_budget,
      cash_remaining = available_budget - calculated_lineup_cost
  WHERE lineup.id = saved_lineup_id;

  RETURN saved_lineup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.repair_legacy_saved_fantasy_lineups()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate_ids UUID[];
  earliest_round_id UUID;
  repaired_lineups JSONB := '[]'::JSONB;
BEGIN
  IF NOT public.is_app_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem reparar escalações históricas.';
  END IF;

  WITH candidates AS (
    SELECT
      lineup.id,
      fantasy_round.round_id,
      round_item.date,
      round_item.number,
      COALESCE(player.name, 'Cartoleiro') AS player_name,
      count(lineup_player.id)::INTEGER AS saved_players
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    LEFT JOIN public.fantasy_lineup_players lineup_player ON lineup_player.lineup_id = lineup.id
    LEFT JOIN public.account_profiles profile ON profile.user_id = lineup.user_id
    LEFT JOIN public.players player ON player.id = profile.player_id
    WHERE lineup.status = 'missed'
      AND fantasy_round.market_status = 'finished'
      AND round_item.status = 'finished'
      AND round_item.round_type = 'official'
    GROUP BY lineup.id, fantasy_round.id, fantasy_round.round_id,
      fantasy_round.settings_snapshot, round_item.date, round_item.number, player.name
    HAVING CASE
      WHEN COALESCE(fantasy_round.settings_snapshot, '{}'::JSONB) ? 'players_per_team'
        THEN count(lineup_player.id) = (fantasy_round.settings_snapshot->>'players_per_team')::INTEGER
      ELSE count(lineup_player.id) BETWEEN 5 AND 6
    END
  )
  SELECT
    array_agg(candidate.id),
    (array_agg(candidate.round_id ORDER BY candidate.date, candidate.number))[1],
    COALESCE(jsonb_agg(jsonb_build_object(
      'lineupId', candidate.id,
      'roundId', candidate.round_id,
      'roundNumber', candidate.number,
      'playerName', candidate.player_name,
      'savedPlayers', candidate.saved_players
    ) ORDER BY candidate.date, candidate.number, candidate.player_name), '[]'::JSONB)
  INTO candidate_ids, earliest_round_id, repaired_lineups
  FROM candidates candidate;

  IF COALESCE(array_length(candidate_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('repaired', 0, 'lineups', repaired_lineups);
  END IF;

  UPDATE public.fantasy_lineups
  SET status = 'locked', updated_at = now()
  WHERE id = ANY(candidate_ids);

  PERFORM public.reprocess_fantasy_from_round(earliest_round_id);

  RETURN jsonb_build_object('repaired', array_length(candidate_ids, 1), 'lineups', repaired_lineups);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_fantasy_lineup(UUID, UUID[], UUID, UUID, UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.repair_legacy_saved_fantasy_lineups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_legacy_saved_fantasy_lineups() TO authenticated;

NOTIFY pgrst, 'reload schema';
