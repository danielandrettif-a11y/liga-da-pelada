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
speed_ratings_file="$(mktemp /tmp/liga-roster-speed-ratings-XXXXXX.json)"
speed_draw_file="$(mktemp /tmp/liga-roster-speed-draw-XXXXXX.json)"
activity_state_file="$(mktemp /tmp/liga-roster-activity-state-XXXXXX.json)"
activity_players_file="$(mktemp /tmp/liga-roster-activity-players-XXXXXX.json)"
catalog_file="$(mktemp /tmp/liga-roster-catalog-XXXXXX.json)"
selectable_catalog_file="$(mktemp /tmp/liga-roster-selectable-catalog-XXXXXX.json)"
player_detail_file="$(mktemp /tmp/liga-roster-player-detail-XXXXXX.json)"
registration_history_file="$(mktemp /tmp/liga-roster-registration-history-XXXXXX.json)"
merge_candidates_file="$(mktemp /tmp/liga-roster-merge-candidates-XXXXXX.json)"
player_playtime_file="$(mktemp /tmp/liga-roster-player-playtime-XXXXXX.json)"
player_club_goals_file="$(mktemp /tmp/liga-roster-player-club-goals-XXXXXX.json)"
player_monthly_awards_file="$(mktemp /tmp/liga-roster-player-monthly-awards-XXXXXX.json)"
player_belts_file="$(mktemp /tmp/liga-roster-player-belts-XXXXXX.json)"
monthly_winners_file="$(mktemp /tmp/liga-roster-monthly-winners-XXXXXX.json)"
player_round_history_file="$(mktemp /tmp/liga-roster-player-round-history-XXXXXX.json)"
player_award_seasons_file="$(mktemp /tmp/liga-roster-player-award-seasons-XXXXXX.json)"
player_create_file="$(mktemp /tmp/liga-roster-player-create-XXXXXX.json)"
player_update_file="$(mktemp /tmp/liga-roster-player-update-XXXXXX.json)"
player_import_file="$(mktemp /tmp/liga-roster-player-import-XXXXXX.json)"
player_swap_file="$(mktemp /tmp/liga-roster-player-swap-XXXXXX.json)"
smoke_created_player_id=""
smoke_imported_player_id=""
cleanup_smoke_players() {
  local player_ids=()
  [[ "$smoke_created_player_id" =~ ^[0-9a-f-]{36}$ ]] && player_ids+=("'$smoke_created_player_id'::uuid")
  [[ "$smoke_imported_player_id" =~ ^[0-9a-f-]{36}$ ]] && player_ids+=("'$smoke_imported_player_id'::uuid")
  if [[ "${#player_ids[@]}" -gt 0 ]]; then
    local joined
    joined="$(IFS=,; echo "${player_ids[*]}")"
    docker exec "$database_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
      -c "DELETE FROM public.callup_entries WHERE player_id IN ($joined)" >/dev/null || true
    docker exec "$database_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
      -c "DELETE FROM public.players WHERE id IN ($joined)" >/dev/null || true
  fi
}
cleanup_roster_smoke() {
  cleanup_smoke_players
  rm -f -- "$response_file" "$tag_response_file" "$fitness_rounds_file" "$fitness_summary_file" \
    "$speed_ratings_file" "$speed_draw_file" "$activity_state_file" "$activity_players_file" \
    "$catalog_file" "$selectable_catalog_file" "$player_detail_file" "$registration_history_file" \
    "$merge_candidates_file" "$player_playtime_file" "$player_club_goals_file" \
    "$player_monthly_awards_file" "$player_belts_file" "$monthly_winners_file" \
    "$player_round_history_file" "$player_award_seasons_file" "$player_create_file" \
    "$player_update_file" "$player_import_file" "$player_swap_file"
}
trap cleanup_roster_smoke EXIT

status="$(curl -sS -o "$response_file" -w '%{http_code}' \
  -H "Authorization: Bearer $header.$payload.$signature" \
  "${backend_url%/}/api/roster/me/career")"
if [[ "$status" != "200" ]]; then
  echo "Consulta local de carreira falhou ($status)." >&2
  exit 1
fi

speed_admin_row="$(docker exec "$database_container" psql -U postgres -d postgres -AtF '|' -c \
  "SELECT user_id, league_id FROM public.league_members WHERE role = 'admin' AND is_active AND user_id IS NOT NULL ORDER BY joined_at LIMIT 1")"
