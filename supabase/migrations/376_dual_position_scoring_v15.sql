-- Posições 2.0: quatro posições de linha, perfil primário/secundário e
-- pontuação v15 congelada por rodada. A ativação inicial é limitada à
-- Pelada BQ. Rodadas encerradas e seus snapshots permanecem intactos.
BEGIN;

ALTER TABLE public.league_members
  ADD COLUMN IF NOT EXISTS primary_position text,
  ADD COLUMN IF NOT EXISTS secondary_position text;

UPDATE public.league_members member
SET primary_position = CASE player_profile
  WHEN 'defensive' THEN 'DEF'
  WHEN 'offensive' THEN 'ATA'
  WHEN 'midfield' THEN 'MEI'
  ELSE NULL
END
FROM public.leagues league
WHERE league.id = member.league_id
  AND league.slug = 'liga-da-pelada'
  AND member.primary_position IS NULL;

ALTER TABLE public.league_members
  DROP CONSTRAINT IF EXISTS league_members_primary_position_check,
  DROP CONSTRAINT IF EXISTS league_members_secondary_position_check,
  DROP CONSTRAINT IF EXISTS league_members_distinct_positions_check;

ALTER TABLE public.league_members
  ADD CONSTRAINT league_members_primary_position_check
    CHECK (primary_position IS NULL OR primary_position IN ('DEF','MEI','ALA','ATA')),
  ADD CONSTRAINT league_members_secondary_position_check
    CHECK (secondary_position IS NULL OR secondary_position IN ('DEF','MEI','ALA','ATA')),
  ADD CONSTRAINT league_members_distinct_positions_check
    CHECK (primary_position IS NULL OR secondary_position IS NULL OR primary_position <> secondary_position);

ALTER TABLE public.round_players
  ADD COLUMN IF NOT EXISTS primary_position_locked text,
  ADD COLUMN IF NOT EXISTS secondary_position_locked text;

UPDATE public.round_players round_player
SET primary_position_locked = CASE round_player.player_profile_locked
  WHEN 'defensive' THEN 'DEF'
  WHEN 'offensive' THEN 'ATA'
  WHEN 'midfield' THEN 'MEI'
  ELSE (
    SELECT member.primary_position
    FROM public.league_members member
    WHERE member.league_id = round_item.league_id
      AND member.player_id = round_player.player_id
      AND member.is_active
    LIMIT 1
  )
END
FROM public.rounds round_item
WHERE round_item.id = round_player.round_id
  AND round_player.primary_position_locked IS NULL;

ALTER TABLE public.round_players
  DROP CONSTRAINT IF EXISTS round_players_primary_position_locked_check,
  DROP CONSTRAINT IF EXISTS round_players_secondary_position_locked_check,
  DROP CONSTRAINT IF EXISTS round_players_distinct_positions_locked_check;

ALTER TABLE public.round_players
  ADD CONSTRAINT round_players_primary_position_locked_check
    CHECK (primary_position_locked IS NULL OR primary_position_locked IN ('DEF','MEI','ALA','ATA')),
  ADD CONSTRAINT round_players_secondary_position_locked_check
    CHECK (secondary_position_locked IS NULL OR secondary_position_locked IN ('DEF','MEI','ALA','ATA')),
  ADD CONSTRAINT round_players_distinct_positions_locked_check
    CHECK (primary_position_locked IS NULL OR secondary_position_locked IS NULL OR primary_position_locked <> secondary_position_locked);

ALTER TABLE public.player_round_stats
  ADD COLUMN IF NOT EXISTS primary_position_locked text,
  ADD COLUMN IF NOT EXISTS secondary_position_locked text;

UPDATE public.player_round_stats stats
SET primary_position_locked = round_player.primary_position_locked,
    secondary_position_locked = round_player.secondary_position_locked
FROM public.round_players round_player
WHERE round_player.round_id = stats.round_id
  AND round_player.player_id = stats.player_id
  AND stats.primary_position_locked IS NULL;

ALTER TABLE public.player_round_stats
  DROP CONSTRAINT IF EXISTS player_round_stats_primary_position_locked_check,
  DROP CONSTRAINT IF EXISTS player_round_stats_secondary_position_locked_check,
  DROP CONSTRAINT IF EXISTS player_round_stats_distinct_positions_locked_check;

ALTER TABLE public.player_round_stats
  ADD CONSTRAINT player_round_stats_primary_position_locked_check
    CHECK (primary_position_locked IS NULL OR primary_position_locked IN ('DEF','MEI','ALA','ATA')),
  ADD CONSTRAINT player_round_stats_secondary_position_locked_check
    CHECK (secondary_position_locked IS NULL OR secondary_position_locked IN ('DEF','MEI','ALA','ATA')),
  ADD CONSTRAINT player_round_stats_distinct_positions_locked_check
    CHECK (primary_position_locked IS NULL OR secondary_position_locked IS NULL OR primary_position_locked <> secondary_position_locked);

