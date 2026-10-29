"""Public sign-in entry points; authenticated data remains behind request_context."""

from datetime import UTC
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete
from sqlalchemy.orm import Session

from . import auth, deployment
from .database import get_session
from .entities import AppSession, AppUser
from .retention import purge_workspace

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
        auth.LOGIN_COOKIE,
        cookie,
        max_age=600,
        httponly=True,
        samesite="lax",
        path=auth.LOGIN_PATH,
        secure=deployment.production(),
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
    response.delete_cookie(auth.LOGIN_COOKIE, path=auth.LOGIN_PATH, secure=deployment.production())
    if tokens:
        response.set_cookie(
            auth.SESSION_COOKIE,
            tokens[0],
            max_age=28800,
            httponly=True,
            samesite="lax",
            path="/",
            secure=deployment.production(),
        )
        response.set_cookie(
            auth.CSRF_COOKIE,
            tokens[1],
            max_age=28800,
            httponly=True,
            samesite="lax",
            path="/",
            secure=deployment.production(),
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
    response.delete_cookie(auth.SESSION_COOKIE, path="/", secure=deployment.production())
    response.delete_cookie(auth.CSRF_COOKIE, path="/", secure=deployment.production())


class AccountDeletion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmation: Literal["DELETE"]


@router.delete("/account", status_code=204)
def delete_identity(payload: AccountDeletion, request: Request, db: DB, response: Response) -> None:
    identity = auth.principal(db, request, lock_user=True)
    user = db.get(AppUser, identity.user_id)
    from .deletion_ledger import record

    record(identity.tenant_id)
    user.status = "deleting"
    db.execute(delete(AppSession).where(AppSession.user_id == user.id))
    db.commit()  # Barrier: no new work or sessions may enter this workspace.
    purge_workspace(db, identity.tenant_id)
    response.delete_cookie(auth.SESSION_COOKIE, path="/", secure=deployment.production())
    response.delete_cookie(auth.CSRF_COOKIE, path="/", secure=deployment.production())
