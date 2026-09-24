"""HTTP entry point for the AI-SOC prototype.

FastAPI validates incoming JSON using strict Pydantic contracts, while the
detection module performs the deterministic analysis.
"""

import os
import re
from collections import deque
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from secrets import token_hex
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import Response

from .api import router as platform_router
from .database import SessionLocal, migrate_schema
from .detection import analyze_message
from .models import AnalysisResult, MessageInput

MAX_REQUEST_BYTES = 1_000_000
DEFAULT_ALLOWED_HOSTS = "localhost,127.0.0.1,testserver"
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,100}$")
FRONTEND_DIST = Path(
    os.getenv("AI_SOC_FRONTEND_DIR", Path(__file__).parents[1] / "frontend" / "dist")
)


class RequestBodyLimitMiddleware:
    """Enforce the body limit against bytes received, not just client metadata.

    ``Content-Length`` is only a useful early-rejection hint: a client can omit
    it or lie about it. Buffering at most one megabyte also lets us reject an
    understated or chunked request before FastAPI begins parsing its content.
    Production deployments should retain an equivalent reverse-proxy limit.
    """

    def __init__(self, app: Any, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: dict[str, Any], receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_lengths = [
            value for name, value in scope.get("headers", []) if name.lower() == b"content-length"
        ]
        if len(content_lengths) > 1 or any(not value.isdigit() for value in content_lengths):
            await _error_response(
                400,
                "INVALID_CONTENT_LENGTH",
                "Content-Length must be one non-negative decimal value.",
            )(scope, receive, send)
            return
        if content_lengths and int(content_lengths[0]) > self.max_bytes:
            await _error_response(
                413,
                "REQUEST_TOO_LARGE",
                f"Request bodies must not exceed {self.max_bytes} bytes.",
            )(scope, receive, send)
            return

        messages: deque[dict[str, Any]] = deque()
        received = 0
        while True:
            message = await receive()
            messages.append(message)
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            received += len(message.get("body", b""))
            if received > self.max_bytes:
                await _error_response(
                    413,
                    "REQUEST_TOO_LARGE",
                    f"Request bodies must not exceed {self.max_bytes} bytes.",
                )(scope, receive, send)
                return
            if not message.get("more_body", False):
                break

        async def replay_receive() -> dict[str, Any]:
            if messages:
                return messages.popleft()
            return {"type": "http.request", "body": b"", "more_body": False}

        await self.app(scope, replay_receive, send)


def _allowed_hosts() -> list[str]:
    """Read the deployment host allow-list while retaining safe local defaults."""

    configured = os.getenv("AI_SOC_ALLOWED_HOSTS", DEFAULT_ALLOWED_HOSTS)
    hosts = [host.strip() for host in configured.split(",") if host.strip()]
    return hosts or DEFAULT_ALLOWED_HOSTS.split(",")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Upgrade the configured database before accepting requests."""

    migrate_schema()
    yield


app = FastAPI(
    title="SentinelSME API",
    description="Evidence-backed security-signal analysis and incident management.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=_allowed_hosts())
app.add_middleware(RequestBodyLimitMiddleware, max_bytes=MAX_REQUEST_BYTES)


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    """Return the stable public error envelope used by the API."""

    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """Return useful validation locations without echoing sensitive input."""

    details = [
        {
            "location": ".".join(str(part) for part in error["loc"]),
            "message": error["msg"],
            "type": error["type"],
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The request did not match the documented message schema.",
                "details": details,
            }
        },
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Keep framework and platform errors inside the same public envelope."""

    detail = exc.detail if isinstance(exc.detail, str) else "The request could not be completed."
    code = {
        status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
        status.HTTP_404_NOT_FOUND: "NOT_FOUND",
        status.HTTP_409_CONFLICT: "CONFLICT",
        status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
    }.get(exc.status_code, "REQUEST_ERROR")
    response = _error_response(exc.status_code, code, detail)
    if exc.headers:
        response.headers.update(exc.headers)
    return response


@app.middleware("http")
async def apply_api_guards(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Enforce JSON contracts and add browser/API defensive headers."""

    content_type = request.headers.get("content-type", "").partition(";")[0].lower()
    has_body = request.headers.get("content-length", "0") != "0" or bool(
        request.headers.get("transfer-encoding")
    )
    if (
        request.method in {"POST", "PUT", "PATCH"}
        and has_body
        and content_type != "application/json"
    ):
        response: Response = _error_response(
            415,
            "UNSUPPORTED_MEDIA_TYPE",
            "Requests with a body must use application/json.",
        )
    else:
        response = await call_next(request)

    supplied_request_id = request.headers.get("x-request-id", "")
    request_id = (
        supplied_request_id if REQUEST_ID_PATTERN.fullmatch(supplied_request_id) else token_hex(16)
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; "
        "form-action 'self'; img-src 'self' data:; script-src 'self'; "
        "style-src 'self' 'unsafe-inline'"
    )
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@app.get("/health")
def health() -> dict[str, str]:
    """Return a minimal liveness response for users and monitoring tools."""

    return {"status": "ok"}


@app.get("/health/live")
def health_live() -> dict[str, str]:
    """Report that the API process can serve requests."""

    return {"status": "ok"}


@app.get("/health/ready")
def health_ready() -> dict[str, str]:
    """Report readiness only after a database round trip succeeds."""

    with SessionLocal() as session:
        session.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}


@app.post("/analyze", response_model=AnalysisResult)
def analyze(message: MessageInput) -> AnalysisResult:
    """Validate one controlled message and return its deterministic analysis."""

    return analyze_message(message)


app.include_router(platform_router)


if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="dashboard-assets")

    @app.get("/", include_in_schema=False)
    def dashboard() -> FileResponse:
        return FileResponse(FRONTEND_DIST / "index.html")
else:

    @app.get("/", include_in_schema=False)
    def dashboard_not_built() -> dict[str, str]:
        return {
            "service": "SentinelSME API",
            "dashboard": "Run `npm --prefix frontend run build` to build the web console.",
            "docs": "/docs",
        }
