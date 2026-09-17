-- OVR v10: reinterpreta as três funções de linha como DEF/VOL, ALA e ATA.
-- Os identificadores internos permanecem estáveis para preservar histórico e
-- consumidores existentes; a fórmula passa a separar gols de assistências.

alter table public.player_overall_round_breakdowns
  add column if not exists goal_score numeric,
  add column if not exists assist_score numeric;

insert into public.overall_formula_versions (key, label, config)
values (
  'adaptive-v10-role-reframe',
  'OVR adaptativo v10 — DEF/VOL, ALA e ATA',
  jsonb_build_object(
    'base', 70,
    'legacyInitialTagBonus', 3,
    'legacySeedEnabled', false,
    'seedFadeRounds', 3,
    'confidenceRounds', 3,
    'goalkeeperEligibilityRounds', 3,
    'positionCaps', jsonb_build_object('1', 74, '2', 76, '3', 78),
    'staleAfterRounds', 4,
    'halfLifeRounds', 3,
    'recentRoundWindow', 8,
    'maxChangePerRound', 2,
    'weeklyEvidenceCap', true,
    -- Uma caracteristica recebe 100% da velocidade; duas recebem 50% cada;
    -- tres recebem 33% cada. Posicoes nao selecionadas conservam so 15%.
    'traitWeightedChange', true,
    'traitBasedOverall', true,
    'overallConfidenceShrink', false,
    'rankedTraitOverall', true,
    'performanceChangeBonus', 0.05,
    'hardPositionCapsEnabled', false,
    'provisionalAtConfidenceThreshold', false,
    'defensiveWeights', jsonb_build_object(
      'concededRate', 0.50,
      'survival', 0.35,
      'exposure', 0.10,
      'discipline', 0.05
    ),
    'legacyTimingConfidence', 0.75,
    'assistValue', 0.65,
    'attackCurve', 0.32,
    'separateAttackScores', true,
    'goalCurve', 0.32,
    'assistCurve', 0.28,
    'positionWeights', jsonb_build_object(
      'DEF', jsonb_build_object('defense', 0.70, 'goals', 0.05, 'assists', 0.20, 'result', 0.05),
      'ALA_MEI', jsonb_build_object('defense', 0.40, 'goals', 0.25, 'assists', 0.30, 'result', 0.05),
      'ATA', jsonb_build_object('defense', 0.10, 'goals', 0.60, 'assists', 0.25, 'result', 0.05)
    ),
    'roleEvidence', jsonb_build_object(
      'DEF', jsonb_build_object('DEF', 1, 'ALA_MEI', 0.45, 'ATA', 0.15),
      'ALA_MEI', jsonb_build_object('DEF', 0.50, 'ALA_MEI', 1, 'ATA', 0.50),
      'ATA', jsonb_build_object('DEF', 0.15, 'ALA_MEI', 0.45, 'ATA', 1)
    ),
    'unassignedRoleEvidence', jsonb_build_object('DEF', 0.40, 'ALA_MEI', 0.55, 'ATA', 0.40),
    'unselectedTraitEvidence', 0.15,
    'trendEnabled', true,
    'trendWindowRounds', 3,
    'trendMinimumRounds', 3,
    'trendRequiredRounds', 2,
    'trendHighScore', 0.56,
    'trendLowScore', 0.42,
    'trendUpwardMultiplier', 0.20,
    'trendDownwardMultiplier', 0.30
  )
)
on conflict (key) do update
set label = excluded.label,
    config = excluded.config;

-- A leitura pública passa a preferir a v10 assim que existir um cálculo bem
-- sucedido. Até lá, as cartas continuam usando v9/v8 sem ficarem vazias.
drop function if exists public.get_latest_player_card_overalls();

create function public.get_latest_player_card_overalls()
returns table (
  player_id uuid,
  overall numeric,
  trend text,
  def_overall numeric,
  ala_mei_overall numeric,
  ata_overall numeric,
  gol_overall numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    snapshot.player_id,
    snapshot.overall,
    coalesce(snapshot.data_quality ->> 'overall_trend', 'steady') as trend,
    snapshot.def_overall,
    snapshot.ala_mei_overall,
    snapshot.ata_overall,
    snapshot.gol_overall
  from public.player_overall_snapshots as snapshot
  inner join (
    select run.id
    from public.overall_calculation_runs as run
    inner join public.overall_formula_versions as formula
      on formula.id = run.formula_version_id
    where formula.key in (
      'adaptive-v10-role-reframe',
      'adaptive-v9-player-form-trend-shadow',
      'adaptive-v8-soft-progression-shadow'
    )
      and run.status in ('succeeded', 'published')
    order by
      case formula.key
        when 'adaptive-v10-role-reframe' then 0
        when 'adaptive-v9-player-form-trend-shadow' then 1
        else 2
      end,
      run.created_at desc,
      run.id desc
    limit 1
  ) as latest_run
    on latest_run.id = snapshot.calculation_run_id;
$function$;

revoke all on function public.get_latest_player_card_overalls() from public;
grant execute on function public.get_latest_player_card_overalls() to anon, authenticated;

notify pgrst, 'reload schema';
