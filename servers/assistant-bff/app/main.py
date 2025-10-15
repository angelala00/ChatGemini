import os
import uvicorn
from .logger import gpt_logger
from fastapi import FastAPI, Request
from starlette.middleware.sessions import SessionMiddleware
from app.auth.auth_routes import router as auth_router
from app.routes.chat_routes import router as chat_router
from app.routes.file_routes import router as file_router
from app.routes.gpts_routes import router as gpts_router
from app.routes.metrics_routes import router as metrics_router
from app.metrics import init_metrics_storage
from fastapi.middleware.cors import CORSMiddleware
from app.base_config import model_config

app = FastAPI()

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "replace-with-a-secure-random-string")
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=model_config.ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router, prefix="")
app.include_router(chat_router, prefix="")
app.include_router(file_router, prefix="")
app.include_router(gpts_router, prefix="")
app.include_router(metrics_router, prefix="")


@app.on_event("startup")
async def _startup() -> None:
    init_metrics_storage()


@app.get("/")
async def root(request: Request):
    user_agent = request.headers.get("user-agent")
    # print(f"User-Agent: {user_agent}")
    return {"message": "服务已启动"}

if __name__ == "__main__":
    gpt_logger.info("服务启动")
    uvicorn.run(app, host="0.0.0.0", port=5008)

    # print(f"grouppp:{get_tools()}")
