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

editor_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT user_id FROM public.private_balance_tag_editors ORDER BY created_at LIMIT 1")"
user_id="${editor_id:-$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT user_id FROM public.account_profiles ORDER BY (role = 'admin') DESC, created_at LIMIT 1")}"
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
tag_response_file="$(mktemp /tmp/liga-roster-private-tag-XXXXXX.json)"
fitness_rounds_file="$(mktemp /tmp/liga-roster-fitness-rounds-XXXXXX.json)"
fitness_summary_file="$(mktemp /tmp/liga-roster-fitness-summary-XXXXXX.json)"
trap 'rm -f -- "$response_file" "$tag_response_file" "$fitness_rounds_file" "$fitness_summary_file"' EXIT

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
[[ "$summary" == valid=1* ]] || exit 1

if [[ -n "$editor_id" ]]; then
  player_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
    "SELECT id FROM public.players ORDER BY created_at LIMIT 1")"
  tag_status="$(curl -sS -o "$tag_response_file" -w '%{http_code}' \
    -H "Authorization: Bearer $header.$payload.$signature" \
    "${backend_url%/}/api/roster/players/$player_id/private-balance-tag")"
  tag_valid="$(python3 - "$tag_response_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    payload = json.load(source)
valid_tags = {None, "bagre_1", "bagre_2", "craque_1", "craque_2"}
print(int(payload.get("allowed") is True and payload.get("tag") in valid_tags))
PY
)"
  printf 'private_balance_tag=%s valid=%s\n' "$tag_status" "$tag_valid"
  [[ "$tag_status" == "200" && "$tag_valid" == "1" ]]
fi

player_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT player_id FROM public.account_profiles WHERE user_id = '$user_id'::uuid")"
league_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT league_id FROM public.league_members WHERE user_id = '$user_id'::uuid AND is_active ORDER BY joined_at LIMIT 1")"
if [[ -n "$player_id" && -n "$league_id" ]]; then
  fitness_rounds_status="$(curl -sS -o "$fitness_rounds_file" -w '%{http_code}' \
    -H "Authorization: Bearer $header.$payload.$signature" \
    "${backend_url%/}/api/roster/players/$player_id/fitness-rounds?league_id=$league_id")"
  fitness_summary_status="$(curl -sS -o "$fitness_summary_file" -w '%{http_code}' \
    -H "Authorization: Bearer $header.$payload.$signature" \
    "${backend_url%/}/api/roster/players/$player_id/fitness-summary?league_id=$league_id")"
  if [[ "$fitness_rounds_status" != "200" || "$fitness_summary_status" != "200" ]]; then
    echo "Leitura local de aptidão falhou (rodadas=$fitness_rounds_status, resumo=$fitness_summary_status)." >&2
    printf 'rounds_response=%s\nsummary_response=%s\n' \
      "$(cat "$fitness_rounds_file")" "$(cat "$fitness_summary_file")" >&2
    exit 1
  fi
  fitness_valid="$(python3 - "$fitness_rounds_file" "$fitness_summary_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    rounds = json.load(source)
with open(sys.argv[2], encoding="utf-8") as source:
    summary = json.load(source)
totals = {"distanceKm", "averageSpeedKmh", "metersPerMinute", "entries"}
valid_rounds = isinstance(rounds.get("rounds"), list)
summaries = summary.get("summaries")
valid_summary = isinstance(summaries, dict) and all(
    isinstance(summaries.get(kind), dict) and totals <= summaries[kind].keys()
    for kind in ("official", "friendly")
)
print(int(valid_rounds and valid_summary))
PY
)"
  printf 'fitness_rounds=%s fitness_summary=%s valid=%s\n' \
    "$fitness_rounds_status" "$fitness_summary_status" "$fitness_valid"
  [[ "$fitness_rounds_status" == "200" && "$fitness_summary_status" == "200" && "$fitness_valid" == "1" ]]
fi
