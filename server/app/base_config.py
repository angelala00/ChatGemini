"""Basic configuration for the application.

The original project loads a number of values from the environment to
configure model access and filesystem locations.  For the purposes of
this repository we provide a very small configuration object that reads
those values with sensible defaults so that the server can start even if
no environment variables are defined.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import List


@dataclass
class ModelConfig:
    """Configuration values used throughout the app.

    Values can be customised via environment variables.  Defaults are
    chosen so the service can run in a local development environment
    without any additional setup.
    """

    API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    FILE_BASE: str = os.getenv("FILE_BASE", "/tmp")
    LOG_BASE: str = os.getenv("LOG_BASE", "/tmp")
    ALLOW_ORIGINS: List[str] = field(
        default_factory=lambda: [o for o in os.getenv("ALLOW_ORIGINS", "*").split(",") if o]
    )


# Single instance imported by other modules
model_config = ModelConfig()

