#!/usr/bin/env bash
set -u

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
backend_url="${LEAGUE_BACKEND_URL:-http://127.0.0.1:3001}"

if [[ ! -f "$environment_file" ]]; then
  echo "Arquivo de ambiente local não encontrado: $environment_file" >&2
  exit 1
fi

jwt_secret="$(sed -n 's/^JWT_SECRET=//p' "$environment_file" | head -n 1)"
if [[ -z "$jwt_secret" ]]; then
  echo "JWT_SECRET não encontrada no ambiente local." >&2
  exit 1
fi

row="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT lm.user_id || chr(124) || lm.league_id || chr(124) || lm.is_favorite
    FROM public.league_members lm
    JOIN auth.users app_user ON app_user.id = lm.user_id
   WHERE lm.user_id IS NOT NULL
     AND lm.is_active = true
   ORDER BY lm.league_id, lm.user_id
   LIMIT 1
")"
if [[ -z "$row" ]]; then
  echo "Nenhum membro ativo encontrado no banco local." >&2
  exit 1
fi

user_id="${row%%|*}"
remaining="${row#*|}"
league_id="${remaining%%|*}"
original="${remaining##*|}"
if [[ "$original" == "t" || "$original" == "true" ]]; then
  desired_json=false
  expected=f
  original_json=true
  original_expected=t
else
  desired_json=true
  expected=t
  original_json=false
  original_expected=f
fi

base64_url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

issued_at="$(date +%s)"
expires_at="$((issued_at + 600))"
header="$(printf '{"alg":"HS256","typ":"JWT"}' | base64_url)"
payload="$(printf \
  '{"aud":"authenticated","exp":%s,"iat":%s,"iss":"supabase","sub":"%s","role":"authenticated","aal":"aal1","is_anonymous":false}' \
  "$expires_at" "$issued_at" "$user_id" | base64_url)"
signature="$(printf '%s' "$header.$payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64_url)"
token="$header.$payload.$signature"
url="${backend_url%/}/api/leagues/$league_id/favorite"

write_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
  -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' \
  --data "{\"favorite\":$desired_json}" \
  "$url")"
retry_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
  -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' \
  --data "{\"favorite\":$desired_json}" \
  "$url")"
actual="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT is_favorite
    FROM public.league_members
   WHERE league_id = '$league_id'::uuid
     AND user_id = '$user_id'::uuid
")"

# A restauração acontece mesmo quando a primeira chamada não produz o valor esperado.
restore_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
  -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' \
  --data "{\"favorite\":$original_json}" \
  "$url")"
restored="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT is_favorite
    FROM public.league_members
   WHERE league_id = '$league_id'::uuid
     AND user_id = '$user_id'::uuid
")"

printf 'write_status=%s retry_status=%s desired=%s actual=%s restore_status=%s restored=%s\n' \
  "$write_status" "$retry_status" "$expected" "$actual" "$restore_status" "$restored"

[[ "$write_status" == "200" \
  && "$retry_status" == "200" \
  && "$actual" == "$expected" \
  && "$restore_status" == "200" \
  && "$restored" == "$original_expected" ]]
