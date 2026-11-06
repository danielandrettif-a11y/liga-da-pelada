#!/usr/bin/env bash

set -euo pipefail

usage() {
  printf 'Uso: %s <arquivo.dump> <container-destino> <banco-destino>\n' "$0" >&2
}

if [[ $# -ne 3 ]]; then
  usage
  exit 2
fi

archive_path="$1"
container_name="$2"
database_name="$3"

if [[ ! -f "$archive_path" ]]; then
  printf 'Arquivo de backup inexistente: %s\n' "$archive_path" >&2
  exit 2
fi

if [[ ! "$container_name" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
  printf 'Nome de container invalido.\n' >&2
  exit 2
fi

if [[ ! "$database_name" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  printf 'Nome de banco invalido.\n' >&2
  exit 2
fi

if docker ps -a --format '{{.Names}}' | grep -Fxq "$container_name"; then
  printf 'O container %s ja existe; use um nome novo para nao reutilizar estado parcial.\n' "$container_name" >&2
  exit 2
fi

archive_directory="$(dirname "$archive_path")"
archive_name="$(basename "$archive_path")"
postgres_image="${SUPABASE_POSTGRES_IMAGE:-$(docker inspect -f '{{.Config.Image}}' supabase-db)}"

docker run --rm --network none \
  -v "$archive_directory:/backup:ro" \
  postgres:17 pg_restore --list "/backup/$archive_name" >/dev/null

disposable_password="$(openssl rand -hex 32)"
docker run -d \
  --name "$container_name" \
  --network none \
  -e POSTGRES_PASSWORD="$disposable_password" \
  "$postgres_image" >/dev/null
unset disposable_password

wait_for_database() {
  local attempt
  for attempt in $(seq 1 90); do
    if docker exec "$container_name" \
      psql -X -q -U supabase_admin -d postgres -Atc 'SELECT 1' 2>/dev/null \
      | grep -qx 1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if ! wait_for_database; then
  printf 'O PostgreSQL isolado nao ficou pronto; o container foi preservado para diagnostico.\n' >&2
  exit 1
fi

cat <<SQL | docker exec -i "$container_name" \
  psql -X -q -v ON_ERROR_STOP=1 -U supabase_admin -d postgres
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'liga_backend') THEN
    CREATE ROLE liga_backend LOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_functions_admin') THEN
    CREATE ROLE supabase_functions_admin LOGIN NOINHERIT CREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_realtime_admin') THEN
    CREATE ROLE supabase_realtime_admin NOLOGIN NOINHERIT;
  END IF;
END
\$\$;
GRANT authenticated TO liga_backend;
GRANT supabase_functions_admin TO postgres;
GRANT anon, authenticated, service_role TO supabase_realtime_admin;
ALTER SYSTEM SET cron.database_name = '$database_name';
SQL

docker restart "$container_name" >/dev/null
if ! wait_for_database; then
  printf 'O PostgreSQL isolado nao voltou apos configurar pg_cron; o container foi preservado.\n' >&2
  exit 1
fi

docker exec "$container_name" \
  createdb -U supabase_admin -O supabase_admin "$database_name"
docker cp "$archive_path" "$container_name:/tmp/source.dump" >/dev/null
docker exec "$container_name" \
  pg_restore --exit-on-error -U supabase_admin -d "$database_name" /tmp/source.dump

printf 'restore_status=passed container=%s database=%s network=none\n' \
  "$container_name" "$database_name"
printf 'O destino foi preservado para executar a verificacao de paridade.\n'
