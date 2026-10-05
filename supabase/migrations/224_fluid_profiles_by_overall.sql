-- Tags fluidas v18: quatro atuações com a identidade inicial; depois, o maior
-- OVR entre DEF e ATA define a função da próxima rodada.

BEGIN;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS initial_player_profile TEXT,
  ADD COLUMN IF NOT EXISTS profile_decision_source TEXT,
  ADD COLUMN IF NOT EXISTS profile_source_round_id UUID REFERENCES public.rounds(id) ON DELETE SET NULL;

UPDATE public.players SET
  initial_player_profile = COALESCE(initial_player_profile, player_profile),
  profile_decision_source = COALESCE(profile_decision_source, 'initial')
WHERE member_category IN ('player', 'guest');

ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_initial_player_profile_check;
ALTER TABLE public.players ADD CONSTRAINT players_initial_player_profile_check
  CHECK (initial_player_profile IS NULL OR initial_player_profile IN ('defensive', 'offensive'));
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_profile_decision_source_check;
ALTER TABLE public.players ADD CONSTRAINT players_profile_decision_source_check
  CHECK (profile_decision_source IS NULL OR profile_decision_source IN ('initial', 'overall'));

ALTER TABLE public.round_players
  ADD COLUMN IF NOT EXISTS player_profile_locked TEXT,
  ADD COLUMN IF NOT EXISTS profile_decision_source TEXT,
  ADD COLUMN IF NOT EXISTS profile_appearance_number INTEGER,
  ADD COLUMN IF NOT EXISTS profile_def_overall NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS profile_ata_overall NUMERIC(5,1);

ALTER TABLE public.round_players DROP CONSTRAINT IF EXISTS round_players_fluid_profile_check;
ALTER TABLE public.round_players ADD CONSTRAINT round_players_fluid_profile_check
  CHECK (player_profile_locked IS NULL OR player_profile_locked IN ('defensive', 'offensive'));
ALTER TABLE public.round_players DROP CONSTRAINT IF EXISTS round_players_profile_source_check;
ALTER TABLE public.round_players ADD CONSTRAINT round_players_profile_source_check
  CHECK (profile_decision_source IS NULL OR profile_decision_source IN ('initial', 'overall'));

ALTER TABLE public.player_round_stats
  ADD COLUMN IF NOT EXISTS profile_decision_source TEXT,
  ADD COLUMN IF NOT EXISTS profile_appearance_number INTEGER,
  ADD COLUMN IF NOT EXISTS profile_def_overall NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS profile_ata_overall NUMERIC(5,1);

ALTER TABLE public.player_round_stats DROP CONSTRAINT IF EXISTS player_round_stats_profile_source_check;
ALTER TABLE public.player_round_stats ADD CONSTRAINT player_round_stats_profile_source_check
  CHECK (profile_decision_source IS NULL OR profile_decision_source IN ('initial', 'overall'));

ALTER TABLE public.player_overall_round_breakdowns
  ADD COLUMN IF NOT EXISTS profile_decision_source TEXT,
  ADD COLUMN IF NOT EXISTS profile_appearance_number INTEGER,
  ADD COLUMN IF NOT EXISTS profile_def_overall NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS profile_ata_overall NUMERIC(5,1);

INSERT INTO public.overall_formula_versions(key, label, config)
SELECT
  'adaptive-v18-fluid-profile',
  'OVR adaptativo v18 — tags fluidas por maior OVR',
  config || jsonb_build_object(
    'fluidProfileEnabled', true,
    'fluidProfileWarmupAppearances', 4,
    'oppositeRoleAcceleration', 1.5,
    'playedRoleEvidenceEnabled', false,
    'unselectedTraitEvidence', 1,
    'unselectedTraitEvidenceEnabled', false,
    'traitsAsProgressionBonus', false,
    'prioritizedTraitProgression', false,
    'prioritizedTraitsAsEvidenceOnly', false,
    'traitInfluenceFadeEnabled', false
  )
