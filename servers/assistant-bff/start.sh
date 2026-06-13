#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"
LOG_DIR="${SCRIPT_DIR}/logs"
LOG_FILE="${LOG_DIR}/assistant-bff.log"
ENV_NAME=""
INSTALL_DEPS=0

for arg in "$@"; do
  case "${arg}" in
    --install) INSTALL_DEPS=1 ;;
    *)
      if [[ -z "${ENV_NAME}" ]]; then
        ENV_NAME="${arg}"
      else
        echo "Unknown argument: ${arg}" >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -n "${ENV_NAME}" && -f "${SCRIPT_DIR}/.env.${ENV_NAME}" ]]; then
  cp -f "${SCRIPT_DIR}/.env.${ENV_NAME}" "${SCRIPT_DIR}/.env"
fi

if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/.env"
  set +a
fi

persist_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file
  local found=0

  tmp_file="$(mktemp)"
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" == "${key}="* ]]; then
      printf '%s=%s\n' "${key}" "${value}" >> "${tmp_file}"
      found=1
    else
      printf '%s\n' "${line}" >> "${tmp_file}"
    fi
  done < "${file}"

  if [[ "${found}" -eq 0 ]]; then
    printf '%s=%s\n' "${key}" "${value}" >> "${tmp_file}"
  fi

  mv "${tmp_file}" "${file}"
}

detect_primary_ip() {
  local ip=""

  if command -v python3 >/dev/null 2>&1; then
    ip="$(python3 -c 'import socket
try:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        print(sock.getsockname()[0])
    finally:
        sock.close()
except Exception:
    pass' 2>/dev/null || true)"
  fi

  if [[ -z "${ip}" ]] && command -v ip >/dev/null 2>&1; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}')"
  fi

  if [[ -z "${ip}" ]] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi

  if [[ -z "${ip}" ]]; then
    ip="127.0.0.1"
  fi

  printf '%s\n' "${ip}"
}

if [[ "${BUSINESS_STORAGE_BACKEND:-}" == "postgres" || -n "${POSTGRES_DSN:-}" ]]; then
  if [[ -z "${SQLITE_MIGRATION_NODE_ID:-}" ]]; then
    SQLITE_MIGRATION_NODE_ID="$(detect_primary_ip)"
    export SQLITE_MIGRATION_NODE_ID
    if [[ -f "${SCRIPT_DIR}/.env" ]]; then
      persist_env_value "${SCRIPT_DIR}/.env" "SQLITE_MIGRATION_NODE_ID" "${SQLITE_MIGRATION_NODE_ID}"
    fi
    echo "assistant-bff: SQLITE_MIGRATION_NODE_ID auto-filled as ${SQLITE_MIGRATION_NODE_ID}"
  fi
fi

if [[ ! -d "${VENV_DIR}" ]]; then
  python3 -m venv "${VENV_DIR}"
  # shellcheck disable=SC1091
  source "${VENV_DIR}/bin/activate"
  pip install --upgrade pip
  pip install -r "${SCRIPT_DIR}/requirements.txt"
else
  # shellcheck disable=SC1091
  source "${VENV_DIR}/bin/activate"
  if [[ "${INSTALL_DEPS}" -eq 1 ]]; then
    pip install -r "${SCRIPT_DIR}/requirements.txt"
  fi
fi

if [[ "${BUSINESS_STORAGE_BACKEND:-}" == "postgres" || -n "${POSTGRES_DSN:-}" ]]; then
  echo "assistant-bff: migrating local sqlite business data to Postgres"
  python "${SCRIPT_DIR}/migrate_local_sqlite_to_postgres.py"
  echo "assistant-bff: local sqlite business data migration finished"
  export ASSISTANT_BFF_SKIP_STARTUP_SQLITE_MIGRATION=1
fi

mkdir -p "${LOG_DIR}"
nohup uvicorn app.main:app --host 0.0.0.0 --port "${ASSISTANT_BFF_PORT:-5008}" \
  > "${LOG_FILE}" 2>&1 &

pid=$!
echo "assistant-bff started (PID ${pid})"
echo "logs: ${LOG_FILE}"
