-- APP ORIGINAL: ponte somente de leitura para o BQ Manager.
-- O banco do jogo tem migrations próprias em manager/supabase/migrations.
-- Não expõe dados de conta, pagamentos, atributos privados ou escrita no app.
CREATE OR REPLACE FUNCTION public.get_manager_player_catalog()
RETURNS TABLE (
  player_id UUID, name TEXT, avatar_url TEXT, snapshot_id UUID,
  formula TEXT, captured_at TIMESTAMPTZ, overall NUMERIC,
  def_overall NUMERIC, ala_mei_overall NUMERIC, ata_overall NUMERIC, gol_overall NUMERIC,
  traits TEXT[], goalkeeper_eligible BOOLEAN, trend TEXT,
  rounds INTEGER, goals INTEGER, assists INTEGER
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT DISTINCT ON (p.id)
    p.id, COALESCE(NULLIF(p.nickname, ''), p.name)::TEXT, p.avatar_url::TEXT,
    s.id, f.key, s.created_at, s.overall,
    s.def_overall, s.ala_mei_overall, s.ata_overall, s.gol_overall,
    p.overall_traits::TEXT[],
    (p.is_goalkeeper AND s.goalkeeper_rounds >= COALESCE((f.config->>'goalkeeperEligibilityRounds')::INTEGER, 3)),
    COALESCE(s.data_quality->>'overall_trend', 'steady'), s.rounds_played,
    COALESCE((s.data_quality->'scout_totals'->>'goals')::INTEGER, 0),
    COALESCE((s.data_quality->'scout_totals'->>'assists')::INTEGER, 0)
  FROM public.players p
  JOIN public.player_overall_snapshots s ON s.player_id = p.id
  JOIN public.overall_calculation_runs r ON r.id = s.calculation_run_id
  JOIN public.overall_formula_versions f ON f.id = r.formula_version_id
  WHERE p.member_category = 'player' AND p.is_selectable = true
    AND cardinality(p.overall_traits) > 0
    AND f.key = 'adaptive-v11-balanced-characteristics'
    AND r.status IN ('succeeded', 'published')
  ORDER BY p.id, r.created_at DESC, r.id DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_manager_player_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_player_catalog() TO authenticated;
NOTIFY pgrst, 'reload schema';