FROM public.overall_formula_versions
WHERE key = 'adaptive-v17-three-positions-column-c'
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, config = EXCLUDED.config;

-- A migration 223 usava a tag atual para refazer toda a temporada. A partir
-- daqui, somente a decisão cronológica congelada em cada rodada é autoritativa.
DROP TRIGGER IF EXISTS sync_ranked_points_after_player_profile_change ON public.players;
DROP FUNCTION IF EXISTS public.sync_ranked_points_after_player_profile_change();
DROP FUNCTION IF EXISTS public.refresh_active_ranked_points_for_current_profile(UUID);

CREATE OR REPLACE FUNCTION public.protect_fluid_player_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE played_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.initial_player_profile := COALESCE(NEW.initial_player_profile, NEW.player_profile);
    NEW.profile_decision_source := COALESCE(NEW.profile_decision_source, 'initial');
    RETURN NEW;
  END IF;

  SELECT count(DISTINCT round_item.id)::INTEGER INTO played_count
  FROM public.rounds round_item
  JOIN public.matches match_item ON match_item.round_id=round_item.id AND match_item.status='finished'
  JOIN public.match_players participant ON participant.match_id=match_item.id
  WHERE participant.player_id=NEW.id
    AND COALESCE(participant.left_elapsed_seconds,
      NULLIF(match_item.timer_accumulated_seconds,0),match_item.duration_seconds,420)
      > participant.entered_elapsed_seconds
    AND NOT EXISTS (SELECT 1 FROM public.player_round_stat_overrides override_item
      WHERE override_item.round_id=round_item.id AND override_item.player_id=NEW.id
        AND override_item.override_type='zero_points')
    AND round_item.round_type='official' AND round_item.status='finished';

  IF OLD.initial_player_profile IS DISTINCT FROM NEW.initial_player_profile AND played_count > 0 THEN
    RAISE EXCEPTION 'A tag inicial não pode mudar depois da primeira atuação oficial.';
  END IF;

  IF OLD.player_profile IS DISTINCT FROM NEW.player_profile
    AND COALESCE(current_setting('app.allow_fluid_profile_update', true), '') <> 'on' THEN
    IF played_count > 0 THEN
      RAISE EXCEPTION 'A tag já foi congelada pelo histórico e agora é controlada pelo OVR.';
    END IF;
    NEW.initial_player_profile := NEW.player_profile;
    NEW.profile_decision_source := 'initial';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_fluid_player_profile ON public.players;
CREATE TRIGGER protect_fluid_player_profile
BEFORE INSERT OR UPDATE OF player_profile, initial_player_profile ON public.players
FOR EACH ROW EXECUTE FUNCTION public.protect_fluid_player_profile();