ALTER TABLE public.fantasy_settings
  ADD COLUMN IF NOT EXISTS dual_position_scoring_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS primary_position_weight numeric NOT NULL DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS secondary_position_weight numeric NOT NULL DEFAULT 0.30,
  ADD COLUMN IF NOT EXISTS line_clean_sheet_min_share numeric NOT NULL DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS position_scoring_rules jsonb NOT NULL DEFAULT '{
    "DEF":{"goal":4.5,"assist":2.5,"cleanSheet":3,"conceded":-1,"ownGoal":-3},
    "MEI":{"goal":4.5,"assist":3.5,"cleanSheet":1,"conceded":-0.6,"ownGoal":-3},
    "ALA":{"goal":4.75,"assist":3,"cleanSheet":1.5,"conceded":-0.8,"ownGoal":-3},
    "ATA":{"goal":5.5,"assist":2.5,"cleanSheet":0,"conceded":-0.4,"ownGoal":-3}
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS goalkeeper_goal_points numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS goalkeeper_assist_points numeric NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS goalkeeper_own_goal_points numeric NOT NULL DEFAULT -3;

ALTER TABLE public.fantasy_settings
  DROP CONSTRAINT IF EXISTS fantasy_settings_dual_position_weights_check,
  DROP CONSTRAINT IF EXISTS fantasy_settings_line_clean_sheet_min_share_check,
  DROP CONSTRAINT IF EXISTS fantasy_settings_position_scoring_rules_check;

ALTER TABLE public.fantasy_settings
  ADD CONSTRAINT fantasy_settings_dual_position_weights_check CHECK (
    primary_position_weight > 0
    AND secondary_position_weight > 0
    AND primary_position_weight + secondary_position_weight = 1
  ),
  ADD CONSTRAINT fantasy_settings_line_clean_sheet_min_share_check
    CHECK (line_clean_sheet_min_share >= 0 AND line_clean_sheet_min_share <= 1),
  ADD CONSTRAINT fantasy_settings_position_scoring_rules_check CHECK (
    position_scoring_rules ?& ARRAY['DEF','MEI','ALA','ATA']
    AND jsonb_typeof(position_scoring_rules) = 'object'
  );

CREATE OR REPLACE FUNCTION public.lock_round_player_dual_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  target_round public.rounds%ROWTYPE;
  membership public.league_members%ROWTYPE;
BEGIN
  SELECT * INTO target_round FROM public.rounds WHERE id = NEW.round_id;
  IF target_round.id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO membership
  FROM public.league_members
  WHERE league_id = target_round.league_id
    AND player_id = NEW.player_id
    AND is_active
  LIMIT 1;

  IF NEW.primary_position_locked IS NULL THEN
    NEW.primary_position_locked := membership.primary_position;
  END IF;
  IF NEW.secondary_position_locked IS NULL THEN
    NEW.secondary_position_locked := membership.secondary_position;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_round_player_dual_position_on_insert ON public.round_players;
CREATE TRIGGER lock_round_player_dual_position_on_insert
BEFORE INSERT ON public.round_players
FOR EACH ROW EXECUTE FUNCTION public.lock_round_player_dual_position();

CREATE OR REPLACE FUNCTION public.sync_draft_round_player_dual_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.round_players round_player
  SET primary_position_locked = NEW.primary_position,
      secondary_position_locked = NEW.secondary_position
  FROM public.rounds round_item
  WHERE round_item.id = round_player.round_id
    AND round_item.league_id = NEW.league_id
    AND round_item.status = 'draft'
    AND round_player.player_id = NEW.player_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_draft_round_player_dual_position_on_update ON public.league_members;
CREATE TRIGGER sync_draft_round_player_dual_position_on_update
AFTER UPDATE OF primary_position, secondary_position ON public.league_members
FOR EACH ROW
WHEN (
  OLD.primary_position IS DISTINCT FROM NEW.primary_position
  OR OLD.secondary_position IS DISTINCT FROM NEW.secondary_position
)
EXECUTE FUNCTION public.sync_draft_round_player_dual_position();

