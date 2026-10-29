"""Gmail consent is public only at its single-use, cookie-bound callback."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import Field

from . import auth, deployment
from .api import DB, Context, _http_error, request_context
from .gmail import (
    COOKIE_NAME,
    COOKIE_PATH,
    GmailError,
    begin_consent,
    configuration_status,
    disconnect_gmail,
    finish_consent,
    scan_mailbox,
)
from .platform import ConflictError, NotFoundError
from .platform_schemas import AccountCreate, APIModel

router = APIRouter(prefix="/api/v1/gmail", tags=["Gmail"])


class ConsentRequest(AccountCreate):
    acknowledged: bool


class GmailScanRequest(APIModel):
    source_id: str
    maximum_messages: Annotated[int, Field(ge=1, le=50)] = 20
    recent_days: Annotated[int, Field(ge=1, le=30)] = 7
    acknowledged: bool


@router.get("/configuration", dependencies=[Depends(request_context)])
def configuration() -> dict:
    return configuration_status()


@router.post("/consent", dependencies=[Depends(request_context)])
def consent(payload: ConsentRequest, db: DB, context: Context, response: Response) -> dict:
    if not payload.acknowledged:
        raise HTTPException(
            400, "Read-only access and the displayed evidence retention must be acknowledged."
        )
    if not payload.email.endswith("@gmail.com"):
        raise HTTPException(400, "This connector currently supports personal Gmail addresses.")
    if context.email and payload.email != context.email:
        raise HTTPException(
            400, "Connect the Gmail account used to sign in to your private workspace."
        )
    try:
        url, cookie = begin_consent(db, context.tenant_id, payload.email)
    except GmailError as exc:
        raise HTTPException(503, str(exc)) from None
    response.set_cookie(
        COOKIE_NAME,
        cookie,
        max_age=600,
        httponly=True,
        samesite="lax",
        path=COOKIE_PATH,
        secure=deployment.production(),
    )
    return {"authorization_url": url}


@router.get("/callback", include_in_schema=False)
def callback(
    request: Request,
    db: DB,
    state: Annotated[str, Query(min_length=1, max_length=256)] = "",
    code: Annotated[str | None, Query(max_length=4096)] = None,
    error: Annotated[str | None, Query(max_length=200)] = None,
) -> RedirectResponse:
    try:
        tenant = auth.principal(db, request, lock_user=True).tenant_id if auth.required() else None
        result = finish_consent(
            db, state, request.cookies.get(COOKIE_NAME, ""), code, bool(error), tenant
        )
    except (GmailError, HTTPException):
        # Never reflect a code, provider error, token, or account address into the URL.
        result = "failed"
    response = RedirectResponse("/?gmail=" + result, status_code=303)
    response.delete_cookie(COOKIE_NAME, path=COOKIE_PATH, secure=deployment.production())
    return response


@router.post("/scan", dependencies=[Depends(request_context)])
def scan(payload: GmailScanRequest, db: DB, context: Context) -> dict:
    if not payload.acknowledged:
        raise HTTPException(400, "Confirm the bounded read-only inbox sample before scanning.")
    try:
        return scan_mailbox(
            db, context.tenant_id, payload.source_id, payload.maximum_messages, payload.recent_days
        )
    except (NotFoundError, ConflictError) as exc:
        raise _http_error(exc) from exc
    except GmailError as exc:
        raise HTTPException(502, str(exc)) from None


@router.post("/sources/{source_id}/disconnect", dependencies=[Depends(request_context)])
def disconnect(source_id: str, db: DB, context: Context) -> dict:
    try:
        return disconnect_gmail(db, context.tenant_id, source_id)
    except (NotFoundError, ConflictError) as exc:
        raise _http_error(exc) from exc
