-- Corrige a auditoria ao final da uniao de perfis.
-- A tabela leagues usa a chave primaria `id`, nao `league_id`.
-- A substituicao da definicao preserva toda a consolidacao transacional
-- criada na migration 041 e altera somente a consulta de auditoria.

DO $migration$
DECLARE
  function_definition TEXT;
  broken_fragment CONSTANT TEXT := 'SELECT league_id, ''profiles_merged'', auth.uid()';
  fixed_fragment CONSTANT TEXT := 'SELECT id, ''profiles_merged'', auth.uid()';
BEGIN
  SELECT pg_get_functiondef(
    'public.merge_selectable_player_profiles(uuid,uuid)'::regprocedure
  )
  INTO function_definition;

  IF position(broken_fragment IN function_definition) > 0 THEN
    function_definition := replace(
      function_definition,
      broken_fragment,
      fixed_fragment
    );
    EXECUTE function_definition;
  ELSIF position(fixed_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Nao foi possivel localizar a consulta de auditoria em merge_selectable_player_profiles.';
  END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION public.merge_selectable_player_profiles(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_selectable_player_profiles(UUID, UUID) TO authenticated;

