"""Package for GPTs related configuration and utilities."""

import importlib
import pkgutil

from .config_gpts import set_defer_refresh

__all__ = []

set_defer_refresh(True)
try:
    for loader, module_name, is_pkg in pkgutil.iter_modules(__path__):
        if module_name.startswith("gpts_"):
            module = importlib.import_module(f".{module_name}", __package__)
            __all__.append(module_name)
            globals()[module_name] = module
finally:
    set_defer_refresh(False)
