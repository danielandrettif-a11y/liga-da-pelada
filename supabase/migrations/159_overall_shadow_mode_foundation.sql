-- Fundação aditiva do OVR adaptativo. Nada aqui altera ranking, Cartola,
-- encerramento de rodada ou sorteio enquanto as chaves permanecerem desligadas.

CREATE TABLE IF NOT EXISTS public.overall_formula_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.overall_calculation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_version_id UUID NOT NULL REFERENCES public.overall_formula_versions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'processing', 'succeeded', 'published', 'discarded', 'failed')),
  source_through_round_id UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.player_overall_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_run_id UUID NOT NULL REFERENCES public.overall_calculation_runs(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  overall NUMERIC(4,1) NOT NULL CHECK (overall >= 40 AND overall <= 99),
  def_overall NUMERIC(4,1) NOT NULL CHECK (def_overall >= 40 AND def_overall <= 99),
  ala_mei_overall NUMERIC(4,1) NOT NULL CHECK (ala_mei_overall >= 40 AND ala_mei_overall <= 99),
  ata_overall NUMERIC(4,1) NOT NULL CHECK (ata_overall >= 40 AND ata_overall <= 99),
  gol_overall NUMERIC(4,1) NOT NULL CHECK (gol_overall >= 40 AND gol_overall <= 99),
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  rounds_played INTEGER NOT NULL DEFAULT 0 CHECK (rounds_played >= 0),
  goalkeeper_rounds INTEGER NOT NULL DEFAULT 0 CHECK (goalkeeper_rounds >= 0),
  is_provisional BOOLEAN NOT NULL DEFAULT true,
  is_stale BOOLEAN NOT NULL DEFAULT false,
  last_round_id UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  data_quality JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (calculation_run_id, player_id)
);

CREATE INDEX IF NOT EXISTS player_overall_snapshots_player_idx
  ON public.player_overall_snapshots (player_id, calculation_run_id);
CREATE INDEX IF NOT EXISTS overall_calculation_runs_status_idx
  ON public.overall_calculation_runs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.overall_feature_flags (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  calculation_enabled BOOLEAN NOT NULL DEFAULT false,
  ui_enabled BOOLEAN NOT NULL DEFAULT false,
  balance_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_rebuild_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.overall_formula_versions (key, label, config)
VALUES (
  'adaptive-v1-shadow',
  'OVR adaptativo — modo sombra',
  '{"base":70,"initialTagBonus":3,"provisionalRounds":5,"staleAfterRounds":6,"maxChangePerRound":2,"halfLifeRounds":8,"recentRoundWindow":20}'::JSONB
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.overall_feature_flags (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.overall_formula_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overall_calculation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_overall_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overall_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read overall shadow data"
  ON public.overall_formula_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read own overall shadow data"
  ON public.player_overall_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage overall formula versions"
  ON public.overall_formula_versions FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "Admins manage overall calculation runs"
  ON public.overall_calculation_runs FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "Admins manage overall snapshots"
  ON public.player_overall_snapshots FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());
CREATE POLICY "Admins manage overall flags"
  ON public.overall_feature_flags FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

GRANT SELECT ON public.overall_formula_versions, public.overall_calculation_runs,
  public.player_overall_snapshots, public.overall_feature_flags TO authenticated;
