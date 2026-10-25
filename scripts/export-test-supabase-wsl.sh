#!/usr/bin/env bash
# Exporta apenas o projeto Supabase de TESTE para ensaio de self-hosting.
# Execute dentro do Ubuntu WSL2 como root, para acessar o Docker sem alterar
# as permissões do usuário: wsl --user root --exec bash /caminho/do/script
set -euo pipefail
set +x
umask 077

if [[ $(id -u) -ne 0 ]]; then
  printf 'Execute como root no WSL: wsl --user root --exec bash <caminho-do-script>\n' >&2
  exit 2
fi
for tool in docker supabase python3; do
  command -v "$tool" >/dev/null || { printf 'Ferramenta ausente: %s\n' "$tool" >&2; exit 2; }
done
docker info >/dev/null 2>&1 || { printf 'Docker não está ativo.\n' >&2; exit 2; }

export_root=/home/danie/pelada-homologacao/exports
install -d -m 0700 "$export_root"
output_dir=$(mktemp -d "$export_root/test-XXXXXXXX")
printf 'Senha do BANCO DE TESTE Supabase (não será exibida): ' >&2
IFS= read -r -s db_password
printf '\n' >&2
if [[ -z "$db_password" ]]; then
  printf 'Senha vazia; exportação cancelada.\n' >&2
  exit 2
fi
encoded_password=$(printf '%s' "$db_password" | python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read(), safe=""))')
unset db_password
db_url="postgresql://postgres.dukjlpdkyngiqxffrxgc:${encoded_password}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
unset encoded_password
trap 'unset db_url' EXIT

export_part() {
  local filename=$1
  shift
  if supabase db dump --db-url "$db_url" --file "$output_dir/$filename" "$@" >"$output_dir/$filename.log" 2>&1; then
    return 0
  else
    local code=$?
    printf 'Falhou %s (código %s). Log privado: %s\n' "$filename" "$code" "$output_dir/$filename.log" >&2
    printf 'Não compartilhe o log sem remover URLs e credenciais.\n' >&2
    exit 1
  fi
}

export_part roles.sql --role-only
export_part schema.sql
export_part data.sql --use-copy --data-only
unset db_url
chown -R danie:danie "$output_dir"
printf 'Exportação de teste concluída em: %s\n' "$output_dir"
sha256sum "$output_dir/roles.sql" "$output_dir/schema.sql" "$output_dir/data.sql"
