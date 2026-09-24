"""HTTP entry point for the AI-SOC prototype.

FastAPI validates incoming JSON using strict Pydantic contracts, while the
detection module performs the deterministic analysis.
"""

import os
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import Response

from .detection import analyze_message
from .models import AnalysisResult, MessageInput

MAX_REQUEST_BYTES = 1_000_000
DEFAULT_ALLOWED_HOSTS = "localhost,127.0.0.1,testserver"


def _allowed_hosts() -> list[str]:
    """Read the deployment host allow-list while retaining safe local defaults."""

    configured = os.getenv("AI_SOC_ALLOWED_HOSTS", DEFAULT_ALLOWED_HOSTS)
    hosts = [host.strip() for host in configured.split(",") if host.strip()]
    return hosts or DEFAULT_ALLOWED_HOSTS.split(",")


app = FastAPI(
    title="AI-SOC Prototype API",
    description="Controlled first slice for transparent email-indicator analysis.",
    version="0.2.0",
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=_allowed_hosts())


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


@app.middleware("http")
async def apply_api_guards(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Reject oversized declared bodies and add defensive response headers."""

    content_length = request.headers.get("content-length")
    if content_length and content_length.isdecimal() and int(content_length) > MAX_REQUEST_BYTES:
        response: Response = _error_response(
            413,
            "REQUEST_TOO_LARGE",
            f"Request bodies must not exceed {MAX_REQUEST_BYTES} bytes.",
        )
    else:
        response = await call_next(request)

    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@app.get("/health")
def health() -> dict[str, str]:
    """Return a minimal readiness response for users and monitoring tools."""

    return {"status": "ok"}


@app.post("/analyze", response_model=AnalysisResult)
def analyze(message: MessageInput) -> AnalysisResult:
    """Validate one controlled message and return its deterministic analysis."""

    return analyze_message(message)
