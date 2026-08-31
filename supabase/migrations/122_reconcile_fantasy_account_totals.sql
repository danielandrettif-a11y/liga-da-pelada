-- Corrige totais gerais divergentes: a fonte de verdade são as escalações
-- pontuadas, nunca um acumulado antigo da conta.

WITH totals AS (
  SELECT fantasy_round.fantasy_season_id,
    lineup.user_id,
    COALESCE(sum(lineup.total_points), 0) AS total_points,
    count(*)::INTEGER AS rounds_played,
    COALESCE(max(lineup.total_points), 0) AS best_round
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  WHERE lineup.status = 'scored'
  GROUP BY fantasy_round.fantasy_season_id, lineup.user_id
)
UPDATE public.fantasy_accounts account
SET total_points = totals.total_points,
    rounds_played = totals.rounds_played,
    best_round_points = totals.best_round,
    updated_at = now()
FROM totals
WHERE account.fantasy_season_id = totals.fantasy_season_id
  AND account.user_id = totals.user_id;

UPDATE public.fantasy_accounts account
SET total_points = 0,
    rounds_played = 0,
    best_round_points = 0,
    updated_at = now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  WHERE fantasy_round.fantasy_season_id = account.fantasy_season_id
    AND lineup.user_id = account.user_id
    AND lineup.status = 'scored'
);

-- Consulta administrativa para localizar escalações antigas que existem,
-- mas não entraram no acumulado por status incorreto ou falta de jogadores.
CREATE OR REPLACE FUNCTION public.audit_fantasy_lineups()
RETURNS TABLE (
  player_name TEXT,
  user_id UUID,
  round_number INTEGER,
  round_date DATE,
  lineup_status TEXT,
  saved_players BIGINT,
  lineup_points NUMERIC,
  counted_in_total BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT player.name,
    lineup.user_id,
    round_item.number,
    round_item.date,
    lineup.status,
    count(lineup_player.id),
    COALESCE(lineup.total_points, 0),
    lineup.status = 'scored'
  FROM public.fantasy_lineups lineup
  JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
  JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
  LEFT JOIN public.fantasy_lineup_players lineup_player ON lineup_player.lineup_id = lineup.id
  LEFT JOIN public.account_profiles profile ON profile.user_id = lineup.user_id
  LEFT JOIN public.players player ON player.id = profile.player_id
  WHERE public.is_app_admin()
  GROUP BY player.name, lineup.user_id, round_item.number, round_item.date,
    lineup.status, lineup.total_points
  ORDER BY round_item.date, round_item.number, player.name;
$$;

REVOKE ALL ON FUNCTION public.audit_fantasy_lineups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_fantasy_lineups() TO authenticated;

NOTIFY pgrst, 'reload schema';
