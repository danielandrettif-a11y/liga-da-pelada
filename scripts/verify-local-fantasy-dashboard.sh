#!/usr/bin/env bash
set -u

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
backend_url="${BACKEND_URL:-http://127.0.0.1:3002}"

jwt_secret="$(sed -n 's/^JWT_SECRET=//p' "$environment_file" | head -n 1)"
if [[ -z "$jwt_secret" ]]; then
  echo "Segredo JWT local indisponível para o smoke do dashboard Fantasy." >&2
  exit 1
fi

fixture="$(docker exec "$database_container" psql -U postgres -d postgres -AtF '|' -c \
  "SELECT lineup.user_id, fantasy_season.league_id
     FROM public.fantasy_lineups lineup
     JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
     JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=fantasy_round.fantasy_season_id
     JOIN public.league_members member ON member.league_id=fantasy_season.league_id
       AND member.user_id=lineup.user_id AND member.is_active
    ORDER BY lineup.updated_at DESC LIMIT 1")"
IFS='|' read -r user_id league_id <<< "$fixture"
if [[ -z "${user_id:-}" || -z "${league_id:-}" ]]; then
  echo "A homologação local não possui conta Fantasy para validar o dashboard." >&2
  exit 1
fi

base64_url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
issued_at="$(date +%s)"
expires_at="$((issued_at + 900))"
header="$(printf '{"alg":"HS256","typ":"JWT"}' | base64_url)"
payload="$(printf \
  '{"aud":"authenticated","exp":%s,"iat":%s,"iss":"supabase","sub":"%s","role":"authenticated","aal":"aal1","is_anonymous":false}' \
  "$expires_at" "$issued_at" "$user_id" | base64_url)"
signature="$(printf '%s' "$header.$payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64_url)"
token="$header.$payload.$signature"
response_file="$(mktemp /tmp/liga-fantasy-dashboard-XXXXXX.json)"
trap 'rm -f -- "$response_file"' EXIT

status="$(curl -sS -o "$response_file" -w '%{http_code}' \
  -H "Authorization: Bearer $token" "${backend_url%/}/api/fantasy/leagues/$league_id/dashboard")"
printf '%-38s %s\n' "fantasy.dashboard" "$status"
if [[ "$status" != "200" ]]; then
  printf 'resposta: %s\n' "$(head -c 1200 "$response_file")" >&2
  exit 1
fi

for key in authenticated available fantasySeasonId fantasyRound market lineup insights radar account lastRound availablePacks inventoryCount liveProjection; do
  if ! grep -q "\"$key\"" "$response_file"; then
    echo "Dashboard sem o campo obrigatório: $key" >&2
    exit 1
  fi
done

if ! grep -q '"authenticated":true' "$response_file" || ! grep -q '"available":true' "$response_file"; then
  echo "Dashboard local não ficou disponível para a fixture autenticada." >&2
  exit 1
fi

echo "Dashboard Fantasy local aprovado com mercado, escalação, radar, conta, cartas, boletim e projeção."
