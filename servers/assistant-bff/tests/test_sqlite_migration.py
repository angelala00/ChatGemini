from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

import migrate_local_sqlite_to_postgres as migration


class SQLiteMigrationTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
