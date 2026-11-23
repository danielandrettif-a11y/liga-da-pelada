#!/usr/bin/env bash
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077

readonly account=liga-migrate-homolog
readonly state=/var/lib/liga-homolog-migrations
readonly account_home=/var/lib/liga-migrate-homolog
readonly runner=/usr/local/sbin/liga-homolog-migrate
readonly dispatcher=/usr/local/sbin/liga-homolog-migrate-ssh
readonly sudo_rule=/etc/sudoers.d/liga-homolog-migrate
readonly database_container=teste-supabase-db

[[ "$EUID" == 0 && "$#" == 2 ]] || { echo "Execute como root com a chave pública e o arquivo do executor." >&2; exit 1; }
[[ "$1" =~ ^ssh-ed25519\ [A-Za-z0-9+/]+={0,2}$ && -f "$2" ]] || { echo "Chave pública ou executor inválido." >&2; exit 1; }
for tool in sudo visudo git docker ssh-keygen flock useradd; do command -v "$tool" >/dev/null; done
docker exec "$database_container" psql -X -U postgres -d postgres -Atq \
  -v ON_ERROR_STOP=1 -c "SELECT to_regprocedure('public.get_home_agenda_v2(uuid)') IS NOT NULL" |
  grep -qx t

if getent passwd "$account" >/dev/null || [[ -e "$account_home" || -e "$sudo_rule" || -e "$runner" || -e "$dispatcher" || -e "$state" ]]; then
  echo "O acesso já existe ou uma instalação anterior ficou incompleta. Confira antes de reinstalar." >&2
  exit 1
fi
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
printf '%s\n' "$1" > "$tmp/key"
ssh-keygen -lf "$tmp/key" >/dev/null

cat > "$tmp/ssh" <<'BASH'
#!/usr/bin/env bash
set -euo pipefail
original=${SSH_ORIGINAL_COMMAND:-}
if [[ "$original" == status ]]; then
  exec /usr/bin/sudo -n /usr/local/sbin/liga-homolog-migrate status
fi
if [[ "$original" =~ ^apply\ ([0-9a-f]{40})\ ([0-9]{3,6}_[a-z0-9_]+\.sql)$ ]]; then
  exec /usr/bin/sudo -n /usr/local/sbin/liga-homolog-migrate apply "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
fi
printf 'Use status ou apply COMMIT ARQUIVO.\n' >&2
exit 1
BASH

printf '%s ALL=(root) NOPASSWD: %s\n' "$account" "$runner" > "$tmp/sudo"
visudo -cf "$tmp/sudo"
install -d -m 0700 "$state"
git init --bare --quiet "$state/repo.git"
install -o root -g root -m 0755 "$2" "$runner"
install -o root -g root -m 0755 "$tmp/ssh" "$dispatcher"
"$runner" status
useradd --system --no-create-home --home-dir "$account_home" --shell /bin/bash "$account"
install -d -o root -g root -m 0755 "$account_home/.ssh"
printf 'restrict,command="%s" %s\n' "$dispatcher" "$1" > "$tmp/authorized_keys"
install -o root -g root -m 0644 "$tmp/authorized_keys" "$account_home/.ssh/authorized_keys"
install -o root -g root -m 0440 "$tmp/sudo" "$sudo_rule"
printf 'Acesso instalado para %s. Impressão digital da VPS:\n' "$account"
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
