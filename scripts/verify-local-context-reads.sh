#!/usr/bin/env bash
set -u

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
backend_url="${BACKEND_URL:-http://127.0.0.1:3001}"

jwt_secret="$(sed -n 's/^JWT_SECRET=//p' "$environment_file" | head -n 1)"
if [[ -z "$jwt_secret" ]]; then
  echo "Segredo JWT local indisponível para o smoke dos contextos." >&2
  exit 1
fi

admin_row="$(docker exec "$database_container" psql -U postgres -d postgres -AtF '|' -c \
  "SELECT member.user_id, member.league_id
     FROM public.league_members member
     JOIN public.account_profiles profile ON profile.user_id = member.user_id
    WHERE member.role = 'admin' AND member.is_active AND member.user_id IS NOT NULL
      AND profile.role = 'admin'
      AND substring(member.league_id::text, 15, 1) IN ('1','2','3','4','5','6','7','8')
      AND substring(member.league_id::text, 20, 1) IN ('8','9','a','b')
    ORDER BY member.joined_at DESC LIMIT 1")"
user_id="${admin_row%%|*}"
league_id="${admin_row#*|}"
if [[ -z "$user_id" || -z "$league_id" || "$user_id" == "$admin_row" ]]; then
  echo "A homologação local não possui administrador ativo de liga." >&2
  exit 1
fi

season_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT id FROM public.seasons WHERE league_id = '$league_id'::uuid ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1")"
round_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT round_entry.id FROM public.rounds round_entry JOIN public.seasons season ON season.id = round_entry.season_id WHERE season.league_id = '$league_id'::uuid ORDER BY round_entry.created_at DESC LIMIT 1")"
match_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT match_entry.id FROM public.matches match_entry JOIN public.rounds round_entry ON round_entry.id = match_entry.round_id JOIN public.seasons season ON season.id = round_entry.season_id WHERE season.league_id = '$league_id'::uuid ORDER BY match_entry.created_at DESC LIMIT 1")"
player_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT player_id FROM public.league_members WHERE league_id = '$league_id'::uuid AND is_active AND player_id IS NOT NULL ORDER BY joined_at LIMIT 1")"

base64_url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
issued_at="$(date +%s)"
expires_at="$((issued_at + 900))"
header="$(printf '{"alg":"HS256","typ":"JWT"}' | base64_url)"
payload="$(printf \
  '{"aud":"authenticated","exp":%s,"iat":%s,"iss":"supabase","sub":"%s","role":"authenticated","aal":"aal1","is_anonymous":false}' \
  "$expires_at" "$issued_at" "$user_id" | base64_url)"
signature="$(printf '%s' "$header.$payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64_url)"
token="$header.$payload.$signature"
response_file="$(mktemp /tmp/liga-context-read-XXXXXX.json)"
trap 'rm -f -- "$response_file"' EXIT

failures=0
checks=0
check_get() {
  local label="$1"
  local path="$2"
  local expected_statuses="${3:-200}"
  local status
  status="$(curl -sS -o "$response_file" -w '%{http_code}' \
    -H "Authorization: Bearer $token" "${backend_url%/}$path")"
  checks=$((checks + 1))
  printf '%-38s %s\n' "$label" "$status"
  if [[ ",$expected_statuses," != *",$status,"* ]]; then
    failures=$((failures + 1))
    printf '  resposta: %s\n' "$(head -c 500 "$response_file")" >&2
  fi
}

check_get "callups.active" "/api/callups/leagues/$league_id/active"
check_get "callups.agenda" "/api/callups/leagues/$league_id/agenda"

check_get "rounds.active-league" "/api/rounds/leagues/$league_id/active-league"
check_get "rounds.prelists" "/api/rounds/leagues/$league_id/prelists"
check_get "rounds.next-team-offset" "/api/rounds/leagues/$league_id/next-team-preset-offset"
if [[ -n "$season_id" ]]; then
  check_get "rounds.by-season" "/api/rounds/seasons/$season_id"
