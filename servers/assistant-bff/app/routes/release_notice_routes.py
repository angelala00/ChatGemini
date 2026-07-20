from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.auth_routes import get_current_user
from app.storage.business_store import (
    advance_user_release_notice_stage,
    list_user_release_notice_states,
)


router = APIRouter(prefix="/api/release-notices", tags=["release-notices"])
_RELEASE_ID_PATTERN = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+$")


def _user_id(user: dict) -> str:
    user_id = str(user.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing user identity")
    return user_id


@router.get("")
async def get_release_notice_states(
    user: dict = Depends(get_current_user),
) -> dict[str, dict[str, int]]:
    return {"states": list_user_release_notice_states(_user_id(user))}


@router.patch("/{release_id}")
async def advance_release_notice_stage(
    release_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
) -> dict[str, object]:
    if not _RELEASE_ID_PATTERN.fullmatch(release_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid release id")
    body = await request.json()
    seen_stage = body.get("seen_stage")
    if not isinstance(seen_stage, int) or isinstance(seen_stage, bool) or seen_stage not in range(1, 4):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "seen_stage must be between 1 and 3")
    stored_stage = advance_user_release_notice_stage(
        _user_id(user),
        release_id,
        seen_stage,
    )
    return {"release_id": release_id, "seen_stage": stored_stage}