CREATE OR REPLACE FUNCTION public.set_bq_scoring_snapshot_on_round_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  settings public.fantasy_settings%ROWTYPE;
BEGIN
  SELECT fantasy_settings.* INTO settings
  FROM public.fantasy_settings
  JOIN public.seasons season ON season.league_id = fantasy_settings.league_id
  WHERE season.id = NEW.season_id
  LIMIT 1;

  IF NEW.scoring_snapshot IS NULL AND COALESCE(settings.dual_position_scoring_enabled, false) THEN
    NEW.scoring_snapshot := jsonb_build_object(
      'version', 15,
      'goal', COALESCE(settings.attacker_goal_points, 4),
      'assist', COALESCE(settings.attacker_assist_points, 2.5),
      'win', 0, 'draw', 0, 'loss', 0,
      'ownGoal', COALESCE(settings.own_goal_points, -3),
      'positionRules', settings.position_scoring_rules,
      'primaryWeight', settings.primary_position_weight,
      'secondaryWeight', settings.secondary_position_weight,
      'lineCleanSheetMinShare', settings.line_clean_sheet_min_share,
      'goalkeeperAppearance', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
      'goalkeeperGoal', settings.goalkeeper_goal_points,
      'goalkeeperAssist', settings.goalkeeper_assist_points,
      'goalkeeperGoalConceded', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeperCleanSheet', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 4),
      'goalkeeperOneGoal', COALESCE(settings.goalkeeper_slot_one_goal_points, 2),
      'goalkeeperOwnGoal', settings.goalkeeper_own_goal_points
    );
    NEW.scoring_version := 15;
  ELSIF NEW.scoring_snapshot IS NULL THEN
    NEW.scoring_snapshot := jsonb_build_object(
      'version', 14,
      'goal', COALESCE(settings.attacker_goal_points, 4),
      'assist', COALESCE(settings.attacker_assist_points, 2.5),
      'win', 0, 'draw', 0, 'loss', 0,
      'ownGoal', COALESCE(settings.own_goal_points, -3),
      'goalkeeperAppearance', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
      'goalkeeperGoalConceded', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'defenderGoal', COALESCE(settings.defender_goal_points, 5),
      'defenderAssist', COALESCE(settings.defender_assist_points, 3),
      'defenderCleanSheet', COALESCE(settings.defender_clean_sheet_points, 3),
      'defenderOneGoal', COALESCE(settings.defender_one_goal_points, 1),
      'defenderOneGoalConceded', COALESCE(settings.defender_one_goal_conceded_points, -0.75),
      'defenderTwoGoalsConceded', COALESCE(settings.defender_two_goals_conceded_points, -1.75),
      'goalkeeperCleanSheet', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 4),
      'goalkeeperOneGoal', COALESCE(settings.goalkeeper_slot_one_goal_points, 2),
      'teamGoalConceded', COALESCE(settings.line_goal_conceded_points, -0.5)
    );
    NEW.scoring_version := 14;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_role_scoring_activation_from_round_two()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  settings public.fantasy_settings%ROWTYPE;
BEGIN
  SELECT fantasy_settings.* INTO settings
  FROM public.fantasy_settings
  JOIN public.fantasy_seasons season ON season.league_id = fantasy_settings.league_id
  WHERE season.id = NEW.fantasy_season_id
  LIMIT 1;

  IF COALESCE(settings.dual_position_scoring_enabled, false) THEN
    NEW.settings_snapshot := COALESCE(NEW.settings_snapshot, '{}') || jsonb_build_object(
      'scoring_version', 15, 'role_scoring_active', true,
      'goal_points', COALESCE(settings.attacker_goal_points, 4),
      'attacker_goal_points', COALESCE(settings.attacker_goal_points, 4),
      'attacker_assist_points', COALESCE(settings.attacker_assist_points, 2.5),
      'win_points', 0, 'draw_points', 0, 'loss_points', 0,
      'own_goal_points', COALESCE(settings.own_goal_points, -3),
      'position_scoring_rules', settings.position_scoring_rules,
      'primary_position_weight', settings.primary_position_weight,
      'secondary_position_weight', settings.secondary_position_weight,
      'line_clean_sheet_min_share', settings.line_clean_sheet_min_share,
      'goalkeeper_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
      'goalkeeper_goal_points', settings.goalkeeper_goal_points,
      'goalkeeper_assist_points', settings.goalkeeper_assist_points,
      'goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeper_slot_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
      'goalkeeper_slot_goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeper_slot_clean_sheet_points', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 4),
      'goalkeeper_slot_one_goal_points', COALESCE(settings.goalkeeper_slot_one_goal_points, 2),
      'goalkeeper_own_goal_points', settings.goalkeeper_own_goal_points,
      'captain_multiplier', COALESCE(settings.captain_multiplier, 1.5)
    );
    NEW.scoring_version := 15;
  ELSE
    NEW.settings_snapshot := COALESCE(NEW.settings_snapshot, '{}') || jsonb_build_object(
      'scoring_version', 14, 'role_scoring_active', true,
      'goal_points', COALESCE(settings.attacker_goal_points, 4),
      'attacker_goal_points', COALESCE(settings.attacker_goal_points, 4),
      'attacker_assist_points', COALESCE(settings.attacker_assist_points, 2.5),
      'defender_goal_points', COALESCE(settings.defender_goal_points, 5),
      'defender_assist_points', COALESCE(settings.defender_assist_points, 3),
      'defender_clean_sheet_points', COALESCE(settings.defender_clean_sheet_points, 3),
      'defender_one_goal_points', COALESCE(settings.defender_one_goal_points, 1),
      'defender_one_goal_conceded_points', COALESCE(settings.defender_one_goal_conceded_points, -0.75),
      'defender_two_goals_conceded_points', COALESCE(settings.defender_two_goals_conceded_points, -1.75),
      'win_points', 0, 'draw_points', 0, 'loss_points', 0,
      'own_goal_points', COALESCE(settings.own_goal_points, -3),
      'line_goal_conceded_points', COALESCE(settings.line_goal_conceded_points, -0.5),
      'goalkeeper_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
      'goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'team_goal_conceded_points', COALESCE(settings.line_goal_conceded_points, -0.5),
      'goalkeeper_slot_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
      'goalkeeper_slot_goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeper_slot_clean_sheet_points', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 4),
      'goalkeeper_slot_one_goal_points', COALESCE(settings.goalkeeper_slot_one_goal_points, 2)
    );
    NEW.scoring_version := 14;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.fantasy_settings settings
