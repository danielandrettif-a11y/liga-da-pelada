-- Permite que o ADM de qualquer pelada, inclusive uma recém-criada, abra sua
-- primeira convocação sem depender das policies legadas de administrador
-- global. Também recupera WAGs/torcedores antigos que ficaram sem vínculo ao
-- elenco quando o aplicativo passou a separar os perfis por pelada.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_league_callup(
  p_league_id uuid,
  p_date date,
  p_start_time time without time zone,
  p_stadium_id uuid DEFAULT NULL,
  p_stadium_name text DEFAULT NULL,
  p_stadium_map_url text DEFAULT NULL,
  p_round_type text DEFAULT 'official',
  p_capacity integer DEFAULT 15,
  p_players_per_team integer DEFAULT 5,
  p_teams_per_round integer DEFAULT 3
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  created_callup_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente administradores desta pelada podem abrir convocacoes.'
      USING ERRCODE = '42501';
  END IF;
  IF p_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'Informe a data e o horario da convocacao.' USING ERRCODE = '22023';
  END IF;
  IF p_round_type NOT IN ('official', 'friendly')
    OR p_capacity NOT BETWEEN 1 AND 100
    OR p_players_per_team NOT BETWEEN 1 AND 10
    OR p_teams_per_round NOT BETWEEN 2 AND 6 THEN
    RAISE EXCEPTION 'Formato de convocacao invalido.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leagues league
    WHERE league.id = p_league_id AND league.is_active
  ) THEN
    RAISE EXCEPTION 'Pelada nao encontrada ou desativada.' USING ERRCODE = 'P0002';
  END IF;
  IF p_stadium_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stadiums stadium
    WHERE stadium.id = p_stadium_id AND stadium.league_id = p_league_id
  ) THEN
    RAISE EXCEPTION 'Estadio fora da pelada selecionada.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.callups (
    league_id, date, start_time, stadium_id, stadium_name, stadium_map_url,
    round_type, status, capacity, players_per_team, teams_per_round, created_by
  ) VALUES (
    p_league_id, p_date, p_start_time, p_stadium_id,
    NULLIF(btrim(p_stadium_name), ''), NULLIF(btrim(p_stadium_map_url), ''),
    p_round_type, 'open', p_capacity, p_players_per_team, p_teams_per_round,
    (SELECT auth.uid())
  )
  RETURNING id INTO created_callup_id;

  RETURN created_callup_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_league_callup(
  uuid,date,time without time zone,uuid,text,text,text,integer,integer,integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_league_callup(
  uuid,date,time without time zone,uuid,text,text,text,integer,integer,integer
) TO authenticated;

-- Perfis comunitários antigos pertenciam à primeira pelada. Só recuperamos
-- quem não tem vínculo ativo em nenhuma liga, evitando copiar identidades de
-- uma pelada moderna para outra.
WITH original_league AS (
  SELECT id FROM public.leagues ORDER BY created_at, id LIMIT 1
), orphan_community_profiles AS (
  SELECT player.id AS player_id
  FROM public.players player
  WHERE player.member_category IN ('wag', 'supporter')
    AND NOT EXISTS (
      SELECT 1 FROM public.league_members membership
      WHERE membership.player_id = player.id AND membership.is_active
    )
)
INSERT INTO public.league_members (league_id, player_id, role, is_active)
SELECT original_league.id, profile.player_id, 'player', true
FROM original_league
CROSS JOIN orphan_community_profiles profile
ON CONFLICT (league_id, player_id)
DO UPDATE SET is_active = true;

NOTIFY pgrst, 'reload schema';
COMMIT;
