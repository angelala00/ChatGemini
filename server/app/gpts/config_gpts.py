"""Minimal GPTS configuration used by the application routes.

The original project loads GPT definitions from a data source.  For this
repository we provide a very small in-memory dictionary with a single
assistant so that the API can operate without external dependencies.
"""

from __future__ import annotations

from typing import Any, Dict


gpts: Dict[str, Dict[str, Any]] = {
    "gptassistant": {
        "name": "GPT Assistant",
        "system_prompt": "You are a helpful assistant.",
        "model_name": "auto",
        "auth": {"type": "all"},
    }
}


def fetch_gpts() -> Dict[str, Dict[str, Any]]:
    """Return the GPT configuration.

    A separate function is provided to mirror the structure of the
    original application where configurations may be refreshed from disk
    or a database.
    """

    return gpts


__all__ = ["gpts", "fetch_gpts"]

