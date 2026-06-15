from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from app.storage import business_store


class SystemGptSeedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "business-dev.db")
        self.backend_patcher = patch.object(business_store.model_config, "BUSINESS_STORAGE_BACKEND", "sqlite")
        self.data_dir_patcher = patch.object(business_store, "DATA_DIR", self.temp_dir.name)
        self.db_path_patcher = patch.object(business_store, "DEV_DB_PATH", self.db_path)
        self.backend_patcher.start()
        self.data_dir_patcher.start()
        self.db_path_patcher.start()

    def tearDown(self) -> None:
        self.db_path_patcher.stop()
        self.data_dir_patcher.stop()
        self.backend_patcher.stop()
        self.temp_dir.cleanup()

    def _create_agents_table(self) -> None:
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agents (
                  gid TEXT PRIMARY KEY,
                  config TEXT NOT NULL,
                  assistant_kind TEXT NOT NULL DEFAULT 'custom',
                  handler_key TEXT
                )
                """
            )
            conn.commit()
        finally:
            conn.close()

    def _create_custom_gpts_table(self) -> None:
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS custom_gpts (
                  gid TEXT PRIMARY KEY,
                  config TEXT NOT NULL,
                  assistant_kind TEXT NOT NULL DEFAULT 'custom',
                  handler_key TEXT
                )
                """
            )
            conn.commit()
        finally:
            conn.close()

    def test_seed_system_gpts_repairs_metadata_without_overwriting_existing_config(self) -> None:
        self._create_agents_table()
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                INSERT INTO agents(gid, config, assistant_kind, handler_key)
                VALUES (?, ?, ?, ?)
                """,
                (
                    "regulationassistant",
                    json.dumps({"name": "DB version", "default_model": "db-model"}),
                    "custom",
                    None,
                ),
            )
            conn.commit()
        finally:
            conn.close()

        with patch.object(
            business_store,
            "_load_seed_system_gpts",
            return_value={
                "regulationassistant": {
                    "name": "Code version",
                    "assistant_kind": "system",
                    "handler_key": "kernel_regulation",
                }
            },
        ):
            business_store._sync_seed_system_gpts_to_storage()

        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT config, assistant_kind, handler_key FROM agents WHERE gid = ?",
                ("regulationassistant",),
            ).fetchone()
        finally:
            conn.close()

        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(json.loads(row[0])["name"], "DB version")
        self.assertEqual(json.loads(row[0])["default_model"], "db-model")
        self.assertEqual(row[1], "system")
        self.assertEqual(row[2], "kernel_regulation")

    def test_builtin_system_seed_source_is_not_overridden_by_corrupted_db_record(self) -> None:
        self._create_custom_gpts_table()
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                INSERT INTO custom_gpts(gid, config, assistant_kind, handler_key)
                VALUES (?, ?, ?, ?)
                """,
                (
                    "regulationassistant",
                    json.dumps({"name": "DB version", "default_model": "db-model"}),
                    "custom",
                    None,
                ),
            )
            conn.commit()
        finally:
            conn.close()

        seeded_items = business_store._load_seed_system_gpts()

        self.assertIn("regulationassistant", seeded_items)
        self.assertEqual(seeded_items["regulationassistant"]["assistant_kind"], "system")
        self.assertEqual(seeded_items["regulationassistant"]["handler_key"], "kernel_regulation")

    def test_builtin_system_seed_source_includes_gptassistant(self) -> None:
        seeded_items = business_store._load_seed_system_gpts()

        self.assertIn("gptassistant", seeded_items)
        self.assertEqual(seeded_items["gptassistant"]["assistant_kind"], "system")
        self.assertEqual(seeded_items["gptassistant"]["handler_key"], "kernel_gptassistant")

    def test_seed_system_gpts_strips_runtime_callables_before_persisting(self) -> None:
        self._create_agents_table()

        def runtime_handler():
            return None

        with patch.object(
            business_store,
            "_load_seed_system_gpts",
            return_value={
                "regulationassistant": {
                    "name": "Code version",
                    "assistant_kind": "system",
                    "handler_key": "kernel_regulation",
                    "chat_function": runtime_handler,
                }
            },
        ):
            business_store._sync_seed_system_gpts_to_storage()

        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT config FROM agents WHERE gid = ?",
                ("regulationassistant",),
            ).fetchone()
        finally:
            conn.close()

        self.assertIsNotNone(row)
        assert row is not None
        stored = json.loads(row[0])
        self.assertNotIn("chat_function", stored)
        self.assertEqual(stored["name"], "Code version")

    def test_init_business_storage_upgrades_agents_schema_before_seeding(self) -> None:
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agents (
                  gid TEXT PRIMARY KEY,
                  config TEXT NOT NULL
                )
                """
            )
            conn.commit()
        finally:
            conn.close()

        business_store._INITIALIZED = False
        business_store.init_business_storage()

        conn = sqlite3.connect(self.db_path)
        try:
            columns = {
                str(row[1])
                for row in conn.execute("PRAGMA table_info(agents)").fetchall()
            }
        finally:
            conn.close()

        self.assertIn("assistant_kind", columns)
        self.assertIn("handler_key", columns)

    def test_init_business_storage_migrates_legacy_custom_gpts_into_agents(self) -> None:
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS custom_gpts (
                  gid TEXT PRIMARY KEY,
                  config TEXT NOT NULL,
                  assistant_kind TEXT NOT NULL DEFAULT 'custom',
                  handler_key TEXT
                )
                """
            )
            conn.execute(
                """
                INSERT INTO custom_gpts(gid, config, assistant_kind, handler_key)
                VALUES (?, ?, ?, ?)
                """,
                (
                    "legacy-agent",
                    json.dumps({"gid": "legacy-agent", "name": "Legacy Agent"}),
                    "custom",
                    None,
                ),
            )
            conn.commit()
        finally:
            conn.close()

        business_store._INITIALIZED = False
        business_store.init_business_storage()

        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT config FROM agents WHERE gid = ?",
                ("legacy-agent",),
            ).fetchone()
        finally:
            conn.close()

        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(json.loads(row[0])["name"], "Legacy Agent")
