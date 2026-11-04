#!/usr/bin/env bash
set -euo pipefail

environment_file="${SUPABASE_ENV_FILE:-/home/danie/pelada-homologacao/supabase-project/.env}"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
service_role_key="$(sed -n 's/^SERVICE_ROLE_KEY=//p' "$environment_file" | head -n 1)"
if [[ -z "$service_role_key" ]]; then
  echo "SERVICE_ROLE_KEY local indisponível para a auditoria de cartas." >&2
  exit 1
fi

docker run --rm --network supabase_default \
  -e NEXT_PUBLIC_SUPABASE_URL=http://supabase-envoy:8000 \
  -e SUPABASE_SECRET_KEY="$service_role_key" \
  -v "$repository_root:/repo:ro" -w /repo \
  node:22-bookworm-slim node scripts/audit-fantasy-cards.mjs
