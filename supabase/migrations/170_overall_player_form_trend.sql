-- OVR v9: acelera levemente a evolução de quem sustenta boa fase e a queda
-- de quem acumula fase ruim, sem mexer no limite semanal da fórmula-base.

insert into public.overall_formula_versions (key, label, config)
values (
  'adaptive-v9-player-form-trend-shadow',
  'OVR adaptativo v9 — tendência de forma por posição',
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
    'traitWeightedChange', false,
    'traitBasedOverall', true,
    'overallConfidenceShrink', false,
    'rankedTraitOverall', true,
    'performanceChangeBonus', 0.05,
    'hardPositionCapsEnabled', false,
    'provisionalAtConfidenceThreshold', false,
    'defensiveWeights', jsonb_build_object('concededRate', 0.50, 'survival', 0.35, 'exposure', 0.10, 'discipline', 0.05),
    'legacyTimingConfidence', 0.75,
    'assistValue', 0.65,
    'attackCurve', 0.32,
    'positionWeights', jsonb_build_object(
      'DEF', jsonb_build_object('defense', 0.85, 'attack', 0.10, 'result', 0.05),
      'ALA_MEI', jsonb_build_object('defense', 0.45, 'attack', 0.45, 'result', 0.10),
      'ATA', jsonb_build_object('defense', 0.15, 'attack', 0.75, 'result', 0.10)
    ),
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
on conflict (key) do update set label = excluded.label, config = excluded.config;

-- Atualiza a leitura pública da carta com os cinco OVRs que ela exibe, sem
-- expor a fórmula ou as auditorias. Enquanto o v9 ainda não foi calculado,
-- mantém o OVR v8 e mostra tendência estável, evitando cartas vazias.
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
      'adaptive-v9-player-form-trend-shadow',
      'adaptive-v8-soft-progression-shadow'
    )
      and run.status in ('succeeded', 'published')
    order by
      case formula.key
        when 'adaptive-v9-player-form-trend-shadow' then 0
        else 1
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
