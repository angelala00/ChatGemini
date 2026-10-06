from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routes import gpts_routes


class GPTDepartmentVisibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.agent = {
            "name": "Department Agent",
            "auth": {
                "type": "white",
                "user": ["person@example.com"],
                "departments": ["平台运维"],
            },
        }

    def test_person_and_department_visibility_are_combined(self):
        self.assertTrue(
            gpts_routes.auth_ok(
                self.agent,
                "person@example.com",
                "person-sub",
            )
        )
        self.assertTrue(
            gpts_routes.auth_ok(
                self.agent,
                "department-member@example.com",
                "department-member-sub",
                user_group="CN=user,OU=平台组,OU=平台运维,DC=nu,DC=com",
            )
        )
        self.assertFalse(
            gpts_routes.auth_ok(
                self.agent,
                "other@example.com",
                "other-sub",
                user_group="CN=user,OU=产品研发,DC=nu,DC=com",
            )
        )

    def test_department_match_is_exact_and_case_insensitive(self):
        english_agent = {
            **self.agent,
            "auth": {
                "type": "white",
                "user": [],
                "departments": ["Platform Operations"],
            },
        }

        self.assertTrue(
            gpts_routes.auth_ok(
                english_agent,
                "member@example.com",
                "member-sub",
                user_group="CN=user,OU=platform operations,DC=nu,DC=com",
            )
        )
        self.assertFalse(
            gpts_routes.auth_ok(
                english_agent,
                "member@example.com",
                "member-sub",
                user_group="CN=user,OU=Platform Operations Test,DC=nu,DC=com",
            )
        )

    def test_provider_scope_still_limits_department_visibility(self):
        provider_agent = {
            **self.agent,
            "provider_scope": "provider",
            "auth_provider": "office",
        }

        self.assertFalse(
            gpts_routes.auth_ok(
                provider_agent,
                "member@example.com",
                "member-sub",
                current_provider="desktop",
                user_group="CN=user,OU=平台运维,DC=nu,DC=com",
            )
        )

    def test_sidebar_uses_department_from_authenticated_identity(self):
        with (
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.object(gpts_routes, "is_gpts_feature_allowed", return_value=True),
            patch.object(gpts_routes, "get_current_auth_provider", return_value="office"),
            patch.object(gpts_routes, "list_user_gpt_pin_states", return_value={}),
            patch.object(gpts_routes, "list_user_pinned_rows", return_value=[]),
            patch.object(gpts_routes, "fetch_gpts", return_value={"department-agent": self.agent}),
        ):
            items = gpts_routes.get_sidebar_gpts(
                {
                    "email": "member@example.com",
                    "sub": "member-sub",
                    "group": "CN=user,OU=平台运维,DC=nu,DC=com",
                }
            )

        self.assertEqual([item["gid"] for item in items], ["department-agent"])

    def test_direct_agent_access_uses_department_from_authenticated_identity(self):
        with (
            patch.object(gpts_routes, "refresh_gpts", lambda: None),
            patch.object(gpts_routes, "get_current_auth_provider", return_value="office"),
            patch.dict(
                gpts_routes.gpts,
                {"department-agent": self.agent},
                clear=True,
            ),
        ):
            allowed = gpts_routes.can_access_gpt(
                {
                    "email": "member@example.com",
                    "sub": "member-sub",
                    "group": "CN=user,OU=平台运维,DC=nu,DC=com",
                },
                "department-agent",
            )

        self.assertTrue(allowed)

    def test_auth_department_list_is_normalized(self):
        normalized = gpts_routes._normalize_gpt_auth(
            {
                "type": "white",
                "user": [],
                "departments": [" 平台运维 ", "平台运维", ""],
            }
        )

        self.assertEqual(normalized["departments"], ["平台运维"])

    def test_auth_department_list_rejects_non_strings(self):
        with self.assertRaises(HTTPException) as ctx:
            gpts_routes._normalize_gpt_auth(
                {"type": "white", "user": [], "departments": ["平台运维", 1]}
            )

        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
