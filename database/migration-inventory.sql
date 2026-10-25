-- Execute com psql -X -q -t -A -v ON_ERROR_STOP=1 -f migration-inventory.sql.
-- Saida: uma linha schema.tabela<TAB>contagem por tabela. Nao contem dados pessoais.
-- A transacao read-only mantem todas as contagens no mesmo snapshot.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT format(
  'SELECT %L || chr(9) || count(*)::text FROM %I.%I;',
  n.nspname || '.' || c.relname,
  n.nspname,
  c.relname
)
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND (
    n.nspname = 'public'
    OR (n.nspname = 'auth' AND c.relname = 'users')
    OR (n.nspname = 'storage' AND c.relname IN ('buckets', 'objects'))
  )
ORDER BY n.nspname, c.relname
\gexec

COMMIT;
