-- Torna a otimização da 335 independente do search_path do papel de restore.
BEGIN;
SET LOCAL search_path = public, pg_catalog;

DO $$
DECLARE
  policy_row record;
  using_expression text;
  check_expression text;
  optimized_using text;
  optimized_check text;
  alter_parts text[];
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') ~ 'auth\.(uid|role|jwt)\(\)'
        OR coalesce(with_check, '') ~ 'auth\.(uid|role|jwt)\(\)'
      )
  LOOP
    using_expression := policy_row.qual;
    check_expression := policy_row.with_check;

    IF using_expression IS NOT NULL THEN
      optimized_using := regexp_replace(using_expression, '\(\s*select\s+auth\.uid\(\)(?:\s+as\s+[a-z_][a-z0-9_]*)?\s*\)', '__AUTH_UID__', 'gi');
      optimized_using := regexp_replace(optimized_using, '\(\s*select\s+auth\.role\(\)(?:\s+as\s+[a-z_][a-z0-9_]*)?\s*\)', '__AUTH_ROLE__', 'gi');
      optimized_using := regexp_replace(optimized_using, '\(\s*select\s+auth\.jwt\(\)(?:\s+as\s+[a-z_][a-z0-9_]*)?\s*\)', '__AUTH_JWT__', 'gi');
      optimized_using := replace(optimized_using, 'auth.uid()', '(select auth.uid())');
      optimized_using := replace(optimized_using, 'auth.role()', '(select auth.role())');
      optimized_using := replace(optimized_using, 'auth.jwt()', '(select auth.jwt())');
      optimized_using := replace(optimized_using, '__AUTH_UID__', '(select auth.uid())');
      optimized_using := replace(optimized_using, '__AUTH_ROLE__', '(select auth.role())');
      optimized_using := replace(optimized_using, '__AUTH_JWT__', '(select auth.jwt())');
    END IF;

    IF check_expression IS NOT NULL THEN
      optimized_check := regexp_replace(check_expression, '\(\s*select\s+auth\.uid\(\)(?:\s+as\s+[a-z_][a-z0-9_]*)?\s*\)', '__AUTH_UID__', 'gi');
      optimized_check := regexp_replace(optimized_check, '\(\s*select\s+auth\.role\(\)(?:\s+as\s+[a-z_][a-z0-9_]*)?\s*\)', '__AUTH_ROLE__', 'gi');
      optimized_check := regexp_replace(optimized_check, '\(\s*select\s+auth\.jwt\(\)(?:\s+as\s+[a-z_][a-z0-9_]*)?\s*\)', '__AUTH_JWT__', 'gi');
      optimized_check := replace(optimized_check, 'auth.uid()', '(select auth.uid())');
      optimized_check := replace(optimized_check, 'auth.role()', '(select auth.role())');
      optimized_check := replace(optimized_check, 'auth.jwt()', '(select auth.jwt())');
      optimized_check := replace(optimized_check, '__AUTH_UID__', '(select auth.uid())');
      optimized_check := replace(optimized_check, '__AUTH_ROLE__', '(select auth.role())');
      optimized_check := replace(optimized_check, '__AUTH_JWT__', '(select auth.jwt())');
    END IF;

    alter_parts := ARRAY[]::text[];
    IF using_expression IS NOT NULL AND optimized_using IS DISTINCT FROM using_expression THEN
      alter_parts := array_append(alter_parts, 'USING (' || optimized_using || ')');
    END IF;
    IF check_expression IS NOT NULL AND optimized_check IS DISTINCT FROM check_expression THEN
      alter_parts := array_append(alter_parts, 'WITH CHECK (' || optimized_check || ')');
    END IF;

    IF cardinality(alter_parts) > 0 THEN
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I %s',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename,
        array_to_string(alter_parts, ' ')
      );
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