SET dual_position_scoring_enabled = true,
    scoring_version = 15,
    updated_at = now()
FROM public.leagues league
WHERE league.id = settings.league_id
  AND league.slug = 'liga-da-pelada';

-- O rascunho pode receber a nova versão. Rodadas em andamento ou encerradas
-- continuam usando o snapshot com que foram abertas.
SELECT set_config('app.allow_bq_snapshot_rewrite', 'on', true);
UPDATE public.rounds round_item
SET scoring_version = 15,
    scoring_snapshot = jsonb_build_object(
      'version', 15,
      'goal', COALESCE(settings.attacker_goal_points, 4),
      'assist', COALESCE(settings.attacker_assist_points, 2.5),
      'win', 0, 'draw', 0, 'loss', 0,
      'ownGoal', COALESCE(settings.own_goal_points, -3),
      'positionRules', settings.position_scoring_rules,
      'primaryWeight', settings.primary_position_weight,
      'secondaryWeight', settings.secondary_position_weight,
      'lineCleanSheetMinShare', settings.line_clean_sheet_min_share,
      'goalkeeperAppearance', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
      'goalkeeperGoal', settings.goalkeeper_goal_points,
      'goalkeeperAssist', settings.goalkeeper_assist_points,
      'goalkeeperGoalConceded', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeperCleanSheet', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 4),
      'goalkeeperOneGoal', COALESCE(settings.goalkeeper_slot_one_goal_points, 2),
      'goalkeeperOwnGoal', settings.goalkeeper_own_goal_points
    )
FROM public.fantasy_settings settings, public.leagues league
WHERE settings.league_id = round_item.league_id
  AND league.id = round_item.league_id
  AND league.slug = 'liga-da-pelada'
  AND round_item.status = 'draft'
  AND round_item.round_type = 'official';
SELECT set_config('app.allow_bq_snapshot_rewrite', 'off', true);

-- O Cartola continua lendo a pontuação consolidada da Ranked. O snapshot
-- próprio recebe somente os parâmetros necessários para a prévia ao vivo.
UPDATE public.fantasy_rounds fantasy_round
SET scoring_version = 15,
    settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}') || jsonb_build_object(
      'scoring_version', 15, 'role_scoring_active', true,
      'goal_points', COALESCE(settings.attacker_goal_points, 4),
      'attacker_goal_points', COALESCE(settings.attacker_goal_points, 4),
      'attacker_assist_points', COALESCE(settings.attacker_assist_points, 2.5),
      'win_points', 0, 'draw_points', 0, 'loss_points', 0,
      'own_goal_points', COALESCE(settings.own_goal_points, -3),
      'position_scoring_rules', settings.position_scoring_rules,
      'primary_position_weight', settings.primary_position_weight,
      'secondary_position_weight', settings.secondary_position_weight,
      'line_clean_sheet_min_share', settings.line_clean_sheet_min_share,
      'goalkeeper_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
      'goalkeeper_goal_points', settings.goalkeeper_goal_points,
      'goalkeeper_assist_points', settings.goalkeeper_assist_points,
      'goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeper_slot_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
      'goalkeeper_slot_goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeper_slot_clean_sheet_points', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 4),
      'goalkeeper_slot_one_goal_points', COALESCE(settings.goalkeeper_slot_one_goal_points, 2),
      'goalkeeper_own_goal_points', settings.goalkeeper_own_goal_points,
      'captain_multiplier', COALESCE(settings.captain_multiplier, 1.5)
    )
