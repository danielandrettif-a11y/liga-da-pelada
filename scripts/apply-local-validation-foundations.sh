#!/usr/bin/env bash
set -euo pipefail

database_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
database_user="${SUPABASE_MIGRATION_USER:-supabase_admin}"
database_name="${SUPABASE_DATABASE_NAME:-postgres}"
backup_root="${LOCAL_BACKUP_ROOT:-/home/danie/pelada-homologacao/backups}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "$script_dir/.." && pwd)"
migrations_root="$repository_root/supabase/migrations"

relation_exists() {
  docker exec "$database_container" psql -U postgres -d "$database_name" -Atc \
    "SELECT (to_regclass('public.$1') IS NOT NULL)::int"
}

migrations=()
if [[ "$(relation_exists round_payments)" == "0" ]]; then
  migrations+=(006_player_profiles_and_payments.sql)
fi
if [[ "$(relation_exists round_payment_audit)" == "0" ]]; then
  migrations+=(022_payment_audit_log.sql)
fi
if [[ "$(relation_exists payment_recipients)" == "0" ]]; then
  migrations+=(063_payment_recipients.sql)
fi
finance_foundation_missing=0
for relation in league_expense_items round_expense_installments round_payment_charge_lines \
  round_payment_obligations round_payment_events; do
  if [[ "$(relation_exists "$relation")" == "0" ]]; then
    finance_foundation_missing=1
  fi
done
if [[ "$finance_foundation_missing" == "1" ]]; then
  migrations+=(
    318_installment_expenses_and_payment_obligations.sql
    319_expense_historic_installments_and_transfermarket_editing.sql
    340_fix_round_payment_participant_order.sql
    341_fix_round_financial_restore_order.sql
  )
fi

if [[ "${#migrations[@]}" -eq 0 ]]; then
  echo "As fundações financeiras locais já estão presentes. Nada foi alterado."
  exit 0
fi

mkdir -p "$backup_root"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="$backup_root/pre-validation-foundations-$timestamp.dump"
docker exec "$database_container" pg_dump -U "$database_user" -d "$database_name" -Fc > "$backup_path"
chmod 600 "$backup_path"
echo "Backup privado criado: $backup_path"

for migration_name in "${migrations[@]}"; do
  echo "Aplicando $migration_name"
  docker exec -i "$database_container" psql \
    -v ON_ERROR_STOP=1 -U "$database_user" -d "$database_name" \
    < "$migrations_root/$migration_name"
done

echo "Fundações financeiras locais reconciliadas."
