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
   WHERE member.is_active AND member.role = 'admin' AND league.is_active
   ORDER BY member.league_id, member.user_id
   LIMIT 1
")"
if [[ -z "$jwt_secret" || -z "$row" ]]; then
  echo "JWT local ou vínculo ADM de teste indisponível." >&2
  exit 1
fi

user_id="${row%%|*}"
league_id="${row##*|}"
fixture_name="Arena smoke $(date +%s)"
stadium_id=""
cleanup() {
  if [[ -n "$stadium_id" ]]; then
    docker exec "$database_container" psql -U postgres -d postgres -qAtc \
      "DELETE FROM public.stadiums WHERE id = '$stadium_id'::uuid AND league_id = '$league_id'::uuid" >/dev/null
  fi
}
trap cleanup EXIT

base64_url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
issued_at="$(date +%s)"
expires_at="$((issued_at + 600))"
header="$(printf '{"alg":"HS256","typ":"JWT"}' | base64_url)"
payload="$(printf \
  '{"aud":"authenticated","exp":%s,"iat":%s,"iss":"supabase","sub":"%s","role":"authenticated","aal":"aal1","is_anonymous":false}' \
  "$expires_at" "$issued_at" "$user_id" | base64_url)"
signature="$(printf '%s' "$header.$payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64_url)"
authorization="Authorization: Bearer $header.$payload.$signature"
base="${backend_url%/}/api/leagues/$league_id/stadiums"

create_payload="$(printf \
  '{"name":"%s","address":null,"google_maps_url":"maps.example/smoke","latitude":null,"longitude":null}' \
  "$fixture_name")"
create_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "$authorization" \
  -H 'Content-Type: application/json' --data "$create_payload" "$base")"
stadium_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT id FROM public.stadiums
   WHERE league_id = '$league_id'::uuid AND name = '$fixture_name'
   ORDER BY created_at DESC LIMIT 1
")"
if [[ ! "$stadium_id" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "O estádio temporário não foi persistido (HTTP $create_status)." >&2
  exit 1
fi

list_status="$(curl -sS -o /dev/null -w '%{http_code}' -H "$authorization" "$base")"
update_payload="$(printf \
  '{"name":"%s atualizada","address":"Rua smoke","google_maps_url":"https://maps.example/smoke","latitude":-23.5505,"longitude":-46.6333}' \
  "$fixture_name")"
update_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH -H "$authorization" \
  -H 'Content-Type: application/json' --data "$update_payload" "$base/$stadium_id")"
order_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PUT -H "$authorization" \
  -H 'Content-Type: application/json' --data "{\"stadium_ids\":[\"$stadium_id\"]}" "$base/order")"
delete_status="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE -H "$authorization" "$base/$stadium_id")"
remaining="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT count(*) FROM public.stadiums WHERE id = '$stadium_id'::uuid")"
stadium_id=""

printf 'create=%s list=%s update=%s order=%s delete=%s removed=%s\n' \
  "$create_status" "$list_status" "$update_status" "$order_status" "$delete_status" "$([[ "$remaining" == "0" ]] && echo 1 || echo 0)"
[[ "$create_status" == "201" && "$list_status" == "200" && "$update_status" == "200" \
  && "$order_status" == "200" && "$delete_status" == "200" && "$remaining" == "0" ]]
