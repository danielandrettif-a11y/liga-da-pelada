#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Uso: backup-official-storage.sh <arquivo-env-privado> <diretorio-novo> [diretorio-de-logs]

O arquivo env deve conter AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
AWS_ENDPOINT_URL e AWS_REGION. O destino nao pode existir.
EOF
  exit 2
}

[[ $# -ge 2 && $# -le 3 ]] || usage

env_file="$(realpath -e "$1")"
output_directory="$(realpath -m "$2")"
log_directory="$(realpath -m "${3:-$(dirname "$output_directory")/runtime}")"
rclone_image='rclone/rclone@sha256:7cbeec24a44f206067597c0368be4de90ae19a64d5113c7d1938bd737a81e466'

if [[ -e "$output_directory" ]]; then
  echo 'erro: o diretorio de destino ja existe' >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

for variable in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_ENDPOINT_URL AWS_REGION; do
  if [[ -z "${!variable:-}" ]]; then
    echo "erro: variavel ausente no arquivo privado: $variable" >&2
    exit 2
  fi
done

install -d -m 700 "$log_directory"

rclone_source=(
  docker run --rm
  --env-file "$env_file"
  -e RCLONE_CONFIG_SRC_TYPE=s3
  -e RCLONE_CONFIG_SRC_PROVIDER=Other
  -e RCLONE_CONFIG_SRC_ENV_AUTH=true
  -e "RCLONE_CONFIG_SRC_ENDPOINT=$AWS_ENDPOINT_URL"
  -e "RCLONE_CONFIG_SRC_REGION=$AWS_REGION"
  "$rclone_image"
)

source_inventory="$("${rclone_source[@]}" size src: --json)"

install -d -m 700 "$output_directory"
docker run --rm \
  --env-file "$env_file" \
  -e RCLONE_CONFIG_SRC_TYPE=s3 \
  -e RCLONE_CONFIG_SRC_PROVIDER=Other \
  -e RCLONE_CONFIG_SRC_ENV_AUTH=true \
  -e "RCLONE_CONFIG_SRC_ENDPOINT=$AWS_ENDPOINT_URL" \
  -e "RCLONE_CONFIG_SRC_REGION=$AWS_REGION" \
  -v "$output_directory:/data" \
  -v "$log_directory:/logs" \
  "$rclone_image" copy src: /data \
  --metadata --checkers 8 --transfers 4 \
  --log-file /logs/official-storage-copy.log --log-level INFO

local_inventory="$(docker run --rm \
  -v "$output_directory:/data:ro" \
  "$rclone_image" size /data --json)"

docker run --rm \
  --env-file "$env_file" \
  -e RCLONE_CONFIG_SRC_TYPE=s3 \
  -e RCLONE_CONFIG_SRC_PROVIDER=Other \
  -e RCLONE_CONFIG_SRC_ENV_AUTH=true \
  -e "RCLONE_CONFIG_SRC_ENDPOINT=$AWS_ENDPOINT_URL" \
  -e "RCLONE_CONFIG_SRC_REGION=$AWS_REGION" \
  -v "$output_directory:/data:ro" \
  -v "$log_directory:/logs" \
  "$rclone_image" check src: /data --download --one-way \
  --log-file /logs/official-storage-check.log --log-level INFO

SOURCE_INVENTORY="$source_inventory" LOCAL_INVENTORY="$local_inventory" \
python3 - <<'PY'
import json
import os

source = json.loads(os.environ['SOURCE_INVENTORY'])
local = json.loads(os.environ['LOCAL_INVENTORY'])
for field in ('count', 'bytes', 'sizeless'):
    if source.get(field) != local.get(field):
        raise SystemExit(f'erro: inventario divergente em {field}')
print(f"Storage validado: {source['count']} objetos; {source['bytes']} bytes")
PY

chmod -R go-rwx "$output_directory"
