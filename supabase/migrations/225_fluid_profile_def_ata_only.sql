-- A tag de linha passa a depender diretamente de DEF x ATA. O OVR GOL fica
-- totalmente fora dessa decisão. A escolha inicial da ADM acelera somente a
-- posição escolhida nas quatro primeiras atuações.

BEGIN;

UPDATE public.overall_formula_versions
SET config = jsonb_set(config, '{initialProfileAcceleration}', '1.25'::jsonb, true),
    label = 'OVR adaptativo v18 — tags fluidas DEF x ATA'
WHERE key = 'adaptive-v18-fluid-profile';

CREATE OR REPLACE FUNCTION public.resolve_fluid_line_profile_v18(
  p_initial_profile TEXT,
  p_previous_profile TEXT,
  p_rounds_played INTEGER,
  p_def_overall NUMERIC,
  p_ata_overall NUMERIC
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COALESCE(p_rounds_played, 0) < 4
      THEN CASE WHEN p_initial_profile = 'defensive' THEN 'defensive' ELSE 'offensive' END
    WHEN round(COALESCE(p_def_overall, 0), 1) > round(COALESCE(p_ata_overall, 0), 1)
      THEN 'defensive'
    WHEN round(COALESCE(p_ata_overall, 0), 1) > round(COALESCE(p_def_overall, 0), 1)
      THEN 'offensive'
    ELSE CASE WHEN p_previous_profile = 'defensive' THEN 'defensive' ELSE 'offensive' END
  END;
$$;

REVOKE ALL ON FUNCTION public.resolve_fluid_line_profile_v18(TEXT,TEXT,INTEGER,NUMERIC,NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_fluid_line_profile_v18(TEXT,TEXT,INTEGER,NUMERIC,NUMERIC)
  TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_fluid_player_profiles_from_run(p_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.overall_calculation_runs run
    JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
    WHERE run.id = p_run_id
      AND run.status = 'published'
      AND formula.key = 'adaptive-v18-fluid-profile'
  ) THEN
    RAISE EXCEPTION 'A execução v18 precisa estar publicada.';
  END IF;

  PERFORM set_config('app.allow_fluid_profile_update', 'on', true);

  -- Corrige também os metadados exibidos no painel. O desempate preserva a
  -- decisão cronológica anterior produzida pelo motor.
  UPDATE public.player_overall_snapshots snapshot
  SET data_quality = jsonb_set(
    jsonb_set(
      COALESCE(snapshot.data_quality, '{}'::jsonb),
      '{effective_profile}',
      to_jsonb(public.resolve_fluid_line_profile_v18(
        COALESCE(player.initial_player_profile, player.player_profile),
        COALESCE(snapshot.data_quality->>'effective_profile', player.player_profile),
        snapshot.rounds_played,
        snapshot.def_overall,
        snapshot.ata_overall
      )),
      true
    ),
    '{profile_source}',
    to_jsonb(CASE WHEN COALESCE(snapshot.rounds_played, 0) < 4 THEN 'initial' ELSE 'overall' END),
    true
  )
  FROM public.players player
  WHERE snapshot.calculation_run_id = p_run_id
    AND player.id = snapshot.player_id;

  -- A tag efetiva compara apenas DEF e ATA. gol_overall não aparece nesta
  -- função e, portanto, jamais libera ou bloqueia bônus de linha da Ranked.
  UPDATE public.players player
  SET player_profile = public.resolve_fluid_line_profile_v18(
        COALESCE(player.initial_player_profile, player.player_profile),
        player.player_profile,
        snapshot.rounds_played,
        snapshot.def_overall,
        snapshot.ata_overall
      ),
      profile_decision_source = CASE
        WHEN COALESCE(snapshot.rounds_played, 0) < 4 THEN 'initial'
        ELSE 'overall'
      END,
      profile_source_round_id = run.source_through_round_id
  FROM public.player_overall_snapshots snapshot
  JOIN public.overall_calculation_runs run ON run.id = snapshot.calculation_run_id
  WHERE snapshot.calculation_run_id = p_run_id
    AND snapshot.player_id = player.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_fluid_player_profiles_from_run(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_fluid_player_profiles_from_run(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.apply_fluid_profiles_after_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND EXISTS (
      SELECT 1 FROM public.overall_formula_versions formula
      WHERE formula.id = NEW.formula_version_id
        AND formula.key = 'adaptive-v18-fluid-profile'
    ) THEN
    PERFORM public.apply_fluid_profiles_from_overall_run(NEW.id);
    PERFORM public.reconcile_fluid_player_profiles_from_run(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- A 224 podia ser instalada depois de uma execução já publicada. Reaplicar a
-- última execução torna a correção imediata e também refaz a Ranked histórica
-- com as decisões cronológicas congeladas no breakdown.
DO $$
DECLARE
  latest_run_id UUID;
BEGIN
  SELECT run.id INTO latest_run_id
  FROM public.overall_calculation_runs run
  JOIN public.overall_formula_versions formula ON formula.id = run.formula_version_id
  WHERE run.status = 'published'
    AND formula.key = 'adaptive-v18-fluid-profile'
  ORDER BY run.published_at DESC NULLS LAST, run.created_at DESC, run.id DESC
  LIMIT 1;

  IF latest_run_id IS NOT NULL THEN
    PERFORM public.apply_fluid_profiles_from_overall_run(latest_run_id);
    PERFORM public.reconcile_fluid_player_profiles_from_run(latest_run_id);
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
