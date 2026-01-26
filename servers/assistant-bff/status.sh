#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -t 1 ]]; then
  COLOR_GREEN="\033[32m"
  COLOR_YELLOW="\033[33m"
  COLOR_RESET="\033[0m"
else
  COLOR_GREEN=""
  COLOR_YELLOW=""
  COLOR_RESET=""
fi

ok() { printf '%b\n' "${COLOR_GREEN}OK${COLOR_RESET}: $*"; }
warn() { printf '%b\n' "${COLOR_YELLOW}WARN${COLOR_RESET}: $*"; }

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
  warn "Neither lsof, ss, nor netstat is available to detect the PID." >&2
  return 1
}

pids="$(get_pids || true)"
if [[ -z "${pids}" ]]; then
  warn "assistant-bff is not running on port ${PORT}."
  exit 1
fi

ok "assistant-bff is running on port ${PORT} (PID(s): ${pids})."
for pid in ${pids}; do
  cmd="$(ps -o command= -p "${pid}" | sed -e 's/^ *//')"
  echo "pid: ${pid}"
  echo "cmd: ${cmd}"
done
for pid in ${pids}; do
  cmd="$(ps -o command= -p "${pid}" | sed -e 's/^ *//')"
  exe="${cmd%% *}"
  if [[ -x "${exe}" && "${exe}" == *python* ]]; then
    ver="$("${exe}" -V 2>&1 || true)"
    if [[ -n "${ver}" ]]; then
      echo "python (${pid}): ${ver}"
    fi
  fi
  started="$(ps -o lstart= -p "${pid}" | sed -e 's/^ *//')"
  if [[ -n "${started}" ]]; then
    echo "started (${pid}): ${started}"
  fi
done
