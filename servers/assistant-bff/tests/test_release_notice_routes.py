from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routes import release_notice_routes
from app.storage import business_store


class _JsonRequest:
    def __init__(self, payload: object) -> None:
        self.payload = payload

    async def json(self) -> object:
        return self.payload


class ReleaseNoticeRoutesTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.business_backend_patcher = patch.object(
            business_store.model_config,
            "BUSINESS_STORAGE_BACKEND",
            "sqlite",
        )
        self.data_dir_patcher = patch.object(
            business_store,
            "DATA_DIR",
            self.temp_dir.name,
        )
        self.db_path_patcher = patch.object(
            business_store,
            "DEV_DB_PATH",
            os.path.join(self.temp_dir.name, "business-dev.db"),
        )
        for patcher in (
            self.business_backend_patcher,
            self.data_dir_patcher,
            self.db_path_patcher,
        ):
            patcher.start()
        business_store._INITIALIZED = False
        business_store.init_business_storage()
        self.user = {"sub": "user-1", "email": "user@example.com"}

    def tearDown(self) -> None:
        for patcher in (
            self.db_path_patcher,
            self.data_dir_patcher,
            self.business_backend_patcher,
        ):
            patcher.stop()
        business_store.close_business_storage()
        business_store._INITIALIZED = False
        self.temp_dir.cleanup()

    async def test_notice_stage_advances_monotonically(self) -> None:
        first = await release_notice_routes.advance_release_notice_stage(
            "v1.4.0",
            _JsonRequest({"seen_stage": 2}),
            self.user,
        )
        regressed = await release_notice_routes.advance_release_notice_stage(
            "v1.4.0",
            _JsonRequest({"seen_stage": 1}),
            self.user,
        )
        states = await release_notice_routes.get_release_notice_states(self.user)

        self.assertEqual(first["seen_stage"], 2)
        self.assertEqual(regressed["seen_stage"], 2)
        self.assertEqual(states, {"states": {"v1.4.0": 2}})

    async def test_notice_state_is_isolated_by_user(self) -> None:
        await release_notice_routes.advance_release_notice_stage(
            "v1.4.0",
            _JsonRequest({"seen_stage": 3}),
            self.user,
        )

        states = await release_notice_routes.get_release_notice_states(
            {"sub": "user-2", "email": "other@example.com"},
        )

        self.assertEqual(states, {"states": {}})

    async def test_invalid_release_or_stage_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as invalid_release:
            await release_notice_routes.advance_release_notice_stage(
                "latest",
                _JsonRequest({"seen_stage": 1}),
                self.user,
            )
        with self.assertRaises(HTTPException) as invalid_stage:
            await release_notice_routes.advance_release_notice_stage(
                "v1.4.0",
                _JsonRequest({"seen_stage": 4}),
                self.user,
            )

        self.assertEqual(invalid_release.exception.status_code, 400)
        self.assertEqual(invalid_stage.exception.status_code, 400)

    async def test_missing_stable_user_identity_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as context:
            await release_notice_routes.get_release_notice_states(
                {"email": "legacy@example.com"},
            )

        self.assertEqual(context.exception.status_code, 401)
