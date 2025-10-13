"""Entry point for the assistant metrics API service."""

from __future__ import annotations

import os
import sys

# Ensure the local ``app`` package is importable when the module is executed
# from the monorepo root.
sys.path.append(os.path.dirname(__file__))

from app.main import app

__all__ = ["app"]
