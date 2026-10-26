#!/usr/bin/env bash
set -u

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
backend_url="${LEAGUE_BACKEND_URL:-http://127.0.0.1:3001}"

jwt_secret="$(sed -n 's/^JWT_SECRET=//p' "$environment_file" | head -n 1)"
row="$(docker exec "$database_container" psql -U postgres -d postgres -Atc "
  SELECT member.user_id || chr(124) || member.league_id || chr(124) || league.accent_color
    FROM public.league_members member
    JOIN auth.users app_user ON app_user.id = member.user_id
    JOIN public.account_profiles profile ON profile.user_id = member.user_id
    JOIN public.leagues league ON league.id = member.league_id
   WHERE member.is_active AND member.role = 'admin' AND league.is_active
     AND league.archived_at IS NULL AND league.logo_url IS NULL
   ORDER BY member.league_id, member.user_id
   LIMIT 1
")"
if [[ -z "$jwt_secret" || -z "$row" ]]; then
  echo "JWT local ou pelada ADM sem escudo indisponível para o smoke reversível." >&2
  exit 1
fi

user_id="${row%%|*}"
rest="${row#*|}"
league_id="${rest%%|*}"
accent_color="${rest##*|}"
logo_path=""
authorization=""
league_base=""
image_file="$(mktemp /tmp/liga-branding-smoke-XXXXXX.png)"
response_file="$(mktemp /tmp/liga-branding-response-XXXXXX.json)"
cleanup() {
  if [[ -n "$logo_path" && -n "$authorization" && -n "$league_base" ]]; then
    curl -sS -o /dev/null -X PATCH -H "$authorization" \
      -F "accent_color=$accent_color" -F 'remove_logo=1' "$league_base/branding" || true
  fi
  docker exec "$database_container" psql -U postgres -d postgres -qAtc "
    UPDATE public.leagues SET logo_url = NULL, accent_color = '$accent_color' WHERE id = '$league_id'::uuid
  " >/dev/null
  rm -f -- "$image_file"
  rm -f -- "$response_file"
}
trap cleanup EXIT

printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' \
  | base64 -d > "$image_file"
base64_url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
issued_at="$(date +%s)"
expires_at="$((issued_at + 600))"
header="$(printf '{"alg":"HS256","typ":"JWT"}' | base64_url)"
payload="$(printf \
  '{"aud":"authenticated","exp":%s,"iat":%s,"iss":"supabase","sub":"%s","role":"authenticated","aal":"aal1","is_anonymous":false}' \
  "$expires_at" "$issued_at" "$user_id" | base64_url)"
signature="$(printf '%s' "$header.$payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64_url)"
authorization="Authorization: Bearer $header.$payload.$signature"
league_base="${backend_url%/}/api/leagues/$league_id"

entry_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "$authorization" \
  -H 'Content-Type: application/json' --data '{"mode":"active"}' "$league_base/selection")"
archived_rejected="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "$authorization" \
  -H 'Content-Type: application/json' --data '{"mode":"archived-quick"}' "$league_base/selection")"
completion_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "$authorization" \
  -H 'Content-Type: application/json' --data '{"version":1}' "${backend_url%/}/api/account/entry-flow/complete")"
branding_status="$(curl -sS -o "$response_file" -w '%{http_code}' -X PATCH -H "$authorization" \
  -F "accent_color=$accent_color" -F "logo=@$image_file;type=image/png" "$league_base/branding")"
logo_url="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT COALESCE(logo_url, '') FROM public.leagues WHERE id = '$league_id'::uuid")"
logo_path="${logo_url#*/storage/v1/object/public/league-branding/}"
if [[ -z "$logo_url" ]]; then
  echo "O backend não persistiu a URL do escudo: $(cat "$response_file")" >&2
fi
object_created="0"
if [[ "$logo_path" != "$logo_url" && -n "$logo_path" ]]; then
  for attempt in {1..20}; do
    object_created="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
      "SELECT count(*) FROM storage.objects WHERE bucket_id = 'league-branding' AND name = '$logo_path'")"
    [[ "$object_created" == "1" ]] && break
    sleep 0.1
  done
fi
remove_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH -H "$authorization" \
  -F "accent_color=$accent_color" -F 'remove_logo=1' "$league_base/branding")"
logo_after="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT COALESCE(logo_url, '') FROM public.leagues WHERE id = '$league_id'::uuid")"
object_after="1"
for attempt in {1..20}; do
  object_after="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
    "SELECT count(*) FROM storage.objects WHERE bucket_id = 'league-branding' AND name = '$logo_path'")"
  [[ "$object_after" == "0" ]] && break
  sleep 0.1
done
logo_path=""

printf 'entry=%s archived_rejected=%s complete=%s upload=%s object_created=%s remove=%s cleaned=%s\n' \
  "$entry_status" "$archived_rejected" "$completion_status" "$branding_status" "$object_created" \
  "$remove_status" "$([[ -z "$logo_after" && "$object_after" == "0" ]] && echo 1 || echo 0)"
[[ "$entry_status" == "200" && "$archived_rejected" == "403" && "$completion_status" == "200" \
  && "$branding_status" == "200" && "$object_created" == "1" && "$remove_status" == "200" \
  && -z "$logo_after" && "$object_after" == "0" ]]