CREATE OR REPLACE FUNCTION public.lock_round_player_fluid_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_round public.rounds%ROWTYPE;
DECLARE prior_appearances INTEGER;
DECLARE initial_profile TEXT;
DECLARE current_profile TEXT;
DECLARE current_source TEXT;
DECLARE latest_def NUMERIC;
DECLARE latest_ata NUMERIC;
BEGIN
  SELECT * INTO target_round FROM public.rounds WHERE id = NEW.round_id;
  SELECT COALESCE(player.initial_player_profile, player.player_profile), player.player_profile,
    COALESCE(player.profile_decision_source, 'initial')
  INTO initial_profile, current_profile, current_source
  FROM public.players player WHERE player.id = NEW.player_id;

  SELECT count(DISTINCT round_item.id)::INTEGER INTO prior_appearances
  FROM public.rounds round_item
  JOIN public.matches match_item ON match_item.round_id=round_item.id AND match_item.status='finished'
  JOIN public.match_players participant ON participant.match_id=match_item.id
  WHERE participant.player_id = NEW.player_id
    AND COALESCE(participant.left_elapsed_seconds,
      NULLIF(match_item.timer_accumulated_seconds,0),match_item.duration_seconds,420)
      > participant.entered_elapsed_seconds
    AND NOT EXISTS (SELECT 1 FROM public.player_round_stat_overrides override_item
      WHERE override_item.round_id=round_item.id AND override_item.player_id=NEW.player_id
        AND override_item.override_type='zero_points')
    AND round_item.round_type = 'official' AND round_item.status = 'finished'
    AND (round_item.date, round_item.created_at, round_item.number, round_item.id)
      < (target_round.date, target_round.created_at, target_round.number, target_round.id);

  SELECT snapshot.def_overall, snapshot.ata_overall INTO latest_def, latest_ata
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  WHERE snapshot.player_id = NEW.player_id AND run.status = 'published'
    AND formula.key IN ('adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c')
  ORDER BY CASE formula.key WHEN 'adaptive-v18-fluid-profile' THEN 0 ELSE 1 END,
    run.published_at DESC NULLS LAST, run.created_at DESC LIMIT 1;

  NEW.profile_appearance_number := CASE WHEN target_round.round_type = 'official' THEN prior_appearances + 1 ELSE NULL END;
  NEW.profile_decision_source := CASE WHEN target_round.round_type = 'official' AND prior_appearances < 4 THEN 'initial' ELSE current_source END;
  NEW.player_profile_locked := CASE WHEN target_round.round_type = 'official' AND prior_appearances < 4 THEN initial_profile ELSE current_profile END;
  NEW.profile_def_overall := latest_def;
  NEW.profile_ata_overall := latest_ata;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_round_player_fluid_profile ON public.round_players;
CREATE TRIGGER lock_round_player_fluid_profile
BEFORE INSERT ON public.round_players
FOR EACH ROW EXECUTE FUNCTION public.lock_round_player_fluid_profile();

WITH pending_history AS (
  SELECT round_player.round_id,round_player.player_id,(
    SELECT count(DISTINCT previous_round.id)::INTEGER
    FROM public.rounds previous_round
    JOIN public.matches match_item ON match_item.round_id=previous_round.id AND match_item.status='finished'
    JOIN public.match_players participant ON participant.match_id=match_item.id
    WHERE participant.player_id=round_player.player_id
      AND COALESCE(participant.left_elapsed_seconds,
        NULLIF(match_item.timer_accumulated_seconds,0),match_item.duration_seconds,420)
        > participant.entered_elapsed_seconds
      AND NOT EXISTS (SELECT 1 FROM public.player_round_stat_overrides override_item
        WHERE override_item.round_id=previous_round.id AND override_item.player_id=round_player.player_id
          AND override_item.override_type='zero_points')
      AND previous_round.round_type='official' AND previous_round.status='finished'
      AND (previous_round.date,previous_round.created_at,previous_round.number,previous_round.id)
        < (round_item.date,round_item.created_at,round_item.number,round_item.id)
  ) appearances
  FROM public.round_players round_player
  JOIN public.rounds round_item ON round_item.id=round_player.round_id
  WHERE round_item.status<>'finished' AND round_player.player_profile_locked IS NULL
)
UPDATE public.round_players round_player SET
  player_profile_locked = CASE WHEN history.appearances < 4
    THEN COALESCE(player.initial_player_profile, player.player_profile)
    ELSE player.player_profile END,
  profile_decision_source = CASE WHEN history.appearances < 4 THEN 'initial'
    ELSE COALESCE(player.profile_decision_source, 'initial') END,
  profile_appearance_number = CASE WHEN round_item.round_type='official' THEN history.appearances+1 ELSE NULL END
FROM public.players player, public.rounds round_item, pending_history history
WHERE player.id=round_player.player_id AND round_item.id=round_player.round_id
  AND history.round_id=round_player.round_id AND history.player_id=round_player.player_id;

