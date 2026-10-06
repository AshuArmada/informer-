from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.http_security import LocalSecurityMiddleware

from sqlalchemy import select

from app.config import get_settings
from app.db import async_session_factory
from app.models import SavedRepo
from app.poller import poller_loop
from app.routers import report as report_router
from app.routers import repos as repos_router
from app.routers import saved as saved_router
from app.routers import settings as settings_router
from app.routers import stream as stream_router
from app.routers import trending as trending_router
from app.routers import contributions as contributions_router
from app.saved_store import set_saved_names
from app.scheduler import start_scheduler, stop_scheduler


async def _load_saved_names() -> None:
    async with async_session_factory() as db:
        result = await db.execute(select(SavedRepo.repo_full_name))
        set_saved_names(set(result.scalars()))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _load_saved_names()
    poll_task = asyncio.create_task(poller_loop(get_settings().poll_interval_minutes))
    await start_scheduler()
    yield
    poll_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await poll_task
    await stop_scheduler()


app = FastAPI(title="Informer API", lifespan=lifespan, docs_url=None, redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Informer-Request"],
)
app.add_middleware(LocalSecurityMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # FastAPI normally echoes invalid inputs, including accidentally pasted keys.
    return JSONResponse(status_code=422, content={"detail": [
        {"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()
    ]})

app.include_router(settings_router.router)
app.include_router(trending_router.router)
app.include_router(stream_router.router)
app.include_router(repos_router.router)
app.include_router(report_router.router)
app.include_router(saved_router.router)
app.include_router(contributions_router.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
