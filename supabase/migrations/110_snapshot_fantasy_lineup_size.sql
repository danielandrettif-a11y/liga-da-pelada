-- Congela o tamanho configurado da escalação no instante em que o mercado
-- fecha. O Passe consegue assim respeitar rodadas de 5, 6 ou qualquer outro
-- tamanho, mesmo que a configuração da liga mude mais adiante.

CREATE OR REPLACE FUNCTION public.lock_fantasy_market_pre_card_lifecycle_093(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_fantasy_round public.fantasy_rounds%ROWTYPE;
  target_fantasy_season public.fantasy_seasons%ROWTYPE;
  max_lineup_players INTEGER := 5;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_round_id::TEXT, 0));

  SELECT * INTO target_fantasy_round
  FROM public.fantasy_rounds fantasy_round
  WHERE fantasy_round.round_id = p_round_id
  FOR UPDATE;

  IF NOT FOUND OR target_fantasy_round.market_status <> 'open' THEN
    RETURN true;
  END IF;

  SELECT * INTO target_fantasy_season
  FROM public.fantasy_seasons fantasy_season
  WHERE fantasy_season.id = target_fantasy_round.fantasy_season_id;

  SELECT COALESCE(league.players_per_team, 5)
  INTO max_lineup_players
  FROM public.leagues league
  WHERE league.id = target_fantasy_season.league_id;

  max_lineup_players := COALESCE(max_lineup_players, 5);

  UPDATE public.fantasy_lineups lineup
  SET status = CASE WHEN (
        SELECT count(*)
        FROM public.fantasy_lineup_players item
        WHERE item.lineup_id = lineup.id
      ) = max_lineup_players
      AND lineup.captain_player_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.fantasy_lineup_players item
        WHERE item.lineup_id = lineup.id
          AND item.player_id = lineup.captain_player_id
      )
      AND (
        SELECT count(*)
        FROM public.fantasy_lineup_players item
        JOIN public.players player ON player.id = item.player_id
        WHERE item.lineup_id = lineup.id
          AND player.member_category = 'player'
          AND player.is_selectable = true
      ) = max_lineup_players
    THEN 'locked' ELSE 'missed' END,
    locked_at = COALESCE(lineup.locked_at, now()),
    updated_at = now()
  WHERE lineup.fantasy_round_id = target_fantasy_round.id;

  UPDATE public.fantasy_rounds
  SET market_status = 'in_progress',
      locked_at = COALESCE(locked_at, now()),
      settings_snapshot = COALESCE(settings_snapshot, '{}'::jsonb)
        || jsonb_build_object('players_per_team', max_lineup_players)
  WHERE id = target_fantasy_round.id;

  INSERT INTO public.fantasy_audit_log (
    league_id, fantasy_round_id, user_id, action, payload
  ) VALUES (
    target_fantasy_season.league_id,
    target_fantasy_round.id,
    auth.uid(),
    'market_locked_dynamic',
    jsonb_build_object('playersPerTeam', max_lineup_players)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_fantasy_market_pre_card_lifecycle_093(UUID)
FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
