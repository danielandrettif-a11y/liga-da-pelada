#!/usr/bin/env bash
set -euo pipefail

state_file="${LOCAL_E2E_STATE_FILE:-/home/danie/pelada-homologacao/runtime/frontend-e2e.env}"
backend_url="${NOTIFICATIONS_BACKEND_URL:-http://127.0.0.1:3001}"
mock_url="${LOCAL_QSTASH_MOCK_URL:-http://127.0.0.1:8081}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"

if [[ ! -f "$state_file" ]]; then
  echo "Fixture E2E local não encontrada. Execute scripts/local-e2e-fixture.sh create." >&2
  exit 1
fi

state_value() {
  sed -n "s/^$1=//p" "$state_file" | head -n 1
}

json_field() {
  local expression="$1"
  python3 -c "import json,sys; value=json.load(sys.stdin); result=$expression; print(json.dumps(result) if isinstance(result,(dict,list,bool)) else ('' if result is None else result))"
}

request_json() {
  local method="$1" url="$2" output="$3" data="${4:-}"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" -H "Authorization: Bearer $access_token")
  if [[ -n "$data" ]]; then
    args+=(-H 'Content-Type: application/json' --data "$data")
  fi
  curl "${args[@]}" "$url"
}

email="$(state_value E2E_ADMIN_EMAIL)"
password="$(state_value E2E_ADMIN_PASSWORD)"
user_id="$(state_value E2E_USER_ID)"
league_id="$(state_value E2E_LEAGUE_ID)"
endpoint="https://push.example.test/local-notification-smoke-$user_id"
dedupe_key="local-notification-smoke-$user_id"
work_dir="$(mktemp -d /tmp/liga-notifications-XXXXXX)"
original_preferences=""
preferences_changed=false

cleanup() {
  if [[ "$preferences_changed" == true && -n "$original_preferences" && -n "${access_token:-}" ]]; then
    request_json PUT "${backend_url%/}/api/notifications/preferences" "$work_dir/restore.json" "$original_preferences" >/dev/null || true
  fi
  docker exec "$database_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q -c \
    "DELETE FROM public.push_subscriptions WHERE user_id = '$user_id'::uuid AND endpoint = '$endpoint';
     DELETE FROM public.user_inbox_notifications WHERE user_id = '$user_id'::uuid AND dedupe_key = '$dedupe_key';" >/dev/null || true
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

login_status="$(curl -sS -o "$work_dir/login.json" -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$email\",\"password\":\"$password\"}" \
  "${backend_url%/}/api/identity/login")"
access_token="$(json_field "value.get('access_token')" < "$work_dir/login.json")"
[[ "$login_status" == "200" && -n "$access_token" ]]

public_key_status="$(request_json GET "${backend_url%/}/api/notifications/push/public-key" "$work_dir/public-key.json")"
system_status="$(request_json GET "${backend_url%/}/api/notifications/push/status" "$work_dir/status.json")"
python3 - "$work_dir/public-key.json" "$work_dir/status.json" <<'PY'
import json, sys
public_key = json.load(open(sys.argv[1], encoding="utf-8"))
status = json.load(open(sys.argv[2], encoding="utf-8"))
assert public_key.get("success") is True and public_key.get("publicKey")
assert public_key.get("backgroundAlertsConfigured") is True
assert status == {
    "pushConfigured": True,
    "pushConfigurationError": None,
    "backgroundAlertsConfigured": True,
}
PY

preferences_status="$(request_json GET "${backend_url%/}/api/notifications/preferences/$league_id" "$work_dir/preferences.json")"
original_preferences="$(python3 - "$work_dir/preferences.json" <<'PY'
import json, sys
value = json.load(open(sys.argv[1], encoding="utf-8"))
keys = ("matchPushEnabled", "callupPushEnabled", "cartolaPushEnabled", "cartolaEmailEnabled", "collectivePushEnabled")
assert all(isinstance(value.get(key), bool) for key in keys)
print(json.dumps({key: value[key] for key in keys}, separators=(",", ":")))
PY
)"
toggled_preferences="$(python3 -c 'import json,sys; value=json.loads(sys.argv[1]); print(json.dumps({key:not item for key,item in value.items()},separators=(",",":")))' "$original_preferences")"
preferences_changed=true
update_status="$(request_json PUT "${backend_url%/}/api/notifications/preferences" "$work_dir/update.json" "$toggled_preferences")"
updated_status="$(request_json GET "${backend_url%/}/api/notifications/preferences/$league_id" "$work_dir/updated.json")"
python3 - "$work_dir/update.json" "$work_dir/updated.json" "$toggled_preferences" <<'PY'
import json, sys
result = json.load(open(sys.argv[1], encoding="utf-8"))
actual = json.load(open(sys.argv[2], encoding="utf-8"))
expected = json.loads(sys.argv[3])
assert result == {"success": True}
assert all(actual.get(key) == value for key, value in expected.items())
PY
restore_status="$(request_json PUT "${backend_url%/}/api/notifications/preferences" "$work_dir/restore.json" "$original_preferences")"
preferences_changed=false

