#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.env"
  set +a
fi

BASE_URL="${ASSISTANT_BFF_BASE_URL:-http://127.0.0.1:${ASSISTANT_BFF_PORT:-5008}}"

echo "== GET ${BASE_URL}/healthz =="
curl -fsS "${BASE_URL}/healthz"
echo
echo

echo "== GET ${BASE_URL}/healthz/dependencies =="
curl -fsS "${BASE_URL}/healthz/dependencies"
echo
echo

echo "== GET ${BASE_URL}/readyz =="
curl -i -fsS "${BASE_URL}/readyz"
echo
echo

echo "Storage verification requests completed."
