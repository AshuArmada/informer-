from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.poller import poller_loop
from app.routers import settings as settings_router
from app.routers import stream as stream_router
from app.routers import trending as trending_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    poll_task = asyncio.create_task(poller_loop(get_settings().poll_interval_minutes))
    yield
    poll_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await poll_task


app = FastAPI(title="Informer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings_router.router)
app.include_router(trending_router.router)
app.include_router(stream_router.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