speed_admin_id="${speed_admin_row%%|*}"
speed_league_id="${speed_admin_row#*|}"
if [[ -n "$speed_admin_id" && -n "$speed_league_id" && "$speed_admin_id" != "$speed_admin_row" ]]; then
  speed_payload="$(printf \
    '{"aud":"authenticated","exp":%s,"iat":%s,"iss":"supabase","sub":"%s","role":"authenticated","aal":"aal1","is_anonymous":false}' \
    "$expires_at" "$issued_at" "$speed_admin_id" | base64_url)"
  speed_signature="$(printf '%s' "$header.$speed_payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64_url)"
  speed_token="$header.$speed_payload.$speed_signature"
  speed_ratings_status="$(curl -sS -o "$speed_ratings_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/speed-ratings")"
  mapfile -t speed_players < <(docker exec "$database_container" psql -U postgres -d postgres -Atc \
    "SELECT member.player_id FROM public.league_members member JOIN public.players player ON player.id = member.player_id WHERE member.league_id = '$speed_league_id'::uuid AND member.is_active AND player.is_selectable AND player.member_category IN ('player','guest') ORDER BY member.joined_at LIMIT 2")
  speed_draw_status="skip"
  if [[ "${#speed_players[@]}" -eq 2 ]]; then
    speed_body="$(printf '{"playerIds":["%s","%s"],"teamCount":2,"playersPerTeam":1}' \
      "${speed_players[0]}" "${speed_players[1]}")"
    speed_draw_status="$(curl -sS -o "$speed_draw_file" -w '%{http_code}' \
      -H "Authorization: Bearer $speed_token" -H 'Content-Type: application/json' \
      --data "$speed_body" \
      "${backend_url%/}/api/roster/leagues/$speed_league_id/speed-draw")"
  fi
  speed_valid="$(python3 - "$speed_ratings_file" "$speed_draw_file" "$speed_draw_status" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    ratings = json.load(source).get("ratings")
valid = isinstance(ratings, dict) and all(value in (None, 1, 2, 3) for value in ratings.values())
if sys.argv[3] == "200":
    with open(sys.argv[2], encoding="utf-8") as source:
        draw = json.load(source)
    valid = valid and isinstance(draw.get("teams"), list) and isinstance(draw.get("teamSummaries"), list)
    valid = valid and isinstance(draw.get("unratedCount"), int) and isinstance(draw.get("attendanceOrder"), list)
print(int(valid))
PY
)"
  printf 'speed_ratings=%s speed_draw=%s valid=%s\n' \
    "$speed_ratings_status" "$speed_draw_status" "$speed_valid"
  if [[ "$speed_ratings_status" != "200" || "$speed_draw_status" != "200" || "$speed_valid" != "1" ]]; then
    echo "Leitura ou sorteio local por velocidade falhou." >&2
    exit 1
  fi
  activity_state_status="$(curl -sS -o "$activity_state_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/activity/unread-state")"
  activity_players_status="$(curl -sS -o "$activity_players_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/activity/unread-players")"
  activity_valid="$(python3 - "$activity_state_file" "$activity_players_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    state = json.load(source)
with open(sys.argv[2], encoding="utf-8") as source:
    players = json.load(source)
valid_state = isinstance(state.get("count"), int) and state["count"] >= 0
valid_state = valid_state and (state.get("lastSeenAt") is None or isinstance(state["lastSeenAt"], str))
valid_players = isinstance(players.get("playerIds"), list) and all(isinstance(item, str) for item in players["playerIds"])
valid_players = valid_players and (players.get("seenThrough") is None or isinstance(players["seenThrough"], str))
print(int(valid_state and valid_players))
PY
)"
  printf 'roster_activity_state=%s roster_activity_players=%s valid=%s\n' \
    "$activity_state_status" "$activity_players_status" "$activity_valid"
  if [[ "$activity_state_status" != "200" || "$activity_players_status" != "200" || "$activity_valid" != "1" ]]; then
    echo "Leitura local das novidades do elenco falhou." >&2
    exit 1
  fi

  catalog_status="$(curl -sS -o "$catalog_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players")"
  selectable_catalog_status="$(curl -sS -o "$selectable_catalog_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players?selectable_only=true")"
  catalog_player_id="$(python3 - "$catalog_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    players = json.load(source).get("players", [])
