#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_NAME=""
INSTALL_DEPS=0
SELECTION_SPECIFIED=0
# Keep a leading empty sentinel for compatibility with Bash versions where an
# empty array expansion is treated as unset under `set -u`.
BACKENDS=("")
FRONTENDS=("")

usage() {
  cat <<'EOF'
Usage: ./deploy.sh [environment] [options]

With no deployment selection option, all backends and frontends are deployed.

Options:
  --backends, --all-backends       Deploy all backends
  --frontends, --all-frontends     Deploy all frontends
  --backend NAME                   Deploy one backend (repeatable)
  --frontend NAME                  Deploy one frontend (repeatable)
  --install                        Install frontend dependencies before building
  -h, --help                       Show this help

Backends:  assistant-bff, assistant-metrics-api
Frontends: assistant-web, assistant-dashboard, llm-platform
EOF
}

append_unique() {
  local value="$1"
  shift
  local existing
  REPLY=("$@")
  for existing in "$@"; do
    if [[ "${existing}" == "${value}" ]]; then
      return
    fi
  done
  REPLY=("$@" "${value}")
}

add_backend() {
  local name="$1"
  case "${name}" in
    assistant-bff|assistant-metrics-api) ;;
    *)
      echo "Unknown backend: ${name}" >&2
      usage >&2
      exit 1
      ;;
  esac
  append_unique "${name}" "${BACKENDS[@]}"
  BACKENDS=("${REPLY[@]}")
}

add_frontend() {
  local name="$1"
  case "${name}" in
    assistant-web|assistant-dashboard|llm-platform) ;;
    *)
      echo "Unknown frontend: ${name}" >&2
      usage >&2
      exit 1
      ;;
  esac
  append_unique "${name}" "${FRONTENDS[@]}"
  FRONTENDS=("${REPLY[@]}")
}

while (( $# )); do
  case "$1" in
    --install)
      INSTALL_DEPS=1
      shift
      ;;
    --backends|--all-backends)
      SELECTION_SPECIFIED=1
      add_backend "assistant-bff"
      add_backend "assistant-metrics-api"
      shift
      ;;
    --frontends|--all-frontends)
      SELECTION_SPECIFIED=1
      add_frontend "assistant-web"
      add_frontend "assistant-dashboard"
      add_frontend "llm-platform"
      shift
      ;;
    --backend|--frontend)
      option="$1"
      if (( $# < 2 )); then
        echo "Missing name after ${option}" >&2
        usage >&2
        exit 1
      fi
      SELECTION_SPECIFIED=1
      if [[ "${option}" == "--backend" ]]; then
        add_backend "$2"
      else
        add_frontend "$2"
      fi
      shift 2
      ;;
    --backend=*)
      SELECTION_SPECIFIED=1
      add_backend "${1#*=}"
      shift
      ;;
    --frontend=*)
      SELECTION_SPECIFIED=1
      add_frontend "${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -n "${ENV_NAME}" ]]; then
        echo "Only one environment may be specified: $1" >&2
        usage >&2
        exit 1
      fi
      ENV_NAME="$1"
      shift
      ;;
  esac
done

if [[ "${SELECTION_SPECIFIED}" -eq 0 ]]; then
  add_backend "assistant-bff"
  add_backend "assistant-metrics-api"
  add_frontend "assistant-web"
  add_frontend "assistant-dashboard"
  add_frontend "llm-platform"
fi

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
  local args=(--install)

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
for backend in "${BACKENDS[@]}"; do
  [[ -n "${backend}" ]] || continue
  run_backend "${backend}" "servers/${backend}"
done

for frontend in "${FRONTENDS[@]}"; do
  [[ -n "${frontend}" ]] || continue
  build_frontend "${frontend}" "apps/${frontend}"
done

echo "Deployment finished."
