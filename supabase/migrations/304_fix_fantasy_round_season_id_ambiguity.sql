-- Evita a colisao entre a variavel PL/pgSQL e a coluna
-- fantasy_player_prices.fantasy_season_id ao abrir a primeira rodada de uma
-- pelada Completa.
BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_fantasy_round(p_round_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_round public.rounds%ROWTYPE;
  target_settings public.fantasy_settings%ROWTYPE;
  target_fantasy_season_id uuid;
  target_fantasy_round_id uuid;
BEGIN
  SELECT round_item.*
  INTO target_round
  FROM public.rounds round_item
  JOIN public.leagues league ON league.id = round_item.league_id
  WHERE round_item.id = p_round_id
    AND league.feature_tier = 'complete';

  IF NOT FOUND
    OR target_round.round_type <> 'official'
    OR target_round.status = 'finished' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.fantasy_settings (league_id)
  VALUES (target_round.league_id)
  ON CONFLICT (league_id) DO NOTHING;

  SELECT settings.*
  INTO target_settings
  FROM public.fantasy_settings settings
  WHERE settings.league_id = target_round.league_id;

  INSERT INTO public.fantasy_seasons (
    league_id,
    season_id,
    initial_budget,
    initial_player_price
  )
  VALUES (
    target_round.league_id,
    target_round.season_id,
    target_settings.initial_budget,
    target_settings.initial_player_price
  )
  ON CONFLICT (season_id) DO UPDATE
  SET league_id = EXCLUDED.league_id
  RETURNING id INTO target_fantasy_season_id;

  INSERT INTO public.fantasy_player_prices (
    fantasy_season_id,
    player_id,
    current_price
  )
  SELECT
    target_fantasy_season_id,
    player.id,
    target_settings.initial_player_price
  FROM public.league_members member
  JOIN public.players player ON player.id = member.player_id
  WHERE member.league_id = target_round.league_id
    AND member.is_active
    AND player.is_selectable
    AND player.member_category IN ('player', 'guest')
  ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;

  INSERT INTO public.fantasy_rounds (
    fantasy_season_id,
    round_id,
    settings_snapshot
  )
  VALUES (
    target_fantasy_season_id,
    target_round.id,
    to_jsonb(target_settings) - 'league_id' - 'updated_at'
  )
  ON CONFLICT (round_id) DO UPDATE
  SET round_id = EXCLUDED.round_id
  RETURNING id INTO target_fantasy_round_id;

  RETURN target_fantasy_round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_fantasy_round(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_fantasy_round(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