print(players[0].get("id", "") if players else "")
PY
)"
  player_detail_status="skip"
  if [[ -n "$catalog_player_id" ]]; then
    player_detail_status="$(curl -sS -o "$player_detail_file" -w '%{http_code}' \
      -H "Authorization: Bearer $speed_token" \
      "${backend_url%/}/api/roster/leagues/$speed_league_id/players/$catalog_player_id")"
  fi
  catalog_valid="$(python3 - "$catalog_file" "$selectable_catalog_file" "$player_detail_file" "$player_detail_status" <<'PY'
import json, sys
required = {
    "id", "name", "nickname", "profile_bio", "avatar_url", "avatar_alternate_url",
    "player_profile", "initial_player_profile", "profile_decision_source", "profile_source_round_id",
    "overall_traits", "overall_seed_mode", "is_goalkeeper", "member_category", "is_selectable",
    "is_competitive_profile_complete", "show_fitness_stats", "registration_source", "profile_scope",
    "created_by_user_id", "created_at",
}
with open(sys.argv[1], encoding="utf-8") as source:
    catalog = json.load(source).get("players")
with open(sys.argv[2], encoding="utf-8") as source:
    selectable = json.load(source).get("players")
valid = isinstance(catalog, list) and len(catalog) > 0 and all(required <= player.keys() for player in catalog)
valid = valid and isinstance(selectable, list) and all(required <= player.keys() for player in selectable)
valid = valid and all(player.get("is_selectable") and player.get("member_category") in ("player", "guest") for player in selectable)
if sys.argv[4] == "200":
    with open(sys.argv[3], encoding="utf-8") as source:
        detail = json.load(source).get("player")
    valid = valid and isinstance(detail, dict) and required <= detail.keys()
else:
    valid = False
print(int(valid))
PY
)"
  printf 'player_catalog=%s selectable_catalog=%s player_detail=%s valid=%s\n' \
    "$catalog_status" "$selectable_catalog_status" "$player_detail_status" "$catalog_valid"
  if [[ "$catalog_status" != "200" || "$selectable_catalog_status" != "200" \
    || "$player_detail_status" != "200" || "$catalog_valid" != "1" ]]; then
    echo "Leitura local do catálogo-base de jogadores falhou." >&2
    exit 1
  fi

  smoke_suffix="$(date +%s)-$$"
  create_body="$(printf '{"name":"Codex roster %s","member_category":"guest","player_profile":"defensive","overall_traits":["defensive"]}' "$smoke_suffix")"
  player_create_status="$(curl -sS -o "$player_create_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" -H 'Content-Type: application/json' \
    --data "$create_body" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players")"
  smoke_created_player_id="$(python3 - "$player_create_file" <<'PY'
import json, re, sys
with open(sys.argv[1], encoding="utf-8") as source:
    player_id = json.load(source).get("player", {}).get("id", "")
print(player_id if isinstance(player_id, str) and re.fullmatch(r"[0-9a-f-]{36}", player_id) else "")
PY
)"
  if [[ "$player_create_status" != "201" || -z "$smoke_created_player_id" ]]; then
    echo "Criação local de jogador descartável falhou ($player_create_status)." >&2
    cat "$player_create_file" >&2
    exit 1
  fi

  update_body='{"nickname":"Smoke BQ","is_selectable":true,"player_profile":"offensive","overall_traits":["offensive"]}'
  player_update_status="$(curl -sS -o "$player_update_file" -w '%{http_code}' \
    -X PATCH -H "Authorization: Bearer $speed_token" -H 'Content-Type: application/json' \
    --data "$update_body" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players/$smoke_created_player_id")"
  player_update_valid="$(python3 - "$player_update_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    player = json.load(source).get("player", {})
print(int(player.get("nickname") == "Smoke BQ" and player.get("is_selectable") is True
          and player.get("player_profile") == "offensive" and player.get("overall_traits") == ["offensive"]))
PY
)"
  if [[ "$player_update_status" != "200" || "$player_update_valid" != "1" ]]; then
    echo "Edição local do jogador descartável falhou ($player_update_status)." >&2
    exit 1
  fi

  docker exec "$database_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
    "UPDATE public.players SET avatar_url = 'smoke-active', avatar_alternate_url = 'smoke-alternate' WHERE id = '$smoke_created_player_id'::uuid" >/dev/null
  player_swap_status="$(curl -sS -o "$player_swap_file" -w '%{http_code}' \
    -X POST -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players/$smoke_created_player_id/swap-avatars")"
  swapped_avatar="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
    "SELECT avatar_url FROM public.players WHERE id = '$smoke_created_player_id'::uuid")"
  if [[ "$player_swap_status" != "204" || "$swapped_avatar" != "smoke-alternate" ]]; then
    echo "Troca local de avatares falhou ($player_swap_status)." >&2
    exit 1
  fi

  import_body="$(printf '{"names":["Codex import %s"]}' "$smoke_suffix")"
  player_import_status="$(curl -sS -o "$player_import_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" -H 'Content-Type: application/json' \
    --data "$import_body" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/guest-imports")"
  smoke_imported_player_id="$(python3 - "$player_import_file" <<'PY'
