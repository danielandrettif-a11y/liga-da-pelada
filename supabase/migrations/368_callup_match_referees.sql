BEGIN;

ALTER TABLE public.callups ADD COLUMN IF NOT EXISTS referee_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS referee_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.create_league_callup_with_rules(
  p_league_id uuid, p_date date, p_start_time time, p_stadium_id uuid,
  p_stadium_name text, p_stadium_map_url text, p_round_type text,
  p_capacity integer, p_players_per_team integer, p_teams_per_round integer,
  p_goals_to_finish integer, p_referee_enabled boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  callup_id uuid;
BEGIN
  callup_id := public.create_league_callup(
    p_league_id, p_date, p_start_time, p_stadium_id, p_stadium_name, p_stadium_map_url,
    p_round_type, p_capacity, p_players_per_team, p_teams_per_round
  );
  UPDATE public.callups
  SET goals_to_finish = COALESCE(p_goals_to_finish, goals_to_finish),
      referee_enabled = COALESCE(p_referee_enabled, false)
  WHERE id = callup_id AND league_id = p_league_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível salvar as regras da convocação.'; END IF;
  RETURN callup_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_match_referee_options(
  p_round_id uuid, p_team_a_id uuid, p_team_b_id uuid, p_lineup_extra_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  target_round public.rounds%ROWTYPE;
  enabled boolean;
BEGIN
  SELECT * INTO target_round FROM public.rounds WHERE id = p_round_id;
  IF NOT FOUND OR NOT public.is_league_admin(target_round.league_id) THEN
    RAISE EXCEPTION 'Acesso restrito ao ADM desta pelada.' USING ERRCODE = '42501';
  END IF;

  SELECT c.referee_enabled INTO enabled FROM public.callups c
  WHERE c.round_id = p_round_id AND c.league_id = target_round.league_id
  ORDER BY c.created_at DESC, c.id DESC LIMIT 1;
  IF NOT COALESCE(enabled, false) THEN RETURN jsonb_build_object('enabled', false); END IF;

  RETURN (
    WITH candidates AS (
      SELECT rp.player_id AS id, p.name,
        EXISTS (
          SELECT 1 FROM public.team_players tp JOIN public.teams t ON t.id = tp.team_id
          WHERE t.round_id = p_round_id AND tp.player_id = rp.player_id
            AND t.id NOT IN (p_team_a_id, p_team_b_id)
        ) AND NOT (rp.player_id = ANY(COALESCE(p_lineup_extra_ids, ARRAY[]::uuid[])))
          AND (target_round.formation_mode = 'manual' OR rp.attendance_status = 'present')
          AND COALESCE(rp.availability_status, 'available') = 'available' AS waiting,
        EXISTS (
          SELECT 1 FROM public.league_members lm
          WHERE lm.league_id = target_round.league_id AND lm.player_id = rp.player_id
            AND lm.role = 'admin' AND lm.is_active
        ) AS admin
      FROM public.round_players rp JOIN public.players p ON p.id = rp.player_id
      WHERE rp.round_id = p_round_id
    ), history AS (
      SELECT m.referee_player_id, count(*) AS assignments, max(m.match_order) AS last_match
      FROM public.matches m WHERE m.round_id = p_round_id AND m.referee_player_id IS NOT NULL
      GROUP BY m.referee_player_id
    )
    SELECT jsonb_build_object(
      'enabled', true,
      'suggestedId', (
        SELECT c.id FROM candidates c LEFT JOIN history h ON h.referee_player_id = c.id
        WHERE c.waiting AND c.admin
        ORDER BY COALESCE(h.assignments, 0), h.last_match NULLS FIRST, c.id LIMIT 1
      ),
      'players', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'waiting', waiting IS TRUE) ORDER BY name, id)
        FROM candidates
      ), '[]'::jsonb)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_live_match_with_referee(
  p_round_id uuid, p_team_a_id uuid, p_team_b_id uuid,
  p_goalkeeper_a_id uuid, p_goalkeeper_b_id uuid,
  p_goalkeeper_a_rotation_order integer, p_goalkeeper_b_rotation_order integer,
  p_lineup jsonb, p_idempotency_key text, p_client_started_at timestamptz, p_referee_choice text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  receipt jsonb;
  options jsonb;
  referee_id uuid;
BEGIN
  receipt := public.create_live_match(
    p_round_id, p_team_a_id, p_team_b_id, p_goalkeeper_a_id, p_goalkeeper_b_id,
    p_goalkeeper_a_rotation_order, p_goalkeeper_b_rotation_order, p_lineup,
    p_idempotency_key, p_client_started_at
  );
  IF (receipt->>'idempotent')::boolean THEN RETURN receipt; END IF;

  -- A rotina de criação mantém a rodada bloqueada até o fim da transação.
  options := public.get_match_referee_options(
    p_round_id, p_team_a_id, p_team_b_id,
    ARRAY(SELECT (entry->>'player_id')::uuid FROM jsonb_array_elements(p_lineup) entry)
  );
  IF NOT (options->>'enabled')::boolean THEN
    RAISE EXCEPTION 'O juiz não está habilitado nesta convocação.' USING ERRCODE = 'P0368';
  END IF;

  IF p_referee_choice = 'auto' THEN
    referee_id := (options->>'suggestedId')::uuid;
    IF referee_id IS NULL THEN
      RAISE EXCEPTION 'Nenhum ADM está disponível no time de fora. Escolha um jogador ou confirme sem juiz.' USING ERRCODE = 'P0368';
    END IF;
  ELSIF p_referee_choice = 'none' THEN
    IF options->>'suggestedId' IS NOT NULL THEN
      RAISE EXCEPTION 'Há um ADM disponível. Escolha quem vai apitar.' USING ERRCODE = 'P0368';
    END IF;
  ELSE
    SELECT (p->>'id')::uuid INTO referee_id
    FROM jsonb_array_elements(options->'players') p WHERE p->>'id' = p_referee_choice;
    IF referee_id IS NULL THEN
      RAISE EXCEPTION 'Escolha um jogador da lista desta rodada.' USING ERRCODE = 'P0368';
    END IF;
  END IF;

  UPDATE public.matches SET referee_player_id = referee_id WHERE id = (receipt->>'match_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível registrar o juiz.'; END IF;
  RETURN receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.create_league_callup_with_rules(uuid,date,time,uuid,text,text,text,integer,integer,integer,integer,boolean),
  public.get_match_referee_options(uuid,uuid,uuid,uuid[]),
  public.create_live_match_with_referee(uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,text,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_league_callup_with_rules(uuid,date,time,uuid,text,text,text,integer,integer,integer,integer,boolean),
  public.get_match_referee_options(uuid,uuid,uuid,uuid[]),
  public.create_live_match_with_referee(uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,text,timestamptz,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
