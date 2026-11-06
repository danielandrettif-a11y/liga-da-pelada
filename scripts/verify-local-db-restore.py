#!/usr/bin/env python3

import argparse
import re
import subprocess
import sys
from pathlib import Path


COPY_HEADER = re.compile(
    r'^COPY (?:(?:"([^"]+)")|([A-Za-z_][A-Za-z0-9_$]*))\.'
    r'(?:(?:"([^"]+)")|([A-Za-z_][A-Za-z0-9_$]*)) \('
)


def run(command, *, input_text=None):
    return subprocess.run(
        command,
        input=input_text,
        text=True,
        capture_output=True,
        check=True,
    ).stdout


def psql(container, database, sql):
    return run(
        [
            'docker', 'exec', '-i', container,
            'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
            '-U', 'supabase_admin', '-d', database,
        ],
        input_text=sql,
    )


def parse_inventory(output, label):
    inventory = {}
    for line_number, raw_line in enumerate(output.splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) != 2 or not parts[1].isdigit():
            raise ValueError(f'{label}:{line_number}: inventario invalido')
        if parts[0] in inventory:
            raise ValueError(f'{label}:{line_number}: tabela duplicada {parts[0]}')
        inventory[parts[0]] = int(parts[1])
    return inventory


def archive_inventory(container, archive_path):
    process = subprocess.Popen(
        [
            'docker', 'exec', container,
            'pg_restore', '--data-only', '--no-owner', '--no-privileges',
            '-f', '-', archive_path,
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    inventory = {}
    current_table = None
    current_count = 0
    assert process.stdout is not None
    for line in process.stdout:
        if current_table is None:
            match = COPY_HEADER.match(line)
            if match:
                schema = match.group(1) or match.group(2)
                table = match.group(3) or match.group(4)
                if schema == 'public' or (
                    schema == 'auth' and table == 'users'
                ) or (
                    schema == 'storage' and table in {'buckets', 'objects'}
                ):
                    current_table = f'{schema}.{table}'
                    current_count = 0
        elif line == '\\.\n' or line == '\\.\r\n':
            if current_table in inventory:
                raise ValueError(f'COPY duplicado no arquivo: {current_table}')
            inventory[current_table] = current_count
            current_table = None
        else:
            current_count += 1
    stderr = process.stderr.read() if process.stderr is not None else ''
    return_code = process.wait()
    if return_code:
        raise RuntimeError(f'pg_restore nao conseguiu ler os dados: {stderr.strip()}')
    if current_table is not None:
        raise ValueError(f'COPY incompleto no arquivo: {current_table}')
    return inventory


SCHEMA_INVENTORY_SQL = r'''
WITH object_rows AS (
  SELECT
    'column'::text AS kind,
    format('%I.%I.%I', n.nspname, c.relname, a.attname) AS object_key,
    md5(concat_ws('|',
      pg_catalog.format_type(a.atttypid, a.atttypmod),
      a.attnotnull::text,
      coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), ''),
      a.attidentity::text,
      a.attgenerated::text
    )) AS digest
  FROM pg_catalog.pg_attribute AS a
  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_attrdef AS d
    ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname IN ('public', 'auth', 'storage')
    AND c.relkind IN ('r', 'p', 'v', 'm')
    AND a.attnum > 0
    AND NOT a.attisdropped

  UNION ALL

  SELECT
    'function',
    format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)),
    md5(regexp_replace(pg_catalog.pg_get_functiondef(p.oid), '\s+', ' ', 'g'))
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'auth', 'storage')

  UNION ALL

  SELECT
    'view',
    format('%I.%I', n.nspname, c.relname),
    md5(regexp_replace(pg_catalog.pg_get_viewdef(c.oid, true), '\s+', ' ', 'g'))
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'auth', 'storage')
    AND c.relkind IN ('v', 'm')

  UNION ALL

  SELECT
    'constraint',
    format('%I.%I.%I', n.nspname, c.relname, con.conname),
    md5(pg_catalog.pg_get_constraintdef(con.oid, true))
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'auth', 'storage')

  UNION ALL

  SELECT
    'index',
    format('%I.%I', schemaname, indexname),
    md5(regexp_replace(indexdef, '\s+', ' ', 'g'))
  FROM pg_catalog.pg_indexes
  WHERE schemaname IN ('public', 'auth', 'storage')

  UNION ALL

  SELECT
    'policy',
    format('%I.%I.%I', schemaname, tablename, policyname),
    md5(concat_ws('|', permissive, cmd, roles::text, coalesce(qual, ''), coalesce(with_check, '')))
  FROM pg_catalog.pg_policies
  WHERE schemaname IN ('public', 'auth', 'storage')

  UNION ALL

  SELECT
    'trigger',
    format('%I.%I.%I', n.nspname, c.relname, t.tgname),
    md5(regexp_replace(pg_catalog.pg_get_triggerdef(t.oid, true), '\s+', ' ', 'g'))
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'auth', 'storage')
    AND NOT t.tgisinternal

  UNION ALL

  SELECT
    'relation_security',
    format('%I.%I', n.nspname, c.relname),
    md5(concat_ws('|', c.relrowsecurity::text, c.relforcerowsecurity::text))
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'auth', 'storage')
    AND c.relkind IN ('r', 'p')

  UNION ALL

  SELECT
    'grant',
    format('%I.%I.%I.%s', n.nspname, c.relname, grantee.rolname, acl.privilege_type),
    md5(acl.is_grantable::text)
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
    c.relacl,
    pg_catalog.acldefault((CASE WHEN c.relkind = 'S' THEN 'S' ELSE 'r' END)::"char", c.relowner)
  )) AS acl
  JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  WHERE n.nspname IN ('public', 'auth', 'storage')
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S')

  UNION ALL

  SELECT
    'function_grant',
    format('%I.%I(%s).%I.%s', n.nspname, p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid), grantee.rolname, acl.privilege_type),
    md5(acl.is_grantable::text)
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
  ) AS acl
  JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  WHERE n.nspname IN ('public', 'auth', 'storage')

  UNION ALL

  SELECT
    'schema_grant',
    format('%I.%I.%s', n.nspname, grantee.rolname, acl.privilege_type),
    md5(acl.is_grantable::text)
  FROM pg_catalog.pg_namespace AS n
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
  ) AS acl
  JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  WHERE n.nspname IN ('public', 'auth', 'storage')

  UNION ALL

  SELECT
    'column_grant',
    format('%I.%I.%I.%I.%s', n.nspname, c.relname, a.attname,
      grantee.rolname, acl.privilege_type),
    md5(acl.is_grantable::text)
  FROM pg_catalog.pg_attribute AS a
  JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) AS acl
  JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  WHERE n.nspname IN ('public', 'auth', 'storage')
    AND a.attnum > 0
    AND NOT a.attisdropped

  UNION ALL

  SELECT
    'owner',
    format('%I.%I', n.nspname, c.relname),
    md5(owner.rolname)
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_roles AS owner ON owner.oid = c.relowner
  WHERE n.nspname IN ('public', 'auth', 'storage')
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S')

  UNION ALL

  SELECT
    'function_owner',
    format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)),
    md5(owner.rolname)
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_roles AS owner ON owner.oid = p.proowner
  WHERE n.nspname IN ('public', 'auth', 'storage')

  UNION ALL

  SELECT
    'extension',
    extname,
    md5(extversion)
  FROM pg_catalog.pg_extension
)
SELECT kind || chr(9) || object_key || chr(9) || digest
FROM object_rows
ORDER BY kind, object_key;
'''


ROLE_INVENTORY_SQL = r'''
WITH relevant_roles AS (
  SELECT oid, rolname, rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls
  FROM pg_catalog.pg_roles
  WHERE rolname IN (
    'anon', 'authenticated', 'authenticator', 'liga_backend', 'postgres',
    'service_role', 'supabase_admin', 'supabase_auth_admin',
    'supabase_functions_admin', 'supabase_realtime_admin', 'supabase_storage_admin'
  )
), rows AS (
  SELECT
    'role'::text AS kind,
    rolname AS object_key,
    md5(concat_ws('|', rolcanlogin::text, rolsuper::text, rolinherit::text,
      rolcreaterole::text, rolcreatedb::text, rolreplication::text, rolbypassrls::text)) AS digest
  FROM relevant_roles

  UNION ALL

  SELECT
    'membership',
    member.rolname || '->' || granted.rolname,
    md5(m.admin_option::text)
  FROM pg_catalog.pg_auth_members AS m
  JOIN relevant_roles AS granted ON granted.oid = m.roleid
  JOIN relevant_roles AS member ON member.oid = m.member
)
SELECT kind || chr(9) || object_key || chr(9) || digest
FROM rows
ORDER BY kind, object_key;
'''


MIGRATION_LEDGER_SQL = r'''
SELECT version || chr(9) || md5(coalesce(name, ''))
FROM supabase_migrations.schema_migrations
ORDER BY version;
'''


def parse_object_inventory(output, label):
    rows = {}
    for line_number, raw_line in enumerate(output.splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) != 3:
            raise ValueError(f'{label}:{line_number}: linha de objeto invalida')
        key = (parts[0], parts[1])
        if key in rows:
            raise ValueError(f'{label}:{line_number}: objeto duplicado {parts[0]} {parts[1]}')
        rows[key] = parts[2]
    return rows


def parse_ledger(output, label):
    rows = {}
    for line_number, raw_line in enumerate(output.splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) != 2:
            raise ValueError(f'{label}:{line_number}: ledger invalido')
        rows[parts[0]] = parts[1]
    return rows


def migration_ledger(container, database, label):
    presence = psql(
        container,
        database,
        "SELECT CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL "
        "THEN 'absent' ELSE 'present' END;",
    ).strip()
    if presence == 'absent':
        return {'__presence__': 'absent'}
    if presence != 'present':
        raise ValueError(f'{label}: estado inesperado do ledger')
    rows = parse_ledger(psql(container, database, MIGRATION_LEDGER_SQL), label)
    rows['__presence__'] = 'present'
    return rows


def compare(label, source, destination):
    differences = []
    for key in sorted(set(source) | set(destination), key=str):
        if source.get(key) != destination.get(key):
            differences.append(key)
    if differences:
        print(f'{label}=divergent differences={len(differences)}', file=sys.stderr)
        for key in differences[:50]:
            printable = '.'.join(key) if isinstance(key, tuple) else key
            print(f'  {printable}', file=sys.stderr)
        if len(differences) > 50:
            print(f'  ... {len(differences) - 50} diferencas omitidas', file=sys.stderr)
        return False
    print(f'{label}=identical entries={len(source)}')
    return True


def main():
    parser = argparse.ArgumentParser(
        description='Compara um pg_dump restaurado localmente sem imprimir dados de linhas.'
    )
    parser.add_argument('--archive-container-path', default='/tmp/source.dump')
    parser.add_argument('--source-container', default='supabase-db')
    parser.add_argument('--source-database', default='postgres')
    parser.add_argument('--destination-container', required=True)
    parser.add_argument('--destination-database', required=True)
    parser.add_argument(
        '--inventory-sql',
        default=str(Path(__file__).resolve().parents[1] / 'database' / 'migration-inventory.sql'),
    )
    args = parser.parse_args()

    inventory_sql = Path(args.inventory_sql).read_text(encoding='utf-8')
    archive_rows = archive_inventory(args.destination_container, args.archive_container_path)
    destination_rows = parse_inventory(
        psql(args.destination_container, args.destination_database, inventory_sql),
        'destino',
    )

    required = {'auth.users', 'storage.buckets', 'storage.objects'}
    if not required.issubset(archive_rows):
        missing = ', '.join(sorted(required - set(archive_rows)))
        raise ValueError(f'o arquivo nao contem os inventarios obrigatorios: {missing}')

    ok = compare('archive_restore_rows', archive_rows, destination_rows)
    print(
        f'archive_tables={len(archive_rows)} restored_tables={len(destination_rows)} '
        f'archive_rows={sum(archive_rows.values())} restored_rows={sum(destination_rows.values())}'
    )

    source_schema = parse_object_inventory(
        psql(args.source_container, args.source_database, SCHEMA_INVENTORY_SQL),
        'schema-origem',
    )
    destination_schema = parse_object_inventory(
        psql(args.destination_container, args.destination_database, SCHEMA_INVENTORY_SQL),
        'schema-destino',
    )
    ok = compare('schema_objects', source_schema, destination_schema) and ok

    source_roles = parse_object_inventory(
        psql(args.source_container, args.source_database, ROLE_INVENTORY_SQL),
        'roles-origem',
    )
    destination_roles = parse_object_inventory(
        psql(args.destination_container, args.destination_database, ROLE_INVENTORY_SQL),
        'roles-destino',
    )
    ok = compare('roles_and_memberships', source_roles, destination_roles) and ok

    source_ledger = migration_ledger(
        args.source_container,
        args.source_database,
        'migrations-origem',
    )
    destination_ledger = migration_ledger(
        args.destination_container,
        args.destination_database,
        'migrations-destino',
    )
    ok = compare('migration_ledger', source_ledger, destination_ledger) and ok

    if not ok:
        return 1
    print('restore_parity=passed pii_output=none')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        message = (error.stderr or '').strip()
        print(f'Falha ao executar ferramenta local: {message}', file=sys.stderr)
        raise SystemExit(1)
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
