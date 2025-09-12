import logging
from logging.handlers import TimedRotatingFileHandler
from app.base_config import model_config

gpt_logger = logging.getLogger("gpt")
gpt_logger.setLevel(logging.INFO)
handler = TimedRotatingFileHandler(
    filename=f"{model_config.LOG_BASE}/gpt-assistant/app.log",
    when="midnight",
    # backupCount=7,
    encoding="utf-8"
)
formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
handler.setFormatter(formatter)
gpt_logger.addHandler(handler)
console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
gpt_logger.addHandler(console_handler)
