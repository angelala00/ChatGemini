from fastapi import APIRouter, Depends, HTTPException, status

from app.admin.access_control import resolve_user_permissions
from app.auth.auth_routes import get_current_user


router = APIRouter(prefix="/api/voice-lab", tags=["voice-lab"])


def is_voice_lab_allowed(user: dict) -> bool:
    return "voice_lab.access" in resolve_user_permissions(user)


def ensure_voice_lab_allowed(user: dict) -> None:
    if not is_voice_lab_allowed(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Voice lab not enabled")


@router.get("/permission")
async def voice_lab_permission(user: dict = Depends(get_current_user)):
    return {"allowed": is_voice_lab_allowed(user)}


@router.get("/status")
async def voice_lab_status(user: dict = Depends(get_current_user)):
    ensure_voice_lab_allowed(user)
    return {
        "allowed": True,
        "user": {
            "email": user.get("email", ""),
            "sub": user.get("sub", ""),
        },
    }
