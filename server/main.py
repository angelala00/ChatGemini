"""Entry point for the backend service.

This file simply re-exports the FastAPI application defined in
``app.main`` so that existing deployment scripts that reference
``server.main:app`` continue to work after migrating the application
code into the ``app`` package.
"""

import os
import sys

# Ensure the ``app`` package inside this directory is importable when the
# module is executed from the project root.
sys.path.append(os.path.dirname(__file__))

from app.main import app

__all__ = ["app"]

