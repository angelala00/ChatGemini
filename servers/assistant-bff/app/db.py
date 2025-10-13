import os
import sqlite3
from app.base_config import model_config

DATA_DIR = os.path.join("", f"{model_config.FILE_BASE}/gptassistant/")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "pins.db")


def get_db(*, check_same_thread=True, isolation_level=None):
    conn = sqlite3.connect(DB_PATH, check_same_thread=check_same_thread, isolation_level=isolation_level)
    conn.row_factory = sqlite3.Row
    return conn
