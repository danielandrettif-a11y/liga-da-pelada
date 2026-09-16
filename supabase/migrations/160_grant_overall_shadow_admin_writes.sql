-- As políticas RLS já restringem escrita aos administradores. Esta migration
-- concede os privilégios SQL correspondentes para que as políticas possam ser
-- avaliadas ao criar e finalizar rascunhos do OVR em modo sombra.

GRANT INSERT, UPDATE, DELETE ON public.overall_formula_versions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.overall_calculation_runs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.player_overall_snapshots TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.overall_feature_flags TO authenticated;
