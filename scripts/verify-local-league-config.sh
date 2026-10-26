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
row="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT member.user_id || chr(124) || member.league_id
    FROM public.league_members member
    JOIN auth.users app_user ON app_user.id = member.user_id
    JOIN public.leagues league ON league.id = member.league_id
   WHERE member.user_id IS NOT NULL
     AND member.is_active = true
     AND member.role = 'admin'
     AND league.is_active = true
   ORDER BY member.league_id, member.user_id
   LIMIT 1
")"
if [[ -z "$jwt_secret" || -z "$row" ]]; then
  echo "JWT local ou vínculo ADM de teste indisponível." >&2
  exit 1
fi

user_id="${row%%|*}"
league_id="${row##*|}"

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
base="${backend_url%/}/api/leagues/$league_id"

name_payload="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT json_build_object('name', name)::text FROM public.leagues WHERE id = '$league_id'::uuid
")"
settings_payload="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT json_build_object(
    'match_duration', match_duration,
    'players_per_team', players_per_team,
    'teams_per_round', teams_per_round,
    'stadium_name', COALESCE(stadium_name, ''),
    'stadium_map_url', COALESCE(stadium_map_url, ''),
    'event_duration_minutes', event_duration_minutes
  )::text
  FROM public.leagues WHERE id = '$league_id'::uuid
")"
preseason_payload="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT json_build_object('enabled', preseason_enabled)::text
  FROM public.leagues WHERE id = '$league_id'::uuid
")"

authorization="Authorization: Bearer $token"
config_status="$(curl -sS -o /dev/null -w '%{http_code}' -H "$authorization" "$base/config")"
name_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH -H "$authorization" \
  -H 'Content-Type: application/json' --data "$name_payload" "$base/name")"
settings_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH -H "$authorization" \
  -H 'Content-Type: application/json' --data "$settings_payload" "$base/config")"
preseason_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH -H "$authorization" \
  -H 'Content-Type: application/json' --data "$preseason_payload" "$base/preseason")"

printf 'config=%s name=%s settings=%s preseason=%s\n' \
  "$config_status" "$name_status" "$settings_status" "$preseason_status"

[[ "$config_status" == "200" \
  && "$name_status" == "200" \
  && "$settings_status" == "200" \
  && "$preseason_status" == "200" ]]
