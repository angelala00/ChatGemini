#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

PKG_MGR="npm"
if [[ -f "${SCRIPT_DIR}/pnpm-lock.yaml" ]] && command -v pnpm >/dev/null 2>&1; then
  PKG_MGR="pnpm"
fi

if [[ "${INSTALL_DEPS}" -eq 1 ]]; then
  if [[ "${PKG_MGR}" == "pnpm" ]]; then
    pnpm install
  else
    npm install
  fi
fi

if [[ "${PKG_MGR}" == "pnpm" ]]; then
  pnpm run build
else
  npm run build
fi
