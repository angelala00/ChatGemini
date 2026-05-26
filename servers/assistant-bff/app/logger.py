import logging
import os
from logging.handlers import TimedRotatingFileHandler
from app.base_config import model_config

gpt_logger = logging.getLogger("gpt")
gpt_logger.setLevel(logging.INFO)
gpt_logger.propagate = False

log_dir = os.path.join(model_config.LOG_BASE, "gpt-assistant")
os.makedirs(log_dir, exist_ok=True)
app_log_file = os.path.join(log_dir, "app.log")
runtime_events_log_file = os.path.join(log_dir, "runtime-events.log")

if not gpt_logger.handlers:
    handler = TimedRotatingFileHandler(
        filename=app_log_file,
        when="midnight",
        encoding="utf-8",
    )
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    handler.setFormatter(formatter)
    gpt_logger.addHandler(handler)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    gpt_logger.addHandler(console_handler)

runtime_events_logger = logging.getLogger("gpt.runtime")
runtime_events_logger.setLevel(logging.INFO)
runtime_events_logger.propagate = False

if not runtime_events_logger.handlers:
    runtime_handler = TimedRotatingFileHandler(
        filename=runtime_events_log_file,
        when="midnight",
        backupCount=14,
        encoding="utf-8",
    )
    runtime_handler.setFormatter(logging.Formatter("%(message)s"))
    runtime_events_logger.addHandler(runtime_handler)
