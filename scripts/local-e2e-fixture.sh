#!/usr/bin/env bash
set -euo pipefail

action="${1:-create}"
environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
state_file="${LOCAL_E2E_STATE_FILE:-/home/danie/pelada-homologacao/runtime/frontend-e2e.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
auth_url="${SUPABASE_AUTH_URL:-http://127.0.0.1:8000}"
backend_url="${IDENTITY_BACKEND_URL:-http://127.0.0.1:3001}"
league_id="${LOCAL_E2E_LEAGUE_ID:-b0000000-0000-0000-0000-000000000001}"

service_role_key="$(sed -n 's/^SERVICE_ROLE_KEY=//p' "$environment_file" | head -n 1)"
if [[ -z "$service_role_key" ]]; then
  echo "SERVICE_ROLE_KEY local indisponível." >&2
  exit 1
fi

state_value() {
  sed -n "s/^$1=//p" "$state_file" | head -n 1
}

cleanup_fixture() {
  if [[ ! -f "$state_file" ]]; then
    echo "E2E_FIXTURE_ALREADY_CLEAN"
    return
  fi

  local user_id player_id
  user_id="$(state_value E2E_USER_ID)"
  player_id="$(state_value E2E_PLAYER_ID)"

  if [[ "$user_id" =~ ^[0-9a-f-]{36}$ ]]; then
    docker exec "$database_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q -c \
      "DELETE FROM public.league_members WHERE user_id = '$user_id'::uuid;" >/dev/null
    curl -sS -o /dev/null -X DELETE \
      -H "apikey: $service_role_key" -H "Authorization: Bearer $service_role_key" \
      "$auth_url/auth/v1/admin/users/$user_id" || true
  fi
  if [[ "$player_id" =~ ^[0-9a-f-]{36}$ ]]; then
    docker exec "$database_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q -c \
      "DELETE FROM public.players WHERE id = '$player_id'::uuid
         AND NOT EXISTS (SELECT 1 FROM public.account_profiles WHERE player_id = '$player_id'::uuid);" >/dev/null || true
  fi
  rm -f -- "$state_file"
  echo "E2E_FIXTURE_CLEANED"
}

if [[ "$action" == "cleanup" ]]; then
  cleanup_fixture
  exit 0
fi
if [[ "$action" != "create" ]]; then
  echo "Uso: $0 [create|cleanup]" >&2
  exit 2
fi

cleanup_fixture >/dev/null
mkdir -p "$(dirname "$state_file")"

email="codex.e2e.$(date +%s).$$@example.test"
password="LocalE2E-$(openssl rand -hex 12)"
response_file="$(mktemp /tmp/liga-e2e-user-XXXXXX.json)"
login_file="$(mktemp /tmp/liga-e2e-login-XXXXXX.json)"
trap 'rm -f -- "$response_file" "$login_file"' EXIT

json_value() {
  python3 -c "import json,sys; value=json.load(sys.stdin); print(value.get('$1', ''))"
}

create_status="$(curl -sS -o "$response_file" -w '%{http_code}' -X POST \
  -H "apikey: $service_role_key" -H "Authorization: Bearer $service_role_key" \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true,\"user_metadata\":{\"name\":\"Conta E2E Local\"}}" \
  "$auth_url/auth/v1/admin/users")"
user_id="$(json_value id < "$response_file")"
if [[ "$create_status" != "200" || ! "$user_id" =~ ^[0-9a-f-]{36}$ ]]; then
  echo "Falha ao criar conta E2E local ($create_status)." >&2
  exit 1
fi

login_status="$(curl -sS -o "$login_file" -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' --data "{\"email\":\"$email\",\"password\":\"$password\"}" \
  "$backend_url/api/identity/login")"
access_token="$(json_value access_token < "$login_file")"
if [[ "$login_status" != "200" || -z "$access_token" ]]; then
  curl -sS -o /dev/null -X DELETE \
    -H "apikey: $service_role_key" -H "Authorization: Bearer $service_role_key" \
    "$auth_url/auth/v1/admin/users/$user_id" || true
  echo "Falha ao autenticar conta E2E local ($login_status)." >&2
  exit 1
fi

curl -sS -o /dev/null -X POST -H "Authorization: Bearer $access_token" \
  "$backend_url/api/callups/repair-player"
player_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT player_id FROM public.account_profiles WHERE user_id = '$user_id'::uuid")"
if [[ ! "$player_id" =~ ^[0-9a-f-]{36}$ ]]; then
  curl -sS -o /dev/null -X DELETE \
    -H "apikey: $service_role_key" -H "Authorization: Bearer $service_role_key" \
    "$auth_url/auth/v1/admin/users/$user_id" || true
  echo "Conta E2E não recebeu jogador local." >&2
  exit 1
fi

docker exec "$database_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q -c "
  INSERT INTO public.league_members (
    league_id, player_id, user_id, role, is_active, is_favorite
  ) VALUES (
    '$league_id'::uuid, '$player_id'::uuid, '$user_id'::uuid, 'admin', true, true
  )
  ON CONFLICT (league_id, player_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        role = 'admin',
        is_active = true,
        is_favorite = true;
" >/dev/null

round_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT id FROM public.rounds WHERE league_id = '$league_id'::uuid ORDER BY date DESC, created_at DESC LIMIT 1")"
match_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT match_item.id FROM public.matches match_item
     JOIN public.rounds round_item ON round_item.id = match_item.round_id
    WHERE round_item.league_id = '$league_id'::uuid
    ORDER BY round_item.date DESC, match_item.created_at DESC LIMIT 1")"

umask 077
printf '%s\n' \
  "E2E_ADMIN_EMAIL=$email" \
  "E2E_ADMIN_PASSWORD=$password" \
  "E2E_USER_ID=$user_id" \
  "E2E_PLAYER_ID=$player_id" \
  "E2E_LEAGUE_ID=$league_id" \
  "E2E_ROUND_ID=$round_id" \
  "E2E_MATCH_ID=$match_id" \
  > "$state_file"

echo "E2E_FIXTURE_READY league=$league_id round=$round_id match=$match_id"
