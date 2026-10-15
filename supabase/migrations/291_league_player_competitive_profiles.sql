-- A identidade do atleta (nome, conta e fotos) continua global, mas sua tag
-- fixa e as caracteristicas que orientam o OVR passam a pertencer a pelada.
-- Assim, o mesmo usuario pode ser ATA em uma liga e DEF em outra sem que uma
-- edicao recalcule ou altere o historico da outra.
BEGIN;

ALTER TABLE public.league_members
  ADD COLUMN IF NOT EXISTS player_profile text,
  ADD COLUMN IF NOT EXISTS initial_player_profile text,
  ADD COLUMN IF NOT EXISTS overall_traits text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS overall_seed_mode text NOT NULL DEFAULT 'observed';

UPDATE public.league_members membership SET
  player_profile = CASE player.player_profile
    WHEN 'defensive' THEN 'defensive'
    WHEN 'offensive' THEN 'offensive'
    WHEN 'midfield' THEN 'offensive'
    WHEN 'wing' THEN 'offensive'
    ELSE NULL END,
  initial_player_profile = CASE COALESCE(player.initial_player_profile, player.player_profile)
    WHEN 'defensive' THEN 'defensive'
    WHEN 'offensive' THEN 'offensive'
    WHEN 'midfield' THEN 'offensive'
    WHEN 'wing' THEN 'offensive'
    ELSE NULL END,
  overall_traits = ARRAY(
    SELECT DISTINCT trait FROM unnest(COALESCE(player.overall_traits, '{}'::text[])) trait
    WHERE trait IN ('defensive', 'offensive') LIMIT 2
  ),
  overall_seed_mode = COALESCE(player.overall_seed_mode, 'observed')
FROM public.players player
WHERE player.id = membership.player_id;

ALTER TABLE public.league_members
  DROP CONSTRAINT IF EXISTS league_members_player_profile_check,
  DROP CONSTRAINT IF EXISTS league_members_initial_player_profile_check,
  DROP CONSTRAINT IF EXISTS league_members_overall_traits_check,
  DROP CONSTRAINT IF EXISTS league_members_overall_seed_mode_check;

ALTER TABLE public.league_members
  ADD CONSTRAINT league_members_player_profile_check
    CHECK (player_profile IS NULL OR player_profile IN ('defensive','offensive')),
  ADD CONSTRAINT league_members_initial_player_profile_check
    CHECK (initial_player_profile IS NULL OR initial_player_profile IN ('defensive','offensive')),
  ADD CONSTRAINT league_members_overall_traits_check
    CHECK (
      cardinality(overall_traits) <= 2
      AND overall_traits <@ ARRAY['defensive','offensive']::text[]
    ),
  ADD CONSTRAINT league_members_overall_seed_mode_check
    CHECK (overall_seed_mode IN ('legacy_tag','observed'));

CREATE OR REPLACE FUNCTION public.seed_league_member_competitive_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source_player public.players%ROWTYPE;
BEGIN
  SELECT * INTO source_player FROM public.players WHERE id = NEW.player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Jogador inexistente para entrar na pelada.'; END IF;
  NEW.player_profile := CASE COALESCE(NEW.player_profile, source_player.player_profile)
    WHEN 'defensive' THEN 'defensive'
    WHEN 'offensive' THEN 'offensive'
    WHEN 'midfield' THEN 'offensive'
    WHEN 'wing' THEN 'offensive'
    ELSE NULL END;
  NEW.initial_player_profile := CASE COALESCE(
    NEW.initial_player_profile, source_player.initial_player_profile, NEW.player_profile)
    WHEN 'defensive' THEN 'defensive'
    WHEN 'offensive' THEN 'offensive'
    WHEN 'midfield' THEN 'offensive'
    WHEN 'wing' THEN 'offensive'
    ELSE NULL END;
  IF NEW.overall_traits IS NULL OR cardinality(NEW.overall_traits) = 0 THEN
    NEW.overall_traits := ARRAY(
      SELECT DISTINCT trait FROM unnest(COALESCE(source_player.overall_traits, '{}'::text[])) trait
      WHERE trait IN ('defensive', 'offensive') LIMIT 2
    );
  END IF;
  NEW.overall_seed_mode := COALESCE(NEW.overall_seed_mode, source_player.overall_seed_mode, 'observed');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_league_member_competitive_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS league_members_seed_competitive_profile ON public.league_members;
