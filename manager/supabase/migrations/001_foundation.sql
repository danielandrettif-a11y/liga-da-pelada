-- SOMENTE NO NOVO PROJETO SUPABASE DO BQ MANAGER.
-- Recusa bases com tabelas conhecidas do app original.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.players') IS NOT NULL OR to_regclass('public.account_profiles') IS NOT NULL THEN
    RAISE EXCEPTION 'Use um projeto separado para o banco do BQ Manager.';
  END IF;
END; $$;

CREATE TABLE public.manager_clubs (
  -- UUID autenticado no APP ORIGINAL, sem FK para auth.users deste projeto.
  owner_id UUID PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  state JSONB NOT NULL CHECK ((
    state->>'schemaVersion' = '1'
    AND jsonb_typeof(state->'club') = 'object'
    AND jsonb_typeof(state->'cards') = 'array'
    AND jsonb_typeof(state->'discovered') = 'array'
    AND jsonb_typeof(state->'packs') = 'array'
  ) IS TRUE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.manager_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES public.manager_clubs(owner_id),
  version INTEGER NOT NULL,
  kind TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, version)
);

-- Reward ledger: only trusted future Várzea/season services may grant packs.
CREATE TABLE public.manager_rewards (
  owner_id UUID NOT NULL REFERENCES public.manager_clubs(owner_id),
  reward_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, reward_key)
);

ALTER TABLE public.manager_clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manager_clubs, public.manager_events, public.manager_rewards FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.manager_clubs TO service_role;
GRANT SELECT, INSERT ON public.manager_events, public.manager_rewards TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.manager_events_id_seq TO service_role;

-- Optimistic concurrency: two tabs cannot spend the same pack/copies twice.
-- Trusted server computes next state, DB commits state + audit as one transaction.
CREATE FUNCTION public.manager_commit(
  p_owner UUID, p_version INTEGER, p_state JSONB, p_kind TEXT, p_details JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_next INTEGER;
BEGIN
  UPDATE public.manager_clubs SET state = p_state, version = version + 1, updated_at = now()
    WHERE owner_id = p_owner AND version = p_version RETURNING version INTO v_next;
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'manager_conflict' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.manager_events(owner_id, version, kind, details)
    VALUES (p_owner, v_next, p_kind, p_details);
  RETURN v_next;
END; $$;

CREATE FUNCTION public.manager_grant_pack(
  p_owner UUID, p_reward_key TEXT, p_kind TEXT, p_label TEXT,
  p_bound BOOLEAN DEFAULT true, p_position TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_state JSONB; v_version INTEGER;
BEGIN
  IF p_kind NOT IN ('choice', 'guaranteed', 'standard') OR p_kind IS NULL
    OR length(trim(p_reward_key)) NOT BETWEEN 1 AND 120 OR p_reward_key IS NULL
    OR length(trim(p_label)) NOT BETWEEN 1 AND 80 OR p_label IS NULL
    OR p_bound IS NULL
    OR (p_position IS NOT NULL AND p_position NOT IN ('DEF', 'ALA_MEI', 'ATA', 'GOL')) THEN
    RAISE EXCEPTION 'invalid_reward';
  END IF;
  SELECT state, version INTO v_state, v_version FROM public.manager_clubs WHERE owner_id = p_owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'club_not_found'; END IF;
  INSERT INTO public.manager_rewards(owner_id, reward_key) VALUES (p_owner, p_reward_key)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  v_state := jsonb_set(v_state, '{packs}', (v_state->'packs') || jsonb_build_array(
    jsonb_strip_nulls(jsonb_build_object('id', gen_random_uuid(), 'kind', p_kind,
      'label', p_label, 'bound', p_bound, 'preferredPosition', p_position,
      'status', 'sealed', 'offers', '[]'::JSONB))));
  PERFORM public.manager_commit(p_owner, v_version, v_state, 'reward', jsonb_build_object('key', p_reward_key));
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.manager_commit(UUID, INTEGER, JSONB, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manager_grant_pack(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manager_commit(UUID, INTEGER, JSONB, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.manager_grant_pack(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
