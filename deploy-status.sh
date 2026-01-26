#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_PROCESS=0
RUN_HEALTH=0

if [[ -t 1 ]]; then
  COLOR_GREEN="\033[32m"
  COLOR_YELLOW="\033[33m"
  COLOR_RED="\033[31m"
  COLOR_RESET="\033[0m"
else
  COLOR_GREEN=""
  COLOR_YELLOW=""
  COLOR_RED=""
  COLOR_RESET=""
fi

ok() { printf '%b\n' "${COLOR_GREEN}OK${COLOR_RESET}: $*"; }
warn() { printf '%b\n' "${COLOR_YELLOW}WARN${COLOR_RESET}: $*"; }
error() { printf '%b\n' "${COLOR_RED}ERROR${COLOR_RESET}: $*"; }

for arg in "$@"; do
  case "${arg}" in
    --process) RUN_PROCESS=1 ;;
    --health) RUN_HEALTH=1 ;;
    *)
      error "Unknown argument: ${arg}" >&2
      exit 1
      ;;
  esac
done

if [[ "${RUN_PROCESS}" -eq 0 && "${RUN_HEALTH}" -eq 0 ]]; then
  RUN_PROCESS=1
  RUN_HEALTH=1
fi

check_backend_status() {
  local name="$1"
  local dir="$2"

  if [[ -x "${ROOT_DIR}/${dir}/status.sh" ]]; then
    echo "==> ${name}: status"
    (cd "${ROOT_DIR}/${dir}" && ./status.sh) || true
  else
    warn "${dir}/status.sh not found or not executable"
  fi
}

check_frontend_build() {
  local name="$1"
  local dir="$2"
  local dist_dir="${ROOT_DIR}/${dir}/dist"
  local index_file="${dist_dir}/index.html"

  echo "==> ${name}: build output"
  if [[ ! -d "${dist_dir}" ]]; then
    warn "${dir}/dist not found"
    return
  fi
  if [[ ! -f "${index_file}" ]]; then
    warn "${dir}/dist/index.html not found"
    return
  fi
  if [[ -z "$(ls -A "${dist_dir}" 2>/dev/null)" ]]; then
    warn "${dir}/dist is empty"
    return
  fi
  if stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "${index_file}" >/dev/null 2>&1; then
    build_time="$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "${index_file}")"
    echo "build time: ${build_time}"
  elif stat -c "%y" "${index_file}" >/dev/null 2>&1; then
    build_time="$(stat -c "%y" "${index_file}")"
    echo "build time: ${build_time}"
  fi
  ok "${dir}/dist exists"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    error "Missing required command: ${cmd}" >&2
    exit 1
  fi
}

get_port() {
  local dir="$1"
  local env_var="$2"
  local default_port="$3"
  local port="${default_port}"

  if [[ -f "${ROOT_DIR}/${dir}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${ROOT_DIR}/${dir}/.env"
    set +a
  fi

  eval "port=\${${env_var}:-${port}}"
  echo "${port}"
}

check_health() {
  local name="$1"
  local dir="$2"
  local env_var="$3"
  local default_port="$4"
  local path="$5"
  local port
  local url
  local status
  local body_file

  if [[ -z "${path}" ]]; then
    warn "${name} health check not configured"
    return 0
  fi

  port="$(get_port "${dir}" "${env_var}" "${default_port}")"
  url="http://127.0.0.1:${port}${path}"
  body_file="$(mktemp)"
  status="$(curl -sS -m 5 -o "${body_file}" -w "%{http_code}" "${url}" || true)"

  echo "==> ${name}: health"
  if [[ "${status}" == "200" ]]; then
    ok "${url}"
    if [[ -s "${body_file}" ]]; then
      echo "body: $(cat "${body_file}")"
    fi
  else
    warn "${url} (status ${status:-error})"
    if [[ -s "${body_file}" ]]; then
      echo "body: $(cat "${body_file}")"
    fi
    rm -f "${body_file}"
    return 1
  fi

  rm -f "${body_file}"
}

failed=0

if [[ "${RUN_PROCESS}" -eq 1 ]]; then
  check_backend_status "assistant-bff" "servers/assistant-bff"
  check_backend_status "assistant-metrics-api" "servers/assistant-metrics-api"

  check_frontend_build "assistant-web" "apps/assistant-web"
  check_frontend_build "assistant-dashboard" "apps/assistant-dashboard"
fi

if [[ "${RUN_HEALTH}" -eq 1 ]]; then
  require_cmd curl
  check_health "assistant-bff" "servers/assistant-bff" "ASSISTANT_BFF_PORT" "5008" "/healthz" || failed=1
  check_health "assistant-metrics-api" "servers/assistant-metrics-api" "ASSISTANT_METRICS_PORT" "5010" "/healthz" || failed=1
fi

if [[ "${failed}" -ne 0 ]]; then
  exit 1
fi
