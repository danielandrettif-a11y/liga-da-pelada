-- OVR v11: remove a dupla penalizacao aplicada a jogadores com duas ou tres
-- caracteristicas. A caracteristica continua pesando a confianca/target de
-- cada posicao e a composicao do OVR geral, mas deixa de reduzir novamente o
-- limite semanal de variacao. Assim, desempenho observado volta a prevalecer
-- sobre a quantidade de caracteristicas marcada pelo ADM.

insert into public.overall_formula_versions (key, label, config)
values (
  'adaptive-v11-balanced-characteristics',
  'OVR adaptativo v11 — características balanceadas',
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
    -- Uma rodada excelente ainda aparece imediatamente, mas duas semanas nao
    -- bastam para um atleta provisório abrir vantagem de jogador consolidado.
    'maxChangePerRound', 1.5,
    'weeklyEvidenceCap', true,
    -- O peso da caracteristica ja entra na confianca e no OVR geral. Repeti-lo
    -- aqui fazia 50% virar, na pratica, uma penalizacao aplicada duas vezes.
    'traitWeightedChange', false,
    'traitBasedOverall', true,
    'overallConfidenceShrink', false,
    'rankedTraitOverall', true,
    'performanceChangeBonus', 0.03,
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

-- As cartas passam a preferir a v11 somente depois de existir um calculo
-- concluido. Ate la, a v10 continua sendo usada como fallback seguro.
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
      'adaptive-v11-balanced-characteristics',
      'adaptive-v10-role-reframe',
      'adaptive-v9-player-form-trend-shadow',
      'adaptive-v8-soft-progression-shadow'
    )
      and run.status in ('succeeded', 'published')
    order by
      case formula.key
        when 'adaptive-v11-balanced-characteristics' then 0
        when 'adaptive-v10-role-reframe' then 1
        when 'adaptive-v9-player-form-trend-shadow' then 2
        else 3
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
