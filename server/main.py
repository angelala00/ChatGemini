import asyncio
import json
import os
import uuid
import imghdr
from typing import Any

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from dotenv import load_dotenv

from .gpts import router as gpts_router

# Load environment variables (kept for future extensibility)
load_dotenv()

# Directories for storing temporary data such as uploads
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI()

# Enable CORS for local development or custom front-end origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include GPTS related endpoints under the /api prefix
app.include_router(gpts_router, prefix="/api")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": {"message": exc.detail}})


@app.exception_handler(Exception)
async def exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": {"message": str(exc)}})


# ------------------------- Authentication -------------------------

@app.get("/api/auth/status")
async def auth_status() -> dict[str, Any]:
    """Mock login status endpoint used by the front-end."""
    return {"name": "Mock User"}


@app.get("/api/auth/get-provider")
async def auth_get_provider() -> dict[str, Any]:
    """Return a fake SSO provider so the front-end can redirect."""
    return {"provider": {"name": "MockSSO", "param": "mock"}}


@app.post("/api/auth/logout")
async def auth_logout() -> dict[str, Any]:
    """Logout endpoint – always succeeds in this mock server."""
    return {"result": "ok"}


# --------------------------- File Upload --------------------------

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)) -> dict[str, Any]:
    """Accept a file and store it locally.  Returns a generated file id."""
    file_id = str(uuid.uuid4())
    dest = os.path.join(UPLOAD_DIR, file_id)
    with open(dest, "wb") as f:
        f.write(await file.read())
    return {"file_id": file_id, "original_filename": file.filename}


# ----------------------------- Chat -------------------------------

async def _mock_chat_stream(query: str, conversation_id: str, model: str):
    """Generate a mock streaming response that echoes the query."""
    message = f"[{model}] Mock response: {query}" or ""
    for word in message.split():
        payload = {
            "event": "message",
            "answer": f"{word} ",
            "conversation_id": conversation_id,
        }
        yield f"data: {json.dumps(payload)}\n\n"
        await asyncio.sleep(0.05)
    yield f"data: {json.dumps({'event': 'message_end', 'conversation_id': conversation_id})}\n\n"


def _fast_model_route(query: str, has_image: bool) -> str | None:
    """Placeholder for using a lightweight model to choose a route.

    In a real system this could call a small model (e.g. 3B) to predict
    which backend model to use.  Returning ``None`` falls back to the
    hand written heuristics below.
    """

    # For now the demo always falls back to heuristics.
    return None


def _route_auto_model(query: str, body: dict[str, Any]) -> str:
    """Route requests to an appropriate mock model based on input files.

    * Only images – answer with ``vl`` or, for complex questions, extract
      details before invoking ``think``.
    * Images together with other documents – extract from both sources and
      hand off to ``think``.
    * Only documents – extract text then choose between ``instruct`` and
      ``think`` depending on question complexity.
    * No files – route between ``instruct`` and ``think`` using text
      heuristics.
    * A fast routing model can be used if available with hard logic as a
      fallback.
    """
    file_ids_raw = body.get("file_ids")
    q = query.lower()

    # ``file_ids`` may be a comma separated string or list; normalise it.
    if isinstance(file_ids_raw, str):
        file_ids = [f for f in file_ids_raw.split(",") if f]
    elif isinstance(file_ids_raw, list):
        file_ids = [str(f) for f in file_ids_raw if f]
    else:
        file_ids = []

    fast_route = _fast_model_route(query, bool(file_ids))
    if fast_route:
        return fast_route

    def is_complex() -> bool:
        complex_keywords = ["why", "how", "分析", "复杂", "reason"]
        return len(query) > 60 or any(k in q for k in complex_keywords)

    if file_ids:
        def is_image(fid: str) -> bool:
            path = os.path.join(UPLOAD_DIR, fid)
            if not os.path.exists(path):
                return False
            try:
                with open(path, "rb") as f:
                    header = f.read(32)
                return imghdr.what(None, header) is not None
            except Exception:
                return False

        has_image = False
        has_other = False
        for fid in file_ids:
            if is_image(fid):
                has_image = True
            else:
                has_other = True

        if has_image:
            if has_other:
                return "vl_and_file_extract_then_think"
            return "vl_extract_then_think" if is_complex() else "vl"

        if has_other:
            return "file_extract_then_think" if is_complex() else "file_extract_then_instruct"

    return "think" if is_complex() else "instruct"


async def _handle_chat_request(req: Request) -> StreamingResponse:
    body = await req.json()
    query = body.get("query", "")
    conversation_id = body.get("conversation_id") or str(uuid.uuid4())
    model = body.get("model", "mock-model")
    if model == "auto":
        model = _route_auto_model(query, body)
    return StreamingResponse(
        _mock_chat_stream(query, conversation_id, model),
        media_type="text/event-stream",
    )


@app.post("/api/chat")
async def chat(req: Request) -> StreamingResponse:
    """Chat endpoint used for the default assistant."""
    return await _handle_chat_request(req)


@app.post("/api/{gpt_id}/chat-messages")
async def chat_messages(gpt_id: str, req: Request) -> StreamingResponse:
    """Chat endpoint for GPT specific conversations."""
    return await _handle_chat_request(req)
