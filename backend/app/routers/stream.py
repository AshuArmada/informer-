import json

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from app.poller import subscribe, trending_cache, unsubscribe

router = APIRouter(prefix="/api/stream", tags=["stream"])


@router.get("")
async def stream_trending(request: Request) -> EventSourceResponse:
    queue = subscribe()

    async def event_generator():
        try:
            # Push current state immediately so the client doesn't wait for the next poll.
            yield {"event": "trending", "data": json.dumps(trending_cache.snapshot())}
            while True:
                if await request.is_disconnected():
                    break
                payload = await queue.get()
                yield {"event": "trending", "data": json.dumps(payload)}
        finally:
            unsubscribe(queue)

    return EventSourceResponse(event_generator())
