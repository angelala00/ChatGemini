from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.base_config import model_config
from app.auth.auth_routes import resolve_auth_provider
from app.metrics import events as metrics_events
from app.storage import business_store, object_store
from app.storage.config_validation import validate_storage_configuration
from app import tracing


class StorageBackendFallbackTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.file_base = self.temp_dir.name
        self.db_path = os.path.join(self.temp_dir.name, "business-dev.db")
        self.log_dir = Path(self.temp_dir.name) / "logs"
        self.log_dir.mkdir(parents=True, exist_ok=True)

        self.business_backend_patcher = patch.object(model_config, "BUSINESS_STORAGE_BACKEND", "sqlite")
        self.object_backend_patcher = patch.object(model_config, "OBJECT_STORAGE_BACKEND", "filesystem")
        self.file_base_patcher = patch.object(model_config, "FILE_BASE", self.file_base)
        self.log_base_patcher = patch.object(model_config, "LOG_BASE", self.file_base)
        self.session_key_patcher = patch.object(model_config, "SESSION_HISTORY_ENCRYPTION_KEY", "")
        self.business_data_dir_patcher = patch.object(business_store, "DATA_DIR", self.temp_dir.name)
        self.business_db_path_patcher = patch.object(business_store, "DEV_DB_PATH", self.db_path)
        self.object_upload_root_patcher = patch.object(
            object_store, "LOCAL_UPLOAD_ROOT", Path(self.file_base) / "gptassistant" / "uploads"
        )
        self.object_cache_root_patcher = patch.object(
            object_store, "LOCAL_CACHE_ROOT", Path(self.file_base) / "gptassistant" / "cache"
        )
        self.metrics_dir_patcher = patch.object(metrics_events, "USAGE_EVENTS_DIR", self.log_dir / "usage-events")
        self.trace_dir_patcher = patch.object(tracing, "TRACE_DIR", self.log_dir / "chat-traces")

        for patcher in (
            self.business_backend_patcher,
            self.object_backend_patcher,
            self.file_base_patcher,
            self.log_base_patcher,
            self.session_key_patcher,
            self.business_data_dir_patcher,
            self.business_db_path_patcher,
            self.object_upload_root_patcher,
            self.object_cache_root_patcher,
            self.metrics_dir_patcher,
            self.trace_dir_patcher,
        ):
            patcher.start()

        business_store._INITIALIZED = False
        object_store._CLIENT = None
        business_store.init_business_storage()
        object_store.init_object_store()
        metrics_events.init_metrics_storage()
        tracing.init_trace_storage()

    def tearDown(self) -> None:
        for patcher in (
            self.trace_dir_patcher,
            self.metrics_dir_patcher,
            self.object_cache_root_patcher,
            self.object_upload_root_patcher,
            self.business_db_path_patcher,
            self.business_data_dir_patcher,
            self.session_key_patcher,
            self.log_base_patcher,
            self.file_base_patcher,
            self.object_backend_patcher,
            self.business_backend_patcher,
        ):
            patcher.stop()
        business_store.close_business_storage()
        business_store._INITIALIZED = False
        business_store._FERNET = None
        object_store._CLIENT = None
        self.temp_dir.cleanup()

    def test_business_store_round_trip_uses_sqlite_fallback(self):
        business_store.save_session_history("cid-1", [{"role": "user", "content": "hello"}])
        self.assertEqual(
            business_store.load_session_history("cid-1")[0]["content"],
            "hello",
        )

        business_store.insert_custom_gpt("gid-1", {"gid": "gid-1", "name": "demo"})
        self.assertEqual(business_store.load_custom_gpts()["gid-1"]["name"], "demo")

        business_store.set_user_gpt_pin("user-1", "gid-1", is_pinned=True)
        self.assertIn("gid-1", business_store.list_pinned_gids("user-1"))

        business_store.set_user_config_version("user-1", "v1.2.3")
        self.assertEqual(business_store.get_user_config_version("user-1"), "v1.2.3")

    def test_init_business_storage_marks_store_initialized(self):
        business_store._INITIALIZED = False
        business_store.init_business_storage()
        self.assertTrue(business_store._INITIALIZED)

    def test_business_storage_health_reports_unowned_file_mappings(self):
        business_store.insert_file_mapping(
            "legacy-file",
            filename="legacy.txt",
            file_extension=".txt",
            content_type="text/plain",
            bucket="",
            object_key="/tmp/legacy-file",
            storage_backend="filesystem",
            size_bytes=5,
        )

        health = business_store.business_storage_health()

        self.assertTrue(health["healthy"])
        self.assertEqual(health["unowned_file_mappings"], 1)
        self.assertIn("warning", health)

    def test_legacy_file_mapping_row_normalizes_to_business_schema(self):
        legacy_path = str(Path(self.file_base) / "gptassistant" / "uploads" / "file-1")
        Path(legacy_path).parent.mkdir(parents=True, exist_ok=True)
        Path(legacy_path).write_bytes(b"demo")

        normalized = business_store._normalize_sqlite_file_mapping_row(
            {
                "file_id": "file-1",
                "filename": "demo.pdf",
                "fileExtension": ".pdf",
                "path": legacy_path,
                "uploadTime": "2026-01-01T00:00:00",
                "gid": "gptassistant",
            },
            {"file_id", "filename", "fileExtension", "path", "uploadTime", "gid"},
        )

        self.assertIsNotNone(normalized)
        assert normalized is not None
        self.assertEqual(normalized["file_extension"], ".pdf")
        self.assertEqual(normalized["content_type"], "application/pdf")
        self.assertEqual(normalized["object_key"], legacy_path)
        self.assertEqual(normalized["storage_backend"], "filesystem")
        self.assertEqual(normalized["size_bytes"], 4)

    def test_business_store_encrypts_session_history_when_key_configured(self):
        try:
            import cryptography  # noqa: F401
        except Exception:
            self.skipTest("cryptography not installed in current test environment")
        encryption_key = base64.urlsafe_b64encode(os.urandom(32)).decode("utf-8")
        with patch.object(model_config, "SESSION_HISTORY_ENCRYPTION_KEY", encryption_key):
            business_store._FERNET = None
            business_store.save_session_history("cid-encrypted", [{"role": "user", "content": "hello"}])
            business_store.save_session_client_history(
                "cid-encrypted",
                [{"role": "user", "parts": "hello", "timestamp": 1}],
            )
            self.assertEqual(
                business_store.load_session_history("cid-encrypted")[0]["content"],
                "hello",
            )
            self.assertEqual(
                business_store.load_session_client_history("cid-encrypted")[0]["parts"],
                "hello",
            )

        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT history FROM session_history WHERE conversation_id = ?",
                ("cid-encrypted",),
            ).fetchone()
            self.assertIsNotNone(row)
            raw_payload = row[0]
            self.assertNotIn("hello", raw_payload)
            encoded = json.loads(raw_payload)
            self.assertTrue(encoded["__encrypted__"])
        finally:
            conn.close()

    def test_init_business_storage_backfills_session_meta_from_usage_events(self):
        business_store.save_session_history(
            "cid-legacy",
            [
                {"role": "system", "content": "system"},
                {"role": "user", "content": "这是一个旧会话标题测试"},
            ],
        )

        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("DELETE FROM session_history_meta WHERE conversation_id = ?", ("cid-legacy",))
            conn.commit()
        finally:
            conn.close()

        tracker = metrics_events.create_usage_event(
            user_id="legacy-user",
            user_email="legacy@example.com",
            conversation_id="cid-legacy",
            gid="gptassistant",
            requested_model="glm-4.7",
            upload_count=0,
        )
        tracker.finalize(status="success", latency_ms=10.0)

        business_store._INITIALIZED = False
        business_store.init_business_storage()

        meta = business_store.get_session_history_meta("cid-legacy")
        self.assertIsNotNone(meta)
        assert meta is not None
        self.assertEqual(meta["user_id"], "legacy-user")
        self.assertEqual(meta["gid"], "gptassistant")
        self.assertEqual(meta["title"], "这是一个旧会话标题测试")

    def test_session_detail_backfills_client_history_from_runtime_history(self):
        from app.routes import chat_routes

        conversation_id = "cid-runtime-only"
        runtime_key = f"{chat_routes.KERNEL_HISTORY_PREFIX}{conversation_id}"
        business_store.save_session_history(
            runtime_key,
            [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": "你好"}],
                    "timestamp": 100,
                },
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "你好，有什么可以帮你？"}],
                    "timestamp": 101,
                },
            ],
        )
        business_store.upsert_session_history_meta(
            conversation_id=conversation_id,
            user_id="user-1",
            user_email="user@example.com",
            auth_provider="c",
            gid="gptassistant",
            title="你好",
        )

        response = asyncio.run(
            chat_routes.get_session(
                conversation_id,
                user={"sub": "user-1", "email": "user@example.com"},
            )
        )

        history = response["item"]["history"]
        self.assertEqual(history[0]["parts"], "你好")
        self.assertEqual(history[1]["parts"], "你好，有什么可以帮你？")
        self.assertEqual(
            business_store.load_session_client_history(conversation_id)[1]["parts"],
            "你好，有什么可以帮你？",
        )

    def test_session_meta_list_is_scoped_by_auth_provider(self) -> None:
        business_store.upsert_session_history_meta(
            conversation_id="cid-provider-a",
            user_id="user-1",
            user_email="user@example.com",
            auth_provider="portal-a",
            gid="gptassistant",
            title="A",
        )
        business_store.upsert_session_history_meta(
            conversation_id="cid-provider-b",
            user_id="user-1",
            user_email="user@example.com",
            auth_provider="portal-b",
            gid="gptassistant",
            title="B",
        )

        items = business_store.list_session_history_meta(
            user_id="user-1",
            auth_provider="portal-a",
        )

        self.assertEqual([item["conversation_id"] for item in items], ["cid-provider-a"])

    def test_auth_provider_resolves_from_request_context(self) -> None:
        self.assertEqual(
            resolve_auth_provider(SimpleNamespace(headers={"user-agent": "client aaaa"})),
            "a",
        )
        self.assertEqual(
            resolve_auth_provider(SimpleNamespace(headers={"x-forwarded-for": "10.0.0.1, ip2"})),
            "b",
        )
        self.assertEqual(
            resolve_auth_provider(SimpleNamespace(headers={})),
            "c",
        )

    def test_stream_completion_persists_client_history_from_runtime_history(self):
        from app.routes import chat_routes

        conversation_id = "cid-stream-complete"
        runtime_key = f"{chat_routes.KERNEL_HISTORY_PREFIX}{conversation_id}"

        async def source_stream():
            yield "data: {}\n\n"
            business_store.save_session_history(
                runtime_key,
                [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "刷新测试"}],
                        "timestamp": 200,
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "刷新后仍可见"}],
                        "timestamp": 201,
                    },
                ],
            )

        async def consume_stream():
            chunks = []
            async for chunk in chat_routes._stream_with_session_client_history(
                source_stream(),
                conversation_id,
                "gptassistant",
            ):
                chunks.append(chunk)
            return chunks

        chunks = asyncio.run(consume_stream())

        self.assertEqual(chunks, ["data: {}\n\n"])
        persisted = business_store.load_session_client_history(conversation_id)
        self.assertEqual(persisted[0]["parts"], "刷新测试")
        self.assertEqual(persisted[1]["parts"], "刷新后仍可见")

    def test_object_store_round_trip_uses_filesystem_fallback(self):
        payload = object_store.store_bytes(
            file_id="file-1",
            filename="demo.txt",
            content=b"hello world",
            content_type="text/plain",
        )
        self.assertEqual(payload["storage_backend"], "filesystem")
        path = object_store.ensure_local_path(
            {
                "file_id": "file-1",
                "fileExtension": ".txt",
                "storageBackend": payload["storage_backend"],
                "objectKey": payload["object_key"],
            }
        )
        self.assertTrue(Path(path).exists())
        self.assertEqual(Path(path).read_text(encoding="utf-8"), "hello world")

    def test_object_store_stream_round_trip_uses_filesystem_fallback(self):
        payload = object_store.store_file(
            file_id="file-stream",
            filename="demo.txt",
            content_file=io.BytesIO(b"streamed content"),
            length=len(b"streamed content"),
            content_type="text/plain",
        )
        self.assertEqual(payload["storage_backend"], "filesystem")
        self.assertEqual(Path(str(payload["object_key"])).read_bytes(), b"streamed content")

    def test_minio_cache_download_is_published_atomically(self):
        cache_path = Path(object_store.LOCAL_CACHE_ROOT) / "file-1.pdf"
        client = SimpleNamespace()

        def download(bucket, object_key, target):
            Path(target).write_bytes(b"complete")

        client.fget_object = download
        entry = {
            "file_id": "file-1",
            "fileExtension": ".pdf",
            "storage_backend": "minio",
            "bucket": "bucket",
            "object_key": "file-1.pdf",
            "size_bytes": 8,
        }
        with (
            patch.object(object_store, "init_object_store"),
            patch.object(object_store, "_get_minio_client", return_value=client),
        ):
            result = object_store.ensure_local_path(entry)

        self.assertEqual(result, str(cache_path))
        self.assertEqual(cache_path.read_bytes(), b"complete")
        self.assertEqual(list(cache_path.parent.glob("*.part")), [])

    def test_minio_cache_download_failure_does_not_leave_partial_cache(self):
        cache_path = Path(object_store.LOCAL_CACHE_ROOT) / "file-1.pdf"
        client = SimpleNamespace()

        def download(bucket, object_key, target):
            Path(target).write_bytes(b"partial")
            raise RuntimeError("download failed")

        client.fget_object = download
        entry = {
            "file_id": "file-1",
            "fileExtension": ".pdf",
            "storage_backend": "minio",
            "bucket": "bucket",
            "object_key": "file-1.pdf",
            "size_bytes": 8,
        }
        with (
            patch.object(object_store, "init_object_store"),
            patch.object(object_store, "_get_minio_client", return_value=client),
        ):
            with self.assertRaises(RuntimeError):
                object_store.ensure_local_path(entry)

        self.assertFalse(cache_path.exists())
        self.assertEqual(list(cache_path.parent.glob("*.part")), [])

    def test_minio_cache_download_size_mismatch_is_not_published(self):
        cache_path = Path(object_store.LOCAL_CACHE_ROOT) / "file-1.pdf"
        client = SimpleNamespace()

        def download(bucket, object_key, target):
            Path(target).write_bytes(b"partial")

        client.fget_object = download
        entry = {
            "file_id": "file-1",
            "fileExtension": ".pdf",
            "storage_backend": "minio",
            "bucket": "bucket",
            "object_key": "file-1.pdf",
            "size_bytes": 8,
        }
        with (
            patch.object(object_store, "init_object_store"),
            patch.object(object_store, "_get_minio_client", return_value=client),
        ):
            with self.assertRaisesRegex(RuntimeError, "Downloaded object size mismatch"):
                object_store.ensure_local_path(entry)

        self.assertFalse(cache_path.exists())
        self.assertEqual(list(cache_path.parent.glob("*.part")), [])

    def test_minio_zero_byte_cache_uses_expected_size(self):
        cache_path = Path(object_store.LOCAL_CACHE_ROOT) / "file-1.txt"
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(b"unexpected")
        client = SimpleNamespace()

        def download(bucket, object_key, target):
            Path(target).write_bytes(b"")

        client.fget_object = download
        entry = {
            "file_id": "file-1",
            "fileExtension": ".txt",
            "storage_backend": "minio",
            "bucket": "bucket",
            "object_key": "file-1.txt",
            "size_bytes": 0,
        }
        with (
            patch.object(object_store, "init_object_store"),
            patch.object(object_store, "_get_minio_client", return_value=client),
        ):
            object_store.ensure_local_path(entry)

        self.assertEqual(cache_path.read_bytes(), b"")

    def test_minio_cache_size_mismatch_triggers_redownload(self):
        cache_path = Path(object_store.LOCAL_CACHE_ROOT) / "file-1.pdf"
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(b"bad")
        client = SimpleNamespace()

        def download(bucket, object_key, target):
            Path(target).write_bytes(b"complete")

        client.fget_object = download
        entry = {
            "file_id": "file-1",
            "fileExtension": ".pdf",
            "storage_backend": "minio",
            "bucket": "bucket",
            "object_key": "file-1.pdf",
            "size_bytes": 8,
        }
        with (
            patch.object(object_store, "init_object_store"),
            patch.object(object_store, "_get_minio_client", return_value=client),
        ):
            object_store.ensure_local_path(entry)

        self.assertEqual(cache_path.read_bytes(), b"complete")

    def test_minio_cache_hit_refreshes_last_used_time(self):
        cache_path = Path(object_store.LOCAL_CACHE_ROOT) / "file-1.pdf"
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(b"complete")
        old_timestamp = 1_000_000
        os.utime(cache_path, (old_timestamp, old_timestamp))
        entry = {
            "file_id": "file-1",
            "fileExtension": ".pdf",
            "storage_backend": "minio",
            "bucket": "bucket",
            "object_key": "file-1.pdf",
            "size_bytes": 8,
        }
        with patch.object(object_store, "init_object_store"):
            object_store.ensure_local_path(entry)

        self.assertGreater(cache_path.stat().st_mtime, old_timestamp)

    def test_file_mapping_persists_owner_and_rejects_other_user(self):
        from fastapi import HTTPException
        from app.routes import file_routes

        business_store.insert_file_mapping(
            "owned-file",
            filename="owned.txt",
            file_extension=".txt",
            content_type="text/plain",
            bucket="",
            object_key="/tmp/owned-file",
            storage_backend="filesystem",
            size_bytes=5,
            owner_user_id="user-1",
            owner_user_email="owner@example.com",
        )

        item = business_store.get_file_mapping("owned-file")
        self.assertIsNotNone(item)
        assert item is not None
        self.assertEqual(item["ownerUserId"], "user-1")
        self.assertEqual(item["ownerUserEmail"], "owner@example.com")
        self.assertEqual(
            business_store.count_file_mappings(
                "gptassistant",
                owner_user_id="user-1",
                owner_user_email="owner@example.com",
            ),
            1,
        )
        self.assertEqual(
            business_store.count_file_mappings(
                "gptassistant",
                owner_user_id="user-2",
                owner_user_email="other@example.com",
            ),
            0,
        )
        self.assertEqual(
            file_routes.get_owned_file_mapping_or_404(
                "owned-file",
                {"sub": "user-1", "email": "owner@example.com"},
            )["file_id"],
            "owned-file",
        )
        with self.assertRaises(HTTPException) as ctx:
            file_routes.get_owned_file_mapping_or_404(
                "owned-file",
                {"sub": "user-2", "email": "other@example.com"},
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_file_upload_reservation_enforces_quota_atomically(self):
        reservation_id = business_store.reserve_file_upload_slot(
            "gptassistant",
            owner_user_id="user-1",
            owner_user_email="owner@example.com",
            max_user_files=1,
            max_system_files=10,
        )
        self.assertTrue(reservation_id)
        with self.assertRaises(business_store.FileUploadQuotaExceeded) as ctx:
            business_store.reserve_file_upload_slot(
                "gptassistant",
                owner_user_id="user-1",
                owner_user_email="owner@example.com",
                max_user_files=1,
                max_system_files=10,
            )
        self.assertEqual(ctx.exception.scope, "user")
        business_store.release_file_upload_slot(reservation_id)
        next_reservation_id = business_store.reserve_file_upload_slot(
            "gptassistant",
            owner_user_id="user-1",
            owner_user_email="owner@example.com",
            max_user_files=1,
            max_system_files=10,
        )
        self.assertTrue(next_reservation_id)
        business_store.release_file_upload_slot(next_reservation_id)

    def test_file_upload_reservation_enforces_system_quota_across_users(self):
        reservation_id = business_store.reserve_file_upload_slot(
            "gptassistant",
            owner_user_id="user-1",
            owner_user_email="owner@example.com",
            max_user_files=10,
            max_system_files=1,
        )
        with self.assertRaises(business_store.FileUploadQuotaExceeded) as ctx:
            business_store.reserve_file_upload_slot(
                "gptassistant",
                owner_user_id="user-2",
                owner_user_email="other@example.com",
                max_user_files=10,
                max_system_files=1,
            )
        self.assertEqual(ctx.exception.scope, "system")
        business_store.release_file_upload_slot(reservation_id)

    def test_sqlite_distributed_task_lock_prevents_overlapping_process_tasks(self):
        if business_store.fcntl is None:
            self.skipTest("fcntl is unavailable")
        with business_store.distributed_task_lock("cleanup-task") as first_acquired:
            with business_store.distributed_task_lock("cleanup-task") as second_acquired:
                self.assertTrue(first_acquired)
                self.assertFalse(second_acquired)

    def test_legacy_unowned_file_mapping_is_not_accessible(self):
        from fastapi import HTTPException
        from app.routes import file_routes

        business_store.insert_file_mapping(
            "legacy-file",
            filename="legacy.txt",
            file_extension=".txt",
            content_type="text/plain",
            bucket="",
            object_key="/tmp/legacy-file",
            storage_backend="filesystem",
            size_bytes=5,
        )

        with self.assertRaises(HTTPException) as ctx:
            file_routes.get_owned_file_mapping_or_404(
                "legacy-file",
                {"sub": "user-1", "email": "owner@example.com"},
            )
        self.assertEqual(ctx.exception.status_code, 404)

    def test_bind_file_mappings_to_conversation_only_binds_owned_unassigned_session_files(self):
        common = {
            "filename": "demo.txt",
            "file_extension": ".txt",
            "content_type": "text/plain",
            "bucket": "",
            "storage_backend": "filesystem",
            "size_bytes": 5,
            "gid": "custom-gpt",
        }
        business_store.insert_file_mapping(
            "session-unassigned",
            object_key="/tmp/session-unassigned",
            owner_user_id="user-1",
            purpose="session_attachment",
            **common,
        )
        business_store.insert_file_mapping(
            "session-existing",
            object_key="/tmp/session-existing",
            owner_user_id="user-1",
            purpose="session_attachment",
            conversation_id="cid-existing",
            **common,
        )
        business_store.insert_file_mapping(
            "knowledge-file",
            object_key="/tmp/knowledge-file",
            owner_user_id="user-1",
            purpose="assistant_knowledge",
            **common,
        )
        business_store.insert_file_mapping(
            "other-user-file",
            object_key="/tmp/other-user-file",
            owner_user_id="user-2",
            purpose="session_attachment",
            **common,
        )
        business_store.insert_file_mapping(
            "email-owned-file",
            object_key="/tmp/email-owned-file",
            owner_user_email="owner@example.com",
            purpose="session_attachment",
            **common,
        )

        updated = business_store.bind_file_mappings_to_conversation(
            [
                "session-unassigned",
                "session-existing",
                "knowledge-file",
                "other-user-file",
                "email-owned-file",
            ],
            gid="custom-gpt",
            conversation_id="cid-generated",
            owner_user_id="user-1",
            owner_user_email="owner@example.com",
        )

        self.assertEqual(updated, 2)
        self.assertEqual(
            business_store.get_file_mapping("session-unassigned")["conversationId"],
            "cid-generated",
        )
        self.assertEqual(
            business_store.get_file_mapping("session-existing")["conversationId"],
            "cid-existing",
        )
        self.assertIsNone(business_store.get_file_mapping("knowledge-file")["conversationId"])
        self.assertIsNone(business_store.get_file_mapping("other-user-file")["conversationId"])
        self.assertEqual(
            business_store.get_file_mapping("email-owned-file")["conversationId"],
            "cid-generated",
        )

    def test_usage_events_file_persistence_and_cleanup(self):
        tracker = metrics_events.create_usage_event(
            user_id="user-1",
            user_email="user@example.com",
            conversation_id="cid-1",
            gid="gptassistant",
            requested_model="glm-4.7",
            upload_count=1,
        )
        tracker.mark_tool("document_read_text")
        metrics_events.record_tokens(tracker.event_id, request_tokens=12, response_tokens=34)
        tracker.finalize(status="success", latency_ms=12.5)

        records = list(metrics_events.iter_usage_events())
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["tool_names"], ["document_read_text"])

        old_file = metrics_events.USAGE_EVENTS_DIR / "2000-01-01.jsonl"
        old_file.write_text("{}\n", encoding="utf-8")
        deleted = metrics_events.cleanup_usage_events(retention_days=1)
        self.assertEqual(deleted, 1)
        self.assertFalse(old_file.exists())

    def test_trace_file_persistence_and_cleanup(self):
        recorder = tracing.create_chat_trace(
            user_id="user-1",
            user_email="user@example.com",
            conversation_id="cid-1",
            gid="gptassistant",
            route="/api/chat",
            requested_model="glm-4.7",
            selected_model="glm-4.7",
            reasoning_enabled=True,
            query="hello",
            request_payload={"prompt": "hello"},
        )
        self.assertIsNotNone(recorder)
        assert recorder is not None
        recorder.log("request.received", {"ok": True})
        recorder.finalize(status="success", response_preview="done", duration_ms=10.0)

        detail = tracing.get_chat_trace(recorder.trace_id)
        self.assertIsNotNone(detail)
        self.assertEqual(detail["trace"]["status"], "success")
        self.assertEqual(detail["events"][0]["event_type"], "request.received")

        old_path = tracing.TRACE_DIR / "old-trace.json"
        old_path.write_text(
            json.dumps(
                {
                    "trace": {"id": "old-trace", "started_at": "2000-01-01T00:00:00+00:00"},
                    "events": [],
                }
            ),
            encoding="utf-8",
        )
        deleted = tracing.cleanup_trace_storage(retention_days=1)
        self.assertEqual(deleted, 1)
        self.assertFalse(old_path.exists())

    def test_local_cache_cleanup_removes_old_cached_files(self):
        cache_dir = Path(object_store.LOCAL_CACHE_ROOT)
        cache_dir.mkdir(parents=True, exist_ok=True)
        old_file = cache_dir / "old.bin"
        old_file.write_bytes(b"old")
        old_mtime = 946684800  # 2000-01-01 UTC
        os.utime(old_file, (old_mtime, old_mtime))
        deleted = object_store.cleanup_local_cache(retention_days=1)
        self.assertEqual(deleted, 1)
        self.assertFalse(old_file.exists())


