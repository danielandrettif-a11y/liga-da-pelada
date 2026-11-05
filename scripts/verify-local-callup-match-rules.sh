#!/usr/bin/env bash
set -u

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
backend_url="${CALLUPS_BACKEND_URL:-http://127.0.0.1:3001}"

if [[ ! -f "$environment_file" ]]; then
  echo "Arquivo de ambiente local não encontrado: $environment_file" >&2
  exit 1
fi

jwt_secret="$(sed -n 's/^JWT_SECRET=//p' "$environment_file" | head -n 1)"
row="$(docker exec "$database_container" psql -U postgres -d postgres -At -F '|' -c "
  SELECT member.user_id,
         callup.league_id,
         callup.id,
         callup.match_duration,
         callup.goals_to_finish
    FROM public.callups callup
    JOIN public.league_members member
      ON member.league_id = callup.league_id
     AND member.role = 'admin'
     AND member.is_active = true
    JOIN auth.users app_user ON app_user.id = member.user_id
   WHERE callup.status IN ('open', 'locked', 'converted')
     AND NOT EXISTS (
       SELECT 1
         FROM public.matches match_item
        WHERE match_item.round_id = callup.round_id
          AND (
            match_item.started_at IS NOT NULL
            OR match_item.status IN ('live', 'in_progress', 'finished')
          )
     )
   ORDER BY callup.created_at DESC, member.user_id
   LIMIT 1
")"

if [[ -z "$jwt_secret" || -z "$row" ]]; then
  echo "JWT local ou convocação editável com vínculo ADM indisponível." >&2
  exit 1
fi

IFS='|' read -r user_id league_id callup_id match_duration goals_to_finish <<< "$row"

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
body="$(printf '{"matchDuration":%s,"goalsToFinish":%s}' "$match_duration" "$goals_to_finish")"
url="${backend_url%/}/api/callups/leagues/$league_id/$callup_id/match-rules"

status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
  -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/json' \
  --data "$body" "$url")"

persisted="$(docker exec "$database_container" psql -U postgres -d postgres -At -F '|' -c "
  SELECT callup.match_duration,
         callup.goals_to_finish,
         COUNT(match_item.id) FILTER (
           WHERE match_item.status = 'pending'
             AND match_item.started_at IS NULL
             AND (
               match_item.duration_seconds <> callup.match_duration * 60
               OR match_item.goals_to_finish <> callup.goals_to_finish
             )
         )
    FROM public.callups callup
    LEFT JOIN public.matches match_item ON match_item.round_id = callup.round_id
   WHERE callup.id = '$callup_id'::uuid
   GROUP BY callup.id
")"

printf 'callup_match_rules=%s callup=%s expected=%s|%s persisted=%s\n' \
  "$status" "$callup_id" "$match_duration" "$goals_to_finish" "$persisted"

[[ "$status" == "200" && "$persisted" == "$match_duration|$goals_to_finish|0" ]]