FROM public.fantasy_seasons fantasy_season, public.fantasy_settings settings,
     public.rounds round_item, public.leagues league
WHERE fantasy_round.fantasy_season_id = fantasy_season.id
  AND settings.league_id = fantasy_season.league_id
  AND round_item.id = fantasy_round.round_id
  AND league.id = fantasy_season.league_id
  AND league.slug = 'liga-da-pelada'
  AND round_item.status = 'draft';

UPDATE public.fantasy_test_sessions test_session
SET scoring_version = 15,
    settings_snapshot = COALESCE(test_session.settings_snapshot, '{}') || jsonb_build_object(
      'scoring_version', 15, 'role_scoring_active', true,
      'goal_points', COALESCE(settings.attacker_goal_points, 4),
      'attacker_goal_points', COALESCE(settings.attacker_goal_points, 4),
      'attacker_assist_points', COALESCE(settings.attacker_assist_points, 2.5),
      'win_points', 0, 'draw_points', 0, 'loss_points', 0,
      'own_goal_points', COALESCE(settings.own_goal_points, -3),
      'position_scoring_rules', settings.position_scoring_rules,
      'primary_position_weight', settings.primary_position_weight,
      'secondary_position_weight', settings.secondary_position_weight,
      'line_clean_sheet_min_share', settings.line_clean_sheet_min_share,
      'goalkeeper_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
      'goalkeeper_goal_points', settings.goalkeeper_goal_points,
      'goalkeeper_assist_points', settings.goalkeeper_assist_points,
      'goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeper_slot_appearance_points', COALESCE(settings.goalkeeper_slot_appearance_points, 1),
      'goalkeeper_slot_goal_conceded_points', COALESCE(settings.goalkeeper_slot_goal_conceded_points, -0.5),
      'goalkeeper_slot_clean_sheet_points', COALESCE(settings.goalkeeper_slot_clean_sheet_points, 4),
      'goalkeeper_slot_one_goal_points', COALESCE(settings.goalkeeper_slot_one_goal_points, 2),
      'goalkeeper_own_goal_points', settings.goalkeeper_own_goal_points,
      'captain_multiplier', COALESCE(settings.captain_multiplier, 1.5)
    )
FROM public.rounds round_item, public.fantasy_settings settings, public.leagues league
WHERE round_item.id = test_session.round_id
  AND settings.league_id = round_item.league_id
  AND league.id = round_item.league_id
  AND league.slug = 'liga-da-pelada'
  AND round_item.status = 'draft'
  AND test_session.status = 'open';

