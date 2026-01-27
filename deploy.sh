#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
}

run_backend() {
  local name="$1"
  local dir="$2"
  local args=()

  echo "==> ${name}: stopping"
  if [[ -x "${ROOT_DIR}/${dir}/stop.sh" ]]; then
    (cd "${ROOT_DIR}/${dir}" && ./stop.sh)
  else
    echo "WARN: ${dir}/stop.sh not found or not executable"
  fi

  echo "==> ${name}: starting"
  if [[ -x "${ROOT_DIR}/${dir}/start.sh" ]]; then
    if [[ -n "${ENV_NAME}" ]]; then
      args+=("${ENV_NAME}")
    fi
    if [[ "${INSTALL_DEPS}" -eq 1 ]]; then
      args+=("--install")
    fi
    if (( ${#args[@]} )); then
      (cd "${ROOT_DIR}/${dir}" && ./start.sh "${args[@]}")
    else
      (cd "${ROOT_DIR}/${dir}" && ./start.sh)
    fi
  else
    echo "ERROR: ${dir}/start.sh not found or not executable" >&2
    exit 1
  fi
}

build_frontend() {
  local name="$1"
  local dir="$2"
  local args=()

  require_cmd npm
  echo "==> ${name}: build"
  if [[ -x "${ROOT_DIR}/${dir}/build.sh" ]]; then
    if [[ -n "${ENV_NAME}" ]]; then
      args+=("${ENV_NAME}")
    fi
    if [[ "${INSTALL_DEPS}" -eq 1 ]]; then
      args+=("--install")
    fi
    if (( ${#args[@]} )); then
      (cd "${ROOT_DIR}/${dir}" && ./build.sh "${args[@]}")
    else
      (cd "${ROOT_DIR}/${dir}" && ./build.sh)
    fi
  else
    (cd "${ROOT_DIR}/${dir}" && npm run build)
  fi
}

echo "Starting deployment..."
run_backend "assistant-bff" "servers/assistant-bff"
run_backend "assistant-metrics-api" "servers/assistant-metrics-api"

build_frontend "assistant-web" "apps/assistant-web"
build_frontend "assistant-dashboard" "apps/assistant-dashboard"
build_frontend "llm-platform" "apps/llm-platform"

echo "Deployment finished."
