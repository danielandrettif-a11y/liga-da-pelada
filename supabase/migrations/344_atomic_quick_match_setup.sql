-- Cria toda a partida rápida em uma única transação. O cliente nunca fica
-- preso com uma pelada sem convocação ou com uma convocação sem pré-lista.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_quick_match_session(
  p_date date,
  p_start_time time without time zone,
  p_field_name text,
  p_map_url text,
  p_players_per_team integer DEFAULT 5,
  p_teams_per_round integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_league_id uuid;
  target_callup_id uuid;
  target_round_id uuid;
  normalized_field_name text := btrim(COALESCE(p_field_name, ''));
  normalized_map_url text := btrim(COALESCE(p_map_url, ''));
  generated_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para criar uma partida rápida.' USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'Informe o dia e o horário da partida.' USING ERRCODE = '22023';
  END IF;
  IF char_length(normalized_field_name) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Informe o nome do campo.' USING ERRCODE = '22023';
  END IF;
  IF char_length(normalized_map_url) > 1000 OR normalized_map_url !~* '^https?://' THEN
    RAISE EXCEPTION 'Informe um link válido para o mapa do campo.' USING ERRCODE = '22023';
  END IF;
  IF p_players_per_team NOT BETWEEN 5 AND 7 OR p_teams_per_round NOT BETWEEN 2 AND 6 THEN
    RAISE EXCEPTION 'Formato da partida inválido.' USING ERRCODE = '22023';
  END IF;

  generated_name := format(
    'Partida rápida · %s · %s · %s',
    to_char(p_date, 'DD/MM'),
    to_char(p_start_time, 'HH24:MI'),
    upper(substr(gen_random_uuid()::text, 1, 4))
  );

  target_league_id := public.create_league_for_user(generated_name, 'quick', 'private');
  target_callup_id := public.create_league_callup(
    target_league_id,
    p_date,
    p_start_time,
    NULL,
    normalized_field_name,
    normalized_map_url,
    'friendly',
    p_players_per_team * p_teams_per_round,
    p_players_per_team,
    p_teams_per_round
  );
  target_round_id := public.save_round_prelist(
    target_league_id,
    NULL,
    p_date,
    p_start_time,
    'friendly',
    ARRAY[]::uuid[],
    target_callup_id,
    NULL,
    normalized_field_name,
    normalized_map_url
  );

  RETURN jsonb_build_object(
    'league_id', target_league_id,
    'callup_id', target_callup_id,
    'round_id', target_round_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_quick_match_session(
  date, time without time zone, text, text, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_quick_match_session(
  date, time without time zone, text, text, integer, integer
) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