CREATE OR REPLACE FUNCTION public.save_dual_position_scoring_settings(
  p_league_id uuid,
  p_position_rules jsonb,
  p_primary_weight numeric,
  p_secondary_weight numeric,
  p_line_clean_sheet_min_share numeric,
  p_goalkeeper_appearance_points numeric,
  p_goalkeeper_goal_points numeric,
  p_goalkeeper_assist_points numeric,
  p_goalkeeper_goal_conceded_points numeric,
  p_goalkeeper_clean_sheet_points numeric,
  p_goalkeeper_one_goal_points numeric,
  p_goalkeeper_own_goal_points numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  draft_count integer := 0;
  position_name text;
  field_name text;
BEGIN
  IF NOT public.is_app_admin() OR NOT public.is_league_admin(p_league_id) THEN
    RAISE EXCEPTION 'Somente administradores desta pelada podem alterar as regras por posição.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leagues WHERE id = p_league_id) THEN
    RAISE EXCEPTION 'Liga não encontrada.';
  END IF;
  IF p_primary_weight <= 0 OR p_secondary_weight <= 0
     OR p_primary_weight + p_secondary_weight <> 1 THEN
    RAISE EXCEPTION 'Os pesos das posições precisam ser positivos e somar 100%%.';
  END IF;
  IF p_line_clean_sheet_min_share < 0 OR p_line_clean_sheet_min_share > 1 THEN
    RAISE EXCEPTION 'A participação mínima para clean sheet deve ficar entre 0%% e 100%%.';
  END IF;
  IF jsonb_typeof(p_position_rules) <> 'object'
     OR NOT (p_position_rules ?& ARRAY['DEF','MEI','ALA','ATA']) THEN
    RAISE EXCEPTION 'A tabela precisa conter DEF, MEI, ALA e ATA.';
  END IF;
  FOREACH position_name IN ARRAY ARRAY['DEF','MEI','ALA','ATA'] LOOP
    FOREACH field_name IN ARRAY ARRAY['goal','assist','cleanSheet','conceded','ownGoal'] LOOP
      IF jsonb_typeof(p_position_rules -> position_name -> field_name) <> 'number' THEN
        RAISE EXCEPTION 'A regra %.% precisa ser numérica.', position_name, field_name;
      END IF;
    END LOOP;
    IF (p_position_rules -> position_name ->> 'conceded')::numeric > 0 THEN
      RAISE EXCEPTION 'Pontos por gol sofrido devem ser zero ou negativos.';
    END IF;
  END LOOP;
  IF p_goalkeeper_goal_conceded_points > 0 THEN
    RAISE EXCEPTION 'Pontos por gol sofrido devem ser zero ou negativos.';
  END IF;

  UPDATE public.fantasy_settings SET
    dual_position_scoring_enabled = true,
    scoring_version = 15,
    position_scoring_rules = p_position_rules,
    primary_position_weight = p_primary_weight,
    secondary_position_weight = p_secondary_weight,
    line_clean_sheet_min_share = p_line_clean_sheet_min_share,
    goalkeeper_slot_appearance_points = p_goalkeeper_appearance_points,
    goalkeeper_goal_points = p_goalkeeper_goal_points,
    goalkeeper_assist_points = p_goalkeeper_assist_points,
    goalkeeper_slot_goal_conceded_points = p_goalkeeper_goal_conceded_points,
    goalkeeper_slot_clean_sheet_points = p_goalkeeper_clean_sheet_points,
    goalkeeper_slot_one_goal_points = p_goalkeeper_one_goal_points,
    goalkeeper_own_goal_points = p_goalkeeper_own_goal_points,
    updated_at = now()
  WHERE league_id = p_league_id;

  PERFORM set_config('app.allow_bq_snapshot_rewrite', 'on', true);
  UPDATE public.rounds round_item SET
    scoring_version = 15,
    scoring_snapshot = jsonb_build_object(
      'version', 15, 'goal', 4, 'assist', 2.5,
      'win', 0, 'draw', 0, 'loss', 0, 'ownGoal', -3,
      'positionRules', p_position_rules,
      'primaryWeight', p_primary_weight,
      'secondaryWeight', p_secondary_weight,
      'lineCleanSheetMinShare', p_line_clean_sheet_min_share,
      'goalkeeperAppearance', p_goalkeeper_appearance_points,
      'goalkeeperGoal', p_goalkeeper_goal_points,
      'goalkeeperAssist', p_goalkeeper_assist_points,
      'goalkeeperGoalConceded', p_goalkeeper_goal_conceded_points,
      'goalkeeperCleanSheet', p_goalkeeper_clean_sheet_points,
      'goalkeeperOneGoal', p_goalkeeper_one_goal_points,
      'goalkeeperOwnGoal', p_goalkeeper_own_goal_points
    )
  WHERE round_item.league_id = p_league_id
    AND round_item.status = 'draft'
    AND round_item.round_type = 'official';
  GET DIAGNOSTICS draft_count = ROW_COUNT;
  PERFORM set_config('app.allow_bq_snapshot_rewrite', 'off', true);

  UPDATE public.fantasy_rounds fantasy_round SET
    scoring_version = 15,
    settings_snapshot = COALESCE(fantasy_round.settings_snapshot, '{}') || jsonb_build_object(
      'scoring_version', 15, 'role_scoring_active', true,
      'position_scoring_rules', p_position_rules,
      'primary_position_weight', p_primary_weight,
      'secondary_position_weight', p_secondary_weight,
      'line_clean_sheet_min_share', p_line_clean_sheet_min_share,
      'goalkeeper_appearance_points', p_goalkeeper_appearance_points,
      'goalkeeper_goal_points', p_goalkeeper_goal_points,
      'goalkeeper_assist_points', p_goalkeeper_assist_points,
      'goal_conceded_points', p_goalkeeper_goal_conceded_points,
      'goalkeeper_slot_appearance_points', p_goalkeeper_appearance_points,
      'goalkeeper_slot_goal_conceded_points', p_goalkeeper_goal_conceded_points,
      'goalkeeper_slot_clean_sheet_points', p_goalkeeper_clean_sheet_points,
      'goalkeeper_slot_one_goal_points', p_goalkeeper_one_goal_points,
      'goalkeeper_own_goal_points', p_goalkeeper_own_goal_points
    )
  FROM public.rounds round_item
  WHERE round_item.id = fantasy_round.round_id
    AND round_item.league_id = p_league_id
    AND round_item.status = 'draft';

  INSERT INTO public.fantasy_audit_log (league_id, user_id, action, payload)
  VALUES (p_league_id, auth.uid(), 'dual_position_scoring_settings_updated',
    jsonb_build_object('draftRoundsUpdated', draft_count, 'version', 15));

  RETURN jsonb_build_object('success', true, 'draft_rounds_updated', draft_count);
END;
$$;

REVOKE ALL ON FUNCTION public.save_dual_position_scoring_settings(
  uuid,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_dual_position_scoring_settings(
  uuid,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.calculate_fantasy_goalkeeper_slot_points_v14(
  p_round_id uuid,
  p_player_id uuid,
  p_snapshot jsonb
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
  SELECT round((
    COALESCE(stat.goalkeeper_games, 0) * COALESCE((p_snapshot->>'goalkeeper_slot_appearance_points')::numeric, 1)
    + COALESCE(stat.goalkeeper_goals, 0) * CASE
        WHEN COALESCE((p_snapshot->>'scoring_version')::integer, 14) >= 15
          THEN COALESCE((p_snapshot->>'goalkeeper_goal_points')::numeric, (p_snapshot->>'defender_goal_points')::numeric, 5)
        ELSE COALESCE((p_snapshot->>'defender_goal_points')::numeric, 5)
      END
    + COALESCE(stat.goalkeeper_assists, 0) * CASE
        WHEN COALESCE((p_snapshot->>'scoring_version')::integer, 14) >= 15
          THEN COALESCE((p_snapshot->>'goalkeeper_assist_points')::numeric, (p_snapshot->>'defender_assist_points')::numeric, 3)
        ELSE COALESCE((p_snapshot->>'defender_assist_points')::numeric, 3)
      END
    + COALESCE(stat.goals_conceded, 0) * COALESCE((p_snapshot->>'goalkeeper_slot_goal_conceded_points')::numeric, -0.5)
    + COALESCE(stat.clean_sheets, 0) * COALESCE((p_snapshot->>'goalkeeper_slot_clean_sheet_points')::numeric, 4)
    + GREATEST(
        0,
        LEAST(
          GREATEST(0, COALESCE(stat.goalkeeper_games, 0) - COALESCE(stat.clean_sheets, 0)),
          GREATEST(0, COALESCE(stat.goalkeeper_games, 0) - COALESCE(stat.clean_sheets, 0)) * 2
            - COALESCE(stat.goals_conceded, 0)
        )
      ) * COALESCE((p_snapshot->>'goalkeeper_slot_one_goal_points')::numeric, 2)
    + COALESCE(stat.goalkeeper_own_goals, 0) * CASE
        WHEN COALESCE((p_snapshot->>'scoring_version')::integer, 14) >= 15
          THEN COALESCE((p_snapshot->>'goalkeeper_own_goal_points')::numeric, (p_snapshot->>'own_goal_points')::numeric, -3)
        ELSE COALESCE((p_snapshot->>'own_goal_points')::numeric, -3)
      END
  )::numeric, 2)
  FROM public.player_round_stats stat
  WHERE stat.round_id = p_round_id
    AND stat.player_id = p_player_id
$$;

REVOKE ALL ON FUNCTION public.calculate_fantasy_goalkeeper_slot_points_v14(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_fantasy_goalkeeper_slot_points_v14(uuid, uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.audit_fantasy_scoring_integrity(p_round_id uuid DEFAULT NULL)
RETURNS TABLE (
  round_id uuid, user_id uuid, player_id uuid, stored_base numeric, expected_base numeric,
  stored_position_bonus numeric, expected_position_bonus numeric,
  stored_captain_bonus numeric, expected_captain_bonus numeric,
  stored_total numeric, expected_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE old_round_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT (
       (public.is_app_admin() AND p_round_id IS NULL)
       OR (p_round_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.rounds r WHERE r.id = p_round_id AND public.is_league_admin(r.league_id)
       ))
     ) THEN
    RAISE EXCEPTION 'Somente administradores podem auditar o Cartola.';
  END IF;

  FOR old_round_id IN
    SELECT round_item.id
    FROM public.rounds round_item
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = round_item.id
    WHERE round_item.status = 'finished'
      AND COALESCE(fantasy_round.scoring_version,
        (fantasy_round.settings_snapshot->>'scoring_version')::integer, 5) < 14
      AND (p_round_id IS NULL OR round_item.id = p_round_id)
  LOOP
    RETURN QUERY
      SELECT * FROM public.audit_fantasy_scoring_integrity_pre_ranked_v14_238(old_round_id);
  END LOOP;

  RETURN QUERY
  WITH source AS (
    SELECT round_item.id AS source_round_id, lineup.user_id AS source_user_id,
      lineup.captain_player_id, item.player_id AS source_player_id,
      item.base_points, item.position_bonus, item.captain_bonus, item.total_points,
      fantasy_round.settings_snapshot AS snapshot,
      CASE
        WHEN item.slot_role = 'GOL' THEN COALESCE(
          public.calculate_fantasy_goalkeeper_slot_points_v14(round_item.id, item.player_id, fantasy_round.settings_snapshot),
          0
        )
        ELSE round(COALESCE(stat.ranking_points, stat.points, 0), 2)
      END AS expected_base_value
    FROM public.fantasy_lineups lineup
    JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id = lineup.fantasy_round_id
    JOIN public.rounds round_item ON round_item.id = fantasy_round.round_id
    JOIN public.fantasy_lineup_players item ON item.lineup_id = lineup.id
    LEFT JOIN public.player_round_stats stat
      ON stat.round_id = round_item.id AND stat.player_id = item.player_id
    WHERE lineup.status = 'scored' AND round_item.status = 'finished'
      AND COALESCE(fantasy_round.scoring_version,
        (fantasy_round.settings_snapshot->>'scoring_version')::integer, 5) >= 14
      AND (p_round_id IS NULL OR round_item.id = p_round_id)
  ), expected AS (
    SELECT source.*,
      0::numeric AS expected_position_value,
      CASE WHEN source_player_id = captain_player_id THEN round(
        expected_base_value * (COALESCE((snapshot->>'captain_multiplier')::numeric, 1.5) - 1), 2
      ) ELSE 0 END AS expected_captain_value,
      CASE WHEN source_player_id = captain_player_id THEN round(
        expected_base_value * COALESCE((snapshot->>'captain_multiplier')::numeric, 1.5), 2
      ) ELSE expected_base_value END AS expected_total_value
    FROM source
  )
  SELECT expected.source_round_id, expected.source_user_id, expected.source_player_id,
    expected.base_points, expected.expected_base_value,
    expected.position_bonus, expected.expected_position_value,
    expected.captain_bonus, expected.expected_captain_value,
    expected.total_points, expected.expected_total_value
  FROM expected
  WHERE abs(COALESCE(expected.base_points, 0) - COALESCE(expected.expected_base_value, 0)) > .001
     OR abs(COALESCE(expected.position_bonus, 0) - COALESCE(expected.expected_position_value, 0)) > .001
     OR abs(COALESCE(expected.captain_bonus, 0) - COALESCE(expected.expected_captain_value, 0)) > .001
     OR abs(COALESCE(expected.total_points, 0) - COALESCE(expected.expected_total_value, 0)) > .001;
END $$;

REVOKE ALL ON FUNCTION public.audit_fantasy_scoring_integrity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_fantasy_scoring_integrity(uuid) TO authenticated, service_role;

-- Rodada 1 em v14/v15 (nova temporada, nova pelada ou temporada reprocessada
-- para v15) usa o motor unificado da Ranked; apenas R1 legada (< v14) mantém o
-- atalho anterior às vagas da migration 075.
CREATE OR REPLACE FUNCTION public.process_fantasy_round_pre_integrity_083(p_round_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  round_number integer;
  v_scoring_version integer;
BEGIN
  SELECT round_item.number,
         COALESCE(fantasy_round.scoring_version, (fantasy_round.settings_snapshot->>'scoring_version')::integer, 2)
    INTO round_number, v_scoring_version
  FROM public.rounds round_item
  LEFT JOIN public.fantasy_rounds fantasy_round ON fantasy_round.round_id = round_item.id
  WHERE round_item.id = p_round_id;

  IF COALESCE(round_number, 1) >= 2 OR v_scoring_version >= 14 THEN
    PERFORM public.process_fantasy_round_pre_round_two_gate_075(p_round_id);
  ELSE
    PERFORM public.process_fantasy_round_pre_slot_position_bonus_073(p_round_id);
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_fantasy_test_round_pre_integrity_083(p_round_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  round_number integer;
  v_scoring_version integer;
BEGIN
  SELECT round_item.number,
         COALESCE(session_item.scoring_version, (session_item.settings_snapshot->>'scoring_version')::integer, 2)
    INTO round_number, v_scoring_version
  FROM public.rounds round_item
  LEFT JOIN public.fantasy_test_sessions session_item ON session_item.round_id = round_item.id
  WHERE round_item.id = p_round_id;

  IF COALESCE(round_number, 1) >= 2 OR v_scoring_version >= 14 THEN
    PERFORM public.process_fantasy_test_round_pre_round_two_gate_075(p_round_id);
  ELSE
    PERFORM public.process_fantasy_test_round_pre_slot_position_bonus_073(p_round_id);
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION
  public.process_fantasy_round_pre_integrity_083(uuid),
  public.process_fantasy_test_round_pre_integrity_083(uuid)
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
