"""Public sign-in entry points; authenticated data remains behind request_context."""

from datetime import UTC
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import delete
from sqlalchemy.orm import Session

from . import auth
from .database import get_session
from .entities import AppSession

router = APIRouter(prefix="/api/v1/auth", tags=["Sign-in"])
DB = Annotated[Session, Depends(get_session)]


@router.get("/session")
def session(request: Request, db: DB) -> dict:
    result = {**auth.configuration(), "user": None, "csrf_token": ""}
    if auth.required():
        try:
            identity = auth.principal(db, request)
            csrf = request.cookies.get(auth.CSRF_COOKIE, "")
            record = db.get(AppSession, auth.digest(request.cookies[auth.SESSION_COOKIE]))
            if not csrf or auth.digest(csrf) != record.csrf_digest:
                raise HTTPException(401)
            result.update(
                user={
                    "id": identity.user_id,
                    "email": identity.email,
                    "workspace_id": identity.tenant_id,
                },
                csrf_token=csrf,
                expires_at=record.expires_at.replace(tzinfo=UTC).isoformat(),
            )
        except HTTPException:
            pass
    return result


@router.post("/login")
def login(db: DB, response: Response) -> dict:
    try:
        url, cookie = auth.begin_login(db)
    except auth.SignInError as exc:
        raise HTTPException(503, str(exc)) from None
    response.set_cookie(
        auth.LOGIN_COOKIE, cookie, max_age=600, httponly=True, samesite="lax", path=auth.LOGIN_PATH
    )
    return {"authorization_url": url}


@router.get("/callback", include_in_schema=False)
def callback(
    request: Request,
    db: DB,
    state: Annotated[str, Query(max_length=256)] = "",
    code: Annotated[str | None, Query(max_length=4096)] = None,
    error: Annotated[str | None, Query(max_length=200)] = None,
) -> RedirectResponse:
    try:
        tokens = auth.finish_login(
            db,
            state,
            request.cookies.get(auth.LOGIN_COOKIE, ""),
            code,
            bool(error),
            request.cookies.get(auth.SESSION_COOKIE, ""),
        )
        result = "signed-in" if tokens else "cancelled"
    except auth.SignInError:
        tokens, result = None, "failed"
    response = RedirectResponse("/?signin=" + result, status_code=303)
    response.delete_cookie(auth.LOGIN_COOKIE, path=auth.LOGIN_PATH)
    if tokens:
        response.set_cookie(
            auth.SESSION_COOKIE, tokens[0], max_age=28800, httponly=True, samesite="lax", path="/"
        )
        response.set_cookie(
            auth.CSRF_COOKIE, tokens[1], max_age=28800, httponly=True, samesite="lax", path="/"
        )
    return response


@router.post("/logout", status_code=204)
def logout(request: Request, db: DB, response: Response) -> None:
    auth.principal(db, request)
    db.execute(
        delete(AppSession).where(
            AppSession.token_digest == auth.digest(request.cookies.get(auth.SESSION_COOKIE, ""))
        )
    )
    db.commit()
    response.delete_cookie(auth.SESSION_COOKIE, path="/")
    response.delete_cookie(auth.CSRF_COOKIE, path="/")