import json, re, sys
with open(sys.argv[1], encoding="utf-8") as source:
    payload = json.load(source)
guests = payload.get("guests", [])
player_id = guests[0].get("playerId", "") if len(guests) == 1 else ""
valid = payload.get("createdCount") == 1 and isinstance(player_id, str) and re.fullmatch(r"[0-9a-f-]{36}", player_id)
print(player_id if valid else "")
PY
)"
  if [[ "$player_import_status" != "201" || -z "$smoke_imported_player_id" ]]; then
    echo "Importação local de convidado descartável falhou ($player_import_status)." >&2
    cat "$player_import_file" >&2
    exit 1
  fi
  printf 'player_create=%s player_update=%s player_swap=%s guest_import=%s valid=1\n' \
    "$player_create_status" "$player_update_status" "$player_swap_status" "$player_import_status"
  cleanup_smoke_players
  cleanup_count="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
    "SELECT count(*) FROM public.players WHERE id IN ('$smoke_created_player_id'::uuid, '$smoke_imported_player_id'::uuid)")"
  if [[ "$cleanup_count" != "0" ]]; then
    echo "A limpeza das fixtures descartáveis do elenco falhou." >&2
    exit 1
  fi
  smoke_created_player_id=""
  smoke_imported_player_id=""

  registration_history_status="$(curl -sS -o "$registration_history_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/registrations")"
  merge_candidates_status="$(curl -sS -o "$merge_candidates_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players/$catalog_player_id/merge-candidates")"
  registration_valid="$(python3 - "$registration_history_file" "$merge_candidates_file" <<'PY'
import json, sys
event_fields = {
    "id", "player_id", "player_name", "avatar_url", "member_category", "source",
    "created_by_user_id", "created_at",
}
player_fields = {
    "id", "name", "nickname", "profile_bio", "avatar_url", "avatar_alternate_url",
    "player_profile", "initial_player_profile", "profile_decision_source", "profile_source_round_id",
    "overall_traits", "overall_seed_mode", "is_goalkeeper", "member_category", "is_selectable",
    "is_competitive_profile_complete", "show_fitness_stats", "registration_source", "profile_scope",
    "created_by_user_id", "created_at",
}
with open(sys.argv[1], encoding="utf-8") as source:
    events = json.load(source).get("events")
with open(sys.argv[2], encoding="utf-8") as source:
    candidates = json.load(source).get("players")
valid = isinstance(events, list) and all(event_fields <= event.keys() for event in events)
valid = valid and isinstance(candidates, list) and all(player_fields <= player.keys() for player in candidates)
print(int(valid))
PY
)"
  printf 'registration_history=%s merge_candidates=%s valid=%s\n' \
    "$registration_history_status" "$merge_candidates_status" "$registration_valid"
  if [[ "$registration_history_status" != "200" || "$merge_candidates_status" != "200" \
    || "$registration_valid" != "1" ]]; then
    echo "Leituras administrativas de cadastro falharam." >&2
    exit 1
  fi

  player_playtime_status="$(curl -sS -o "$player_playtime_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players/$catalog_player_id/playtime")"
  player_club_goals_status="$(curl -sS -o "$player_club_goals_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players/$catalog_player_id/club-goals")"
  player_performance_valid="$(python3 - "$player_playtime_file" "$player_club_goals_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    playtime = json.load(source).get("playtime")
with open(sys.argv[2], encoding="utf-8") as source:
    clubs = json.load(source).get("clubs")
