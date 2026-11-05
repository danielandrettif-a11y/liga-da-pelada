#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
checks=(
  verify-local-league-favorite.sh
  verify-local-league-config.sh
  verify-local-callup-match-rules.sh
  verify-local-league-lifecycle.sh
  verify-local-stadiums.sh
  verify-local-league-entry-branding.sh
  verify-local-quick-match.sh
  verify-local-seasons.sh
  verify-local-identity.sh
  verify-local-roster.sh
  verify-local-context-reads.sh
)

for check in "${checks[@]}"; do
  echo "Executando $check"
  sed 's/\r$//' "$script_dir/$check" | bash
done

echo "Todos os smokes locais passaram."
