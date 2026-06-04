import os
import uvicorn
from .logger import gpt_logger
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from apscheduler.schedulers.background import BackgroundScheduler
from starlette.middleware.sessions import SessionMiddleware
from app.routes.admin_routes import router as admin_router
from app.auth.auth_routes import router as auth_router
from app.routes.chat_routes import router as chat_router
from app.routes.chat_trace_routes import router as trace_router
from app.routes.file_routes import (
    router as file_router,
    start_file_retention_scheduler,
    stop_file_retention_scheduler,
)
from app.routes.gpts_routes import router as gpts_router
from app.routes.metrics_routes import router as metrics_router
from app.routes.platform_routes import router as platform_router
from app.routes.runtime_routes import router as runtime_router
from app.routes.voice_lab_routes import router as voice_lab_router
from app.metrics import init_metrics_storage
from app.metrics.events import cleanup_usage_events
from app.gpts.config_gpts import refresh_gpts
from app.tracing import cleanup_trace_storage, init_trace_storage
from app.storage.business_store import business_storage_health, close_business_storage, init_business_storage
from app.storage.config_validation import validate_storage_configuration
from app.storage.object_store import cleanup_local_cache
from app.storage.object_store import init_object_store, object_storage_health
from fastapi.middleware.cors import CORSMiddleware
from app.base_config import model_config

app = FastAPI()
maintenance_scheduler = BackgroundScheduler()

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
app.include_router(admin_router, prefix="")
app.include_router(chat_router, prefix="")
app.include_router(trace_router, prefix="")
app.include_router(file_router, prefix="")
app.include_router(gpts_router, prefix="")
app.include_router(metrics_router, prefix="")
app.include_router(platform_router, prefix="")
app.include_router(runtime_router, prefix="")
app.include_router(voice_lab_router, prefix="")


@app.on_event("startup")
async def _startup() -> None:
    validate_storage_configuration()
    init_business_storage()
    refresh_gpts()
    init_object_store()
    init_metrics_storage()
    init_trace_storage()
    start_file_retention_scheduler()
    if not maintenance_scheduler.running:
        maintenance_scheduler.remove_all_jobs()
        maintenance_scheduler.add_job(cleanup_usage_events, "interval", days=1)
        maintenance_scheduler.add_job(cleanup_trace_storage, "interval", days=1)
        maintenance_scheduler.add_job(cleanup_local_cache, "interval", days=1)
        maintenance_scheduler.start()


@app.on_event("shutdown")
async def _shutdown() -> None:
    stop_file_retention_scheduler()
    close_business_storage()
    if maintenance_scheduler.running:
        maintenance_scheduler.shutdown(wait=False)


@app.get("/")
async def root(request: Request):
    user_agent = request.headers.get("user-agent")
    # print(f"User-Agent: {user_agent}")
    return {"message": "服务已启动"}


@app.get("/healthz")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/healthz/dependencies")
async def dependency_healthcheck() -> dict[str, object]:
    business = business_storage_health()
    object_store = object_storage_health()
    healthy = bool(business.get("healthy")) and bool(object_store.get("healthy"))
    return {
        "status": "ok" if healthy else "degraded",
        "businessStorage": business,
        "objectStorage": object_store,
    }


@app.get("/readyz")
async def readiness_healthcheck():
    business = business_storage_health()
    object_store = object_storage_health()
    healthy = bool(business.get("healthy")) and bool(object_store.get("healthy"))
    payload = {
        "status": "ready" if healthy else "not_ready",
        "businessStorage": business,
        "objectStorage": object_store,
    }
    if healthy:
        return payload
    return JSONResponse(status_code=503, content=payload)

if __name__ == "__main__":
    gpt_logger.info("服务启动")
    uvicorn.run(app, host="0.0.0.0", port=5008)

    # print(f"grouppp:{get_tools()}")
