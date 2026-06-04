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