class ConfigValidationTests(unittest.TestCase):
    def test_invalid_business_backend_raises(self):
        with patch.object(model_config, "BUSINESS_STORAGE_BACKEND", "broken"):
            with self.assertRaisesRegex(RuntimeError, "Invalid BUSINESS_STORAGE_BACKEND"):
                validate_storage_configuration()

    def test_postgres_backend_requires_dsn(self):
        with patch.object(model_config, "BUSINESS_STORAGE_BACKEND", "postgres"), \
             patch.object(model_config, "POSTGRES_DSN", ""):
            with self.assertRaisesRegex(RuntimeError, "POSTGRES_DSN"):
                validate_storage_configuration()

    def test_postgres_backend_requires_session_history_encryption_key(self):
        with patch.object(model_config, "BUSINESS_STORAGE_BACKEND", "postgres"), \
             patch.object(model_config, "POSTGRES_DSN", "postgresql://demo"), \
             patch.object(model_config, "SESSION_HISTORY_ENCRYPTION_KEY", ""):
            with self.assertRaisesRegex(RuntimeError, "SESSION_HISTORY_ENCRYPTION_KEY"):
                validate_storage_configuration()

    def test_postgres_backend_requires_valid_session_history_encryption_key(self):
        with patch.object(model_config, "BUSINESS_STORAGE_BACKEND", "postgres"), \
             patch.object(model_config, "POSTGRES_DSN", "postgresql://demo"), \
             patch.object(model_config, "SESSION_HISTORY_ENCRYPTION_KEY", "not-a-fernet-key"):
            with self.assertRaisesRegex(RuntimeError, "valid Fernet key"):
                validate_storage_configuration()

    def test_postgres_backend_accepts_valid_session_history_encryption_key(self):
        try:
            from cryptography.fernet import Fernet
        except Exception:
            self.skipTest("cryptography not installed in current test environment")
        with patch.object(model_config, "BUSINESS_STORAGE_BACKEND", "postgres"), \
             patch.object(model_config, "POSTGRES_DSN", "postgresql://demo"), \
             patch.object(model_config, "SESSION_HISTORY_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8")), \
             patch("importlib.util.find_spec", return_value=object()):
            validate_storage_configuration()

    def test_postgres_backend_rejects_invalid_pool_size(self):
        try:
            from cryptography.fernet import Fernet
        except Exception:
            self.skipTest("cryptography not installed in current test environment")
        with patch.object(model_config, "BUSINESS_STORAGE_BACKEND", "postgres"), \
             patch.object(model_config, "POSTGRES_DSN", "postgresql://demo"), \
             patch.object(model_config, "SESSION_HISTORY_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8")), \
             patch.object(model_config, "POSTGRES_POOL_MIN_SIZE", 6), \
             patch.object(model_config, "POSTGRES_POOL_MAX_SIZE", 5), \
            patch("importlib.util.find_spec", return_value=object()):
            with self.assertRaisesRegex(RuntimeError, "POSTGRES_POOL_MIN_SIZE"):
                validate_storage_configuration()

    def test_postgres_backend_requires_psycopg_pool(self):
        try:
            from cryptography.fernet import Fernet
        except Exception:
            self.skipTest("cryptography not installed in current test environment")
        with patch.object(model_config, "BUSINESS_STORAGE_BACKEND", "postgres"), \
             patch.object(model_config, "POSTGRES_DSN", "postgresql://demo"), \
             patch.object(model_config, "SESSION_HISTORY_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8")), \
             patch("importlib.util.find_spec", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "psycopg_pool"):
                validate_storage_configuration()

    def test_minio_backend_requires_credentials(self):
        with patch.object(model_config, "OBJECT_STORAGE_BACKEND", "minio"), \
             patch.object(model_config, "MINIO_ENDPOINT", ""), \
             patch.object(model_config, "MINIO_ACCESS_KEY", ""), \
             patch.object(model_config, "MINIO_SECRET_KEY", ""), \
             patch.object(model_config, "MINIO_BUCKET", ""):
            with self.assertRaisesRegex(RuntimeError, "Missing required MinIO settings"):
                validate_storage_configuration()


if __name__ == "__main__":
    unittest.main()
