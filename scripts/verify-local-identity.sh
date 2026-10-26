#!/usr/bin/env bash
set -u

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
backend_url="${IDENTITY_BACKEND_URL:-http://127.0.0.1:3001}"
auth_url="${SUPABASE_AUTH_URL:-http://127.0.0.1:8000}"

service_role_key="$(sed -n 's/^SERVICE_ROLE_KEY=//p' "$environment_file" | head -n 1)"
jwt_secret="$(sed -n 's/^JWT_SECRET=//p' "$environment_file" | head -n 1)"
if [[ -z "$service_role_key" || -z "$jwt_secret" ]]; then
  echo "Chaves locais de Auth indisponíveis para o smoke descartável." >&2
  exit 1
fi

email="codex.identity.$(date +%s).$$@example.test"
password="Local-test-$(openssl rand -hex 12)"
new_password="Changed-$(openssl rand -hex 12)"
flow_id="$(openssl rand -hex 16)"
verifier="$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n')"
challenge="$(printf '%s' "$verifier" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
signup_file="$(mktemp /tmp/liga-identity-signup-XXXXXX.json)"
login_file="$(mktemp /tmp/liga-identity-login-XXXXXX.json)"
oauth_file="$(mktemp /tmp/liga-identity-oauth-XXXXXX.json)"
user_id=""

json_value() {
  python3 -c "import json,sys; value=json.load(sys.stdin); print(value.get('$1', ''))"
}

cleanup() {
  if [[ -z "$user_id" ]]; then
    user_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
      "SELECT id FROM auth.users WHERE email = '$email' LIMIT 1" 2>/dev/null || true)"
  fi
  if [[ -n "$user_id" ]]; then
    curl -sS -o /dev/null -X DELETE \
      -H "apikey: $service_role_key" -H "Authorization: Bearer $service_role_key" \
      "$auth_url/auth/v1/admin/users/$user_id" || true
  fi
  rm -f -- "$signup_file" "$login_file" "$oauth_file"
}
trap cleanup EXIT

create_status="$(curl -sS -o "$signup_file" -w '%{http_code}' -X POST \
  -H "apikey: $service_role_key" -H "Authorization: Bearer $service_role_key" \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true,\"user_metadata\":{\"name\":\"Conta Smoke\"}}" \
  "$auth_url/auth/v1/admin/users")"
user_id="$(json_value id < "$signup_file")"
if [[ "$create_status" != "200" || -z "$user_id" ]]; then
  echo "Criação administrativa local falhou ($create_status): $(cat "$signup_file")" >&2
  exit 1
fi

# O SMTP local não faz parte desta stack restaurada. Exercita a validação da
# rota de cadastro sem criar outra conta; confirmação por e-mail fica no gate manual.
signup_validation_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"invalido\",\"password\":\"$password\",\"name\":\"Conta Smoke\",\"flow_id\":\"$flow_id\",\"code_challenge\":\"$challenge\",\"return_path\":\"/inicio\"}" \
  "${backend_url%/}/api/identity/signup")"

login_status="$(curl -sS -o "$login_file" -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' --data "{\"email\":\"$email\",\"password\":\"$password\"}" \
  "${backend_url%/}/api/identity/login")"
access_token="$(json_value access_token < "$login_file")"
profile_created="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT count(*) FROM public.account_profiles WHERE user_id = '$user_id'::uuid")"

recovery_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  --data "{\"email\":\"missing.$email\",\"flow_id\":\"$flow_id\",\"code_challenge\":\"$challenge\",\"return_path\":\"/redefinir-senha\"}" \
  "${backend_url%/}/api/identity/password-reset")"
oauth_status="$(curl -sS -o "$oauth_file" -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  --data "{\"flow_id\":\"$flow_id\",\"code_challenge\":\"$challenge\",\"return_path\":\"/inicio\"}" \
  "${backend_url%/}/api/identity/oauth/google")"
oauth_url="$(json_value url < "$oauth_file")"

password_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
  -H "Authorization: Bearer $access_token" -H 'Content-Type: application/json' \
  --data "{\"password\":\"$new_password\"}" "${backend_url%/}/api/identity/password")"
logout_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $access_token" "${backend_url%/}/api/identity/logout")"
new_login_status="$(curl -sS -o "$login_file" -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' --data "{\"email\":\"$email\",\"password\":\"$new_password\"}" \
  "${backend_url%/}/api/identity/login")"

admin_id="$(docker exec "$database_container" psql -U postgres -d postgres -Atc \
  "SELECT user_id FROM public.account_profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1")"
base64_url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
issued_at="$(date +%s)"
expires_at="$((issued_at + 600))"
header="$(printf '{"alg":"HS256","typ":"JWT"}' | base64_url)"
payload="$(printf \
  '{"aud":"authenticated","exp":%s,"iat":%s,"iss":"supabase","sub":"%s","role":"authenticated","aal":"aal1","is_anonymous":false}' \
  "$expires_at" "$issued_at" "$admin_id" | base64_url)"
signature="$(printf '%s' "$header.$payload" | openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64_url)"
admin_authorization="Authorization: Bearer $header.$payload.$signature"
accounts_status="$(curl -sS -o /dev/null -w '%{http_code}' -H "$admin_authorization" \
  "${backend_url%/}/api/identity/accounts")"
role_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH -H "$admin_authorization" \
  -H 'Content-Type: application/json' --data '{"admin":false}' \
  "${backend_url%/}/api/identity/accounts/$user_id/role")"

printf 'account_fixture=%s signup_validation=%s login=%s profile=%s recovery=%s oauth=%s password=%s logout=%s relogin=%s accounts=%s role=%s oauth_url=%s\n' \
  "$create_status" "$signup_validation_status" "$login_status" "$profile_created" "$recovery_status" "$oauth_status" \
  "$password_status" "$logout_status" "$new_login_status" "$accounts_status" "$role_status" \
  "$([[ "$oauth_url" == *'/auth/v1/authorize?'* ]] && echo 1 || echo 0)"

[[ "$create_status" == "200" && "$signup_validation_status" == "400" \
  && "$login_status" == "200" && "$profile_created" == "1" \
  && "$recovery_status" == "202" && "$oauth_status" == "200" \
  && "$password_status" == "204" && "$logout_status" == "204" && "$new_login_status" == "200" \
  && "$accounts_status" == "200" && "$role_status" == "200" \
  && "$oauth_url" == *'/auth/v1/authorize?'* ]]
