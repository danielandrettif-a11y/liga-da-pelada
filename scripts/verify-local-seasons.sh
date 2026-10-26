#!/usr/bin/env bash
set -u

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
backend_url="${LEAGUE_BACKEND_URL:-http://127.0.0.1:3001}"

jwt_secret="$(sed -n 's/^JWT_SECRET=//p' "$environment_file" | head -n 1)"
row="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT member.user_id || chr(124) || member.league_id || chr(124) || season.id
    FROM public.league_members member
    JOIN auth.users app_user ON app_user.id = member.user_id
    JOIN public.seasons season ON season.league_id = member.league_id AND season.status = 'active'
   WHERE member.is_active AND member.role = 'admin'
     AND (
       NOT EXISTS (SELECT 1 FROM public.rounds round_item WHERE round_item.season_id = season.id)
       OR EXISTS (SELECT 1 FROM public.rounds round_item WHERE round_item.season_id = season.id AND round_item.status <> 'finished')
       OR NOT EXISTS (SELECT 1 FROM public.rounds round_item WHERE round_item.season_id = season.id AND round_item.round_type = 'official')
       OR EXISTS (
         SELECT 1 FROM public.matches match_item
         JOIN public.rounds round_item ON round_item.id = match_item.round_id
         WHERE round_item.season_id = season.id AND round_item.round_type = 'official' AND match_item.status <> 'finished'
       )
     )
   ORDER BY member.league_id, member.user_id
   LIMIT 1
")"
if [[ -z "$jwt_secret" || -z "$row" ]]; then
  echo "JWT local ou temporada ativa segura para teste indisponível." >&2
  exit 1
fi

user_id="${row%%|*}"
rest="${row#*|}"
league_id="${rest%%|*}"
season_id="${rest##*|}"
base64_url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
issued_at="$(date +%s)"
expires_at="$((issued_at + 600))"
header="$(printf '{"alg":"HS256","typ":"JWT"}' | base64_url)"
payload="$(printf \
  '{"aud":"authenticated","exp":%s,"iat":%s,"iss":"supabase","sub":"%s","role":"authenticated","aal":"aal1","is_anonymous":false}' \
  "$expires_at" "$issued_at" "$user_id" | base64_url)"
signature="$(printf '%s' "$header.$payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64_url)"
authorization="Authorization: Bearer $header.$payload.$signature"
base="${backend_url%/}/api/leagues/$league_id/seasons"

active_status="$(curl -sS -o /dev/null -w '%{http_code}' -H "$authorization" "$base/active")"
rounds_status="$(curl -sS -o /dev/null -w '%{http_code}' -H "$authorization" "$base/active/rounds?round_type=official")"
latest_status="$(curl -sS -o /dev/null -w '%{http_code}' -H "$authorization" "$base/latest-finished")"
finish_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "$authorization" \
  -H 'Content-Type: application/json' --data '{"confirmation":"Terminar"}' "$base/active/finish")"
active_after="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT id FROM public.seasons WHERE league_id = '$league_id'::uuid AND status = 'active'
")"

printf 'active=%s rounds=%s latest=%s finish_rejected=%s unchanged=%s\n' \
  "$active_status" "$rounds_status" "$latest_status" "$finish_status" "$([[ "$active_after" == "$season_id" ]] && echo 1 || echo 0)"
[[ "$active_status" == "200" && "$rounds_status" == "200" && "$latest_status" == "200" \
  && "$finish_status" == "409" && "$active_after" == "$season_id" ]]
