#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.env"
  set +a
fi

PORT="${ASSISTANT_BFF_PORT:-5008}"

get_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${PORT}" -sTCP:LISTEN -Pn 2>/dev/null | awk 'NR>1{print $2}' | sort -u
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -lptn "sport = :${PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u
    return
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -lptn 2>/dev/null | awk -v p=":${PORT}" '$4 ~ p {split($7,a,"/"); print a[1]}' | sort -u
    return
  fi
  echo "Neither lsof, ss, nor netstat is available to detect the PID." >&2
  return 1
}

pids="$(get_pids || true)"
if [[ -z "${pids}" ]]; then
  echo "assistant-bff is not running on port ${PORT}."
  exit 0
fi

echo "Stopping assistant-bff on port ${PORT} (PID(s): ${pids})..."
kill ${pids} || true

for _ in $(seq 1 10); do
  sleep 1
  if [[ -z "$(get_pids || true)" ]]; then
    echo "assistant-bff stopped."
    exit 0
  fi
done

echo "assistant-bff did not stop gracefully; sending SIGKILL..."
kill -9 ${pids} || true
echo "assistant-bff stopped."
