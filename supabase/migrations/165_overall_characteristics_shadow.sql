-- OVR v5: características escolhidas pelo administrador, sem usar a posição
-- operacional do Cartola como evidência do jogador.

alter table public.players
  add column if not exists overall_traits text[] not null default '{}'::text[];

alter table public.players
  drop constraint if exists players_overall_traits_values_check;

alter table public.players
  add constraint players_overall_traits_values_check check (
    cardinality(overall_traits) <= 3
    and overall_traits <@ array['defensive', 'midfield', 'offensive']::text[]
  );

alter table public.player_overall_round_breakdowns
  add column if not exists trait_evidence jsonb not null default '{}'::jsonb;

insert into public.overall_formula_versions (key, label, config)
values (
  'adaptive-v5-characteristics-shadow',
  'OVR adaptativo v5 — características ponderadas',
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
