"""Versioned HTTP API for the persistent SentinelSME platform."""

from __future__ import annotations

import hmac
import os
import re
from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_session
from .entities import AuditRecord
from .platform import (
    ConflictError,
    InvalidTransitionError,
    NotFoundError,
    create_account,
    create_scan_job,
    create_source,
    get_account,
    get_scan_job,
    incident_detail,
    ingest_signals,
    list_accounts,
    list_incidents,
    list_rules,
    list_scan_jobs,
    list_sources,
    run_evaluation,
    transition_incident,
    update_source_status,
)
from .platform_schemas import (
    AccountCreate,
    AccountView,
    AuditView,
    CompatibilityScanCreate,
    EvaluationRequest,
    EvaluationResult,
    IncidentDetail,
    IncidentListItem,
    IncidentStatus,
    IncidentTransition,
    IngestionResult,
    RuleView,
    ScanJobCreate,
    ScanJobView,
    Severity,
    SignalBatch,
    SourceCreate,
    SourceStatusUpdate,
    SourceView,
)

TENANT_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$")


@dataclass(frozen=True)
class RequestContext:
    tenant_id: str


def request_context(
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
    x_tenant_id: Annotated[str, Header(alias="X-Tenant-ID")] = "default",
) -> RequestContext:
    """Enforce optional deployment API-key auth and validate the tenant boundary."""

    expected = os.getenv("AI_SOC_API_KEY")
    if expected and (not x_api_key or not hmac.compare_digest(x_api_key, expected)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid X-API-Key header is required.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    if not TENANT_PATTERN.fullmatch(x_tenant_id):
        raise HTTPException(status_code=400, detail="X-Tenant-ID has an invalid format.")
    return RequestContext(tenant_id=x_tenant_id)


router = APIRouter(prefix="/api/v1", tags=["SentinelSME"], dependencies=[Depends(request_context)])
DB = Annotated[Session, Depends(get_session)]
Context = Annotated[RequestContext, Depends(request_context)]


def _http_error(error: Exception) -> HTTPException:
    if isinstance(error, NotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, (ConflictError, InvalidTransitionError)):
        return HTTPException(status_code=409, detail=str(error))
    return HTTPException(status_code=500, detail="Unexpected platform error.")


@router.get("/capabilities")
def capabilities() -> dict:
    """Describe available adapters without claiming unavailable live integrations."""

    return {
        "service": "SentinelSME",
        "signal_types": ["email", "forwarding", "signin", "mfa", "oauth_grant"],
        "source_types": ["controlled", "gmail", "workspace"],
        "live_connectors": [],
        "controlled_ingestion": True,
        "template_explanations": True,
        "ai_explanations": False,
        "correlation_window_minutes": 30,
        "maximum_batch_size": 500,
        "privacy": {"stores_full_bodies": False, "stores_attachments": False},
    }


@router.post("/accounts", response_model=AccountView, status_code=201)
def accounts_create(payload: AccountCreate, db: DB, context: Context) -> AccountView:
    try:
        return AccountView.model_validate(create_account(db, context.tenant_id, payload))
    except (ConflictError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.get("/accounts", response_model=list[AccountView])
def accounts_list(db: DB, context: Context) -> list[AccountView]:
    return [AccountView.model_validate(item) for item in list_accounts(db, context.tenant_id)]


@router.get("/accounts/{account_id}", response_model=AccountView)
def accounts_get(account_id: str, db: DB, context: Context) -> AccountView:
    try:
        return AccountView.model_validate(get_account(db, context.tenant_id, account_id))
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.post("/accounts/{account_id}/sources", response_model=SourceView, status_code=201)
def sources_create(account_id: str, payload: SourceCreate, db: DB, context: Context) -> SourceView:
    try:
        return SourceView.model_validate(create_source(db, context.tenant_id, account_id, payload))
    except (ConflictError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.get("/accounts/{account_id}/sources", response_model=list[SourceView])
def account_sources_list(account_id: str, db: DB, context: Context) -> list[SourceView]:
    try:
        get_account(db, context.tenant_id, account_id)
        return [
            SourceView.model_validate(item)
            for item in list_sources(db, context.tenant_id, account_id)
        ]
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.get("/sources", response_model=list[SourceView])
def sources_list(db: DB, context: Context, account_id: str | None = None) -> list[SourceView]:
    return [
        SourceView.model_validate(item) for item in list_sources(db, context.tenant_id, account_id)
    ]


@router.patch("/sources/{source_id}", response_model=SourceView)
def sources_update(
    source_id: str, payload: SourceStatusUpdate, db: DB, context: Context
) -> SourceView:
    try:
        return SourceView.model_validate(
            update_source_status(db, context.tenant_id, source_id, payload.status)
        )
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.post("/scan-jobs", response_model=ScanJobView, status_code=202)
def scan_jobs_create(payload: ScanJobCreate, db: DB, context: Context) -> ScanJobView:
    try:
        return ScanJobView.model_validate(
            create_scan_job(db, context.tenant_id, payload.source_id, payload.trigger)
        )
    except (ConflictError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.get("/scan-jobs", response_model=list[ScanJobView])
def scan_jobs_list(db: DB, context: Context, source_id: str | None = None) -> list[ScanJobView]:
    return [
        ScanJobView.model_validate(item)
        for item in list_scan_jobs(db, context.tenant_id, source_id)
    ]


@router.get("/scan-jobs/{job_id}", response_model=ScanJobView)
def scan_jobs_get(job_id: str, db: DB, context: Context) -> ScanJobView:
    try:
        return ScanJobView.model_validate(get_scan_job(db, context.tenant_id, job_id))
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.post("/scans", response_model=ScanJobView, status_code=202)
def dashboard_scan_create(
    payload: CompatibilityScanCreate, db: DB, context: Context
) -> ScanJobView:
    """Create a controlled source on demand for the dashboard's compact flow."""

    try:
        get_account(db, context.tenant_id, payload.account_id)
        external_id = f"dashboard:{payload.account_id}:{payload.scope}:{payload.target}"
        source = next(
            (
                item
                for item in list_sources(db, context.tenant_id, payload.account_id)
                if item.external_id == external_id
            ),
            None,
        )
        if source is None:
            source = create_source(
                db,
                context.tenant_id,
                payload.account_id,
                SourceCreate(
                    source_type="controlled",
                    name=f"Dashboard {payload.scope} scan",
                    external_id=external_id,
                    capabilities=["email", "forwarding", "signin", "mfa", "oauth_grant"],
                ),
            )
        return ScanJobView.model_validate(create_scan_job(db, context.tenant_id, source.id, "user"))
    except (ConflictError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.get("/scans/{job_id}", response_model=ScanJobView)
def dashboard_scan_get(job_id: str, db: DB, context: Context) -> ScanJobView:
    return scan_jobs_get(job_id, db, context)


@router.post("/sources/{source_id}/signals", response_model=IngestionResult, status_code=201)
def signals_ingest(
    source_id: str, payload: SignalBatch, db: DB, context: Context
) -> IngestionResult:
    try:
        return ingest_signals(db, context.tenant_id, source_id, payload)
    except (ConflictError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.get("/incidents", response_model=list[IncidentListItem])
def incidents_list(
    db: DB,
    context: Context,
    severity: Severity | None = None,
    status_filter: Annotated[IncidentStatus | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    account_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[IncidentListItem]:
    return list_incidents(
        db,
        context.tenant_id,
        severity=severity,
        status=status_filter,
        search=search,
        account_id=account_id,
        limit=limit,
        offset=offset,
    )


@router.get("/incidents/{incident_id}", response_model=IncidentDetail)
def incidents_get(incident_id: str, db: DB, context: Context) -> IncidentDetail:
    try:
        return incident_detail(db, context.tenant_id, incident_id)
    except NotFoundError as exc:
        raise _http_error(exc) from exc


@router.patch("/incidents/{incident_id}/status", response_model=IncidentDetail)
def incidents_transition(
    incident_id: str, payload: IncidentTransition, db: DB, context: Context
) -> IncidentDetail:
    try:
        return transition_incident(db, context.tenant_id, incident_id, payload)
    except (InvalidTransitionError, NotFoundError) as exc:
        raise _http_error(exc) from exc


@router.get("/rules", response_model=list[RuleView])
def rules_list(db: DB) -> list[RuleView]:
    return [RuleView.model_validate(item) for item in list_rules(db)]


@router.get("/audit", response_model=list[AuditView])
def audit_list(
    db: DB,
    context: Context,
    incident_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> list[AuditView]:
    statement = select(AuditRecord).where(AuditRecord.tenant_id == context.tenant_id)
    if incident_id:
        statement = statement.where(AuditRecord.incident_id == incident_id)
    records = db.scalars(statement.order_by(AuditRecord.created_at.desc()).limit(limit)).all()
    return [AuditView.model_validate(item) for item in records]


@router.post("/evaluation", response_model=EvaluationResult)
def evaluation_run(payload: EvaluationRequest, db: DB, _context: Context) -> EvaluationResult:
    return run_evaluation(db, payload)
