"""Browser and resource protections for the loopback-only, single-user API."""
import ipaddress
import asyncio
import logging
import time
from collections import defaultdict, deque
from urllib.parse import urlsplit

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse

from app.config import get_settings

audit = logging.getLogger("informer.security")
MAX_BODY = 64 * 1024


class LocalSecurityMiddleware:
    def __init__(self, app):
        self.app = app
        # Global limits are intentional: this is a single-user local service.
        self.windows = defaultdict(deque)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)

        async def secured_send(message):
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                response_headers["X-Content-Type-Options"] = "nosniff"
                response_headers["X-Frame-Options"] = "DENY"
                response_headers["Referrer-Policy"] = "no-referrer"
                response_headers["Cache-Control"] = "no-store"
                response_headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
                response_headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
            await send(message)

        async def reject(status, detail, extra=None):
            audit.warning("Local API request rejected; status=%s", status)
            await JSONResponse({"detail": detail}, status_code=status, headers=extra)(scope, receive, secured_send)

        try:
            host = urlsplit("http://" + headers.get("host", "")).hostname
            peer = ipaddress.ip_address(scope.get("client", ("", 0))[0])
            local_peer = peer.is_loopback or bool(getattr(peer, "ipv4_mapped", None) and peer.ipv4_mapped.is_loopback)
        except ValueError:
            return await reject(403, "Informer accepts local connections only.")
        if host not in ("localhost", "127.0.0.1", "::1") or not local_peer:
            return await reject(403, "Informer accepts local connections only.")
        origin = headers.get("origin")
        if origin and origin not in get_settings().cors_origins:
            return await reject(403, "This browser origin is not allowed.")
        if headers.get("sec-fetch-site") == "cross-site" and not origin:
            return await reject(403, "Cross-site requests are not allowed.")
        method = scope["method"]
        mutation = method not in ("GET", "HEAD", "OPTIONS")
        if mutation and headers.get("x-informer-request") != "1":
            return await reject(403, "Missing browser request protection header.")
        if mutation and headers.get("content-type", "").split(";")[0].strip() != "application/json":
            return await reject(415, "Use application/json for API changes.")
        if method != "OPTIONS":
            bucket = "advice" if scope["path"].endswith("/advice") else "changes" if mutation else "reads"
            limit = {"advice": 6, "changes": 30, "reads": 120}[bucket]
            now = time.monotonic()
            window = self.windows[bucket]
            while window and window[0] <= now - 60:
                window.popleft()
            if len(window) >= limit:
                return await reject(429, "Too many requests. Wait a minute and retry.", {"Retry-After": "60"})
            window.append(now)
        try:
            if int(headers.get("content-length", "0")) > MAX_BODY:
                return await reject(413, "Request body exceeds 64 KiB.")
        except ValueError:
            return await reject(400, "Invalid request length.")
        # Enforce the real size too, including requests without Content-Length.
        body = bytearray()
        while True:
            try:
                message = await asyncio.wait_for(receive(), timeout=10)
            except TimeoutError:
                return await reject(408, "Request body timed out.")
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > MAX_BODY:
                return await reject(413, "Request body exceeds 64 KiB.")
            if not message.get("more_body", False):
                break
        consumed = False

        async def bounded_receive():
            nonlocal consumed
            if not consumed:
                consumed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, secured_send)
