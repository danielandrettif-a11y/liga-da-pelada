#!/usr/bin/env bash
set -euo pipefail

archive_path="${1:-/home/danie/pelada-homologacao/backups/pre-player-avatar-policy-20261103.dump}"
target_major="${2:-17}"
if [[ ! -f "$archive_path" ]]; then
  echo "Arquivo de backup não encontrado: $archive_path" >&2
  exit 1
fi

archive_dir="$(cd "$(dirname "$archive_path")" && pwd)"
archive_name="$(basename "$archive_path")"
catalog_file="$(mktemp /tmp/liga-db-archive-XXXXXX.list)"
trap 'rm -f -- "$catalog_file"' EXIT

docker run --rm -v "$archive_dir:/backup:ro" postgres:"$target_major" \
  pg_restore --list "/backup/$archive_name" > "$catalog_file"

source_version="$(sed -n 's/^;[[:space:]]*Dumped from database version:[[:space:]]*//p' "$catalog_file" | head -n 1)"
source_major="${source_version%%.*}"
schemas="$(awk '$0 ~ / SCHEMA - / { for (i = 1; i <= NF; i++) if ($i == "SCHEMA") print $(i + 2) }' "$catalog_file" | sort -u | paste -sd, -)"
has_table_data=0
grep -q ' TABLE DATA ' "$catalog_file" && has_table_data=1

if [[ -z "$source_version" || ! "$source_major" =~ ^[0-9]+$ ]]; then
  echo "O catálogo não informa a versão de origem." >&2
  exit 1
fi
if (( source_major > target_major )); then
  echo "Backup PostgreSQL $source_version não pode ser restaurado diretamente no PostgreSQL $target_major." >&2
  exit 1
fi
for required_schema in auth storage; do
  if ! grep -q " SCHEMA - $required_schema " "$catalog_file"; then
    echo "Schema obrigatório ausente no backup: $required_schema" >&2
    exit 1
  fi
done

printf 'source=%s target=%s schemas=%s table_data=%s compatible=1\n' \
  "$source_version" "$target_major" "$schemas" "$has_table_data"
