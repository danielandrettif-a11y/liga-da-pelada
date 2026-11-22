#!/usr/bin/env bash
set -u

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
backend_url="${LEAGUE_BACKEND_URL:-http://127.0.0.1:3001}"
response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

jwt_secret="$(sed -n 's/^JWT_SECRET=//p' "$environment_file" | head -n 1)"
user_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT profile.user_id
    FROM public.account_profiles profile
    JOIN auth.users app_user ON app_user.id = profile.user_id
    JOIN public.players player ON player.id = profile.player_id
   WHERE player.is_selectable
     AND player.member_category IN ('player', 'guest')
   ORDER BY profile.user_id
   LIMIT 1
")"
if [[ -z "$jwt_secret" || -z "$user_id" ]]; then
  echo "JWT local ou conta com perfil elegível indisponível." >&2
  exit 1
fi
base64_url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
issued_at="$(date +%s)"
expires_at="$((issued_at + 600))"
header="$(printf '{"alg":"HS256","typ":"JWT"}' | base64_url)"
payload="$(printf \
  '{"aud":"authenticated","exp":%s,"iat":%s,"iss":"supabase","sub":"%s","role":"authenticated","aal":"aal1","is_anonymous":false}' \
  "$expires_at" "$issued_at" "$user_id" | base64_url)"
signature="$(printf '%s' "$header.$payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64_url)"
authorization="Authorization: Bearer $header.$payload.$signature"
match_date="$(date -d tomorrow +%F)"

create_status="$(curl -sS -o "$response_file" -w '%{http_code}' -X POST \
  -H "$authorization" -H 'Content-Type: application/json' \
  --data "{\"date\":\"$match_date\",\"start_time\":\"20:30\",\"field_name\":\"\",\"map_url\":\"\"}" \
  "${backend_url%/}/api/quick-match-sessions")"
league_id="$(sed -n 's/.*"league_id":"\([^"]*\)".*/\1/p' "$response_file")"
callup_id="$(sed -n 's/.*"callup_id":"\([^"]*\)".*/\1/p' "$response_file")"
round_id="$(sed -n 's/.*"round_id":"\([^"]*\)".*/\1/p' "$response_file")"
if [[ "$create_status" != "201" || -z "$league_id" || -z "$callup_id" || -z "$round_id" ]]; then
  printf 'create=%s valid_response=0\n' "$create_status"
  exit 1
fi

created_graph="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT (EXISTS(SELECT 1 FROM public.leagues WHERE id = '$league_id'::uuid))::int || chr(124) ||
         (EXISTS(SELECT 1 FROM public.callups WHERE id = '$callup_id'::uuid AND league_id = '$league_id'::uuid))::int || chr(124) ||
         (EXISTS(SELECT 1 FROM public.rounds WHERE id = '$round_id'::uuid AND league_id = '$league_id'::uuid))::int
")"
league_name="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT name FROM public.leagues WHERE id = '$league_id'::uuid")"
delete_payload="{\"confirm_name\":\"$league_name\"}"
delete_status="$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE \
  -H "$authorization" -H 'Content-Type: application/json' --data "$delete_payload" \
  "${backend_url%/}/api/leagues/$league_id")"
still_exists="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT count(*) FROM public.leagues WHERE id = '$league_id'::uuid")"

printf 'create=%s graph=%s cleanup=%s still_exists=%s\n' "$create_status" "$created_graph" "$delete_status" "$still_exists"
[[ "$created_graph" == "1|1|1" && "$delete_status" == "200" && "$still_exists" == "0" ]]
