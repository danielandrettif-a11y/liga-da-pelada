-- Inventario agregado e somente leitura para origem oficial e destino restaurado.
-- Execute com psql -X -q -t -A -F $'\t' -v ON_ERROR_STOP=1 -f deste-arquivo.
-- A saida contem apenas nomes, contagens e digests de metadados; nao contem linhas.
WITH
public_tables AS (
  SELECT c.relname
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
),
exact_counts AS (
  SELECT
    relname,
    ((xpath(
      '/row/count/text()',
      query_to_xml(
        format('SELECT count(*) AS count FROM public.%I', relname),
        false,
        true,
        ''
      )
    ))[1]::text)::bigint AS row_count
  FROM public_tables
),
counts_payload AS (
  SELECT jsonb_build_object(
    'table_count', count(*),
    'total_rows', sum(row_count),
    'rows', jsonb_object_agg(relname, row_count ORDER BY relname)
  ) AS payload
  FROM exact_counts
),
columns_sig AS (
  SELECT
    count(*) AS object_count,
    md5(string_agg(
      concat_ws('|', table_schema, table_name, ordinal_position, column_name,
        data_type, udt_schema, udt_name, is_nullable,
        coalesce(column_default, ''), is_generated,
        coalesce(generation_expression, '')),
      E'\n' ORDER BY table_schema, table_name, ordinal_position
    )) AS digest
  FROM information_schema.columns
  WHERE table_schema IN ('public', 'auth', 'storage')
),
functions_sig AS (
  SELECT
    count(*) AS object_count,
    md5(string_agg(
      pg_get_functiondef(p.oid),
      E'\n' ORDER BY n.nspname, p.proname,
        pg_get_function_identity_arguments(p.oid)
    )) AS digest
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'auth', 'storage')
),
policies_sig AS (
  SELECT
    count(*) AS object_count,
    md5(string_agg(
      concat_ws('|', schemaname, tablename, policyname, permissive,
        roles::text, cmd, coalesce(qual, ''), coalesce(with_check, '')),
      E'\n' ORDER BY schemaname, tablename, policyname
    )) AS digest
  FROM pg_catalog.pg_policies
  WHERE schemaname IN ('public', 'auth', 'storage')
),
indexes_sig AS (
  SELECT
    count(*) AS object_count,
    md5(string_agg(
      concat_ws('|', schemaname, tablename, indexname, indexdef),
      E'\n' ORDER BY schemaname, tablename, indexname
    )) AS digest
  FROM pg_catalog.pg_indexes
  WHERE schemaname IN ('public', 'auth', 'storage')
),
triggers_sig AS (
  SELECT
    count(*) AS object_count,
    md5(string_agg(
      pg_get_triggerdef(t.oid, true),
      E'\n' ORDER BY n.nspname, c.relname, t.tgname
    )) AS digest
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'auth', 'storage')
    AND NOT t.tgisinternal
),
rls_sig AS (
  SELECT
    count(*) FILTER (WHERE c.relrowsecurity) AS enabled,
    count(*) FILTER (WHERE c.relforcerowsecurity) AS forced,
    md5(string_agg(
      concat_ws('|', n.nspname, c.relname, c.relrowsecurity,
        c.relforcerowsecurity),
      E'\n' ORDER BY n.nspname, c.relname
    )) AS digest
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'auth', 'storage')
    AND c.relkind IN ('r', 'p')
),
signatures_payload AS (
  SELECT jsonb_build_object(
    'columns', jsonb_build_object(
      'count', columns_sig.object_count, 'md5', columns_sig.digest),
    'functions', jsonb_build_object(
      'count', functions_sig.object_count, 'md5', functions_sig.digest),
    'policies', jsonb_build_object(
      'count', policies_sig.object_count, 'md5', policies_sig.digest),
    'indexes', jsonb_build_object(
      'count', indexes_sig.object_count, 'md5', indexes_sig.digest),
    'triggers', jsonb_build_object(
      'count', triggers_sig.object_count, 'md5', triggers_sig.digest),
    'rls', jsonb_build_object(
      'enabled', rls_sig.enabled, 'forced', rls_sig.forced,
      'md5', rls_sig.digest),
    'auth', jsonb_build_object(
      'users', (SELECT count(*) FROM auth.users),
      'identities', (SELECT count(*) FROM auth.identities),
      'sessions', (SELECT count(*) FROM auth.sessions)),
    'storage', jsonb_build_object(
      'buckets', (SELECT count(*) FROM storage.buckets),
      'objects', (SELECT count(*) FROM storage.objects),
      'bytes', (SELECT coalesce(sum(
        CASE
          WHEN metadata->>'size' ~ '^[0-9]+$'
            THEN (metadata->>'size')::bigint
          ELSE 0
        END
      ), 0) FROM storage.objects))
  ) AS payload
  FROM columns_sig, functions_sig, policies_sig, indexes_sig,
    triggers_sig, rls_sig
)
SELECT 'exact_public_counts' AS section, payload
FROM counts_payload
UNION ALL
SELECT 'signatures' AS section, payload
FROM signatures_payload
ORDER BY section;
