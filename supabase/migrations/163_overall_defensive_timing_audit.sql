-- Auditoria por rodada para a fórmula adaptativa v3. O modo continua sombra:
-- nenhuma dessas tabelas alimenta Cartola, ranking ou sorteio.
create table if not exists public.player_overall_round_breakdowns (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.overall_calculation_runs(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  round_date date not null,
  round_index integer not null check (round_index >= 0),
  goals numeric(8,3) not null default 0,
  assists numeric(8,3) not null default 0,
  own_goals numeric(8,3) not null default 0,
  goals_conceded numeric(8,3) not null default 0,
  attacking_score numeric(6,4) not null,
  defensive_score numeric(6,4) not null,
  timing_quality text not null check (timing_quality in ('exact', 'fallback')),
  positions jsonb not null,
  position_confidence jsonb not null,
  created_at timestamptz not null default now(),
  unique (calculation_run_id, player_id, round_id)
);

create index if not exists player_overall_round_breakdowns_run_player_idx
  on public.player_overall_round_breakdowns (calculation_run_id, player_id, round_index desc);

-- Impede dois cliques simultâneos de misturarem históricos no mesmo cálculo.
create unique index if not exists overall_calculation_runs_one_processing_per_formula_idx
  on public.overall_calculation_runs (formula_version_id)
  where status = 'processing';

alter table public.player_overall_round_breakdowns enable row level security;

drop policy if exists "Authenticated users can read overall breakdowns" on public.player_overall_round_breakdowns;
create policy "Authenticated users can read overall breakdowns"
  on public.player_overall_round_breakdowns for select to authenticated using (true);

drop policy if exists "Admins manage overall breakdowns" on public.player_overall_round_breakdowns;
create policy "Admins manage overall breakdowns"
  on public.player_overall_round_breakdowns for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

grant select, insert, update, delete on public.player_overall_round_breakdowns to authenticated;

insert into public.overall_formula_versions (key, label, config)
values (
  'adaptive-v3-defensive-timing-shadow',
  'OVR adaptativo v3 — defesa por tempo do gol',
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
    'legacyTimingConfidence', 0.75
  )
)
on conflict (key) do update set label = excluded.label, config = excluded.config;

notify pgrst, 'reload schema';
