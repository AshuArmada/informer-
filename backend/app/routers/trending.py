from fastapi import APIRouter

from app.poller import trending_cache
from app.schemas import TrendingResponse

router = APIRouter(prefix="/api/trending", tags=["trending"])


@router.get("", response_model=TrendingResponse)
async def get_trending() -> TrendingResponse:
    return TrendingResponse(**trending_cache.snapshot())
