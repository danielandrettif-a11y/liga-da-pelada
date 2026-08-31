-- Recupera escalações históricas que tinham um time completo salvo, mas foram
-- marcadas como `missed` por validações antigas (principalmente a mudança de
-- cinco para seis vagas). O reparo é explícito, auditável e só pode ser
-- executado por um administrador.

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
    JOIN public.fantasy_rounds fantasy_round
      ON fantasy_round.id = lineup.fantasy_round_id
    JOIN public.rounds round_item
      ON round_item.id = fantasy_round.round_id
    LEFT JOIN public.fantasy_lineup_players lineup_player
      ON lineup_player.lineup_id = lineup.id
    LEFT JOIN public.account_profiles profile
      ON profile.user_id = lineup.user_id
    LEFT JOIN public.players player
      ON player.id = profile.player_id
    WHERE lineup.status = 'missed'
      AND fantasy_round.market_status = 'finished'
      AND round_item.status = 'finished'
      AND round_item.round_type = 'official'
      AND lineup.captain_player_id IS NOT NULL
    GROUP BY lineup.id, fantasy_round.id, fantasy_round.round_id,
      fantasy_round.settings_snapshot, round_item.date, round_item.number,
      player.name
    HAVING bool_or(lineup_player.player_id = lineup.captain_player_id)
      AND CASE
        WHEN COALESCE(fantasy_round.settings_snapshot, '{}'::JSONB) ? 'players_per_team'
          THEN count(lineup_player.id) =
            (fantasy_round.settings_snapshot->>'players_per_team')::INTEGER
        -- Rodadas anteriores ao snapshot usavam formações de 5 ou 6 atletas.
        -- Times sem capitão continuam de fora porque estavam incompletos.
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

  -- O reprocessador restaura preços e patrimônios desde a primeira rodada
  -- afetada e recalcula cronologicamente as posteriores na mesma transação.
  UPDATE public.fantasy_lineups
  SET status = 'locked', updated_at = now()
  WHERE id = ANY(candidate_ids);

  PERFORM public.reprocess_fantasy_from_round(earliest_round_id);

  RETURN jsonb_build_object(
    'repaired', array_length(candidate_ids, 1),
    'lineups', repaired_lineups
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_legacy_saved_fantasy_lineups()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_legacy_saved_fantasy_lineups()
TO authenticated;

NOTIFY pgrst, 'reload schema';
