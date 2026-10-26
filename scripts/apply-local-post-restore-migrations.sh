#!/usr/bin/env bash
set -euo pipefail

database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
database_user="${SUPABASE_MIGRATION_USER:-supabase_admin}"
database_name="${SUPABASE_DATABASE_NAME:-postgres}"
backup_root="${LOCAL_BACKUP_ROOT:-/home/danie/pelada-homologacao/backups}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "$script_dir/.." && pwd)"
migrations_root="$repository_root/supabase/migrations"

prerequisite="$(docker exec "$database_container" psql -U postgres -d "$database_name" -Atc "
  SELECT count(*)
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname = 'public'
     AND procedure.proname = 'create_league_for_user'
")"
if [[ "$prerequisite" == "0" ]]; then
  echo "A migration 313 precisa estar aplicada antes deste lote." >&2
  exit 1
fi

branding_column="$(docker exec "$database_container" psql -U postgres -d "$database_name" -Atc "
  SELECT count(*)
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'leagues'
     AND column_name = 'logo_url'
")"
if [[ "$branding_column" != "0" ]]; then
  echo "O lote 314-349 parece já aplicado (public.leagues.logo_url existe). Nada foi alterado."
  exit 0
fi

mkdir -p "$backup_root"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="$backup_root/pre-314-349-$timestamp.dump"
docker exec "$database_container" pg_dump -U "$database_user" -d "$database_name" -Fc > "$backup_path"
echo "Backup privado criado antes das migrations: $backup_path"

mapfile -t migration_files < <(
  find "$migrations_root" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' \
    | awk -F_ '$1 ~ /^[0-9]+$/ && $1 >= 314 && $1 <= 349 { print }' \
    | sort -V
)
if [[ "${#migration_files[@]}" -eq 0 ]]; then
  echo "Nenhuma migration 314-349 encontrada em $migrations_root" >&2
  exit 1
fi

for migration_name in "${migration_files[@]}"; do
  echo "Aplicando $migration_name"
  docker exec -i "$database_container" psql \
    -v ON_ERROR_STOP=1 -U "$database_user" -d "$database_name" \
    < "$migrations_root/$migration_name"
done

echo "Migrations 314-349 aplicadas. O dump de retorno permanece fora do Git em: $backup_path"