valid = isinstance(playtime, dict) and all(
    isinstance(playtime.get(field), int) and playtime[field] >= 0
    for field in ("totalSeconds", "officialSeconds", "friendlySeconds")
)
club_fields = {"key", "name", "color", "crestUrl", "officialGoals", "friendlyGoals", "totalGoals"}
valid = valid and isinstance(clubs, list) and all(club_fields <= club.keys() for club in clubs)
print(int(valid))
PY
)"
  printf 'player_playtime=%s player_club_goals=%s valid=%s\n' \
    "$player_playtime_status" "$player_club_goals_status" "$player_performance_valid"
  if [[ "$player_playtime_status" != "200" || "$player_club_goals_status" != "200" \
    || "$player_performance_valid" != "1" ]]; then
    echo "Leituras de desempenho do perfil falharam." >&2
    exit 1
  fi

  previous_month="$(python3 - <<'PY'
from datetime import datetime
from zoneinfo import ZoneInfo
now = datetime.now(ZoneInfo("America/Sao_Paulo"))
year, month = (now.year - 1, 12) if now.month == 1 else (now.year, now.month - 1)
print(f"{year:04d}-{month:02d}-01")
PY
)"
  player_monthly_awards_status="$(curl -sS -o "$player_monthly_awards_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players/$catalog_player_id/monthly-awards")"
  player_belts_status="$(curl -sS -o "$player_belts_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players/$catalog_player_id/achievement-belts")"
  monthly_winners_status="$(curl -sS -o "$monthly_winners_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/monthly-awards/winners?period_start=$previous_month")"
  player_awards_valid="$(python3 - "$player_monthly_awards_file" "$player_belts_file" "$monthly_winners_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    awards = json.load(source).get("awards")
with open(sys.argv[2], encoding="utf-8") as source:
    belts = json.load(source).get("belts")
with open(sys.argv[3], encoding="utf-8") as source:
    winners = json.load(source).get("winners")
award_fields = {"type", "periodStart", "points", "roundsPlayed", "isFinal"}
belt_fields = {"slug", "name", "description", "recordValue", "unit", "scope", "roundId", "roundNumber", "roundDate", "team"}
winner_fields = award_fields | {"playerId", "playerName", "avatarUrl"}
valid = isinstance(awards, list) and all(award_fields <= item.keys() for item in awards)
valid = valid and isinstance(belts, list) and all(belt_fields <= item.keys() for item in belts)
valid = valid and isinstance(winners, list) and all(winner_fields <= item.keys() for item in winners)
print(int(valid))
PY
)"
  printf 'player_monthly_awards=%s player_belts=%s monthly_winners=%s valid=%s\n' \
    "$player_monthly_awards_status" "$player_belts_status" "$monthly_winners_status" "$player_awards_valid"
  if [[ "$player_monthly_awards_status" != "200" || "$player_belts_status" != "200" \
    || "$monthly_winners_status" != "200" || "$player_awards_valid" != "1" ]]; then
    echo "Leituras de prêmios do jogador falharam." >&2
    exit 1
  fi

  player_round_history_status="$(curl -sS -o "$player_round_history_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players/$catalog_player_id/round-history?round_type=official")"
  player_award_seasons_status="$(curl -sS -o "$player_award_seasons_file" -w '%{http_code}' \
    -H "Authorization: Bearer $speed_token" \
    "${backend_url%/}/api/roster/leagues/$speed_league_id/players/$catalog_player_id/award-seasons")"
  player_history_valid="$(python3 - "$player_round_history_file" "$player_award_seasons_file" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    history = json.load(source).get("history")
with open(sys.argv[2], encoding="utf-8") as source:
    seasons = json.load(source).get("seasons")
history_fields = {
    "id", "player_id", "round_id", "games", "wins", "draws", "losses", "goals", "assists",
    "points", "ranking_points", "legacy_points", "point_breakdown", "rounds",
}
season_fields = {"seasonId", "seasonNumber", "seasonStatus", "awards"}
valid = isinstance(history, list) and all(history_fields <= row.keys() for row in history)
valid = valid and all(isinstance(row.get("point_breakdown"), list) and isinstance(row.get("rounds"), dict) for row in history)
valid = valid and isinstance(seasons, list) and all(season_fields <= season.keys() for season in seasons)
valid = valid and all(isinstance(season.get("awards"), list) for season in seasons)
print(int(valid))
PY
)"
  printf 'player_round_history=%s player_award_seasons=%s valid=%s\n' \
    "$player_round_history_status" "$player_award_seasons_status" "$player_history_valid"
  if [[ "$player_round_history_status" != "200" || "$player_award_seasons_status" != "200" \
    || "$player_history_valid" != "1" ]]; then
    echo "Leituras históricas do jogador falharam." >&2
    exit 1
  fi
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
