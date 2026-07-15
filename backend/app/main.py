from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import settings as settings_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Trending poller (Milestone 3) and report scheduler (Milestone 8) start here.
    yield


app = FastAPI(title="Informer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings_router.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
