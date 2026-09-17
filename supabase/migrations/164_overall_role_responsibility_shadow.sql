-- V4 mantém o OVR em modo sombra, mas passa a usar a função congelada da
-- rodada como responsabilidade de evidência, não como bônus permanente.

alter table public.player_overall_round_breakdowns
  add column if not exists played_profile text
    check (played_profile in ('defensive', 'midfield', 'offensive')),
  add column if not exists role_evidence jsonb not null default '{}'::jsonb;

insert into public.overall_formula_versions (key, label, config)
values (
  'adaptive-v4-role-responsibility-shadow',
  'OVR adaptativo v4 — responsabilidade por posição',
  jsonb_build_object(
    'base', 70,
    'legacyInitialTagBonus', 3,
    'seedFadeRounds', 3,
    'confidenceRounds', 3,
    'goalkeeperEligibilityRounds', 3,
    'positionCaps', jsonb_build_object('1', 74, '2', 76, '3', 78),
    'staleAfterRounds', 4,
    'halfLifeRounds', 3,
    'recentRoundWindow', 8,
    'maxChangePerRound', 2,
    'defensiveWeights', jsonb_build_object('concededRate', 0.50, 'survival', 0.35, 'exposure', 0.10, 'discipline', 0.05),
    'legacyTimingConfidence', 0.75,
    'assistValue', 0.65,
    'attackCurve', 0.32,
    'positionWeights', jsonb_build_object(
      'DEF', jsonb_build_object('defense', 0.85, 'attack', 0.10, 'result', 0.05),
      'ALA_MEI', jsonb_build_object('defense', 0.45, 'attack', 0.45, 'result', 0.10),
      'ATA', jsonb_build_object('defense', 0.15, 'attack', 0.75, 'result', 0.10)
    ),
    'roleEvidence', jsonb_build_object(
      'DEF', jsonb_build_object('DEF', 1, 'ALA_MEI', 0.45, 'ATA', 0.15),
      'ALA_MEI', jsonb_build_object('DEF', 0.50, 'ALA_MEI', 1, 'ATA', 0.50),
      'ATA', jsonb_build_object('DEF', 0.15, 'ALA_MEI', 0.45, 'ATA', 1)
    ),
    'unassignedRoleEvidence', jsonb_build_object('DEF', 0.40, 'ALA_MEI', 0.55, 'ATA', 0.40)
  )
)
on conflict (key) do update set label = excluded.label, config = excluded.config;

notify pgrst, 'reload schema';
