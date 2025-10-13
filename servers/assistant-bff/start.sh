#!/usr/bin/env bash
set -euo pipefail

# Resolve the directory containing this script.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"

# Create the virtual environment if it does not exist.
# if [ ! -d "${VENV_DIR}" ]; then
#   python3 -m venv "${VENV_DIR}"
# fi

# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

# Install dependencies before starting.
# pip install --upgrade pip
# pip install -r "${SCRIPT_DIR}/requirements.txt"

# Launch the FastAPI service with Uvicorn.
uvicorn app.main:app --host 0.0.0.0 --port 5008
