#!/usr/bin/env bash
set -u

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
backend_url="${ROSTER_BACKEND_URL:-http://127.0.0.1:3001}"

jwt_secret="$(sed -n 's/^JWT_SECRET=//p' "$environment_file" | head -n 1)"
if [[ -z "$jwt_secret" ]]; then
  echo "Segredo JWT local indisponível para o smoke de elenco." >&2
  exit 1
fi

user_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT user_id FROM public.account_profiles ORDER BY (role = 'admin') DESC, created_at LIMIT 1")"
if [[ -z "$user_id" ]]; then
  echo "A homologação local não possui uma conta com perfil." >&2
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
response_file="$(mktemp /tmp/liga-roster-career-XXXXXX.json)"
trap 'rm -f -- "$response_file"' EXIT

status="$(curl -sS -o "$response_file" -w '%{http_code}' \
  -H "Authorization: Bearer $header.$payload.$signature" \
  "${backend_url%/}/api/roster/me/career")"
if [[ "$status" != "200" ]]; then
  echo "Consulta local de carreira falhou ($status)." >&2
  exit 1
fi

summary="$(python3 - "$response_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    payload = json.load(source)
required = {"rows", "overall", "official", "friendly"}
totals = {"rounds_count", "games", "goals", "assists", "wins", "draws", "losses", "points", "goalkeeper_games", "goals_conceded", "clean_sheets", "play_seconds"}
valid = required <= payload.keys() and isinstance(payload["rows"], list)
valid = valid and all(isinstance(payload[key], dict) and totals <= payload[key].keys() for key in ("overall", "official", "friendly"))
print(f"valid={int(valid)} rows={len(payload.get('rows', []))}")
PY
)"

printf 'career=%s %s\n' "$status" "$summary"
[[ "$summary" == valid=1* ]]
