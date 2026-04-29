from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.auth_routes import get_current_user
from app.base_config import model_config


router = APIRouter(prefix="/api/voice-lab", tags=["voice-lab"])


def is_voice_lab_allowed(user: dict) -> bool:
    white_list = model_config.VOICE_LAB_WHITE_LIST
    if not white_list:
        return False
    return user.get("email") in white_list or user.get("sub") in white_list


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
