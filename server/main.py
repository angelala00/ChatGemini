import base64
import json
import os
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai
# NOTE:
# ``server`` and ``gpts`` live in the same folder.  When ``uvicorn`` imports
# ``server.main`` as a module, Python does not automatically put this directory
# on ``sys.path`` for absolute imports.  The previous absolute import
# ``from gpts import router as gpts_router`` therefore failed with
# ``ModuleNotFoundError`` when launching the application.  Using a relative
# import ensures the router module is loaded correctly regardless of how the
# package is executed.
from .gpts import router as gpts_router

# Load environment variables
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
BASE_URL = os.getenv("GOOGLE_API_BASE_URL")

if API_KEY:
    genai.configure(api_key=API_KEY, client_options={"api_endpoint": BASE_URL} if BASE_URL else None)

app = FastAPI()

# Enable CORS for local development or custom front-end origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GPTS endpoints
app.include_router(gpts_router)

class ChatRequest(BaseModel):
    prompt: str
    history: Optional[List[Dict[str, Any]]] = None
    image_base64: Optional[str] = None
    options: Optional[Dict[str, Any]] = None
    stream: bool = False


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": {"message": exc.detail}})


@app.exception_handler(Exception)
async def exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": {"message": str(exc)}})


@app.post("/chat")
async def chat(req: ChatRequest):
    model_name = req.options.get("model", "gemini-2.5-pro") if req.options else "gemini-2.5-pro"
    model = genai.GenerativeModel(model_name)
    generation_config = (req.options or {}).get("generation_config")
    safety_settings = (req.options or {}).get("safety_settings")

    img = None
    if req.image_base64:
        image_bytes = base64.b64decode(req.image_base64)
        img = {"mime_type": "image/png", "data": image_bytes}

    try:
        if req.stream:
            def event_stream():
                last_text = ""
                try:
                    if img:
                        iterator = model.generate_content(
                            [req.prompt, img],
                            stream=True,
                            generation_config=generation_config,
                            safety_settings=safety_settings,
                        )
                    else:
                        chat_session = model.start_chat(history=req.history or [])
                        iterator = chat_session.send_message(
                            req.prompt,
                            stream=True,
                            generation_config=generation_config,
                            safety_settings=safety_settings,
                        )
                    for chunk in iterator:
                        if chunk.text:
                            text = chunk.text[len(last_text) :]
                            last_text += text
                            if text:
                                yield f"data: {json.dumps({'text': text})}\n\n"
                finally:
                    # signal the client the stream is complete
                    yield "data: [DONE]\n\n"

            headers = {
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
            return StreamingResponse(
                event_stream(), media_type="text/event-stream", headers=headers
            )
        else:
            if img:
                response = model.generate_content(
                    [req.prompt, img],
                    stream=False,
                    generation_config=generation_config,
                    safety_settings=safety_settings,
                )
            else:
                chat_session = model.start_chat(history=req.history or [])
                response = chat_session.send_message(
                    req.prompt,
                    stream=False,
                    generation_config=generation_config,
                    safety_settings=safety_settings,
                )
            return {"text": response.text}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