UPDATE public.round_players round_player SET
  profile_def_overall = COALESCE(round_player.profile_def_overall, (
    SELECT snapshot.def_overall
    FROM public.player_overall_snapshots snapshot
    JOIN public.overall_calculation_runs run ON run.id=snapshot.calculation_run_id
    JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
    WHERE snapshot.player_id=round_player.player_id AND run.status='published'
      AND formula.key IN ('adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c')
    ORDER BY CASE formula.key WHEN 'adaptive-v18-fluid-profile' THEN 0 ELSE 1 END,
      run.published_at DESC NULLS LAST,run.created_at DESC LIMIT 1
  )),
  profile_ata_overall = COALESCE(round_player.profile_ata_overall, (
    SELECT snapshot.ata_overall
    FROM public.player_overall_snapshots snapshot
    JOIN public.overall_calculation_runs run ON run.id=snapshot.calculation_run_id
    JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
    WHERE snapshot.player_id=round_player.player_id AND run.status='published'
      AND formula.key IN ('adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c')
    ORDER BY CASE formula.key WHEN 'adaptive-v18-fluid-profile' THEN 0 ELSE 1 END,
      run.published_at DESC NULLS LAST,run.created_at DESC LIMIT 1
  ))
FROM public.rounds round_item
WHERE round_item.id=round_player.round_id AND round_item.status<>'finished';

