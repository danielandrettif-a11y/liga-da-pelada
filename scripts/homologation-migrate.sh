#!/usr/bin/env bash
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077

readonly state=/var/lib/liga-homolog-migrations
readonly remote=https://github.com/danielandrettif-a11y/liga-da-pelada.git
readonly branch=codex/homologacao-coolify
readonly baseline=370

fail() { printf '%s\n' "$*" >&2; exit 1; }
db() {
  docker exec homolog-supabase-db psql -X -U postgres -d postgres \
    -v ON_ERROR_STOP=1 "$@"
}

case "$#" in
  1) [[ "$1" == status ]] || fail "Use status ou apply COMMIT ARQUIVO." ;;
  3)
    [[ "$1" == apply && "$2" =~ ^[0-9a-f]{40}$ && "$3" =~ ^([0-9]{3,6})_[a-z0-9_]+\.sql$ ]] ||
      fail "Use apply COMMIT ARQUIVO."
    commit=$2
    filename=$3
    version=$((10#${BASH_REMATCH[1]}))
    (( version > baseline )) || fail "O histórico até a 370 deve ser conferido separadamente."
    ;;
  *) fail "Use status ou apply COMMIT ARQUIVO." ;;
esac

exec 9>"$state/lock"
flock -w 30 9 || fail "Já existe uma migração em andamento."
[[ "$(db -Atqc "SELECT to_regprocedure('public.get_home_agenda_v2(uuid)') IS NOT NULL")" == t ]] ||
  fail "Migração 370 não encontrada no banco de homologação."

ledger_exists=$(db -Atqc "SELECT to_regclass('homolog_migrations.applied') IS NOT NULL")
if [[ "$1" == status ]]; then
  printf 'Banco: homolog-supabase-db. Marco confirmado: 370 (agenda v2).\n'
  if [[ "$ledger_exists" == t ]]; then
    db -c 'SELECT version, filename, git_commit, applied_at FROM homolog_migrations.applied ORDER BY version'
  else
    printf 'Nenhuma migração registrada por este comando.\n'
  fi
  exit 0
fi

git --git-dir="$state/repo.git" fetch --quiet --no-tags "$remote" "refs/heads/$branch"
git --git-dir="$state/repo.git" cat-file -e "$commit^{commit}" 2>/dev/null &&
  git --git-dir="$state/repo.git" merge-base --is-ancestor "$commit" FETCH_HEAD ||
  fail "O commit não pertence à branch de homologação."
[[ "$(git --git-dir="$state/repo.git" cat-file -t "$commit:supabase/migrations/$filename" 2>/dev/null)" == blob ]] ||
  fail "Arquivo ausente no commit."

ledger=''
if [[ "$ledger_exists" == t ]]; then
  ledger=$(db -At -F '|' -c 'SELECT version, filename, sha256 FROM homolog_migrations.applied ORDER BY version')
fi
declare -A applied_files applied_hashes
highest=$baseline
while IFS='|' read -r done_version done_file done_hash; do
  [[ -n "$done_version" ]] || continue
  applied_files[$done_version]=$done_file
  applied_hashes[$done_version]=$done_hash
  highest=$done_version
done <<< "$ledger"

tree=$(git --git-dir="$state/repo.git" ls-tree --name-only "$commit:supabase/migrations")
while IFS= read -r file; do
  [[ "$file" =~ ^([0-9]{3,6})_[a-z0-9_]+\.sql$ ]] || continue
  number=$((10#${BASH_REMATCH[1]}))
  (( number > baseline && number < version )) || continue
  [[ "${applied_files[$number]:-}" == "$file" ]] || fail "Aplique primeiro $file."
  prior_checksum=$(git --git-dir="$state/repo.git" show "$commit:supabase/migrations/$file" | sha256sum)
  [[ "${prior_checksum%% *}" == "${applied_hashes[$number]}" ]] || fail "O arquivo aplicado $file foi modificado."
done <<< "$tree"

sqlfile=$(mktemp "$state/migration.XXXXXX")
bodyfile=$(mktemp "$state/body.XXXXXX")
trap 'rm -f -- "$sqlfile" "$bodyfile"' EXIT
git --git-dir="$state/repo.git" show "$commit:supabase/migrations/$filename" > "$sqlfile"
checksum=$(sha256sum < "$sqlfile")
checksum=${checksum%% *}
if [[ -n "${applied_files[$version]:-}" ]]; then
  [[ "${applied_files[$version]}" == "$filename" && "${applied_hashes[$version]}" == "$checksum" ]] ||
    fail "O número já foi aplicado com outro arquivo ou conteúdo."
  printf '%s já aplicada.\n' "$filename"
  exit 0
fi
(( version > highest )) || fail "A migração é anterior à última versão registrada."

# Aceita SQL transacional com ou sem BEGIN/COMMIT externos em linhas próprias.
# psql -c envia a migração e o registro juntos ao servidor, sem interpretar comandos do psql.
sed 's/\r$//' "$sqlfile" > "$bodyfile"
first=$(awk 'NF && !/^[[:space:]]*--/{print NR; exit}' "$bodyfile")
last=$(awk 'NF && !/^[[:space:]]*--/{last=NR} END{print last}' "$bodyfile")
[[ -n "$first" ]] || fail "A migração está vazia."
if sed -n "${first}p" "$bodyfile" | grep -Eiq '^[[:space:]]*BEGIN;[[:space:]]*$' &&
   sed -n "${last}p" "$bodyfile" | grep -Eiq '^[[:space:]]*COMMIT;[[:space:]]*$'; then
  sed -i "${first}d;${last}d" "$bodyfile"
fi
[[ $(wc -c < "$bodyfile") -le 90000 ]] || fail "A migração excede o limite deste comando."
if grep -Fq -e '$liga_migrate$' -e '$liga_body$' "$bodyfile"; then
  fail "A migração usa um delimitador reservado."
fi

db -q -c "BEGIN;
DO \$liga_migrate\$
BEGIN
  EXECUTE \$liga_body\$
$(cat "$bodyfile")
\$liga_body\$;
END
\$liga_migrate\$;
CREATE SCHEMA IF NOT EXISTS homolog_migrations;
REVOKE ALL ON SCHEMA homolog_migrations FROM PUBLIC;
CREATE TABLE IF NOT EXISTS homolog_migrations.applied (
  version integer PRIMARY KEY,
  filename text NOT NULL,
  git_commit text NOT NULL,
  sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO homolog_migrations.applied(version, filename, git_commit, sha256)
VALUES ($version, '$filename', '$commit', '$checksum');
COMMIT;"
printf '%s aplicada e registrada (%s).\n' "$filename" "$commit"