fi
if [[ -n "$round_id" ]]; then
  check_get "rounds.detail" "/api/rounds/leagues/$league_id/$round_id"
  check_get "rounds.match-setup" "/api/rounds/leagues/$league_id/$round_id/match-setup"
  check_get "rounds.prelist" "/api/rounds/leagues/$league_id/$round_id/prelist"
  check_get "rounds.draft-workspace" "/api/rounds/leagues/$league_id/$round_id/draft-workspace"
fi

if [[ -n "$match_id" ]]; then
  check_get "matches.detail" "/api/matches/leagues/$league_id/$match_id"
  check_get "matches.audit" "/api/matches/leagues/$league_id/$match_id/audit"
fi

check_get "statistics.dashboard" "/api/statistics/leagues/$league_id/dashboard"
check_get "statistics.ranking" "/api/statistics/leagues/$league_id/ranking"
check_get "statistics.ranking-experience" "/api/statistics/leagues/$league_id/ranking/experience"
check_get "statistics.player-card-overalls" "/api/statistics/leagues/$league_id/player-card-overalls"
check_get "statistics.team-standings" "/api/statistics/leagues/$league_id/team-standings"
check_get "statistics.reprocess-preview" "/api/statistics/leagues/$league_id/reprocess/preview"
check_get "statistics.friendlies" "/api/statistics/leagues/$league_id/friendlies"
check_get "statistics.overall-shadow" "/api/statistics/leagues/$league_id/overall/shadow"
check_get "statistics.scoring-bq" "/api/statistics/leagues/$league_id/scoring/bq"
check_get "statistics.scoring-column-c" "/api/statistics/leagues/$league_id/scoring/column-c"
if [[ -n "$round_id" ]]; then
  check_get "statistics.round" "/api/statistics/leagues/$league_id/rounds/$round_id" "200,404"
fi
if [[ -n "$player_id" ]]; then
  check_get "statistics.player-ranking" "/api/statistics/leagues/$league_id/ranking/players/$player_id"
fi

check_get "finance.expenses" "/api/finance/leagues/$league_id/expenses"
check_get "finance.recipients" "/api/finance/leagues/$league_id/recipients"
check_get "finance.rounds" "/api/finance/leagues/$league_id/rounds"
check_get "finance.has-pending" "/api/finance/leagues/$league_id/rounds/has-pending"
check_get "finance.audit-log" "/api/finance/leagues/$league_id/audit-log"
if [[ -n "$round_id" ]]; then
  check_get "finance.workspace" "/api/finance/leagues/$league_id/rounds/$round_id/workspace"
  check_get "finance.players" "/api/finance/leagues/$league_id/rounds/$round_id/players"
  check_get "finance.obligations" "/api/finance/leagues/$league_id/rounds/$round_id/obligations"
  check_get "finance.expense-selections" "/api/finance/leagues/$league_id/rounds/$round_id/expense-selections"
  check_get "finance.charge-lines" "/api/finance/leagues/$league_id/rounds/$round_id/charge-lines"
fi

check_get "cards.packs" "/api/cards/leagues/$league_id/packs"
check_get "cards.inventory" "/api/cards/leagues/$league_id/inventory"
check_get "cards.inventory-count" "/api/cards/leagues/$league_id/inventory/count"
if [[ -n "$round_id" ]]; then
  check_get "cards.active-round" "/api/cards/leagues/$league_id/rounds/$round_id/active"
fi

check_get "cosmetics.dashboard" "/api/cosmetics/dashboard?leagueId=$league_id"
check_get "cosmetics.equipped-me" "/api/cosmetics/equipped/me"
if [[ -n "$player_id" ]]; then
  check_get "cosmetics.equipped-player" "/api/cosmetics/equipped/players/$player_id"
fi

check_get "collective.summary" "/api/collective/leagues/$league_id/summary"
check_get "collective.room" "/api/collective/leagues/$league_id/room"
check_get "collective.admin-previous" "/api/collective/leagues/$league_id/admin-previous"
check_get "operations.performance-summary" "/api/operations/performance-summary?hours=24"

printf 'context_read_checks=%s failures=%s league=%s\n' "$checks" "$failures" "$league_id"
if [[ "$failures" -ne 0 ]]; then
  exit 1
fi