CREATE TRIGGER league_members_seed_competitive_profile
BEFORE INSERT ON public.league_members
FOR EACH ROW EXECUTE FUNCTION public.seed_league_member_competitive_profile();

-- Substitui a versao da 288: a formula e identica, mas a posicao vem do
-- vinculo do jogador com a pelada, nunca mais do cadastro global.
CREATE OR REPLACE FUNCTION public.reprocess_ranked_fixed_profiles_for_league(
  p_league_id uuid,
  p_player_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected_stats integer := 0;
BEGIN
  IF p_league_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.leagues WHERE id = p_league_id
  ) THEN
    RAISE EXCEPTION 'Pelada inexistente para reprocessar a Ranked.';
  END IF;

  UPDATE public.player_round_stats stats SET
    player_profile_locked = membership.player_profile,
    profile_decision_source = 'initial',
    points = CASE WHEN EXISTS (
      SELECT 1 FROM public.player_round_stat_overrides override_item
      WHERE override_item.round_id = stats.round_id
        AND override_item.player_id = stats.player_id
        AND override_item.override_type = 'zero_points'
    ) THEN 0 ELSE round(
      GREATEST(COALESCE(stats.goals,0)-COALESCE(stats.goalkeeper_goals,0),0)
        * CASE WHEN membership.player_profile = 'defensive'
          THEN COALESCE((round_item.scoring_snapshot->>'defenderGoal')::numeric,5)
          ELSE COALESCE((round_item.scoring_snapshot->>'goal')::numeric,4) END
      + GREATEST(COALESCE(stats.assists,0)-COALESCE(stats.goalkeeper_assists,0),0)
        * CASE WHEN membership.player_profile = 'defensive'
          THEN COALESCE((round_item.scoring_snapshot->>'defenderAssist')::numeric,3)
          ELSE COALESCE((round_item.scoring_snapshot->>'assist')::numeric,2.5) END
      + CASE WHEN membership.player_profile = 'defensive' THEN
          COALESCE(stats.ranking_defensive_clean_games,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderCleanSheet')::numeric,3)
          + COALESCE(stats.ranking_defensive_one_goal_games,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderOneGoal')::numeric,1)
          + COALESCE(stats.ranking_defensive_one_goal_games,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderOneGoalConceded')::numeric,-0.75)
          + GREATEST((
              GREATEST(COALESCE(stats.team_goals_conceded,0)-COALESCE(stats.goals_conceded,0),0)
                - COALESCE(stats.ranking_defensive_one_goal_games,0)
            )/2.0,0)
            * COALESCE((round_item.scoring_snapshot->>'defenderTwoGoalsConceded')::numeric,-1.75)
        ELSE GREATEST(COALESCE(stats.team_goals_conceded,0)-COALESCE(stats.goals_conceded,0),0)
          * COALESCE((round_item.scoring_snapshot->>'teamGoalConceded')::numeric,-0.5) END
      + GREATEST(COALESCE(stats.own_goals,0)-COALESCE(stats.goalkeeper_own_goals,0),0)
        * COALESCE((round_item.scoring_snapshot->>'ownGoal')::numeric,-3)
      + COALESCE(stats.goalkeeper_games,0)
        * COALESCE((round_item.scoring_snapshot->>'goalkeeperAppearance')::numeric,1)
      + COALESCE(stats.goalkeeper_goals,0)
        * COALESCE((round_item.scoring_snapshot->>'defenderGoal')::numeric,5)
      + COALESCE(stats.goalkeeper_assists,0)
        * COALESCE((round_item.scoring_snapshot->>'defenderAssist')::numeric,3)
      + COALESCE(stats.goals_conceded,0)
        * COALESCE((round_item.scoring_snapshot->>'goalkeeperGoalConceded')::numeric,-0.5)
      + COALESCE(stats.clean_sheets,0)
        * COALESCE((round_item.scoring_snapshot->>'goalkeeperCleanSheet')::numeric,4)
      + GREATEST(LEAST(
          COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0),
          2*(COALESCE(stats.goalkeeper_games,0)-COALESCE(stats.clean_sheets,0))
            -COALESCE(stats.goals_conceded,0)
        ),0)*COALESCE((round_item.scoring_snapshot->>'goalkeeperOneGoal')::numeric,2)
      + COALESCE(stats.goalkeeper_own_goals,0)
        * COALESCE((round_item.scoring_snapshot->>'ownGoal')::numeric,-3)
    ,2) END,
    ranking_role_weights = CASE WHEN stats.games > 0 THEN jsonb_build_array(jsonb_build_object(
      'role',CASE WHEN membership.player_profile = 'defensive' THEN 'DEF' ELSE 'ATA' END,
      'overall',0,'weight',1
    )) ELSE '[]'::jsonb END,
    ranking_position_bonus = 0
  FROM public.league_members membership, public.rounds round_item, public.seasons season
  WHERE membership.league_id = p_league_id
    AND membership.player_id = stats.player_id
    AND membership.is_active
    AND round_item.id = stats.round_id
    AND round_item.league_id = p_league_id
    AND season.id = round_item.season_id
    AND season.league_id = p_league_id
    AND season.status = 'active'
    AND round_item.round_type = 'official'
    AND round_item.status = 'finished'
    AND membership.player_profile IN ('defensive','offensive')
    AND (p_player_id IS NULL OR stats.player_id = p_player_id);
  GET DIAGNOSTICS affected_stats = ROW_COUNT;

  UPDATE public.round_players round_player SET
    player_profile_locked = membership.player_profile,
    profile_decision_source = 'initial'
  FROM public.league_members membership, public.rounds round_item, public.seasons season
  WHERE membership.league_id = p_league_id
    AND membership.player_id = round_player.player_id
    AND membership.is_active
    AND round_item.id = round_player.round_id
    AND round_item.league_id = p_league_id
    AND season.id = round_item.season_id
    AND season.league_id = p_league_id
    AND season.status = 'active'
    AND round_item.round_type = 'official'
    AND membership.player_profile IN ('defensive','offensive')
    AND (p_player_id IS NULL OR round_player.player_id = p_player_id);

  RETURN jsonb_build_object('success',true,'player_rounds_reprocessed',affected_stats);
END;
$$;
REVOKE ALL ON FUNCTION public.reprocess_ranked_fixed_profiles_for_league(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprocess_ranked_fixed_profiles_for_league(uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.sync_ranked_points_after_league_profile_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.reprocess_ranked_fixed_profiles_for_league(NEW.league_id, NEW.player_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_ranked_points_after_league_profile_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_ranked_points_after_player_profile_change ON public.players;
DROP TRIGGER IF EXISTS sync_ranked_points_after_league_profile_change ON public.league_members;
CREATE TRIGGER sync_ranked_points_after_league_profile_change
AFTER UPDATE OF player_profile ON public.league_members
FOR EACH ROW WHEN (OLD.player_profile IS DISTINCT FROM NEW.player_profile)
EXECUTE FUNCTION public.sync_ranked_points_after_league_profile_change();

-- Uma nova convocacao congela a tag e os OVRs publicados da propria pelada.
CREATE OR REPLACE FUNCTION public.lock_round_player_fluid_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_round public.rounds%ROWTYPE;
DECLARE prior_appearances integer := 0;
DECLARE fixed_profile text;
DECLARE latest_def numeric;
DECLARE latest_ata numeric;
BEGIN
  SELECT * INTO target_round FROM public.rounds WHERE id = NEW.round_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rodada inexistente.'; END IF;

  SELECT membership.player_profile INTO fixed_profile
  FROM public.league_members membership
  WHERE membership.league_id = target_round.league_id
    AND membership.player_id = NEW.player_id
    AND membership.is_active;
  IF fixed_profile IS NULL THEN
    RAISE EXCEPTION 'O jogador nao possui perfil esportivo ativo nesta pelada.';
  END IF;

  SELECT count(DISTINCT round_item.id)::integer INTO prior_appearances
  FROM public.rounds round_item
  JOIN public.matches match_item ON match_item.round_id = round_item.id AND match_item.status = 'finished'
  JOIN public.match_players participant ON participant.match_id = match_item.id
  WHERE participant.player_id = NEW.player_id
    AND round_item.league_id = target_round.league_id
    AND round_item.round_type = 'official' AND round_item.status = 'finished'
    AND (round_item.date,round_item.created_at,round_item.number,round_item.id)
      < (target_round.date,target_round.created_at,target_round.number,target_round.id);

  SELECT snapshot.def_overall,snapshot.ata_overall INTO latest_def,latest_ata
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  WHERE snapshot.player_id = NEW.player_id
    AND run.league_id = target_round.league_id
    AND run.status = 'published'
    AND formula.key IN ('adaptive-v20-statistical-confidence','adaptive-v19-admin-fixed-profile')
  ORDER BY run.published_at DESC NULLS LAST,run.created_at DESC
  LIMIT 1;

  NEW.player_profile_locked := fixed_profile;
  NEW.profile_decision_source := 'initial';
  NEW.profile_appearance_number := CASE WHEN target_round.round_type = 'official' THEN prior_appearances+1 ELSE NULL END;
  NEW.profile_def_overall := latest_def;
  NEW.profile_ata_overall := latest_ata;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_admin_fixed_profiles_from_overall_run(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_league_id uuid;
BEGIN
  SELECT run.league_id INTO target_league_id
  FROM public.overall_calculation_runs run
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  WHERE run.id = p_run_id AND run.status = 'published'
    AND formula.key IN ('adaptive-v20-statistical-confidence','adaptive-v19-admin-fixed-profile');
  IF target_league_id IS NULL THEN
    RAISE EXCEPTION 'A execucao v19 ou v20 precisa estar publicada.';
  END IF;

  UPDATE public.player_round_stats stats SET
    player_profile_locked = breakdown.played_profile,
    profile_decision_source = 'initial',
    profile_appearance_number = breakdown.profile_appearance_number,
    profile_def_overall = breakdown.profile_def_overall,
    profile_ata_overall = breakdown.profile_ata_overall
  FROM public.player_overall_round_breakdowns breakdown, public.rounds round_item
  WHERE breakdown.calculation_run_id = p_run_id
    AND breakdown.player_id = stats.player_id
    AND breakdown.round_id = stats.round_id
    AND round_item.id = stats.round_id
    AND round_item.league_id = target_league_id;

  UPDATE public.round_players round_player SET
    player_profile_locked = membership.player_profile,
    profile_decision_source = 'initial',
    profile_def_overall = stats.profile_def_overall,
    profile_ata_overall = stats.profile_ata_overall
  FROM public.league_members membership, public.player_round_stats stats, public.rounds round_item
  WHERE membership.league_id = target_league_id
    AND membership.player_id = round_player.player_id
    AND stats.player_id = round_player.player_id
    AND stats.round_id = round_player.round_id
    AND round_item.id = round_player.round_id
    AND round_item.league_id = target_league_id;

  PERFORM public.reprocess_ranked_fixed_profiles_for_league(target_league_id);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_admin_fixed_profiles_from_overall_run(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_admin_fixed_profiles_from_overall_run(uuid)
  TO service_role;

-- As cartas publicas e o catalogo do BQ Manager validam a completude usando
-- identidade global + configuracao esportiva da pelada.
CREATE OR REPLACE FUNCTION public.get_latest_player_card_overalls_for_league(p_league_id uuid)
RETURNS TABLE (
  player_id uuid, overall numeric, trend text, def_overall numeric,
  ala_mei_overall numeric, ata_overall numeric, gol_overall numeric,
  goalkeeper_rounds integer, goalkeeper_games integer, rounds_played integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT ON (snapshot.player_id)
    snapshot.player_id, snapshot.overall,
    COALESCE(snapshot.data_quality->>'overall_trend','steady'),
    snapshot.def_overall, snapshot.ata_overall, snapshot.ata_overall,
    snapshot.gol_overall, snapshot.goalkeeper_rounds,
    snapshot.goalkeeper_games, snapshot.rounds_played
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  JOIN public.players player ON player.id = snapshot.player_id
  JOIN public.league_members member
    ON member.league_id = p_league_id AND member.player_id = snapshot.player_id
  WHERE public.is_league_member(p_league_id)
    AND run.league_id = p_league_id AND run.status = 'published'
    AND member.is_active
    AND player.member_category = 'player' AND player.is_selectable
    AND NULLIF(btrim(player.name), '') IS NOT NULL
    AND NULLIF(btrim(player.avatar_url), '') IS NOT NULL
    AND member.player_profile IN ('defensive','offensive')
    AND COALESCE(cardinality(member.overall_traits),0) BETWEEN 1 AND 2
  ORDER BY snapshot.player_id,
    CASE formula.key
      WHEN 'adaptive-v20-statistical-confidence' THEN 0
      WHEN 'adaptive-v19-admin-fixed-profile' THEN 1
      WHEN 'adaptive-v18-fluid-profile' THEN 2
      WHEN 'adaptive-v17-three-positions-column-c' THEN 3
      ELSE 4
    END,
    run.published_at DESC NULLS LAST, run.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_latest_player_card_overalls_for_league(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_latest_player_card_overalls_for_league(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_manager_player_catalog_for_league(p_league_id uuid)
RETURNS TABLE (
  player_id uuid, name text, avatar_url text, snapshot_id uuid,
  formula text, captured_at timestamptz, overall numeric,
  def_overall numeric, ala_mei_overall numeric, ata_overall numeric,
  gol_overall numeric, traits text[], goalkeeper_eligible boolean,
  trend text, rounds integer, goals integer, assists integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT ON (player.id)
    player.id, COALESCE(NULLIF(player.nickname,''),player.name)::text,
    player.avatar_url::text, snapshot.id, formula.key, run.created_at,
    snapshot.overall, snapshot.def_overall,
    CASE WHEN formula.key IN (
      'adaptive-v20-statistical-confidence','adaptive-v19-admin-fixed-profile',
      'adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c'
    ) THEN snapshot.ata_overall ELSE snapshot.ala_mei_overall END,
    snapshot.ata_overall, snapshot.gol_overall, member.overall_traits::text[],
    (snapshot.goalkeeper_games >= COALESCE(
      (formula.config->>'goalkeeperEligibilityGames')::integer,8)
      AND snapshot.goalkeeper_rounds >= COALESCE(
        (formula.config->>'goalkeeperEligibilityRounds')::integer,3)),
    COALESCE(snapshot.data_quality->>'overall_trend','steady'),
    snapshot.rounds_played,
    COALESCE((snapshot.data_quality->'scout_totals'->>'goals')::integer,0),
    COALESCE((snapshot.data_quality->'scout_totals'->>'assists')::integer,0)
  FROM public.players player
  JOIN public.player_overall_snapshots snapshot ON snapshot.player_id = player.id
  JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  JOIN public.league_members member
    ON member.league_id = p_league_id AND member.player_id = player.id
  WHERE p_league_id = public.get_bq_manager_source_league()
    AND run.league_id = p_league_id AND run.status = 'published'
    AND member.is_active
    AND player.member_category = 'player' AND player.is_selectable
    AND NULLIF(btrim(player.name), '') IS NOT NULL
    AND NULLIF(btrim(player.avatar_url), '') IS NOT NULL
    AND member.player_profile IN ('defensive','offensive')
    AND COALESCE(cardinality(member.overall_traits),0) BETWEEN 1 AND 2
    AND formula.key IN (
      'adaptive-v20-statistical-confidence','adaptive-v19-admin-fixed-profile',
      'adaptive-v18-fluid-profile','adaptive-v17-three-positions-column-c',
      'adaptive-v16-distributed-trait-bonus','adaptive-v15-goalkeeper-outcomes',
      'adaptive-v14-role-adjusted-rates','adaptive-v13-admin-style-evidence',
      'adaptive-v12-top-three-progression','adaptive-v11-balanced-characteristics'
    )
  ORDER BY player.id, CASE formula.key
    WHEN 'adaptive-v20-statistical-confidence' THEN 0
    WHEN 'adaptive-v19-admin-fixed-profile' THEN 1
    WHEN 'adaptive-v18-fluid-profile' THEN 2
    WHEN 'adaptive-v17-three-positions-column-c' THEN 3
    WHEN 'adaptive-v16-distributed-trait-bonus' THEN 4
    WHEN 'adaptive-v15-goalkeeper-outcomes' THEN 5
    WHEN 'adaptive-v14-role-adjusted-rates' THEN 6
    WHEN 'adaptive-v13-admin-style-evidence' THEN 7
    WHEN 'adaptive-v12-top-three-progression' THEN 8 ELSE 9 END,
    run.created_at DESC, run.id DESC;
$$;
REVOKE ALL ON FUNCTION public.get_manager_player_catalog_for_league(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_player_catalog_for_league(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