subscribe_status="$(request_json POST "${backend_url%/}/api/notifications/push/subscribe" "$work_dir/subscribe.json" \
  "{\"endpoint\":\"$endpoint\",\"expirationTime\":null,\"keys\":{\"p256dh\":\"local-contract-p256dh\",\"auth\":\"local-contract-auth\"},\"userAgent\":\"local-notification-smoke\"}")"
stored_subscription="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT count(*) FROM public.push_subscriptions WHERE user_id = '$user_id'::uuid AND endpoint = '$endpoint'")"
unsubscribe_status="$(request_json POST "${backend_url%/}/api/notifications/push/unsubscribe" "$work_dir/unsubscribe.json" "{\"endpoint\":\"$endpoint\"}")"
remaining_subscription="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT count(*) FROM public.push_subscriptions WHERE user_id = '$user_id'::uuid AND endpoint = '$endpoint'")"

sync_status="$(request_json POST "${backend_url%/}/api/notifications/inbox/sync" "$work_dir/sync.json" \
  "{\"leagueId\":\"$league_id\",\"desired\":[{\"type\":\"local_validation\",\"key\":\"$dedupe_key\",\"title\":\"Validação local\",\"body\":\"Contrato de notificações\",\"href\":\"/mais/notificacoes\"}]}")"
notification_id="$(python3 - "$work_dir/sync.json" "$dedupe_key" <<'PY'
import json, sys
items = json.load(open(sys.argv[1], encoding="utf-8"))
item = next((item for item in items if item.get("title") == "Validação local"), None)
assert item and item.get("state") == "active"
print(item["id"])
PY
)"
preview_status="$(request_json GET "${backend_url%/}/api/notifications/inbox/preview" "$work_dir/preview.json")"
python3 - "$work_dir/preview.json" "$notification_id" <<'PY'
import json, sys
items = json.load(open(sys.argv[1], encoding="utf-8"))
assert any(item.get("id") == sys.argv[2] for item in items)
PY
read_status="$(request_json POST "${backend_url%/}/api/notifications/inbox/read" "$work_dir/read.json" "{\"ids\":[\"$notification_id\"]}")"
python3 - "$work_dir/read.json" <<'PY'
import json, sys
assert json.load(open(sys.argv[1], encoding="utf-8")) == {"success": True}
PY

publishes_before="$(curl -fsS "$mock_url/metrics" | json_field "value.get('acceptedPublishes')")"
schedule_status="$(request_json POST "${backend_url%/}/api/notifications/test-push" "$work_dir/schedule.json" '{}')"
publishes_after="$(curl -fsS "$mock_url/metrics" | json_field "value.get('acceptedPublishes')")"
python3 - "$work_dir/schedule.json" "$publishes_before" "$publishes_after" <<'PY'
import json, sys
assert json.load(open(sys.argv[1], encoding="utf-8")) == {"success": True, "scheduled": True}
assert int(sys.argv[3]) == int(sys.argv[2]) + 1
PY

printf 'public_key=%s status=%s preferences=%s/%s/%s push=%s/%s inbox=%s/%s/%s schedule=%s publishes=%s->%s\n' \
  "$public_key_status" "$system_status" "$preferences_status" "$update_status" "$restore_status" \
  "$subscribe_status:$stored_subscription" "$unsubscribe_status:$remaining_subscription" \
  "$sync_status" "$preview_status" "$read_status" "$schedule_status" "$publishes_before" "$publishes_after"

[[ "$public_key_status" == "200" && "$system_status" == "200" \
  && "$preferences_status" == "200" && "$update_status" == "200" && "$updated_status" == "200" && "$restore_status" == "200" \
  && "$subscribe_status" == "200" && "$stored_subscription" == "1" \
  && "$unsubscribe_status" == "200" && "$remaining_subscription" == "0" \
  && "$sync_status" == "200" && "$preview_status" == "200" && "$read_status" == "200" \
  && "$schedule_status" == "200" ]]

