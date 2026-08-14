-- Corrige a criacao automatica do mercado do Cartola ao salvar uma pre-lista
-- Ranked. Os nomes anteriores das variaveis coincidiam com colunas das tabelas
-- e o PostgreSQL interrompia toda a transacao com referencia ambigua.

CREATE OR REPLACE FUNCTION public.ensure_fantasy_round(p_round_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_round public.rounds%ROWTYPE;
  current_settings public.fantasy_settings%ROWTYPE;
  v_fantasy_season_id UUID;
  v_fantasy_round_id UUID;
BEGIN
  SELECT * INTO current_round
  FROM public.rounds
  WHERE id = p_round_id;

  IF NOT FOUND OR current_round.round_type <> 'official' OR current_round.status = 'finished' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.fantasy_settings (league_id)
  VALUES (current_round.league_id)
  ON CONFLICT (league_id) DO NOTHING;

  SELECT * INTO current_settings
  FROM public.fantasy_settings
  WHERE league_id = current_round.league_id;

  INSERT INTO public.fantasy_seasons (league_id, season_id, initial_budget, initial_player_price)
  VALUES (
    current_round.league_id,
    current_round.season_id,
    current_settings.initial_budget,
    current_settings.initial_player_price
  )
  ON CONFLICT (season_id) DO UPDATE SET league_id = EXCLUDED.league_id
  RETURNING id INTO v_fantasy_season_id;

  INSERT INTO public.fantasy_player_prices (fantasy_season_id, player_id, current_price)
  SELECT v_fantasy_season_id, player.id, current_settings.initial_player_price
  FROM public.players player
  WHERE player.is_selectable = true
    AND player.member_category = 'player'
  ON CONFLICT (fantasy_season_id, player_id) DO NOTHING;

  INSERT INTO public.fantasy_rounds (fantasy_season_id, round_id, settings_snapshot)
  VALUES (
    v_fantasy_season_id,
    current_round.id,
    to_jsonb(current_settings) - 'league_id' - 'updated_at'
  )
  ON CONFLICT (round_id) DO UPDATE SET round_id = EXCLUDED.round_id
  RETURNING id INTO v_fantasy_round_id;

  RETURN v_fantasy_round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_fantasy_round(UUID) FROM PUBLIC, anon;
