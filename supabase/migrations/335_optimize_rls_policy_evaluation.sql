-- Evita reavaliar auth.uid()/auth.role()/auth.jwt() para cada linha e remove
-- a sobreposicao SELECT causada por politicas ALL + SELECT. A transformacao
-- preserva as expressoes e os papeis originais.
BEGIN;

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
    SELECT
      schemaname,
      tablename,
      policyname,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') ~ 'auth\.(uid|role|jwt)\(\)'
        OR coalesce(with_check, '') ~ 'auth\.(uid|role|jwt)\(\)'
      )
  LOOP
    using_expression := policy_row.qual;
    check_expression := policy_row.with_check;

    -- Normaliza formas ja otimizadas para marcadores antes de substituir as
    -- chamadas restantes. Assim o bloco tambem e seguro em reaplicacoes.
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

DO $$
DECLARE
  policy_row record;
  role_list text;
  using_clause text;
  check_clause text;
  insert_policy_name text;
  update_policy_name text;
  delete_policy_name text;
BEGIN
  FOR policy_row IN
    SELECT source.*
    FROM pg_policies source
    WHERE source.schemaname = 'public'
      AND source.cmd = 'ALL'
      AND EXISTS (
        SELECT 1
        FROM pg_policies reader
        WHERE reader.schemaname = source.schemaname
          AND reader.tablename = source.tablename
          AND reader.cmd = 'SELECT'
      )
  LOOP
    role_list := (
      SELECT string_agg(quote_ident(role_name), ', ')
      FROM unnest(policy_row.roles) AS role_name
    );
    using_clause := coalesce(policy_row.qual, 'true');
    check_clause := coalesce(policy_row.with_check, policy_row.qual, 'true');
    insert_policy_name := left(policy_row.policyname, 52) || '_insert';
    update_policy_name := left(policy_row.policyname, 52) || '_update';
    delete_policy_name := left(policy_row.policyname, 52) || '_delete';

    EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = policy_row.schemaname AND tablename = policy_row.tablename AND policyname = insert_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR INSERT TO %s WITH CHECK (%s)',
        insert_policy_name, policy_row.schemaname, policy_row.tablename, role_list, check_clause
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = policy_row.schemaname AND tablename = policy_row.tablename AND policyname = update_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR UPDATE TO %s USING (%s) WITH CHECK (%s)',
        update_policy_name, policy_row.schemaname, policy_row.tablename, role_list, using_clause, check_clause
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = policy_row.schemaname AND tablename = policy_row.tablename AND policyname = delete_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR DELETE TO %s USING (%s)',
        delete_policy_name, policy_row.schemaname, policy_row.tablename, role_list, using_clause
      );
    END IF;
  END LOOP;
END;
$$;

-- Politicas permissivas da mesma tabela/comando/papeis sao combinadas com OR
-- pelo proprio PostgreSQL. Materializar esse OR em uma unica policy evita que
-- cada linha execute duas ou mais arvores RLS equivalentes.
DO $$
DECLARE
  policy_group record;
  policy_name text;
  old_policy_name text;
  role_list text;
BEGIN
  FOR policy_group IN
    SELECT
      schemaname,
      tablename,
      cmd,
      roles,
      array_agg(policyname ORDER BY policyname) AS policy_names,
      string_agg('(' || coalesce(qual, 'true') || ')', ' OR ' ORDER BY policyname) AS using_clause,
      string_agg('(' || coalesce(with_check, qual, 'true') || ')', ' OR ' ORDER BY policyname) AS check_clause
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
      AND cmd <> 'ALL'
    GROUP BY schemaname, tablename, cmd, roles
    HAVING count(*) > 1
  LOOP
    role_list := (
      SELECT string_agg(quote_ident(role_name), ', ')
      FROM unnest(policy_group.roles) AS role_name
    );
    policy_name := left(
      'optimized_' || policy_group.tablename || '_' || lower(policy_group.cmd),
      54
    ) || '_' || substr(md5(array_to_string(policy_group.policy_names, ',')), 1, 8);

    FOREACH old_policy_name IN ARRAY policy_group.policy_names LOOP
      EXECUTE format(
        'DROP POLICY %I ON %I.%I',
        old_policy_name,
        policy_group.schemaname,
        policy_group.tablename
      );
    END LOOP;

    IF policy_group.cmd = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR SELECT TO %s USING (%s)',
        policy_name, policy_group.schemaname, policy_group.tablename,
        role_list, policy_group.using_clause
      );
    ELSIF policy_group.cmd = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR INSERT TO %s WITH CHECK (%s)',
        policy_name, policy_group.schemaname, policy_group.tablename,
        role_list, policy_group.check_clause
      );
    ELSIF policy_group.cmd = 'UPDATE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR UPDATE TO %s USING (%s) WITH CHECK (%s)',
        policy_name, policy_group.schemaname, policy_group.tablename,
        role_list, policy_group.using_clause, policy_group.check_clause
      );
    ELSIF policy_group.cmd = 'DELETE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR DELETE TO %s USING (%s)',
        policy_name, policy_group.schemaname, policy_group.tablename,
        role_list, policy_group.using_clause
      );
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
