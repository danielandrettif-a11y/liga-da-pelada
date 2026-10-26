#!/usr/bin/env bash
set -u

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
backend_url="${LEAGUE_BACKEND_URL:-http://127.0.0.1:3001}"

jwt_secret="$(sed -n 's/^JWT_SECRET=//p' "$environment_file" | head -n 1)"
row="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT member.user_id || chr(124) || member.league_id
    FROM public.league_members member
    JOIN auth.users app_user ON app_user.id = member.user_id
    JOIN public.leagues league ON league.id = member.league_id
   WHERE member.user_id IS NOT NULL
     AND member.is_active = true
     AND member.role = 'admin'
     AND league.is_active = true
     AND league.feature_tier = 'complete'
   ORDER BY member.league_id, member.user_id
   LIMIT 1
")"
if [[ -z "$jwt_secret" || -z "$row" ]]; then
  echo "JWT local ou pelada completa com ADM indisponível." >&2
  exit 1
fi

user_id="${row%%|*}"
league_id="${row##*|}"
base64_url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
issued_at="$(date +%s)"
expires_at="$((issued_at + 600))"
header="$(printf '{"alg":"HS256","typ":"JWT"}' | base64_url)"
payload="$(printf \
  '{"aud":"authenticated","exp":%s,"iat":%s,"iss":"supabase","sub":"%s","role":"authenticated","aal":"aal1","is_anonymous":false}' \
  "$expires_at" "$issued_at" "$user_id" | base64_url)"
signature="$(printf '%s' "$header.$payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64_url)"
authorization="Authorization: Bearer $header.$payload.$signature"
base="${backend_url%/}/api/leagues/$league_id"

# Upgrade de uma pelada já completa é idempotente e não altera dados.
upgrade_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "$authorization" "$base/upgrade")"
# Nome deliberadamente incorreto: valida autorização/contrato sem excluir nada.
delete_status="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE -H "$authorization" \
  -H 'Content-Type: application/json' --data '{"confirm_name":"__nome_incorreto__"}' "$base")"
still_exists="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT count(*) FROM public.leagues WHERE id = '$league_id'::uuid AND is_active = true
")"

printf 'upgrade=%s delete_rejected=%s still_exists=%s\n' "$upgrade_status" "$delete_status" "$still_exists"
[[ "$upgrade_status" == "200" && "$delete_status" == "400" && "$still_exists" == "1" ]]
