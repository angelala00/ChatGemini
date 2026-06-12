from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import migrate_local_sqlite_to_postgres as migration


class SQLiteMigrationTests(unittest.TestCase):
    def test_migration_node_id_reads_from_config(self):
        with patch.object(migration.model_config, "SQLITE_MIGRATION_NODE_ID", "node-a"):
            self.assertEqual(migration._migration_node_id(), "node-a")

    def test_source_fingerprint_distinguishes_same_size_and_mtime_content(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            first = Path(temp_dir) / "first.db"
            second = Path(temp_dir) / "second.db"
            first.write_bytes(b"node-a")
            second.write_bytes(b"node-b")
            timestamp_ns = 1_700_000_000_000_000_000
            os.utime(first, ns=(timestamp_ns, timestamp_ns))
            os.utime(second, ns=(timestamp_ns, timestamp_ns))

            first_fingerprint = migration._source_fingerprint(first)
            second_fingerprint = migration._source_fingerprint(second)

        self.assertEqual(first_fingerprint[:2], second_fingerprint[:2])
        self.assertNotEqual(first_fingerprint[2], second_fingerprint[2])

    def test_source_with_same_content_and_new_mtime_is_already_migrated(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "source.db"
            source.write_bytes(b"unchanged")
            source_size, source_mtime_ns, source_sha256 = migration._source_fingerprint(source)
            os.utime(source, ns=(source_mtime_ns + 1, source_mtime_ns + 1))

            conn = Mock()
            conn.execute.return_value.fetchone.return_value = (
                source_size,
                source_mtime_ns,
                source_sha256,
            )

            with patch.object(migration.model_config, "SQLITE_MIGRATION_NODE_ID", "node-a"):
                self.assertTrue(migration._is_source_already_migrated(conn, source))
            conn.execute.assert_called_with(
                """
        SELECT source_size, source_mtime_ns, source_sha256
          FROM sqlite_migration_state
         WHERE node_id=%s AND source_path=%s
        """,
                ("node-a", str(source)),
            )

    def test_legacy_state_without_hash_uses_size_and_mtime(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "source.db"
            source.write_bytes(b"legacy")
            source_size, source_mtime_ns, _ = migration._source_fingerprint(source)

            conn = Mock()
            conn.execute.return_value.fetchone.return_value = (
                source_size,
                source_mtime_ns,
                None,
            )

            with patch.object(migration.model_config, "SQLITE_MIGRATION_NODE_ID", "node-a"):
                self.assertTrue(migration._is_source_already_migrated(conn, source))


if __name__ == "__main__":
    unittest.main()
