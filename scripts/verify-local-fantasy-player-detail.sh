#!/usr/bin/env bash
set -u

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
backend_url="${BACKEND_URL:-http://127.0.0.1:3002}"

jwt_secret="$(sed -n 's/^JWT_SECRET=//p' "$environment_file" | head -n 1)"
if [[ -z "$jwt_secret" ]]; then
  echo "Segredo JWT local indisponível para o smoke da ficha Fantasy." >&2
  exit 1
fi

fixture="$(docker exec "$database_container" psql -U postgres -d postgres -AtF '|' -c \
  "SELECT lineup.user_id, fantasy_season.league_id, fantasy_round.id, player.player_id
     FROM public.fantasy_lineups lineup
     JOIN public.fantasy_lineup_players player ON player.lineup_id=lineup.id
     JOIN public.fantasy_rounds fantasy_round ON fantasy_round.id=lineup.fantasy_round_id
     JOIN public.fantasy_seasons fantasy_season ON fantasy_season.id=fantasy_round.fantasy_season_id
     JOIN public.league_members member ON member.league_id=fantasy_season.league_id
       AND member.user_id=lineup.user_id AND member.is_active
    ORDER BY (fantasy_round.market_status <> 'open') DESC,lineup.updated_at DESC,player.slot_index
    LIMIT 1")"
IFS='|' read -r user_id league_id fantasy_round_id player_id <<< "$fixture"
if [[ -z "${user_id:-}" || -z "${league_id:-}" || -z "${fantasy_round_id:-}" || -z "${player_id:-}" ]]; then
  echo "A homologação local não possui atleta escalado para validar a ficha Fantasy." >&2
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
response_file="$(mktemp /tmp/liga-fantasy-player-XXXXXX.json)"
trap 'rm -f -- "$response_file"' EXIT

failures=0
checks=0
check_detail() {
  local label="$1"
  local path="$2"
  local status
  status="$(curl -sS -o "$response_file" -w '%{http_code}' \
    -H "Authorization: Bearer $token" "${backend_url%/}$path")"
  checks=$((checks + 1))
  printf '%-38s %s\n' "$label" "$status"
  if [[ "$status" != "200" ]] || ! grep -q '"roundDetail"' "$response_file" || ! grep -q '"history"' "$response_file"; then
    failures=$((failures + 1))
    printf '  resposta: %s\n' "$(head -c 700 "$response_file")" >&2
  fi
}

check_detail "fantasy.player-detail-current" "/api/fantasy/leagues/$league_id/players/$player_id"
check_detail "fantasy.player-detail-history" "/api/fantasy/leagues/$league_id/players/$player_id?fantasyRoundId=$fantasy_round_id"

if (( failures > 0 )); then
  echo "$failures de $checks consultas da ficha Fantasy falharam." >&2
  exit 1
fi

echo "Ficha Fantasy local aprovada: $checks de $checks consultas preservaram histórico e detalhe da rodada."