-- Permite que o publicador v18 faça uma reconstrução auditável, mantendo a
-- trava antiga para qualquer atualização comum.
CREATE OR REPLACE FUNCTION public.lock_player_round_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.player_profile_locked IS NOT NULL
    AND COALESCE(current_setting('app.allow_fluid_profile_update', true), '') <> 'on' THEN
    NEW.player_profile_locked := OLD.player_profile_locked;
  ELSIF NEW.player_profile_locked IS NULL THEN
    SELECT COALESCE(player.player_profile, player.initial_player_profile)
    INTO NEW.player_profile_locked FROM public.players player WHERE player.id = NEW.player_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_fluid_profiles_from_overall_run(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.overall_calculation_runs run
    JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
    WHERE run.id = p_run_id AND run.status = 'published'
      AND formula.key = 'adaptive-v18-fluid-profile'
  ) THEN
    RAISE EXCEPTION 'A execução v18 precisa estar publicada.';
  END IF;

  PERFORM set_config('app.allow_fluid_profile_update', 'on', true);

  UPDATE public.player_round_stats stats SET
    player_profile_locked = breakdown.played_profile,
    profile_decision_source = breakdown.profile_decision_source,
    profile_appearance_number = breakdown.profile_appearance_number,
    profile_def_overall = breakdown.profile_def_overall,
    profile_ata_overall = breakdown.profile_ata_overall,
    points = CASE WHEN EXISTS (
      SELECT 1 FROM public.player_round_stat_overrides override_item
      WHERE override_item.round_id = stats.round_id AND override_item.player_id = stats.player_id
        AND override_item.override_type = 'zero_points'
    ) THEN 0 ELSE round(
      GREATEST(stats.goals-COALESCE(stats.goalkeeper_goals,0),0)
        * CASE WHEN breakdown.played_profile='defensive' THEN 5 ELSE 4 END
      + GREATEST(stats.assists-COALESCE(stats.goalkeeper_assists,0),0)
        * CASE WHEN breakdown.played_profile='defensive' THEN 3 ELSE 2.5 END
      + GREATEST(stats.team_goals_conceded-COALESCE(stats.goals_conceded,0),0)*-0.5
      + CASE WHEN breakdown.played_profile='defensive'
          THEN COALESCE(stats.ranking_defensive_clean_games,0)*2
            + COALESCE(stats.ranking_defensive_one_goal_games,0) ELSE 0 END
      + GREATEST(stats.own_goals-COALESCE(stats.goalkeeper_own_goals,0),0)*-3
      + COALESCE(stats.goalkeeper_games,0)
      + COALESCE(stats.goalkeeper_goals,0)*5
      + COALESCE(stats.goalkeeper_assists,0)*3
      + COALESCE(stats.goals_conceded,0)*-0.5
      + COALESCE(stats.clean_sheets,0)*4
      + GREATEST(LEAST(
          COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0),
          2*(COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0))-COALESCE(stats.goals_conceded,0)
        ),0)*2
      + COALESCE(stats.goalkeeper_own_goals,0)*-3
    ,2) END,
    ranking_role_weights = CASE WHEN stats.games > 0 THEN jsonb_build_array(jsonb_build_object(
      'role', CASE WHEN breakdown.played_profile='defensive' THEN 'DEF' ELSE 'ATA' END,
      'overall', CASE WHEN breakdown.played_profile='defensive' THEN breakdown.profile_def_overall ELSE breakdown.profile_ata_overall END,
      'weight', 1
    )) ELSE '[]'::JSONB END,
    ranking_position_bonus = 0
  FROM public.player_overall_round_breakdowns breakdown
  WHERE breakdown.calculation_run_id = p_run_id
    AND breakdown.player_id = stats.player_id AND breakdown.round_id = stats.round_id;

  UPDATE public.round_players round_player SET
    player_profile_locked = stats.player_profile_locked,
    profile_decision_source = stats.profile_decision_source,
    profile_appearance_number = stats.profile_appearance_number,
    profile_def_overall = stats.profile_def_overall,
    profile_ata_overall = stats.profile_ata_overall
  FROM public.player_round_stats stats, public.rounds round_item
  WHERE stats.round_id = round_player.round_id AND stats.player_id = round_player.player_id
    AND round_item.id = stats.round_id AND round_item.status = 'finished';

  UPDATE public.players player SET
    player_profile = CASE WHEN snapshot.data_quality->>'effective_profile'='defensive' THEN 'defensive' ELSE 'offensive' END,
    profile_decision_source = CASE WHEN snapshot.data_quality->>'profile_source'='overall' THEN 'overall' ELSE 'initial' END,
    profile_source_round_id = run.source_through_round_id
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
  WHERE snapshot.calculation_run_id = p_run_id AND snapshot.player_id = player.id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_fluid_profiles_from_overall_run(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_fluid_profiles_from_overall_run(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_fluid_profiles_after_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status='published' AND OLD.status IS DISTINCT FROM NEW.status
    AND EXISTS (SELECT 1 FROM public.overall_formula_versions formula
      WHERE formula.id=NEW.formula_version_id AND formula.key='adaptive-v18-fluid-profile') THEN
    PERFORM public.apply_fluid_profiles_from_overall_run(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_fluid_profiles_after_publish ON public.overall_calculation_runs;
CREATE TRIGGER apply_fluid_profiles_after_publish
AFTER UPDATE OF status ON public.overall_calculation_runs
FOR EACH ROW EXECUTE FUNCTION public.apply_fluid_profiles_after_publish();

DROP FUNCTION IF EXISTS public.get_latest_player_card_overalls();
CREATE FUNCTION public.get_latest_player_card_overalls()
RETURNS TABLE (
  player_id UUID, overall NUMERIC, trend TEXT, def_overall NUMERIC,
  ala_mei_overall NUMERIC, ata_overall NUMERIC, gol_overall NUMERIC,
  goalkeeper_rounds INTEGER, goalkeeper_games INTEGER, rounds_played INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT DISTINCT ON (snapshot.player_id)
    snapshot.player_id,snapshot.overall,COALESCE(snapshot.data_quality->>'overall_trend','steady'),
    snapshot.def_overall,snapshot.ata_overall,snapshot.ata_overall,snapshot.gol_overall,
    snapshot.goalkeeper_rounds,snapshot.goalkeeper_games,snapshot.rounds_played
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id=snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
  JOIN public.players player ON player.id=snapshot.player_id
  WHERE run.status='published' AND player.is_competitive_profile_complete=true
  ORDER BY snapshot.player_id,
    CASE formula.key WHEN 'adaptive-v18-fluid-profile' THEN 0
      WHEN 'adaptive-v17-three-positions-column-c' THEN 1 ELSE 2 END,
    run.published_at DESC NULLS LAST,run.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_player_card_overalls() TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_manager_player_catalog()
RETURNS TABLE (
  player_id UUID,name TEXT,avatar_url TEXT,snapshot_id UUID,
  formula TEXT,captured_at TIMESTAMPTZ,overall NUMERIC,
  def_overall NUMERIC,ala_mei_overall NUMERIC,ata_overall NUMERIC,gol_overall NUMERIC,
  traits TEXT[],goalkeeper_eligible BOOLEAN,trend TEXT,
  rounds INTEGER,goals INTEGER,assists INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT DISTINCT ON (player.id)
    player.id,COALESCE(NULLIF(player.nickname,''),player.name)::TEXT,player.avatar_url::TEXT,
    snapshot.id,formula.key,run.created_at,snapshot.overall,snapshot.def_overall,
    CASE WHEN formula.key IN ('adaptive-v17-three-positions-column-c','adaptive-v18-fluid-profile')
      THEN snapshot.ata_overall ELSE snapshot.ala_mei_overall END,
    snapshot.ata_overall,snapshot.gol_overall,player.overall_traits::TEXT[],
    (snapshot.goalkeeper_games>=COALESCE((formula.config->>'goalkeeperEligibilityGames')::INTEGER,8)
      AND snapshot.goalkeeper_rounds>=COALESCE((formula.config->>'goalkeeperEligibilityRounds')::INTEGER,3)),
    COALESCE(snapshot.data_quality->>'overall_trend','steady'),snapshot.rounds_played,
    COALESCE((snapshot.data_quality->'scout_totals'->>'goals')::INTEGER,0),
    COALESCE((snapshot.data_quality->'scout_totals'->>'assists')::INTEGER,0)
  FROM public.players player
  JOIN public.player_overall_snapshots snapshot ON snapshot.player_id=player.id
  JOIN public.overall_calculation_runs run ON run.id=snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id=run.formula_version_id
  WHERE player.is_competitive_profile_complete=true
    AND formula.key IN (
      'adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c',
      'adaptive-v16-distributed-trait-bonus','adaptive-v15-goalkeeper-outcomes',
      'adaptive-v14-role-adjusted-rates','adaptive-v13-admin-style-evidence',
      'adaptive-v12-top-three-progression','adaptive-v11-balanced-characteristics')
    AND ((formula.key IN (
        'adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c',
        'adaptive-v16-distributed-trait-bonus','adaptive-v15-goalkeeper-outcomes',
        'adaptive-v14-role-adjusted-rates','adaptive-v13-admin-style-evidence') AND run.status='published')
      OR (formula.key NOT IN (
        'adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c',
        'adaptive-v16-distributed-trait-bonus','adaptive-v15-goalkeeper-outcomes',
        'adaptive-v14-role-adjusted-rates','adaptive-v13-admin-style-evidence')
        AND run.status IN ('succeeded','published')))
  ORDER BY player.id,CASE formula.key
    WHEN 'adaptive-v18-fluid-profile' THEN 0
    WHEN 'adaptive-v17-three-positions-column-c' THEN 1
    WHEN 'adaptive-v16-distributed-trait-bonus' THEN 2
    WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 3
    WHEN 'adaptive-v14-role-adjusted-rates' THEN 4
    WHEN 'adaptive-v13-admin-style-evidence' THEN 5
    WHEN 'adaptive-v12-top-three-progression' THEN 6 ELSE 7 END,
    run.created_at DESC,run.id DESC;
$$;
REVOKE ALL ON FUNCTION public.get_manager_player_catalog() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_manager_player_catalog() TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
