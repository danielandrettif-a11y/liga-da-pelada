-- OVR v7: a característica define a evidência uma única vez e também quais
-- notas formam o OVR geral. Evita comprimir ou bonificar o mesmo peso em três
-- etapas diferentes do cálculo.

insert into public.overall_formula_versions (key, label, config)
values (
  'adaptive-v7-trait-composed-shadow',
  'OVR adaptativo v7 — composição por características',
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
    'defensiveWeights', jsonb_build_object('concededRate', 0.50, 'survival', 0.35, 'exposure', 0.10, 'discipline', 0.05),
    'legacyTimingConfidence', 0.75,
    'assistValue', 0.65,
    'attackCurve', 0.32,
    'positionWeights', jsonb_build_object(
      'DEF', jsonb_build_object('defense', 0.85, 'attack', 0.10, 'result', 0.05),
      'ALA_MEI', jsonb_build_object('defense', 0.45, 'attack', 0.45, 'result', 0.10),
      'ATA', jsonb_build_object('defense', 0.15, 'attack', 0.75, 'result', 0.10)
    ),
    'unselectedTraitEvidence', 0.15
  )
)
on conflict (key) do update set label = excluded.label, config = excluded.config;

notify pgrst, 'reload schema';
