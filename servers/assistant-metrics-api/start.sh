#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"

# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

uvicorn app.main:app --host 0.0.0.0 --port 5010
